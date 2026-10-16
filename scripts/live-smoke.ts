/** Opt-in live verification. Requires a running local API and a server-side TinyFish key. */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { TinyFish } from '../server/tinyfish'
import { grounded } from '../server/scoring'
import { jobStatusSchema } from '../src/lib/api-schema'
import { scopeListing } from '../server/resolve-listing'
import { BrightData } from '../server/bright-data'

const origin = 'http://127.0.0.1:3001'
const urls = process.argv.slice(2)
if (!urls.length)
  urls.push(
    'https://job-boards.greenhouse.io/deliveroo/jobs/8202442',
    'https://job-boards.greenhouse.io/isaraerospace/jobs/4587242101',
  )
const key = process.env.TINYFISH_API_KEY?.trim()
if (!key) throw new Error('Configure TINYFISH_API_KEY in .env first.')
const provider = new TinyFish(key)
const fallback = new BrightData(process.env.BRIGHT_DATA_API_KEY?.trim() ?? '')
const results = []
await mkdir('.qa', { recursive: true })
const resultPath = `.qa/live-smoke-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
async function startScan(url: string, cookie?: string) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${origin}/api/analyses`, {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify({ url, probe: false }),
      signal: AbortSignal.timeout(30000),
    })
    if (response.status !== 429 || attempt >= 2) return response
    await response.body?.cancel()
    console.log('Local start limit reached; waiting 60 seconds before retrying.')
    await delay(60000)
  }
}
for (const url of urls) {
  const startedAt = Date.now()
  try {
    const start = await startScan(url)
    if (!start.ok) throw new Error(`Start failed: HTTP ${start.status}`)
    const cookie = start.headers.get('set-cookie')?.split(';')[0]
    assert.ok(cookie, 'API must create a session')
    let task = jobStatusSchema.parse(await start.json())
    for (let attempt = 0; task.status === 'queued' || task.status === 'running'; attempt++) {
      assert.ok(attempt < 200, 'Scan timed out')
      await delay(2000)
      const response = await fetch(`${origin}/api/analyses/${task.id}`, {
        headers: { Cookie: cookie },
        signal: AbortSignal.timeout(30000),
      })
      assert.equal(response.status, 200)
      task = jobStatusSchema.parse(await response.json())
    }
    assert.equal(task.status, 'completed', task.error?.message)
    const report = task.report!
    assert.equal(report.mode, 'live')
    assert.ok(
      ['fetch-rules', 'browser-rules', 'bright-data-rules'].includes(report.analysisMethod!),
    )
    assert.equal(report.providerRunId, undefined)
    assert.equal(report.coverage.applyFlow, false)
    // Independently request fresh provider text: all rendered quotes must still occur on the page.
    const page = scopeListing(
      await (report.analysisMethod === 'bright-data-rules'
        ? fallback.indeed(report.analyzedUrl!).then((result) => result.page)
        : report.analysisMethod === 'browser-rules'
          ? provider.renderedPage(report.analyzedUrl!)
          : provider.page(report.analyzedUrl!)),
    )
    assert.ok(report.signals.length > 0)
    for (const signal of report.signals) {
      assert.ok(
        signal.quote && grounded(signal.quote, page, signal.rule === 'listing_present' ? 3 : 12),
        `Ungrounded quote: ${signal.id}`,
      )
      assert.equal(signal.sourceUrl, page.url)
    }
    for (const kind of ['ghost', 'scam'] as const)
      assert.equal(
        report[kind].value,
        Math.min(
          100,
          report.signals
            .filter((signal) => signal.kind === kind)
            .reduce((total, signal) => total + signal.weight, 0),
        ),
      )
    const cachedResponse = await startScan(url, cookie)
    const cached = jobStatusSchema.parse(await cachedResponse.json())
    assert.equal(cached.report?.cached, true)
    assert.equal(cached.report?.checkedAt, report.checkedAt)
    assert.deepEqual(cached.report?.signals, report.signals)
    results.push({
      url,
      checkedAt: report.checkedAt,
      verifiedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      title: report.job.title,
      employer: report.job.employer,
      method: report.analysisMethod,
      resolvedUrl: report.analyzedUrl,
      ghost: report.ghost.value,
      scam: report.scam.value,
      quotesVerified: report.signals.length,
      cacheVerified: true,
      initialCacheHit: !!report.cached,
    })
    console.log(JSON.stringify(results.at(-1)))
  } catch (error) {
    results.push({
      url,
      verifiedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : 'Verification failed',
    })
    console.error(JSON.stringify(results.at(-1)))
    process.exitCode = 1
  }
  await writeFile(resultPath, JSON.stringify(results, null, 2))
}
await mkdir('.qa', { recursive: true })
await writeFile('.qa/live-smoke-results.json', JSON.stringify(results, null, 2))
