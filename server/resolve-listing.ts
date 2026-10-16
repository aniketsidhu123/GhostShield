import { identifyJobLink, sameJobLink } from '../src/lib/job-links'
import { AppError } from './errors'
import { analyzePage } from './page-analysis'
import { TinyFish, type Page } from './tinyfish'

/** Related-job widgets and footer warnings must not contribute to the selected role's scores. */
export function scopeListing(page: Page): Page {
  const platform = identifyJobLink(page.url).platform
  if (platform === 'Workday') {
    const lines = page.text.split('\n')
    const index = lines.findIndex(
      (line) =>
        line
          .replace(/^#{1,6}\s+/, '')
          .replace(/[*_`]/g, '')
          .trim()
          .toLowerCase() === page.title.toLowerCase(),
    )
    if (index >= 0) page = { ...page, text: lines.slice(index).join('\n') }
    else if (/\b\d+\s+JOBS FOUND\b|Search for Jobs page is loaded/i.test(page.text))
      throw new AppError(
        'NOT_A_READABLE_JOB',
        'Workday returned search results without the selected role description.',
        422,
      )
  }
  const boundaries =
    platform === 'LinkedIn'
      ? /\n(?:#{1,6}\s*)?(?:Similar jobs|More jobs like this|People also viewed|Get notified about new|Explore collaborative articles)\b/i
      : platform === 'Naukri'
        ? /\n(?:#{1,6}\s*)?(?:People who search this job|Jobs you might be interested|Similar jobs|Recommended jobs)\b/i
        : platform === 'Indeed'
          ? /\n(?:#{1,6}\s*)?(?:People also searched|Explore other jobs|Similar jobs)\b/i
          : null
  const index = boundaries ? page.text.search(boundaries) : -1
  return index < 0 ? page : { ...page, text: page.text.slice(0, index) }
}

export async function resolveListing(
  url: string,
  provider: TinyFish,
  stage: (message: string) => void,
  signal: AbortSignal,
) {
  const identity = identifyJobLink(url)
  if (identity.needsSelection)
    throw new AppError(
      'SELECT_JOB',
      `${identity.platform}: select a job in the search results, then copy its link. The URL needs ${identity.platform === 'LinkedIn' ? 'a /jobs/view/ ID or currentJobId' : identity.platform === 'Indeed' ? 'a jk or vjk job ID' : 'one specific listing'}. You do not need to find the employer careers page.`,
      400,
    )
  const read = async (target: string, render = false) => {
    const page = scopeListing(
      await (render ? provider.renderedPage(target, signal) : provider.page(target, signal)),
    )
    if (identity.jobId && !sameJobLink(identity.url, page.url))
      throw new AppError(
        'JOB_REDIRECT_MISMATCH',
        'The site redirected to a different listing or a search page. No scores were generated.',
        422,
      )
    return { page, extraction: analyzePage(page) }
  }
  try {
    const result = await read(identity.url)
    return {
      ...result,
      resolution: {
        platform: identity.platform,
        submittedUrl: url,
        resolvedUrl: result.page.url,
        method: 'direct' as const,
        jobId: identity.jobId,
      },
    }
  } catch (error) {
    if (
      !(error instanceof AppError) ||
      ![
        'SOURCE_UNAVAILABLE',
        'SOURCE_PAGE_ERROR',
        'NOT_A_READABLE_JOB',
        'JOB_REDIRECT_MISMATCH',
      ].includes(error.code) ||
      !identity.jobId
    )
      throw error
    if (['Naukri', 'Indeed'].includes(identity.platform)) {
      stage(`Reading the public ${identity.platform} page in TinyFish’s cloud browser…`)
      try {
        const result = await read(identity.url, true)
        result.extraction.limitations[0] =
          'TinyFish Browser retrieved the rendered public page. Local English text rules extracted observations. No forms, sign-in, CAPTCHA, or application steps were completed.'
        return {
          ...result,
          resolution: {
            platform: identity.platform,
            submittedUrl: url,
            resolvedUrl: result.page.url,
            method: 'cloud-render' as const,
            jobId: identity.jobId,
          },
        }
      } catch (browserError) {
        signal.throwIfAborted()
        if (
          browserError instanceof AppError &&
          (browserError.code.startsWith('PROVIDER_') || browserError.code === 'RATE_LIMIT')
        )
          throw browserError
      }
    }
    stage(`Finding the same ${identity.platform} listing by its job ID…`)
    const host = new URL(identity.url).hostname.replace(/^(www|in)\./, '')
    const candidates = await provider.searchListings(`site:${host} "${identity.jobId}"`, signal)
    for (const candidate of candidates
      .filter(
        (candidate) => sameJobLink(identity.url, candidate.url) && candidate.url !== identity.url,
      )
      .slice(0, 2)) {
      try {
        const result = await read(candidate.url)
        return {
          ...result,
          resolution: {
            platform: identity.platform,
            submittedUrl: url,
            resolvedUrl: result.page.url,
            method: 'exact-id-search' as const,
            jobId: identity.jobId,
          },
        }
      } catch (candidateError) {
        if (!(candidateError instanceof AppError) || candidateError.code.startsWith('PROVIDER_'))
          throw candidateError
      }
    }
    throw new AppError(
      'LISTING_UNAVAILABLE',
      `${identity.platform} did not provide a readable description for job ${identity.jobId}. We also searched for that exact listing, but could not retrieve it. It may be unavailable, require sign-in, or be blocked. Try again later or another job link; no scores were invented.`,
      422,
    )
  }
}
