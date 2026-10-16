import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { BrightData, normalizeIndeedRecord } from './bright-data'
import { AppError } from './errors'
import { TinyFish } from './tinyfish'
import { resolveWithFallback } from './provider-routing'
import { analyze, cacheKey } from './pipeline'
import { Store } from './store'
import { liveAnalysisSchema } from '../src/lib/api-schema'
import { IndeedState } from './indeed-state'
import { writeFile } from 'node:fs/promises'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { createApp } from './app'
import { jobStatusSchema } from '../src/lib/api-schema'

const url = 'https://in.indeed.com/viewjob?jk=34797a0025b9529d'
// Deliberately fictional transport fixtures, never used by the production adapter.
const record = {
  jobid: '34797a0025b9529d',
  url,
  job_title: 'Software Engineer',
  company_name: 'Fixture Company',
  location: 'Bengaluru',
  job_type: ['Full-time'],
  description_text: [
    'Responsibilities include designing reliable services and maintaining distributed systems with our engineering team.',
    'Qualifications include software development experience, strong communication skills and careful attention to detail.',
    'This posting is for our talent pool for future opportunities.',
    'Applicants must pay a registration fee of INR 2500 before the interview.',
  ].join('\n\n'),
  date_posted_parsed: '2020-01-01',
}
const validate = async (value: string) => value
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const unreadable = () => {
  throw new AppError('SOURCE_UNAVAILABLE', 'Unreadable public page')
}
const blockedTinyFish = {
  page: unreadable,
  renderedPage: unreadable,
  searchListings: async () => [],
} as unknown as TinyFish

test('Indeed fallback produces grounded independent scores and preserves cache/report schema', async () => {
  let calls = 0
  const fallback = new BrightData(
    'fixture-secret',
    async () => {
      calls++
      return json([record])
    },
    validate,
    0,
  )
  const store = new Store(resolve('.qa', `bright-data-test-${randomUUID()}`))
  const report = await analyze(
    url,
    false,
    blockedTinyFish,
    store,
    () => {},
    AbortSignal.timeout(10000),
    fallback,
  )
  assert.ok(liveAnalysisSchema.safeParse(report).success)
  assert.equal(report.analysisMethod, 'bright-data-rules')
  assert.equal(report.resolution?.method, 'bright-data')
  assert.equal(report.job.employer, 'Fixture Company')
  assert.equal(report.ghost.value, 20)
  assert.equal(report.scam.value, 45)
  assert.equal(report.coverage.applyFlow, false)
  assert.equal(calls, 1)
  assert.ok(!report.signals.some((s) => s.rule === 'posted_age_90'))
  const { page } = normalizeIndeedRecord([record], url)
  for (const signal of report.signals) {
    if (signal.quote) assert.ok(page.text.includes(signal.quote))
  }
  assert.ok(await store.cached(cacheKey(url, false), 3600000))
})

test('Indeed records reject wrong jobs, partial descriptions, access screens and provider errors', () => {
  for (const data of [
    [],
    [record, record],
    [{ ...record, jobid: 'aaaaaaaaaaaaaaaa' }],
    [{ ...record, url: 'https://www.indeed.com/viewjob?jk=aaaaaaaaaaaaaaaa' }],
    [{ ...record, description_text: 'Too short' }],
    [{ ...record, description_text: 'Sign in to continue. '.repeat(30) }],
    [{ ...record, error: 'Provider failure' }],
    [{ ...record, company_name: '' }],
  ])
    assert.throws(() => normalizeIndeedRecord(data, url), AppError)
})

test('HTTP 200 crawler failures disclose the source limit without leaking provider error text', () => {
  assert.throws(
    () =>
      normalizeIndeedRecord([{ error_code: 'rate_limit', error: 'private provider context' }], url),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === 'BRIGHT_DATA_SOURCE_RATE_LIMIT' &&
      error.status === 429 &&
      !error.message.includes('private provider context'),
  )
  assert.throws(
    () => normalizeIndeedRecord([{ error_code: 'dead_page', error: 'private context' }], url),
    /may be unavailable or blocked/,
  )
})

test('async collection polls the supplied snapshot and never resubmits the job', async () => {
  const calls: { url: string; method?: string; body?: BodyInit | null }[] = []
  const responses = [
    json({ snapshot_id: 'sd_test_123' }, 202),
    json({ status: 'running' }),
    json({ status: 'ready' }),
    json([record]),
  ]
  const client = new BrightData(
    'fixture-secret',
    async (input, init) => {
      calls.push({ url: String(input), method: init?.method, body: init?.body })
      return responses.shift()!
    },
    validate,
    0,
  )
  const result = await client.indeed(url)
  assert.equal(result.snapshotId, 'sd_test_123')
  assert.equal(calls.filter((c) => c.method === 'POST').length, 1)
  assert.deepEqual(JSON.parse(String(calls[0].body)), { input: [{ url }] })
  assert.match(calls[0].url, /scrape\?dataset_id=gd_l4dx9j9sscpvs7no2/)
  assert.match(calls[1].url, /progress\/sd_test_123$/)
  assert.match(calls[3].url, /snapshot\/sd_test_123\?format=json$/)
})

test('provider errors are sanitized and a failed POST is never automatically repeated', async () => {
  let attempts = 0
  const client = new BrightData(
    'fixture-secret',
    async () => {
      attempts++
      throw new Error('Transport accidentally contains fixture-secret')
    },
    validate,
    0,
  )
  await assert.rejects(
    client.indeed(url),
    (error: Error) =>
      !error.message.includes('fixture-secret') &&
      /not automatically resubmitted/.test(error.message),
  )
  assert.equal(attempts, 1)
  const denied = new BrightData(
    'fixture-secret',
    async () => json({ error: 'fixture-secret' }, 401),
    validate,
    0,
  )
  await assert.rejects(denied.indeed(url), /Check BRIGHT_DATA_API_KEY/)
  const invalid = new BrightData(
    'fixture-secret',
    async () => json({ snapshot_id: '../unsafe' }, 202),
    validate,
    0,
  )
  await assert.rejects(invalid.indeed(url), /valid snapshot ID/)
  const responses = [json({ snapshot_id: 'sd_failed' }, 202), json({ status: 'failed' })]
  const failed = new BrightData('fixture-secret', async () => responses.shift()!, validate, 0)
  await assert.rejects(failed.indeed(url), /No scores were generated/)
})

test('working TinyFish listings and non-Indeed failures never call Bright Data', async () => {
  let fallbackCalls = 0
  const fallback = new BrightData(
    'fixture-secret',
    async () => {
      fallbackCalls++
      return json([record])
    },
    validate,
    0,
  )
  for (const target of [
    url,
    'https://www.linkedin.com/jobs/view/4479816430',
    'https://www.naukri.com/job-listings-engineer-fixture-0-to-2-years-200520500046',
    'https://job-boards.greenhouse.io/fixture/jobs/123456',
  ]) {
    const provider = {
      page: async () => ({
        url: target,
        title: record.job_title,
        text: `${record.job_title}\n${record.description_text}\n\nApply for this role through our recruitment portal.`,
        links: [],
        fetchedAt: new Date().toISOString(),
      }),
    } as unknown as TinyFish
    const result = await resolveWithFallback(
      target,
      provider,
      () => {},
      AbortSignal.timeout(10000),
      fallback,
    )
    assert.equal(result.resolution.method, 'direct')
  }
  await assert.rejects(
    resolveWithFallback(
      'https://www.linkedin.com/jobs/view/4479816430',
      blockedTinyFish,
      () => {},
      AbortSignal.timeout(10000),
      fallback,
    ),
    /did not provide a readable description/,
  )
  const authError = new AppError('PROVIDER_AUTH', 'TinyFish authentication failed')
  const invalidTiny = {
    page: async () => {
      throw authError
    },
  } as unknown as TinyFish
  await assert.rejects(
    resolveWithFallback(url, invalidTiny, () => {}, AbortSignal.timeout(10000), fallback),
    (error) => error === authError,
  )
  await assert.rejects(
    resolveWithFallback(url, blockedTinyFish, () => {}, AbortSignal.timeout(10000)),
    /BRIGHT_DATA_API_KEY/,
  )
  assert.equal(fallbackCalls, 0)
})

test('rate-limit cooldown survives restart, blocks other Indeed jobs and expires without auto-retry', async () => {
  const file = resolve('.qa', `indeed-cooldown-${randomUUID()}.json`)
  let now = Date.now(),
    posts = 0
  const transport: typeof fetch = async () => {
    posts++
    return json([{ error_code: 'rate_limit', error: 'private' }])
  }
  const first = new BrightData('test', transport, validate, 0, new IndeedState(file), () => now)
  await assert.rejects(
    first.indeed(url),
    (e: unknown) => e instanceof AppError && e.code === 'INDEED_COOLDOWN' && !!e.retryAt,
  )
  const restarted = new BrightData('test', transport, validate, 0, new IndeedState(file), () => now)
  let tinyCalls = 0
  const tiny = {
    page: async () => {
      tinyCalls++
      throw new Error('Must not fetch during cooldown')
    },
  } as unknown as TinyFish
  await assert.rejects(
    resolveWithFallback(url, tiny, () => {}, AbortSignal.timeout(1000), restarted),
    /Retry after/,
  )
  await assert.rejects(
    restarted.indeed('https://www.indeed.com/viewjob?jk=aaaaaaaaaaaaaaaa'),
    /Retry after/,
  )
  assert.equal(posts, 1)
  assert.equal(tinyCalls, 0)
  now += 30 * 60000 + 1
  assert.equal(posts, 1, 'expiry never triggers background submission')
  await assert.rejects(restarted.indeed(url), /Retry after/)
  assert.equal(posts, 2)
})

test('timed-out snapshots resume across restart with GET only and then reuse validated data', async () => {
  const file = resolve('.qa', `indeed-resume-${randomUUID()}.json`)
  let now = Date.now(),
    posts = 0,
    ready = false,
    gets = 0
  const transport: typeof fetch = async (input, init) => {
    if (init?.method === 'POST') {
      posts++
      return json({ snapshot_id: 'sd_resume' }, 202)
    }
    gets++
    return String(input).includes('/progress/')
      ? json({ status: ready ? 'ready' : 'running' })
      : json([record])
  }
  await assert.rejects(
    new BrightData('test', transport, validate, 0, new IndeedState(file), () => now).indeed(url),
    /pending/,
  )
  const restarted = new BrightData('test', transport, validate, 0, new IndeedState(file), () => now)
  const before = gets
  await assert.rejects(restarted.indeed(url), /Retry after/)
  assert.equal(gets, before)
  now += 61000
  ready = true
  const result = await restarted.indeed(url)
  assert.equal(result.extraction.job.title, record.job_title)
  assert.equal(result.snapshotId, 'sd_resume')
  assert.equal(posts, 1)
  const successfulGets = gets
  const cached = await new BrightData(
    'test',
    transport,
    validate,
    0,
    new IndeedState(file),
    () => now,
  ).indeed(url)
  assert.equal(cached.page.fetchedAt, result.page.fetchedAt)
  assert.equal(gets, successfulGets)
})

test('concurrent clients and uncertain POST outcomes cannot submit duplicates', async () => {
  const file = resolve('.qa', `indeed-claims-${randomUUID()}.json`)
  let posts = 0
  const transport: typeof fetch = async () => {
    posts++
    throw new Error('Unknown POST outcome')
  }
  const clients = [1, 2].map(
    () => new BrightData('test', transport, validate, 0, new IndeedState(file)),
  )
  const results = await Promise.allSettled(clients.map((client) => client.indeed(url)))
  assert.ok(results.every((result) => result.status === 'rejected'))
  assert.equal(posts, 1)
  await assert.rejects(
    new BrightData('test', transport, validate, 0, new IndeedState(file)).indeed(url),
    /snapshot ID has not been confirmed/,
  )
  assert.equal(posts, 1)
})

test('HTTP Retry-After during polling preserves the snapshot for a GET-only retry', async () => {
  let now = Date.now(),
    posts = 0,
    limited = true
  const transport: typeof fetch = async (input, init) => {
    if (init?.method === 'POST') {
      posts++
      return json({ snapshot_id: 'sd_limited' }, 202)
    }
    if (limited) return new Response('', { status: 429, headers: { 'Retry-After': '3600' } })
    return String(input).includes('/progress/') ? json({ status: 'ready' }) : json([record])
  }
  const client = new BrightData('test', transport, validate, 0, new IndeedState(), () => now)
  await assert.rejects(
    client.indeed(url),
    (error: unknown) =>
      error instanceof AppError && error.retryAt === new Date(now + 3600000).toISOString(),
  )
  now += 31 * 60000
  await assert.rejects(client.indeed(url), /Retry after/)
  now += 30 * 60000
  limited = false
  assert.equal((await client.indeed(url)).snapshotId, 'sd_limited')
  assert.equal(posts, 1)
})

test('administrative recovery of an existing snapshot only reads and blocks duplicate retries on failure', async () => {
  let gets = 0
  const transport: typeof fetch = async (input, init) => {
    assert.equal(init?.method, 'GET')
    gets++
    return String(input).includes('/progress/')
      ? json({ status: 'ready' })
      : json([{ error_code: 'rate_limit' }])
  }
  const client = new BrightData('test', transport, validate, 0)
  await assert.rejects(client.resumeSnapshot(url, 'sd_existing'), /Retry after/)
  await assert.rejects(client.indeed(url), /Retry after/)
  assert.equal(gets, 2)
})

test('corrupted saved state fails closed without starting another scrape', async () => {
  const file = resolve('.qa', `indeed-corrupt-${randomUUID()}.json`)
  await writeFile(file, 'broken JSON')
  let calls = 0
  const client = new BrightData(
    'test',
    async () => {
      calls++
      return json([record])
    },
    validate,
    0,
    new IndeedState(file),
  )
  await assert.rejects(client.indeed(url), /Saved Indeed collection state could not be read/)
  assert.equal(calls, 0)
})

test('simultaneous clicks join one collection rather than creating duplicate POSTs', async () => {
  let posts = 0
  const client = new BrightData(
    'test',
    async () => {
      posts++
      return json([record])
    },
    validate,
    0,
  )
  const [first, second] = await Promise.all([
    client.indeed(url),
    client.indeed(url + '&utm_source=copy'),
  ])
  assert.equal(posts, 1)
  assert.equal(first.page.text, second.page.text)
})

test('API exposes cooldown and retry time without a report, while ATS still completes', async (t) => {
  const state = new IndeedState()
  const until = Date.now() + 30 * 60000
  await state.transaction((data) => {
    data.cooldownUntil = until
  })
  let brightCalls = 0,
    tinyCalls = 0
  const fallback = new BrightData(
    'test',
    async () => {
      brightCalls++
      throw new Error('No calls during cooldown')
    },
    validate,
    0,
    state,
  )
  const target = 'https://careers.example.com/jobs/engineer'
  const provider = {
    page: async (value: string) => {
      tinyCalls++
      return {
        url: value,
        title: record.job_title,
        text: `${record.job_title}\n${record.description_text}\n\nApply for this role.`,
        links: [],
        fetchedAt: new Date().toISOString(),
      }
    },
  } as unknown as TinyFish
  const app = createApp({
    key: 'test',
    fallback,
    provider,
    validate,
    store: new Store(resolve('.qa', `cooldown-api-${randomUUID()}`)),
  })
  app.listen(0, '127.0.0.1')
  await once(app, 'listening')
  t.after(() => {
    app.closeAllConnections()
    app.close()
  })
  const origin = `http://127.0.0.1:${(app.address() as AddressInfo).port}`
  const run = async (jobUrl: string) => {
    const response = await fetch(origin + '/api/analyses', {
      method: 'POST',
      headers: { Origin: 'http://127.0.0.1:5173', 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: jobUrl }),
    })
    const cookie = response.headers.get('set-cookie')!.split(';')[0]
    let task = jobStatusSchema.parse(await response.json())
    for (let i = 0; i < 100 && ['queued', 'running'].includes(task.status); i++) {
      await new Promise((resolve) => setTimeout(resolve, 5))
      task = jobStatusSchema.parse(
        await (
          await fetch(origin + '/api/analyses/' + task.id, { headers: { Cookie: cookie } })
        ).json(),
      )
    }
    return task
  }
  for (let i = 0; i < 2; i++) {
    const blocked = await run(url)
    assert.equal(blocked.status, 'failed')
    assert.equal(blocked.error?.code, 'INDEED_COOLDOWN')
    assert.equal(blocked.error?.retryAt, new Date(until).toISOString())
    assert.equal(blocked.report, undefined)
  }
  assert.equal(tinyCalls, 0)
  const working = await run(target)
  assert.equal(working.status, 'completed')
  assert.equal(working.report?.analysisMethod, 'fetch-rules')
  assert.equal(tinyCalls, 1)
  assert.equal(brightCalls, 0)
})
