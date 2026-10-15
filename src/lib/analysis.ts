import type { JobAnalysis, SavedListing } from '../types/analysis'

export function normalizeJobUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new Error('Paste a job listing link to get started.')
  let url: URL
  try {
    url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
  } catch {
    throw new Error('That link doesn’t look right. Try a full job listing URL.')
  }
  const hostname = url.hostname.toLowerCase()
  const local =
    /^(localhost|.*\.localhost|.*\.local|.*\.internal|127\..*|10\..*|192\.168\..*|169\.254\..*|0\..*|172\.(1[6-9]|2\d|3[01])\..*)$/.test(
      hostname,
    )
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    !hostname.includes('.') ||
    local ||
    hostname.includes(':') ||
    url.username ||
    url.password
  ) {
    throw new Error('Use a public http or https job listing link, without sign-in details.')
  }
  url.hash = ''
  for (const key of [...url.searchParams.keys()]) {
    if (/^utm_|^(fbclid|gclid)$/i.test(key)) url.searchParams.delete(key)
  }
  return url.toString()
}

export function scoreBand(value: number): 'low' | 'medium' | 'high' {
  return value >= 65 ? 'high' : value >= 35 ? 'medium' : 'low'
}

export function sumSignals(analysis: JobAnalysis, kind: 'ghost' | 'scam'): number {
  return Math.min(
    100,
    Math.max(
      0,
      analysis.signals.filter((s) => s.kind === kind).reduce((total, s) => total + s.weight, 0),
    ),
  )
}

const WATCHLIST_KEY = 'ghostjob-shield:watchlist:v1'

export function readWatchlist(): SavedListing[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(WATCHLIST_KEY) ?? '[]')
    if (!Array.isArray(value)) return []
    return value.filter(
      (item): item is SavedListing =>
        !!item &&
        typeof item === 'object' &&
        typeof item.id === 'string' &&
        typeof item.title === 'string' &&
        typeof item.employer === 'string' &&
        typeof item.savedAt === 'string' &&
        !Number.isNaN(Date.parse(item.savedAt)) &&
        ['ghost', 'scam', 'active'].includes(item.scenario) &&
        ['demo', 'live'].includes(item.mode),
    )
  } catch {
    return []
  }
}

export function writeWatchlist(listings: SavedListing[]): boolean {
  try {
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(listings))
    return true
  } catch {
    return false
  }
}
