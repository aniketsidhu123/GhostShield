import { randomUUID } from 'node:crypto'
import { descriptionAnalysisSchema, descriptionInputSchema } from '../src/lib/api-schema'
import { normalizeJobUrl } from '../src/lib/analysis'
import { analyzePage } from './page-analysis'
import { buildReport } from './scoring'
import { AppError } from './errors'
import type { Page } from './tinyfish'

/** Local text analysis only: no provider, DNS lookup, cache or snapshot writes. */
export function analyzeDescription(input: unknown) {
  const parsed = descriptionInputSchema.safeParse(input)
  if (!parsed.success)
    throw new AppError(
      'INVALID_DESCRIPTION',
      'Paste 240–30,000 characters of job description, with the job title on the first line.',
      400,
    )
  const { description, url } = parsed.data
  const title = description
    .split(/\r?\n/)
    .find((line) => line.trim())!
    .replace(/^\s*#{1,6}\s+/, '')
    .replace(/[*_`]/g, '')
    .trim()
  if (
    title.length < 3 ||
    title.length > 180 ||
    !/responsibilit|qualifications?|requirements?|this role|job description|you(?:’|'| wi)ll|what you/i.test(
      description,
    )
  )
    throw new AppError(
      'INVALID_DESCRIPTION',
      'Put the job title on its own first line, followed by the role description and responsibilities or requirements.',
      400,
    )
  let requestedUrl: string | null = null
  try {
    requestedUrl = url ? normalizeJobUrl(url) : null
  } catch {
    throw new AppError(
      'INVALID_DESCRIPTION_URL',
      'The original link must be a public job URL without sign-in details.',
      400,
    )
  }
  // Internal identity lets the existing quote-grounding/scoring rules operate unchanged.
  // This reserved .invalid URL is never requested, persisted or returned to the client.
  const page: Page = {
    url: 'https://user-provided.invalid/jobs/description',
    title,
    text: description,
    links: [],
    fetchedAt: new Date().toISOString(),
  }
  let extraction
  try {
    extraction = analyzePage(page, {
      title,
      employer: 'Not verified',
      location: 'Not verified',
      employment: 'Not verified',
    })
  } catch {
    throw new AppError(
      'INVALID_DESCRIPTION',
      'Paste one complete job description, not a sign-in page or search results. Put the job title on the first line.',
      400,
    )
  }
  // Pasted dates are not independently observed posting history.
  extraction.observations = extraction.observations.filter((item) => item.code !== 'posted_date')
  const report = buildReport({
    id: randomUUID(),
    url: page.url,
    primary: page,
    pages: [page],
    extraction,
    history: [],
    probe: false,
    limitations: [],
    sourceType: 'user-provided',
  })
  const context: Record<string, [string, string]> = {
    listing_present: [
      'Job title supplied in pasted text',
      'This title occurs in the supplied text. The original listing was not read or verified.',
    ],
    listing_details: [
      'Role details appear in pasted text',
      'The supplied text describes duties or requirements. Publication and accuracy are unverified.',
    ],
    application_instructions: [
      'Application instructions appear in pasted text',
      'These instructions were supplied by the user. No application page was visited.',
    ],
    fee_disclaimer: [
      'No-payment notice appears in pasted text',
      'This user-provided statement adds no risk points and does not verify legitimacy.',
    ],
    explicitly_closed: [
      'Pasted text says the role is closed',
      'The supplied text describes a closed role. Its status has not been independently checked.',
    ],
  }
  return descriptionAnalysisSchema.parse({
    ...report,
    mode: 'user-provided',
    analysisMethod: 'text-rules',
    requestedUrl,
    analyzedUrl: null,
    sources: [],
    history: [],
    cached: false,
    coverage: { careerPage: false, history: false, applyFlow: false },
    ghost: {
      ...report.ghost,
      confidence: 'Low',
      summary:
        'Based only on user-provided, unverified text. This score does not establish current hiring intent.',
    },
    scam: {
      ...report.scam,
      confidence: 'Low',
      summary:
        'Based only on user-provided, unverified text. A low score does not establish safety.',
    },
    signals: report.signals.map((signal) => ({
      ...signal,
      source: 'User-provided text · unverified',
      sourceUrl: undefined,
      title: context[signal.rule ?? '']?.[0] ?? signal.title,
      description:
        context[signal.rule ?? '']?.[1] ??
        `In the user-provided, unverified text: ${signal.description}`,
    })),
    recommendation:
      'Verify this exact role through independently located employer contact details. These scores assess the pasted wording only; they do not authenticate the listing or its claims.',
    limitations: [
      'User-provided text only. No website was read and neither TinyFish nor Bright Data was called for this report. Quotes match the supplied text, not an independently verified source.',
      'Any original URL is reference only. The pasted description may be incomplete, edited, outdated or unrelated to that URL. Employer identity and current hiring status are unverified.',
      'Local English text rules can miss paraphrased, non-English, image-only or omitted signals. Scores are uncalibrated signal indices, not probabilities or proof of fraud or employer intent.',
      'No posting-age, repost-history, careers-page match or application-flow verification was performed. No source snapshots were saved.',
    ],
  })
}
