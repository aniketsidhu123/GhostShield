import type { JobAnalysis, Signal, RiskScore } from '../src/types/analysis'
import type { Extraction } from './extraction'
import type { Page } from './tinyfish'
import type { Snapshot } from './store'
import { canonicalUrl } from './urls'
import { AppError } from './errors'

export const SCORING_VERSION = 'board-page-signals-v4'
export const rules = {
  listing_details: {
    kind: 'verified',
    weight: 0,
    title: 'Role details are published',
    description:
      'The fetched page describes duties or requirements. This is page content, not verification of hiring intent.',
  },
  application_instructions: {
    kind: 'verified',
    weight: 0,
    title: 'An application section is visible',
    description:
      'The fetched page includes an Apply section. No form was filled or submitted, and later steps were not inspected.',
  },
  fee_disclaimer: {
    kind: 'verified',
    weight: 0,
    title: 'A no-payment notice is published',
    description:
      'The page warns against recruitment payments. This statement adds no risk points and does not independently establish legitimacy.',
  },
  listing_present: {
    kind: 'verified',
    weight: 0,
    title: 'The posting was readable',
    description:
      'The submitted page contains this role. Readability does not establish current hiring intent.',
  },
  official_active: {
    kind: 'verified',
    weight: 0,
    title: 'Matching role on an employer careers page',
    description:
      'A matching role was observed on the employer careers site or its linked ATS. It is not a guarantee of an active hiring process.',
  },
  explicitly_closed: {
    kind: 'verified',
    weight: 0,
    title: 'This role is explicitly closed',
    description:
      'The page states that this role is closed. A closed listing alone is not evidence of ghost hiring or fraud.',
  },
  talent_pool: {
    kind: 'ghost',
    weight: 20,
    title: 'Future-opportunity or talent-pool listing',
    description:
      'The text describes collecting applications for future openings rather than a current vacancy. This can be legitimate, but current hiring intent is limited.',
  },
  hiring_paused: {
    kind: 'ghost',
    weight: 25,
    title: 'An explicit hiring pause was observed',
    description:
      'The source describes paused hiring relevant to this role. Confirm whether this specific opening has an exception.',
  },
  upfront_fee: {
    kind: 'scam',
    weight: 45,
    title: 'An applicant payment is requested',
    description:
      'The source requests an applicant fee before hiring. Verify independently before paying or sharing payment details.',
  },
  bank_before_offer: {
    kind: 'scam',
    weight: 35,
    title: 'Bank details requested before an offer',
    description:
      'The source requests banking details before an offer, rather than ordinary payroll onboarding after hiring.',
  },
  whatsapp_only: {
    kind: 'scam',
    weight: 15,
    title: 'WhatsApp is the only application channel',
    description:
      'The text explicitly restricts applications to WhatsApp. This is a weak identity-verification signal, not proof of fraud.',
  },
  recruiter_mismatch: {
    kind: 'scam',
    weight: 20,
    title: 'Recruiter identity needs verification',
    description:
      'The source documents an inconsistency in the claimed employer or recruiter identity. Third-party ATS and staffing domains alone do not qualify.',
  },
} as const
export function normalizedText(value: string) {
  return value
    .normalize('NFKC')
    .replace(/[*_`#]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}
export function grounded(quote: string, page: Page, minimumLength = 12) {
  const normalized = normalizedText(quote)
  return normalized.length >= minimumLength && normalizedText(page.text).includes(normalized)
}
function permits(code: string, quote: string) {
  if (code === 'upfront_fee')
    return (
      /fee|payment|deposit|pay\b|upi/i.test(quote) &&
      !/(?:never|do not|don't|no|not)\s+(?:\w+\s+){0,3}(?:pay|charge|fee|payment|deposit|require)/i.test(
        quote,
      )
    )
  if (code === 'bank_before_offer')
    return (
      /bank|account|ifsc|otp|pin/i.test(quote) && /before|prior|interview|application/i.test(quote)
    )
  if (code === 'whatsapp_only') return /whats\s*app/i.test(quote) && /only|exclusiv/i.test(quote)
  if (code === 'hiring_paused') return /paus|freez|frozen|halt/i.test(quote)
  if (code === 'talent_pool')
    return /talent pool|future opportunit|future opening|no current|not (?:a|an) (?:active|current)/i.test(
      quote,
    )
  return true
}

export function buildReport(input: {
  id: string
  url: string
  primary: Page
  pages: Page[]
  extraction: Extraction
  history: Snapshot[]
  probe: boolean
  runId?: string
  limitations: string[]
}): JobAnalysis {
  const { extraction, primary, history } = input
  if (
    !extraction.readable ||
    !extraction.isJobListing ||
    !grounded(extraction.titleQuote, primary, 3) ||
    !normalizedText(extraction.titleQuote).includes(normalizedText(extraction.job.title))
  ) {
    throw new AppError(
      'NOT_A_READABLE_JOB',
      'A specific job posting could not be verified on this page. Try the direct public role URL. No scores were generated.',
      422,
    )
  }
  const checkedAt = new Date().toISOString()
  const limitations = [...input.limitations, ...extraction.limitations]
  const signals: Signal[] = []
  const seen = new Set<string>()
  let postedDate: string | null = null
  for (const observation of extraction.observations) {
    let url: string
    try {
      url = canonicalUrl(observation.sourceUrl)
    } catch {
      continue
    }
    const page = input.pages.find((page) => page.url === url || page.requestedUrl === url)
    if (
      !page ||
      !grounded(observation.quote, page, observation.code === 'listing_present' ? 3 : 12) ||
      !permits(observation.code, observation.quote)
    ) {
      limitations.push(
        'An agent observation was excluded because its supporting text could not be independently confirmed.',
      )
      continue
    }
    if (seen.has(observation.code)) continue
    seen.add(observation.code)
    if (observation.code === 'posted_date') {
      if (
        page.url !== primary.url ||
        !observation.date ||
        !/^\d{4}-\d{2}-\d{2}$/.test(observation.date)
      )
        continue
      const date = new Date(`${observation.date}T00:00:00Z`)
      if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== observation.date)
        continue
      // Require the extracted date to be supported by the quote, not a model guess.
      const quote = normalizedText(observation.quote)
      const month = date
        .toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
        .toLowerCase()
      const dateInQuote =
        quote.includes(observation.date) ||
        (quote.includes(month) &&
          quote.includes(String(date.getUTCFullYear())) &&
          new RegExp(`\\b0?${date.getUTCDate()}\\b`).test(quote))
      const age = (Date.now() - date.getTime()) / 86400000
      if (!dateInQuote || !Number.isFinite(age) || age < 0 || age > 3650) continue
      postedDate = observation.date
      if (age >= 90)
        signals.push({
          id: 'posted-age',
          kind: 'ghost',
          title: 'Original posting date is at least 90 days old',
          description: `The cited original posting date is ${observation.date}. Age alone does not establish hiring intent.`,
          observedAt: checkedAt,
          source: page.title,
          sourceUrl: page.url,
          quote: observation.quote,
          weight: 15,
          rule: 'posted_age_90',
        })
      continue
    }
    if (observation.code === 'official_active') {
      if (
        !normalizedText(page.text).includes(normalizedText(extraction.job.title)) ||
        !normalizedText(page.text).includes(normalizedText(extraction.job.employer)) ||
        /^(.*\.)?(linkedin\.com|indeed\.com|naukri\.com|glassdoor\.com)$/.test(
          new URL(page.url).hostname,
        )
      )
        continue
    }
    const rule = rules[observation.code]
    signals.push({
      id: observation.code,
      kind: rule.kind,
      title: rule.title,
      description: rule.description,
      observedAt: checkedAt,
      source: page.title,
      sourceUrl: page.url,
      quote: observation.quote,
      weight: rule.weight,
      rule: observation.code,
    })
  }
  if (!signals.some((signal) => signal.id === 'listing_present'))
    signals.unshift({
      id: 'listing_present',
      kind: 'verified',
      title: rules.listing_present.title,
      description: rules.listing_present.description,
      observedAt: checkedAt,
      source: primary.title,
      sourceUrl: primary.url,
      quote: extraction.titleQuote,
      weight: 0,
      rule: 'listing_present',
    })
  // A closed role is not penalized for age or a historical hiring pause.
  const closed = signals.some((signal) => signal.rule === 'explicitly_closed')
  if (closed)
    for (let index = signals.length - 1; index >= 0; index--)
      if (signals[index].kind === 'ghost') signals.splice(index, 1)
  const coverage = {
    careerPage: signals.some((signal) => signal.rule === 'official_active'),
    history: history.length >= 2,
    applyFlow: input.probe && extraction.applyFlowInspected,
  }
  if (!coverage.careerPage)
    limitations.push(
      'A matching active role on the employer careers site was not established. No risk points were added for this absence.',
    )
  if (!coverage.history)
    limitations.push(
      'There is not yet enough locally observed history to assess reposting. This check starts the snapshot history.',
    )
  if (!coverage.applyFlow)
    limitations.push(
      'The application flow was not inspected; fees or data requests in later steps may be missed.',
    )
  limitations.push(
    'These are uncalibrated, rule-based signal indices, not probabilities or proof of employer intent or fraud. Text classifications can be mistaken; review the quoted sources.',
  )
  function score(kind: 'ghost' | 'scam'): RiskScore {
    const points = Math.min(
      100,
      signals
        .filter((signal) => signal.kind === kind)
        .reduce((sum, signal) => sum + signal.weight, 0),
    )
    return {
      value: points,
      label:
        closed && kind === 'ghost'
          ? 'Closed listing · intent not inferred'
          : points >= 65
            ? 'Strong observed signals'
            : points >= 35
              ? 'Several observed signals'
              : points
                ? 'Limited observed signals'
                : 'No weighted signals observed',
      confidence:
        kind === 'ghost'
          ? coverage.careerPage && coverage.history
            ? 'Medium'
            : 'Low'
          : coverage.applyFlow
            ? 'Medium'
            : 'Low',
      summary:
        kind === 'ghost'
          ? 'Based on the sources read at check time. A low index does not confirm current hiring intent.'
          : 'Based on observable requests and identity signals. A low index does not establish safety.',
    }
  }
  const ghost = score('ghost'),
    scam = score('scam')
  return {
    id: input.id,
    mode: 'live',
    scenario: (scam.value ?? 0) >= 35 ? 'scam' : (ghost.value ?? 0) > 0 ? 'ghost' : 'active',
    requestedUrl: input.url,
    analyzedUrl: primary.url,
    checkedAt,
    job: extraction.job,
    ghost,
    scam,
    signals,
    coverage,
    recommendation: closed
      ? 'This role appears closed. Look for a current opening on the employer’s official careers site.'
      : (scam.value ?? 0) >= 35
        ? 'Verify the role through independently located employer contact details before paying or sharing financial information.'
        : 'Confirm that the employer is actively hiring for this exact role, then review the official application process before sharing personal information.',
    limitations: [...new Set(limitations)].slice(0, 30),
    sources: input.pages.map((page) => ({
      url: page.url,
      title: page.title,
      fetchedAt: page.fetchedAt,
    })),
    scoringVersion: SCORING_VERSION,
    providerRunId: input.runId,
    analysisMethod: input.runId
      ? 'agent'
      : primary.retrieval === 'browser'
        ? 'browser-rules'
        : 'fetch-rules',
    cached: false,
    // The posting date is stored in snapshot history by the pipeline, not inferred from page metadata.
    ...{
      history: history.map((snapshot, index) =>
        index === history.length - 1 ? { ...snapshot, postedDate } : snapshot,
      ),
    },
  }
}
