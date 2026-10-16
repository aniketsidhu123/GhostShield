import { z } from 'zod'
import { setTimeout as delay } from 'node:timers/promises'
import { AppError } from './errors'
import { assertPublicUrl } from './urls'
import { Budget, type Page } from './tinyfish'
import { identifyJobLink, sameJobLink } from '../src/lib/job-links'
import { analyzePage } from './page-analysis'

const DATASET = 'gd_l4dx9j9sscpvs7no2'
const budget = new Budget(20, 3600000)
const recordSchema = z.object({
  jobid: z.string().regex(/^[a-f0-9]{16}$/i),
  job_title: z.string().trim().min(3).max(180),
  company_name: z.string().trim().min(1).max(500),
  description_text: z.string().trim().min(240).max(160000),
  url: z.string().url().max(2048).nullish(),
  location: z.string().max(500).nullish(),
  job_location: z.string().max(500).nullish(),
  job_type: z.union([z.string(), z.array(z.string())]).nullish(),
  error: z.unknown().optional(),
  error_code: z.unknown().optional(),
})

/** Normalize only an exact-ID Indeed record. Provider dates are not original-date evidence. */
export function normalizeIndeedRecord(raw: unknown, submittedUrl: string) {
  const identity = identifyJobLink(submittedUrl)
  // Scraper failures can arrive inside HTTP 200. Never interpret them as job data.
  const failure = z
    .array(z.object({ error_code: z.string(), error: z.unknown().optional() }))
    .length(1)
    .safeParse(raw)
  if (failure.success) {
    const rateLimited = failure.data[0].error_code === 'rate_limit'
    throw new AppError(
      rateLimited ? 'BRIGHT_DATA_SOURCE_RATE_LIMIT' : 'BRIGHT_DATA_COLLECTION_FAILED',
      rateLimited
        ? 'Indeed rate-limited Bright Data while retrieving this job. Please try again later; no scores were generated.'
        : 'Bright Data could not retrieve this Indeed job description. It may be unavailable or blocked; no scores were generated.',
      rateLimited ? 429 : 422,
    )
  }
  const parsed = z.array(recordSchema).length(1).safeParse(raw)
  if (!parsed.success || identity.platform !== 'Indeed' || !identity.jobId)
    throw new AppError(
      'BRIGHT_DATA_CONTENT',
      'Bright Data did not return one complete Indeed job description. No scores were generated.',
      422,
    )
  const record = parsed.data[0]
  if (
    record.error ||
    record.error_code ||
    record.jobid.toLowerCase() !== identity.jobId ||
    (record.url && !sameJobLink(identity.url, record.url))
  )
    throw new AppError(
      'BRIGHT_DATA_JOB_MISMATCH',
      'Bright Data could not confirm the exact submitted Indeed job ID. No scores were generated.',
      422,
    )
  if (
    /^(?:sign in|log ?in|access denied|verify you are human|just a moment)\b/i.test(
      record.description_text,
    ) ||
    /<\/?(?:html|script|body)\b/i.test(record.description_text)
  )
    throw new AppError(
      'BRIGHT_DATA_CONTENT',
      'Bright Data returned an access page or unsupported content instead of job text.',
      422,
    )
  const page: Page = {
    url: identity.url,
    requestedUrl: submittedUrl,
    title: record.job_title,
    text: `${record.job_title}\n\n${record.description_text}`,
    links: [],
    fetchedAt: new Date().toISOString(),
    retrieval: 'bright-data',
  }
  const extraction = analyzePage(page, {
    title: record.job_title,
    employer: record.company_name,
    location: record.location ?? record.job_location ?? 'Not established',
    employment:
      (Array.isArray(record.job_type) ? record.job_type.join(', ') : record.job_type)?.slice(
        0,
        200,
      ) ?? 'Not established',
  })
  extraction.limitations[0] =
    'Bright Data’s Indeed scraper returned the matching job ID, title and description. Quotes were checked against its returned text; the page was not independently readable through TinyFish. Check time is retrieval time, not confirmation of active hiring or original posting age.'
  // A complete description is contextual evidence even if its section labels use different wording.
  if (!extraction.observations.some((o) => o.code === 'listing_details')) {
    const excerpt = record.description_text
      .split(/\n\s*\n|\n/)
      .find((p) => p.trim().length >= 60 && p.trim().length <= 1000)
    if (excerpt)
      extraction.observations.push({
        code: 'listing_details',
        quote: excerpt.trim(),
        sourceUrl: page.url,
        date: null,
      })
  }
  return { page, extraction }
}

export class BrightData {
  constructor(
    private key: string,
    private transport: typeof fetch = fetch,
    private validate = assertPublicUrl,
    private pollMs = 10000,
  ) {}

  private async request(path: string, signal: AbortSignal, body?: unknown) {
    let response: Response
    try {
      response = await this.transport(`https://api.brightdata.com/datasets/v3/${path}`, {
        method: body ? 'POST' : 'GET',
        redirect: 'error',
        headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.any([signal, AbortSignal.timeout(body ? 75000 : 30000)]),
      })
    } catch {
      throw new AppError(
        'BRIGHT_DATA_UNREACHABLE',
        'Bright Data did not respond. The request was not automatically resubmitted; check its dashboard before retrying.',
      )
    }
    if (!response.ok) {
      await response.body?.cancel()
      const messages: Record<number, string> = {
        401: 'Bright Data rejected the API key. Check BRIGHT_DATA_API_KEY and restart the API.',
        402: 'Bright Data allowance or credits are exhausted. Check your account limits.',
        403: 'Bright Data denied access. Enable the Indeed scraper and check your API token permissions.',
        429: 'Bright Data is rate limited. Please retry later.',
      }
      throw new AppError(
        'BRIGHT_DATA_REQUEST',
        messages[response.status] ??
          `Bright Data could not complete the request (HTTP ${response.status}).`,
        response.status === 429 ? 429 : 502,
      )
    }
    const reader = response.body?.getReader()
    if (!reader) throw new AppError('BRIGHT_DATA_FORMAT', 'Bright Data returned no response body.')
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > 4 * 1024 * 1024) {
          await reader.cancel()
          throw new AppError(
            'BRIGHT_DATA_SIZE',
            'Bright Data returned more data than one listing can safely contain.',
          )
        }
        chunks.push(value)
      }
      return {
        status: response.status,
        data: JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown,
      }
    } catch (error) {
      if (error instanceof AppError) throw error
      throw new AppError('BRIGHT_DATA_FORMAT', 'Bright Data returned incomplete or invalid JSON.')
    }
  }

  async indeed(
    url: string,
    signal: AbortSignal = AbortSignal.timeout(190000),
    stage = (_message: string) => {},
  ) {
    const target = identifyJobLink(await this.validate(url))
    if (target.platform !== 'Indeed' || !target.jobId || target.needsSelection)
      throw new AppError(
        'BRIGHT_DATA_UNSUPPORTED',
        'The Bright Data fallback currently supports selected Indeed job URLs only.',
        400,
      )
    if (!this.key)
      throw new AppError(
        'BRIGHT_DATA_NOT_CONFIGURED',
        'TinyFish could not read this Indeed listing. Add BRIGHT_DATA_API_KEY to the server .env file and restart to enable the Indeed fallback.',
        503,
      )
    budget.take()
    const bounded = AbortSignal.any([signal, AbortSignal.timeout(190000)])
    stage(
      'TinyFish could not read this listing. Retrieving the same Indeed job through Bright Data…',
    )
    // Never retry POST: a transport timeout may already have started billable work.
    let result = await this.request(
      `scrape?dataset_id=${DATASET}&format=json&include_errors=true`,
      bounded,
      { input: [{ url: target.url }] },
    )
    let snapshotId: string | undefined
    if (result.status === 202) {
      const parsed = z
        .object({ snapshot_id: z.string().regex(/^s[d]?_[a-zA-Z0-9_-]{1,100}$/) })
        .safeParse(result.data)
      if (!parsed.success)
        throw new AppError('BRIGHT_DATA_FORMAT', 'Bright Data did not provide a valid snapshot ID.')
      snapshotId = parsed.data.snapshot_id
      let ready = false
      for (let attempt = 0; attempt < 12; attempt++) {
        try {
          await delay(this.pollMs, undefined, { signal: bounded })
        } catch {
          throw new AppError(
            'BRIGHT_DATA_TIMEOUT',
            `Bright Data snapshot ${snapshotId} was not ready before the scan stopped. Check its dashboard before starting another scan.`,
          )
        }
        stage('Bright Data is collecting the selected Indeed description…')
        const progress = await this.request(`progress/${snapshotId}`, bounded)
        const state = z
          .object({ status: z.enum(['starting', 'running', 'ready', 'failed', 'canceled']) })
          .safeParse(progress.data)
        if (!state.success)
          throw new AppError(
            'BRIGHT_DATA_FORMAT',
            'Bright Data returned an unknown collection status.',
          )
        if (state.data.status === 'ready') {
          ready = true
          break
        }
        if (['failed', 'canceled'].includes(state.data.status))
          throw new AppError(
            'BRIGHT_DATA_FAILED',
            'Bright Data could not collect this Indeed listing. No scores were generated.',
          )
      }
      if (!ready)
        throw new AppError(
          'BRIGHT_DATA_TIMEOUT',
          `Bright Data is still processing snapshot ${snapshotId}. Check its dashboard before starting another scan.`,
        )
      result = await this.request(`snapshot/${snapshotId}?format=json`, bounded)
    }
    return { ...normalizeIndeedRecord(result.data, target.url), snapshotId }
  }
}
