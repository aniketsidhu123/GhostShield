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
