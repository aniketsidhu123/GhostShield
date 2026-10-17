import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { analyzeDescription } from './description-analysis'
import { createApp } from './app'
import type { TinyFish } from './tinyfish'
import type { Store } from './store'
import {
  descriptionAnalysisSchema,
  liveAnalysisSchema,
  jobStatusSchema,
} from '../src/lib/api-schema'
import { readWatchlist, writeWatchlist } from '../src/lib/analysis'

const description = [
  'Software Engineer',
  'Responsibilities include building reliable services and maintaining distributed systems with the engineering team.',
  'Requirements include software development experience, communication skills and careful attention to detail.',
  'This posting is for our talent pool for future opportunities.',
  'Applicants must pay a registration fee of INR 2500 before the interview.',
  'Date posted: 2020-01-01',
].join('\n\n')
const url = 'https://in.indeed.com/viewjob?jk=34797a0025b9529d'

test('pasted wording yields independent grounded scores with no fetched-source claims', () => {
  const report = analyzeDescription({ description, url })
  assert.equal(report.ghost.value, 20)
  assert.equal(report.scam.value, 45)
  assert.equal(report.requestedUrl, url)
  assert.equal(report.analyzedUrl, null)
  assert.deepEqual(report.coverage, { careerPage: false, history: false, applyFlow: false })
  assert.deepEqual(report.sources, [])
  assert.deepEqual(report.history, [])
  assert.ok(descriptionAnalysisSchema.safeParse(report).success)
  assert.ok(!liveAnalysisSchema.safeParse(report).success)
  assert.ok(!JSON.stringify(report).includes('user-provided.invalid'))
  assert.ok(!report.signals.some((s) => s.rule === 'posted_age_90'))
  for (const signal of report.signals) {
    assert.ok(signal.quote && description.includes(signal.quote))
    assert.equal(signal.source, 'User-provided text · unverified')
    assert.equal(signal.sourceUrl, undefined)
  }
  assert.ok(
    !descriptionAnalysisSchema.safeParse({
      ...report,
      sources: [{ url, title: 'Fake verification', fetchedAt: report.checkedAt }],
    }).success,
  )
})

test('text validation rejects incomplete or access-page content and keeps payment disclaimers at zero', () => {
  for (const input of [
    { description: 'Too short' },
    { description: 'a'.repeat(30001) },
    { description, unexpected: true },
    { description, url: 'https://user:secret@example.com/job' },
    { description: description.replace('Software Engineer', 'Sign in') },
  ])
    assert.throws(() => analyzeDescription(input))
  const clean = description.replace(
    'Applicants must pay a registration fee of INR 2500 before the interview.',
    'We never charge an application fee or request payment from candidates.',
  )
  assert.equal(analyzeDescription({ description: clean }).scam.value, 0)
})

test('text API works without provider credentials, network validation or persistence and still enforces origin', async (t) => {
  const forbidden = () => {
    throw new Error('Text analysis must not call providers, DNS validation or store')
  }
  const server = createApp({
    store: new Proxy({}, { get: () => forbidden }) as Store,
    provider: new Proxy({}, { get: () => forbidden }) as TinyFish,
    validate: forbidden,
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => server.close())
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const headers = { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:5173' }
  const response = await fetch(`${origin}/api/description-analyses`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ description, url }),
  })
  assert.equal(response.status, 200)
  const task = jobStatusSchema.parse(await response.json())
  assert.equal(task.report?.mode, 'user-provided')
  assert.equal(task.report?.scam.value, 45)
  const badOrigin = await fetch(`${origin}/api/description-analyses`, {
    method: 'POST',
    headers: { ...headers, Origin: 'https://untrusted.example' },
    body: JSON.stringify({ description }),
  })
  assert.equal(badOrigin.status, 403)
  const invalid = await fetch(`${origin}/api/description-analyses`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ description: 'short' }),
  })
  assert.equal(invalid.status, 400)
  const live = await fetch(`${origin}/api/analyses`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ url }),
  })
  assert.equal(live.status, 503, 'Live route must still require TinyFish configuration')
})

test('saved pasted reports retain unverified provenance after reload and reject mode relabeling', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  let data = ''
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: () => data,
      setItem: (_key: string, value: string) => {
        data = value
      },
    },
  })
  try {
    const report = analyzeDescription({ description, url })
    const item = {
      id: report.id,
      title: report.job.title,
      employer: report.job.employer,
      savedAt: report.checkedAt,
      scenario: report.scenario,
      mode: report.mode,
      report,
    }
    assert.equal(writeWatchlist([item]), true)
    assert.equal(readWatchlist()[0]?.report?.mode, 'user-provided')
    data = JSON.stringify([{ ...item, mode: 'live' }])
    assert.deepEqual(readWatchlist(), [])
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  }
})
