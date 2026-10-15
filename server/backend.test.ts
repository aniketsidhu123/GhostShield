import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { canonicalUrl, assertPublicUrl } from './urls'
import { TinyFish, type Page } from './tinyfish'
import { buildReport, grounded } from './scoring'
import { createApp } from './app'
import { Store } from './store'
import type { Extraction } from './extraction'
import { liveAnalysisSchema } from '../src/lib/api-schema'
import { AppError } from './errors'

const url = 'https://careers.example.com/jobs/engineer'
const quote = 'Senior Engineer at Example Systems'
const fee = 'Applicants must pay a registration fee of INR 2500 before the interview.'
const primary: Page = {
  url,
  title: quote,
  text: `${quote}\nBengaluru. Full-time software engineering role. Design systems and work with a distributed engineering team.\n${fee}`,
  links: [],
  fetchedAt: new Date().toISOString(),
}
const base: Extraction = {
  readable: true,
  isJobListing: true,
  titleQuote: quote,
  job: {
    title: 'Senior Engineer',
    employer: 'Example Systems',
    location: 'Bengaluru',
    employment: 'Full-time',
  },
  observations: [{ code: 'listing_present', sourceUrl: url, quote, date: null }],
  applyFlowInspected: false,
  limitations: [],
}
function report(extraction: Extraction, page = primary) {
  return buildReport({
    id: randomUUID(),
    url,
    primary: page,
    pages: [page],
    extraction,
    history: [],
    probe: false,
    runId: 'test-run',
    limitations: [],
  })
}
const store = () => new Store(resolve('.qa', `backend-test-${randomUUID()}`))

test('short real role titles are accepted but formatting-only evidence is rejected', () => {
  const result = report(
    { ...base, titleQuote: 'QA Engineer', job: { ...base.job, title: 'QA Engineer' } },
    { ...primary, text: `QA Engineer\n${primary.text}` },
  )
  assert.equal(result.job.title, 'QA Engineer')
  assert.equal(grounded('****************', primary), false)
})

test('server rejects credentials, non-web schemes, private literals and obfuscated loopback', async () => {
  for (const value of [
    'file:///etc/passwd',
    'http://127.0.0.1',
    'http://2130706433',
    'http://0x7f000001',
    'http://169.254.169.254/latest',
    'https://a:b@example.com',
    'https://localhost',
    'https://example.com:8443',
    'http://[::1]',
  ])
    assert.throws(() => canonicalUrl(value))
  assert.equal(canonicalUrl(`${url}?id=5&utm_source=test#apply`), `${url}?id=5`)
  const privateResolver = (async () => [
    { address: '10.0.0.1', family: 4 },
  ]) as unknown as Parameters<typeof assertPublicUrl>[1]
  await assert.rejects(assertPublicUrl(url, privateResolver), /Private/)
  const mixedResolver = (async () => [
    { address: '93.184.216.34', family: 4 },
    { address: '::ffff:127.0.0.1', family: 6 },
  ]) as unknown as Parameters<typeof assertPublicUrl>[1]
  await assert.rejects(assertPublicUrl(url, mixedResolver), /Private/)
})
test('scores use grounded observations, stay independent, and deduplicate rules', () => {
  const observation = { code: 'upfront_fee' as const, sourceUrl: url, quote: fee, date: null }
  const result = report({ ...base, observations: [...base.observations, observation, observation] })
  assert.equal(result.ghost.value, 0)
  assert.equal(result.scam.value, 45)
  assert.equal(result.signals.filter((signal) => signal.rule === 'upfront_fee').length, 1)
  assert.equal(result.coverage.applyFlow, false)
  assert.equal(result.scam.confidence, 'Low')
  assert.ok(liveAnalysisSchema.safeParse(result).success)
})
test('fabricated quotes, unvisited sources, and fee-disclaimer false positives add no points', () => {
  const disclaimer = 'We never charge applicants a registration fee before an interview.'
  const result = report(
    {
      ...base,
      observations: [
        ...base.observations,
        {
          code: 'upfront_fee',
          sourceUrl: url,
          quote: 'Pay us a fee to guarantee an offer.',
          date: null,
        },
        {
          code: 'bank_before_offer',
          sourceUrl: 'https://other.example.com/',
          quote: 'Send bank details before the interview.',
          date: null,
        },
        { code: 'upfront_fee', sourceUrl: url, quote: disclaimer, date: null },
      ],
    },
    { ...primary, text: `${primary.text}\n${disclaimer}` },
  )
  assert.equal(result.scam.value, 0)
  assert.ok(result.limitations?.some((item) => item.includes('excluded')))
})
test('a closed role is not treated as a ghost simply because it is old', () => {
  const text = 'This position is closed and no longer accepting applications.'
  const result = report(
    {
      ...base,
      observations: [
        ...base.observations,
        { code: 'explicitly_closed', quote: text, sourceUrl: url, date: null },
        {
          code: 'posted_date',
          quote: 'Date posted: 2025-01-01',
          sourceUrl: url,
          date: '2025-01-01',
        },
      ],
    },
    { ...primary, text: `${primary.text}\n${text}\nDate posted: 2025-01-01` },
  )
  assert.equal(result.ghost.value, 0)
  assert.match(result.ghost.label, /Closed/)
})
test('a guessed old posting date is not accepted without a supporting date quote', () => {
  const result = report({
    ...base,
    observations: [
      ...base.observations,
      { code: 'posted_date', quote, sourceUrl: url, date: '2025-01-01' },
    ],
  })
  assert.equal(result.ghost.value, 0)
})
test('blocked pages and generic career indexes never produce a low-risk report', () => {
  assert.throws(() => report({ ...base, readable: false }), /could not be verified/)
  assert.throws(() => report({ ...base, isJobListing: false }), /could not be verified/)
  assert.throws(
    () => report({ ...base, titleQuote: 'Imaginary job title not on the source' }),
    /could not be verified/,
  )
})

function fakeProvider() {
  const calls: { endpoint: string; body: unknown }[] = []
  const transport: typeof fetch = async (input, init) => {
    const endpoint = String(input),
      body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ endpoint, body })
    assert.equal(new Headers(init?.headers).get('x-api-key'), 'test-key')
    if (endpoint.startsWith('https://api.fetch.tinyfish.ai'))
      return Response.json({
        results: [{ url, final_url: url, title: primary.title, text: primary.text, links: [] }],
        errors: [],
      })
    if (endpoint.startsWith('https://api.search.tinyfish.ai')) return Response.json({ results: [] })
    if (endpoint.endsWith('/run-async')) return Response.json({ run_id: 'test-run' })
    if (endpoint.endsWith('/test-run'))
      return Response.json({
        status: 'COMPLETED',
        result: {
          ...base,
          observations: [
            ...base.observations,
            { code: 'upfront_fee', sourceUrl: url, quote: fee, date: null },
          ],
        },
      })
    throw new Error(`Unexpected provider URL ${endpoint}`)
  }
  return {
    provider: new TinyFish('test-key', transport, async (value) => canonicalUrl(value), 1),
    calls,
  }
}

test('Fetch handles HTTP-200 per-URL failures without inventing evidence', async () => {
  const provider = new TinyFish(
    'test-key',
    async () => Response.json({ results: [], errors: [{ url, error: 'bot_blocked' }] }),
    async (value) => value,
  )
  await assert.rejects(provider.page(url), /blocked automated access/)
})
test('provider authorization and credit errors are actionable and never leak the key', async () => {
  for (const status of [401, 402, 429]) {
    const provider = new TinyFish(
      'secret-do-not-leak',
      async () => Response.json({ secret: 'secret-do-not-leak' }, { status }),
      async (value) => value,
    )
    await assert.rejects(
      provider.page(url),
      (error: Error) =>
        !error.message.includes('secret-do-not-leak') && /TinyFish/.test(error.message),
    )
  }
})
test('provider redirects are validated before evidence is accepted', async () => {
  const provider = new TinyFish(
    'test-key',
    async () =>
      Response.json({
        results: [{ url, final_url: 'http://127.0.0.1/private', text: primary.text }],
        errors: [],
      }),
    async (value) => canonicalUrl(value),
  )
  await assert.rejects(provider.page(url), /public job URLs/)
})

test('terminal policy and billing rejections are actionable, sanitized, and never retried', async () => {
  for (const [failure, code] of [
    [
      { category: 'AGENT_FAILURE', message: 'May violate our usage policies. secret-do-not-leak' },
      'PROVIDER_POLICY',
    ],
    [{ category: 'BILLING_FAILURE', message: 'secret-do-not-leak' }, 'PROVIDER_CREDITS'],
  ] as const) {
    const calls: string[] = []
    const provider = new TinyFish(
      'secret-do-not-leak',
      async (input) => {
        const endpoint = String(input)
        calls.push(endpoint)
        if (endpoint.endsWith('/run-async')) return Response.json({ run_id: 'failed-run' })
        if (endpoint.endsWith('/v1/runs/failed-run'))
          return Response.json({ status: 'FAILED', error: failure })
        throw new Error('Unexpected retry or cancellation')
      },
      async (value) => value,
      1,
    )
    await assert.rejects(
      provider.inspect(url, [], true, AbortSignal.timeout(1000)),
      (error: unknown) =>
        error instanceof AppError &&
        error.code === code &&
        error.message.includes('No scores were generated') &&
        !error.message.includes('secret-do-not-leak'),
    )
    assert.equal(calls.length, 2)
  }
})

test('API runs the real pipeline against a stub provider, persists cache, and scopes task reads', async (t) => {
  const { provider, calls } = fakeProvider()
  const storage = store()
  const app = createApp({
    key: 'test-key',
    provider,
    store: storage,
    validate: async (value) => canonicalUrl(value),
  })
  app.listen(0, '127.0.0.1')
  await once(app, 'listening')
  t.after(() => {
    app.closeAllConnections()
    app.close()
  })
  const address = `http://127.0.0.1:${(app.address() as AddressInfo).port}`
  const start = await fetch(`${address}/api/analyses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:5173' },
    body: JSON.stringify({ url, probe: false }),
  })
  assert.equal(start.status, 202)
  const cookie = start.headers.get('set-cookie')!.split(';')[0]
  let task = await start.json()
  for (
    let count = 0;
    count < 100 && task.status !== 'completed' && task.status !== 'failed';
    count++
  ) {
    await new Promise((resolve) => setTimeout(resolve, 10))
    task = await (
      await fetch(`${address}/api/analyses/${task.id}`, { headers: { Cookie: cookie } })
    ).json()
  }
  assert.equal(task.status, 'completed', JSON.stringify(task.error))
  assert.equal(task.report.mode, 'live')
  assert.equal(task.report.scam.value, 45)
  assert.equal(
    task.report.signals.find((signal: { rule: string }) => signal.rule === 'upfront_fee').quote,
    fee,
  )
  assert.equal((await fetch(`${address}/api/analyses/${task.id}`)).status, 404)
  const runBody = calls.find((call) => call.endpoint.endsWith('/run-async'))!.body as {
    agent_config: unknown
    use_vault: boolean
    goal: string
  }
  assert.equal(runBody.use_vault, false)
  assert.match(runBody.goal, /Do not walk the application flow/)
  assert.deepEqual(runBody.agent_config, { max_duration_seconds: 180 })
  const count = calls.length
  const cached = await (
    await fetch(`${address}/api/analyses`, {
      method: 'POST',
      headers: {
        Cookie: cookie,
        Origin: 'http://127.0.0.1:5173',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url, probe: false }),
    })
  ).json()
  assert.equal(cached.report.cached, true)
  assert.equal(calls.length, count)
  assert.equal((await storage.snapshots(url)).length, 1)
  assert.equal(JSON.stringify(task).includes('test-key'), false)
})
test('missing credentials and foreign origins fail explicitly without starting provider work', async (t) => {
  const app = createApp({ store: store() })
  app.listen(0, '127.0.0.1')
  await once(app, 'listening')
  t.after(() => {
    app.closeAllConnections()
    app.close()
  })
  const address = `http://127.0.0.1:${(app.address() as AddressInfo).port}`
  const request = (origin: string) =>
    fetch(`${address}/api/analyses`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
  const missing = await request('http://127.0.0.1:5173')
  assert.equal(missing.status, 503)
  assert.equal((await missing.json()).error.code, 'NOT_CONFIGURED')
  assert.equal((await request('https://unrelated.example.com')).status, 403)
})
