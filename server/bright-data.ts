import { z } from 'zod'
import { setTimeout as delay } from 'node:timers/promises'
import { AppError } from './errors'
import { assertPublicUrl } from './urls'
import { Budget, type Page } from './tinyfish'
import { identifyJobLink, sameJobLink } from '../src/lib/job-links'
import { analyzePage } from './page-analysis'
import { IndeedState, type IndeedEntry } from './indeed-state'

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
  private active = new Map<
    string,
    Promise<ReturnType<typeof normalizeIndeedRecord> & { snapshotId?: string }>
  >()
  constructor(
    private key: string,
    private transport: typeof fetch = fetch,
    private validate = assertPublicUrl,
    private pollMs = 10000,
    private state = new IndeedState(),
    private now = Date.now,
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
      if (response.status === 429) {
        const header = response.headers.get('retry-after')
        const retry =
          header && /^\d+$/.test(header)
            ? this.now() + Number(header) * 1000
            : Date.parse(header ?? '')
        throw new AppError(
          'BRIGHT_DATA_HTTP_RATE_LIMIT',
          'Indeed retrieval is rate limited.',
          429,
          new Date(
            Math.max(this.now() + 30 * 60000, Number.isFinite(retry) ? retry : 0),
          ).toISOString(),
        )
      }
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

  private cooldown(until: number, pending = false) {
    return new AppError(
      pending ? 'INDEED_PENDING' : 'INDEED_COOLDOWN',
      `${pending ? 'Indeed’s existing collection is still pending. Retrying will reuse that snapshot.' : 'Indeed could not be read. Collection requests are paused after an unreadable or rate-limited response.'} Retry after ${new Date(
        until,
      )
        .toISOString()
        .replace('T', ' ')
        .replace(
          /\.\d{3}Z$/,
          ' UTC',
        )}. No new collection was started and no scores were generated.`,
      429,
      new Date(until).toISOString(),
    )
  }

  /** Previously attempted Indeed jobs bypass another round of TinyFish retrieval. */
  async existing(url: string, signal: AbortSignal, stage: (message: string) => void) {
    const target = identifyJobLink(url)
    if (target.platform !== 'Indeed' || !target.jobId) return undefined
    const reuse = await this.state.transaction((state) => {
      const entry = state.jobs[target.jobId!]
      return (
        state.cooldownUntil > this.now() ||
        (entry &&
          (entry.status === 'pending' ||
            entry.status === 'submitting' ||
            (entry.status === 'ready' && entry.updatedAt + 3600000 > this.now()) ||
            (entry.retryAt ?? 0) > this.now()))
      )
    })
    return reuse ? this.indeed(url, signal, stage) : undefined
  }

  /** Administrative recovery of a known snapshot. This method can only perform GETs. */
  async resumeSnapshot(url: string, snapshotId: string, signal = AbortSignal.timeout(190000)) {
    const target = identifyJobLink(await this.validate(url))
    if (
      target.platform !== 'Indeed' ||
      !target.jobId ||
      !/^sd?_[a-zA-Z0-9_-]{1,100}$/.test(snapshotId)
    )
      throw new AppError(
        'BRIGHT_DATA_UNSUPPORTED',
        'Provide a selected Indeed URL and a valid existing snapshot ID.',
        400,
      )
    await this.state.transaction((state) => {
      const existing = state.jobs[target.jobId!]
      if (existing?.snapshotId && existing.snapshotId !== snapshotId)
        throw new AppError(
          'INDEED_SNAPSHOT_CONFLICT',
          'This job already has a different collection. Check saved state before changing its snapshot.',
          409,
        )
      if (!existing || existing.status === 'submitting')
        state.jobs[target.jobId!] = {
          url: target.url,
          status: 'pending',
          snapshotId,
          startedAt: this.now(),
          updatedAt: this.now(),
        }
    })
    return this.run(target.url, signal, () => {}, false)
  }

  async indeed(
    url: string,
    signal: AbortSignal = AbortSignal.timeout(190000),
    stage = (_message: string) => {},
  ) {
    const target = identifyJobLink(url)
    const key = target.jobId ?? target.url
    const active = this.active.get(key)
    if (active) {
      stage('Reusing the existing Indeed collection…')
      return active
    }
    const task = this.run(url, signal, stage, true)
    this.active.set(key, task)
    try {
      return await task
    } finally {
      this.active.delete(key)
    }
  }

  private async run(
    url: string,
    signal: AbortSignal,
    stage: (message: string) => void,
    allowCreate: boolean,
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
    const bounded = AbortSignal.any([signal, AbortSignal.timeout(190000)])
    const jobId = target.jobId
    const entry = await this.state.transaction((state) => {
      const existing = state.jobs[jobId]
      if (
        existing?.status === 'ready' &&
        existing.data &&
        existing.updatedAt + 3600000 > this.now()
      )
        return existing
      if (state.cooldownUntil > this.now()) throw this.cooldown(state.cooldownUntil)
      if (existing?.status === 'submitting')
        throw new AppError(
          'INDEED_SUBMISSION_UNCERTAIN',
          'An Indeed collection was already submitted, but its snapshot ID has not been confirmed. Check Bright Data’s dashboard before retrying; no duplicate collection was started.',
          409,
        )
      if (existing && (existing.retryAt ?? 0) > this.now())
        throw this.cooldown(existing.retryAt!, existing.status === 'pending')
      if (existing?.status === 'pending' || (!allowCreate && existing?.snapshotId)) return existing
      if (!allowCreate)
        throw new AppError(
          'INDEED_SNAPSHOT_MISSING',
          'No existing snapshot is available. No collection was started.',
          409,
        )
      for (const [id, old] of Object.entries(state.jobs))
        if (['ready', 'failed'].includes(old.status) && old.updatedAt + 86400000 < this.now())
          delete state.jobs[id]
      if (Object.keys(state.jobs).length >= 1000)
        throw new AppError(
          'INDEED_STATE_FULL',
          'Saved Indeed collections need administrator review. No new collection was started.',
          503,
        )
      budget.take()
      const claim: IndeedEntry = {
        url: target.url,
        status: 'submitting',
        startedAt: this.now(),
        updatedAt: this.now(),
      }
      state.jobs[jobId] = claim
      return claim
    })
    let snapshotId = entry.snapshotId
    if (entry.status === 'ready' && entry.data && entry.updatedAt + 3600000 > this.now()) {
      stage('Reusing the recently retrieved Indeed description…')
      const restored = normalizeIndeedRecord(entry.data, target.url)
      restored.page.fetchedAt = new Date(entry.updatedAt).toISOString()
      restored.extraction.limitations.push(
        `Reused the Indeed description retrieved at ${restored.page.fetchedAt}. No new collection was started for this check.`,
      )
      return { ...restored, snapshotId }
    }
    try {
      let result: { status: number; data: unknown }
      if (!snapshotId) {
        stage(
          'TinyFish could not read this listing. Retrieving the same Indeed job through Bright Data…',
        )
        // The durable submitting claim prevents another POST even if this process stops here.
        result = await this.request(
          `scrape?dataset_id=${DATASET}&format=json&include_errors=true`,
          bounded,
          { input: [{ url: target.url }] },
        )
      } else result = { status: 202, data: { snapshot_id: snapshotId } }
      if (result.status === 202) {
        const parsed = z
          .object({ snapshot_id: z.string().regex(/^s[d]?_[a-zA-Z0-9_-]{1,100}$/) })
          .safeParse(result.data)
        if (!parsed.success)
          throw new AppError(
            'BRIGHT_DATA_FORMAT',
            'Bright Data did not provide a valid snapshot ID.',
          )
        snapshotId = parsed.data.snapshot_id
        await this.state.transaction((state) => {
          state.jobs[jobId] = {
            ...entry,
            status: 'pending',
            snapshotId,
            updatedAt: this.now(),
            retryAt: undefined,
          }
        })
        let ready = false
        for (let attempt = 0; attempt < 12; attempt++) {
          try {
            if (attempt > 0) await delay(this.pollMs, undefined, { signal: bounded })
          } catch {
            throw new AppError(
              'BRIGHT_DATA_TIMEOUT',
              'The existing Indeed collection is still pending. Retry shortly to check the same snapshot.',
            )
          }
          stage('Checking the existing Indeed snapshot; no new collection is being started…')
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
            'The existing Indeed collection is still pending. Retry shortly to check the same snapshot.',
          )
        result = await this.request(`snapshot/${snapshotId}?format=json`, bounded)
      }
      const normalized = normalizeIndeedRecord(result.data, target.url)
      normalized.page.fetchedAt = new Date(this.now()).toISOString()
      if (snapshotId)
        normalized.extraction.limitations.push(
          `Evidence was retrieved from existing Bright Data snapshot ${snapshotId}, originally registered at ${new Date(entry.startedAt).toISOString()}. Completion does not confirm current hiring intent.`,
        )
      const data = z.array(recordSchema).length(1).parse(result.data)
      await this.state.transaction((state) => {
        state.jobs[jobId] = {
          ...entry,
          status: 'ready',
          snapshotId,
          data,
          updatedAt: this.now(),
          retryAt: undefined,
        }
      })
      return { ...normalized, snapshotId }
    } catch (error) {
      const rateLimited =
        error instanceof AppError &&
        ['BRIGHT_DATA_SOURCE_RATE_LIMIT', 'BRIGHT_DATA_HTTP_RATE_LIMIT'].includes(error.code)
      const terminal =
        error instanceof AppError &&
        ((error.code === 'BRIGHT_DATA_HTTP_RATE_LIMIT' && !snapshotId) ||
          [
            'BRIGHT_DATA_SOURCE_RATE_LIMIT',
            'BRIGHT_DATA_FAILED',
            'BRIGHT_DATA_COLLECTION_FAILED',
            'BRIGHT_DATA_CONTENT',
            'BRIGHT_DATA_JOB_MISMATCH',
            'NOT_A_READABLE_JOB',
          ].includes(error.code))
      const until = Math.max(
        this.now() + (rateLimited ? 30 * 60000 : terminal ? 10 * 60000 : 60000),
        error instanceof AppError && error.retryAt ? Date.parse(error.retryAt) : 0,
      )
      await this.state.transaction((state) => {
        if (rateLimited) state.cooldownUntil = Math.max(state.cooldownUntil, until)
        if (terminal || snapshotId)
          state.jobs[jobId] = {
            ...entry,
            status: terminal ? 'failed' : 'pending',
            snapshotId,
            updatedAt: this.now(),
            retryAt: until,
            reason: rateLimited ? 'rate_limit' : terminal ? 'unreadable' : 'pending',
          }
        else if (error instanceof AppError && error.code === 'BRIGHT_DATA_REQUEST')
          state.jobs[jobId] = {
            ...entry,
            status: 'failed',
            updatedAt: this.now(),
            retryAt: this.now() + 10 * 60000,
            reason: 'request_rejected',
          }
        // Unknown POST outcome: retain submitting, requiring dashboard reconciliation.
      })
      if (rateLimited) throw this.cooldown(until)
      if (snapshotId && !terminal) throw this.cooldown(until, true)
      if (terminal)
        throw new AppError(
          'INDEED_UNREADABLE',
          `Indeed could not provide a complete job description. No scores were generated. Retry after ${new Date(until).toISOString()}; repeated collection requests are paused until then.`,
          422,
          new Date(until).toISOString(),
        )
      throw error
    }
  }
}
