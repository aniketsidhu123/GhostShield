import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeJobUrl, readWatchlist, scoreBand, sumSignals, writeWatchlist } from './analysis'
import { mockAnalyses } from '../data/mockAnalysis'

test('normalizes public links while preserving the job identity', () => {
  assert.equal(
    normalizeJobUrl('  careers.example.com/jobs?id=42&utm_source=email#apply '),
    'https://careers.example.com/jobs?id=42',
  )
  assert.equal(
    normalizeJobUrl('https://www.linkedin.com/jobs/view/123'),
    'https://www.linkedin.com/jobs/view/123',
  )
})

test('rejects invalid, credential-bearing and local URLs', () => {
  for (const value of [
    '',
    'not a link',
    'javascript:alert(1)',
    'ftp://example.com/job',
    'http://localhost/jobs',
    'http://192.168.1.1/job',
    'http://[::1]/job',
    'https://user:secret@example.com/job',
    'http://2130706433/jobs',
  ]) {
    assert.throws(() => normalizeJobUrl(value), Error, value)
  }
})

test('every demo score matches the disclosed signal contributions', () => {
  for (const analysis of Object.values(mockAnalyses)) {
    assert.equal(sumSignals(analysis, 'ghost'), analysis.ghost.value)
    assert.equal(sumSignals(analysis, 'scam'), analysis.scam.value)
    assert.equal(analysis.mode, 'demo')
    assert.equal(analysis.analyzedUrl, null)
  }
})

test('score categories preserve both decision thresholds', () => {
  assert.equal(scoreBand(34), 'low')
  assert.equal(scoreBand(35), 'medium')
  assert.equal(scoreBand(64), 'medium')
  assert.equal(scoreBand(65), 'high')
})

test('watchlist survives reloads, rejects corrupt data, and reports storage failures', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  let stored: string | null = null
  const storage = {
    getItem: () => stored,
    setItem: (_key: string, value: string) => {
      stored = value
    },
  }
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
  try {
    assert.deepEqual(readWatchlist(), [])
    const item = {
      id: 'demo-ghost-001',
      scenario: 'ghost' as const,
      title: 'Product Designer',
      employer: 'Northstar Labs',
      savedAt: '2026-10-14T10:30:00Z',
      mode: 'demo' as const,
    }
    assert.equal(writeWatchlist([item]), true)
    assert.deepEqual(readWatchlist(), [item])
    stored = JSON.stringify([item, { id: 'broken' }, null, { ...item, savedAt: 'invalid' }])
    assert.deepEqual(readWatchlist(), [item])
    stored = '{broken-json'
    assert.deepEqual(readWatchlist(), [])
    storage.setItem = () => {
      throw new Error('Quota exceeded')
    }
    assert.equal(writeWatchlist([item]), false)
    storage.getItem = () => {
      throw new Error('Storage blocked')
    }
    assert.deepEqual(readWatchlist(), [])
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  }
})
