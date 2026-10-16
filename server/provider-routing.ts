import { identifyJobLink } from '../src/lib/job-links'
import { AppError } from './errors'
import { resolveListing } from './resolve-listing'
import type { TinyFish } from './tinyfish'
import { BrightData } from './bright-data'

export async function resolveWithFallback(
  url: string,
  provider: TinyFish,
  stage: (message: string) => void,
  signal: AbortSignal,
  fallback?: BrightData,
) {
  const resolved = (result: Awaited<ReturnType<BrightData['indeed']>>) => ({
    ...result,
    resolution: {
      platform: 'Indeed',
      submittedUrl: url,
      resolvedUrl: result.page.url,
      method: 'bright-data' as const,
      jobId: identifyJobLink(url).jobId,
    },
  })
  const existing = await fallback?.existing(url, signal, stage)
  if (existing) return resolved(existing)
  try {
    return await resolveListing(url, provider, stage, signal)
  } catch (error) {
    // Access/content failures only: never hide TinyFish auth, billing, policy or configuration errors.
    if (
      !(error instanceof AppError) ||
      error.code !== 'LISTING_UNAVAILABLE' ||
      identifyJobLink(url).platform !== 'Indeed'
    )
      throw error
    signal.throwIfAborted()
    if (!fallback)
      throw new AppError(
        'BRIGHT_DATA_NOT_CONFIGURED',
        'TinyFish could not read this Indeed listing. Add BRIGHT_DATA_API_KEY to the server .env file and restart to enable the Indeed fallback.',
        503,
      )
    const result = await fallback.indeed(url, signal, stage)
    return resolved(result)
  }
}
