import type { Extraction } from './extraction'
import type { Page } from './tinyfish'
import { AppError } from './errors'
import { identifyJobLink } from '../src/lib/job-links'

const clean = (text: string) =>
  text
    .replace(/^\s*#{1,6}\s+/, '')
    .replace(/[*_`]/g, '')
    .trim()
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const negative = /\b(?:no|not|never|don't|do not|without|avoid|beware|scam|fraud|warning)\b/i

/** Conservative English text rules over the fetched page, with exact excerpts, no model guesses. */
export function analyzePage(page: Page): Extraction {
  const lines = page.text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const headings = lines.filter((line) => /^#{1,3}\s+\S/.test(line))
  const metaTitle = page.title.replace(/^Job Application for\s+/i, '').split(/\s+(?:at|\||–)\s+/)[0]
  const heading =
    headings.find((line) => clean(line).toLowerCase() === metaTitle.toLowerCase()) ??
    headings.find((line) => /^#\s+/.test(line)) ??
    headings.find(
      (line) =>
        !/^(?:about|job details|job description|benefits|profile insights|sign in|join|cookie|privacy)/i.test(
          clean(line),
        ),
    )
  const titleQuote =
    heading ?? lines.find((line) => clean(line).toLowerCase() === metaTitle.toLowerCase())
  const title = clean(titleQuote ?? '')
  const path = new URL(page.url).pathname
  const identity = identifyJobLink(page.url)
  const specificPath =
    (!!identity.jobId && !identity.needsSelection) ||
    /\/job-listings-[a-z0-9-]+\d{8,}/i.test(path) ||
    /\/(?:jobs?|job-listings?|positions?|requisitions?|careers)\/[^/]+/i.test(path) ||
    /\/[a-f0-9-]{24,}(?:\/|$)/i.test(path)
  const roleBody =
    /responsibilit|qualifications?|requirements?|you(?:’|'| wi)ll|this role|job description|what you/i.test(
      page.text,
    )
  const application = /apply|application|candidate|hiring|recruit/i.test(page.text)
  if (
    !titleQuote ||
    title.length < 3 ||
    title.length > 180 ||
    !specificPath ||
    /^(?:careers?|jobs?|job search|search jobs|current openings|access denied|just a moment|page not found|error|sign in|sign up|login|security check|verify you are human)(?:\s|$)/i.test(
      title,
    ) ||
    page.text.length < 240 ||
    !roleBody ||
    !application
  ) {
    throw new AppError(
      'NOT_A_READABLE_JOB',
      'A specific job description could not be verified. Select one job on the board and paste its link; a search page without a selected job cannot be scored.',
      422,
    )
  }

  let employer =
    page.title.match(/\s+at\s+(.+?)(?:\s+—|\s+\||$)/i)?.[1]?.trim() ??
    page.title.match(/^(.+?)\s+hiring\s+/i)?.[1]?.trim() ??
    'Not established'
  const hostname = new URL(page.url).hostname
  if (
    employer === 'Not established' &&
    /(?:greenhouse\.io|lever\.co|ashbyhq\.com)$/.test(hostname)
  ) {
    const tenant = path.split('/').filter(Boolean)[0]
    // Use the tenant only if its name is actually present in the fetched body.
    if (tenant && /^[a-z][a-z0-9-]{1,60}$/i.test(tenant)) {
      const matched = page.text.match(new RegExp(`\\b${escape(tenant.replace(/-/g, ' '))}\\b`, 'i'))
      if (matched) employer = matched[0]
    }
  }
  const headingIndex = lines.indexOf(titleQuote)
  let locationLine = lines
    .slice(headingIndex + 1, headingIndex + 5)
    .find(
      (line) =>
        line.length < 120 && !/^[#*\[]/.test(line) && /,|\bremote\b|^location\s*:/i.test(line),
    )
  if (identity.platform === 'Workday') {
    const locationIndex = lines.findIndex((line) => /^locations?$/i.test(clean(line)))
    if (locationIndex >= 0) locationLine = lines[locationIndex + 1]
    const inlineLocation = lines.find((line) => /^locations?\s*:/i.test(clean(line)))
    if (inlineLocation) locationLine = clean(inlineLocation).replace(/^locations?\s*:\s*/i, '')
    const tenant = hostname.split('.')[0]
    const matched = page.text.match(new RegExp(`\\b${escape(tenant)}\\b`, 'i'))
    if (matched) employer = matched[0]
  }
  if (identity.platform === 'LinkedIn') {
    const match = page.title.match(/\s+—\s+(.+?)\s*\|/)
    if (match) locationLine = match[1]
    const company = lines.find((line) => /^Company:\s*\S/i.test(clean(line)))
    if (company) employer = clean(company).replace(/^Company:\s*/i, '')
    employer = employer.replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&')
  }
  const employment =
    page.text.match(/\b(?:full[ -]time|part[ -]time|contract|internship)\b/i)?.[0] ??
    'Not established'
  const observations: Extraction['observations'] = []
  const add = (
    code: Extraction['observations'][number]['code'],
    quote: string,
    date: string | null = null,
  ) => {
    if (
      quote.length >= 12 &&
      quote.length <= 1000 &&
      !observations.some((item) => item.code === code)
    )
      observations.push({ code, quote, sourceUrl: page.url, date })
  }
  // Each match is a complete paragraph or line; never extract just a keyword without its context.
  const excerpts = page.text
    .split(/\n\s*\n/)
    .map((text) => text.trim())
    .filter((text) => text.length >= 12 && text.length <= 1000)
  add(
    'listing_present',
    titleQuote.length >= 12
      ? titleQuote
      : (excerpts.find((text) => text.includes(title)) ?? titleQuote),
  )
  for (const excerpt of excerpts) {
    const text = clean(excerpt)
    if (
      /this role|you(?:’|')ll|responsibilit|qualifications|requirements/i.test(text) &&
      text.length >= 60
    )
      add('listing_details', excerpt)
    if (
      /^(?:apply for (?:this|the) (?:job|role)|how to apply|application instructions)\b/i.test(text)
    )
      add('application_instructions', excerpt)
    if (/\b(?:never|do not|don't|no)\b.{0,100}\b(?:pay|charge|fee|money|payment)\b/i.test(text))
      add('fee_disclaimer', excerpt)
    if (
      /\b(?:this (?:job|role|position)|applications? for this (?:job|role|position))\b.{0,60}\b(?:is closed|has been filled|no longer (?:available|accepting))\b|^this job is no longer available/i.test(
        text,
      )
    )
      add('explicitly_closed', excerpt)
    if (
      /\b(?:this (?:is|role|position|posting|opportunity)|you are applying|we are (?:building|creating)|join our)\b.{0,150}\b(?:talent pool|future opportunit|future openings?)\b|\bnot (?:a|an) (?:active|current) (?:vacancy|opening|position)\b/i.test(
        text,
      )
    )
      add('talent_pool', excerpt)
    if (
      /\b(?:hiring|recruitment) for this (?:role|position|job) (?:is|has been) (?:paused|frozen|halted)\b/i.test(
        text,
      ) &&
      !negative.test(text)
    )
      add('hiring_paused', excerpt)
    if (!negative.test(text)) {
      if (
        /\b(?:applicants?|candidates?|you)\s+(?:must|are required to|need to|have to)\s+pay\b.{0,100}\b(?:fee|deposit|registration|payment)\b/i.test(
          text,
        ) &&
        /before|application|interview|registration/i.test(text)
      )
        add('upfront_fee', excerpt)
      if (
        /\b(?:provide|submit|send|share)\b.{0,60}\b(?:bank account|banking details|ifsc|bank details)\b.{0,80}\b(?:before|prior to)\b.{0,30}\b(?:offer|interview|hiring)\b/i.test(
          text,
        )
      )
        add('bank_before_offer', excerpt)
      if (
        /\b(?:apply|applications?|candidates?)\b.{0,60}\bonly\b.{0,25}\bwhats\s*app\b/i.test(text)
      )
        add('whatsapp_only', excerpt)
    }
    const posted = text.match(
      /\b(?:date posted|posted on|posting date)\s*:?\s*(\d{4}-\d{2}-\d{2})\b/i,
    )
    if (posted) add('posted_date', excerpt, posted[1])
  }
  return {
    readable: true,
    isJobListing: true,
    titleQuote,
    job: {
      title,
      employer,
      location: locationLine
        ? clean(locationLine).replace(/^location\s*:\s*/i, '')
        : 'Not established',
      employment,
    },
    observations,
    applyFlowInspected: false,
    limitations: [
      'TinyFish Fetch retrieved this public page. Local English text rules extracted the observations; no Web Agent or application-flow automation was used.',
      'This page-only check can miss paraphrased, non-English, image-only, or hidden indicators. Employer identity and recruiter-domain mismatches were not independently verified.',
      'Only explicit ISO original-posting dates are assessed for age. An absent date, absent fee request, or readable Apply section does not establish safety or active hiring.',
    ],
  }
}
