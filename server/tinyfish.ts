import { z } from 'zod'
import { setTimeout as delay } from 'node:timers/promises'
import { AppError } from './errors'
import { extractionGoal, extractionSchema, outputSchema } from './extraction'
import { assertPublicUrl } from './urls'
import { readCloudPage } from './cloud-page'

const pageSchema = z.object({
  url: z.string(),
  final_url: z.string().nullish(),
  title: z.string().nullish(),
  text: z.string(),
  links: z.array(z.string()).optional(),
})
export type Page = {
  url: string
  requestedUrl?: string
  title: string
  text: string
  links: string[]
  fetchedAt: string
  retrieval?: 'fetch' | 'browser'
}
const AGENT = 'https://agent.tinyfish.ai'

/** A process-wide sliding window. Provider quotas and the account wallet remain authoritative. */
export class Budget {
  private timestamps: number[] = []
  constructor(
    private limit: number,
    private windowMs = 60000,
  ) {}
  take() {
    const now = Date.now()
    this.timestamps = this.timestamps.filter((time) => now - time < this.windowMs)
    if (this.timestamps.length >= this.limit)
      throw new AppError(
        'RATE_LIMIT',
        'The analysis budget is busy. Please retry after a minute.',
        429,
      )
    this.timestamps.push(now)
  }
}
const fetchBudget = new Budget(25)
const searchBudget = new Budget(5)
const browserBudget = new Budget(20, 3600000)
const agentBudget = new Budget(Number(process.env.TINYFISH_RUNS_PER_HOUR) || 20, 3600000)

export class TinyFish {
  constructor(
    private key: string,
    private transport: typeof fetch = fetch,
    private validate = assertPublicUrl,
    private pollDelay = 4000,
  ) {}
  async renderedPage(url: string, signal?: AbortSignal) {
    browserBudget.take()
    return readCloudPage(url, this.key, signal)
  }
  private async json(endpoint: string, body?: unknown, signal?: AbortSignal): Promise<unknown> {
    let response: Response
    try {
      response = await this.transport(endpoint, {
        method: body === undefined ? 'GET' : 'POST',
        redirect: 'error',
        headers: { 'X-API-Key': this.key, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.any([AbortSignal.timeout(150000), ...(signal ? [signal] : [])]),
      })
    } catch {
      throw new AppError(
        'PROVIDER_UNREACHABLE',
        'TinyFish did not respond in time. Please retry. No scores were substituted.',
      )
    }
    if (!response.ok) {
      await response.body?.cancel()
      const messages: Record<number, [string, string]> = {
        401: [
          'PROVIDER_AUTH',
          'TinyFish rejected the API key. Check the server’s TINYFISH_API_KEY.',
        ],
        403: [
          'PROVIDER_ACCESS',
          'TinyFish denied this request. Check the account’s API permissions.',
        ],
        402: [
          'PROVIDER_CREDITS',
          'TinyFish credits or daily allowance are exhausted. Check the TinyFish dashboard.',
        ],
        429: ['PROVIDER_RATE_LIMIT', 'TinyFish is rate limited. Please retry after a minute.'],
      }
      const [code, message] = messages[response.status] ?? [
        'PROVIDER_FAILED',
        'TinyFish could not complete this request. Try again later.',
      ]
      throw new AppError(code, message, response.status === 429 ? 429 : 502)
    }
    const reader = response.body?.getReader()
    if (!reader) throw new AppError('PROVIDER_EMPTY', 'TinyFish returned no data.')
    const chunks: Uint8Array[] = []
    let length = 0
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        length += value.byteLength
        if (length > 4 * 1024 * 1024) {
          await reader.cancel()
          throw new AppError(
            'PROVIDER_TOO_LARGE',
            'The source response is too large to inspect safely.',
          )
        }
        chunks.push(value)
      }
      return JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } catch (error) {
      if (error instanceof AppError) throw error
      throw new AppError('PROVIDER_FORMAT', 'TinyFish returned an incomplete or invalid response.')
    }
  }
  async page(url: string, signal?: AbortSignal): Promise<Page> {
    await this.validate(url)
    fetchBudget.take()
    const raw = await this.json(
      'https://api.fetch.tinyfish.ai',
      {
        urls: [url],
        format: 'markdown',
        links: true,
        ttl: 0,
        per_url_timeout_ms: 45000,
        purpose:
          'Read a public job description for a page-text report of ghost-job and scam-risk signals with quoted evidence. No applications, personal data, or website interactions.',
      },
      signal,
    )
    const parsed = z
      .object({
        results: z.array(z.unknown()).default([]),
        errors: z.array(z.object({ error: z.string() })).default([]),
      })
      .safeParse(raw)
    if (!parsed.success)
      throw new AppError('PROVIDER_FORMAT', 'TinyFish Fetch returned an unexpected response.')
    const result = pageSchema.safeParse(parsed.data.results[0])
    if (!result.success || result.data.text.trim().length < 80) {
      const code = parsed.data.errors[0]?.error ?? 'empty_content'
      const labels: Record<string, string> = {
        login_required: 'The listing requires login.',
        bot_blocked: 'The site blocked automated access.',
        page_not_found: 'The listing was not found.',
        timeout: 'The listing took too long to load.',
      }
      throw new AppError(
        'SOURCE_UNAVAILABLE',
        `${labels[code] ?? 'The listing could not be read.'} No score can be inferred from this access failure.`,
        422,
      )
    }
    const page = result.data
    if (
      page.text.length < 1500 &&
      /application error:.*client-side exception|application error:.*server-side exception/i.test(
        page.text,
      )
    )
      throw new AppError(
        'SOURCE_PAGE_ERROR',
        'The job site returned an application error instead of a job description. No scores can be calculated from an error page.',
        422,
      )
    const final = await this.validate(page.final_url || page.url)
    return {
      url: final,
      requestedUrl: url,
      title: (page.title || new URL(final).hostname).slice(0, 500),
      text: page.text.slice(0, 160000),
      links: page.links ?? [],
      fetchedAt: new Date().toISOString(),
    }
  }
  async search(title: string, signal?: AbortSignal): Promise<string[]> {
    return (await this.searchListings(`${title.slice(0, 180)} official careers job`, signal)).map(
      (item) => item.url,
    )
  }
  async searchListings(
    query: string,
    signal?: AbortSignal,
  ): Promise<{ url: string; title: string; snippet: string }[]> {
    searchBudget.take()
    const endpoint = new URL('https://api.search.tinyfish.ai')
    endpoint.searchParams.set('query', query.slice(0, 1500))
    endpoint.searchParams.set(
      'purpose',
      'Find the exact public job posting by its listing ID to retrieve evidence for a job-risk report. Do not substitute another vacancy.',
    )
    endpoint.searchParams.set('location', 'IN')
    endpoint.searchParams.set('language', 'en')
    const raw = await this.json(endpoint.toString(), undefined, signal)
    const result = z
      .object({
        results: z.array(
          z.object({
            url: z.string(),
            title: z.string().default(''),
            snippet: z.string().default(''),
          }),
        ),
      })
      .safeParse(raw)
    if (!result.success)
      throw new AppError('SEARCH_FORMAT', 'Supporting search results could not be read.')
    const safe: { url: string; title: string; snippet: string }[] = []
    for (const candidate of result.data.results.slice(0, 5)) {
      try {
        safe.push({ ...candidate, url: await this.validate(candidate.url) })
      } catch {
        /* Reject unsafe search leads. */
      }
    }
    return safe
  }
  async inspect(url: string, candidates: string[], probe: boolean, signal: AbortSignal) {
    await this.validate(url)
    agentBudget.take()
    // Do not retry run creation: an ambiguous network failure may already have incurred a run.
    const queued = z.object({ run_id: z.string().regex(/^[a-zA-Z0-9_-]+$/) }).safeParse(
      await this.json(
        `${AGENT}/v1/automation/run-async`,
        {
          url,
          goal: extractionGoal(url, candidates, probe),
          output_schema: outputSchema,
          browser_profile: 'lite',
          agent_config: { max_duration_seconds: 180 },
          use_profile: false,
          use_vault: false,
        },
        signal,
      ),
    )
    if (!queued.success)
      throw new AppError(
        'AGENT_START_FAILED',
        'TinyFish did not return a run ID. Check its dashboard before retrying.',
      )
    const runId = queued.data.run_id
    let finished = false
    try {
      for (let attempt = 0; attempt < 60; attempt++) {
        await delay(this.pollDelay, undefined, { signal })
        const run = z
          .object({
            status: z.string(),
            result: z.unknown().optional(),
            resultJson: z.unknown().optional(),
            error: z.unknown().optional(),
          })
          .safeParse(await this.json(`${AGENT}/v1/runs/${runId}`, undefined, signal))
        if (!run.success)
          throw new AppError('AGENT_FORMAT', 'TinyFish returned an unexpected run status.')
        if (run.data.status === 'COMPLETED') {
          finished = true
          let output = run.data.result ?? run.data.resultJson
          if (typeof output === 'string') {
            try {
              output = JSON.parse(output)
            } catch {
              throw new AppError(
                'AGENT_FORMAT',
                'The agent did not return structured observations.',
              )
            }
          }
          const extraction = extractionSchema.safeParse(output)
          if (!extraction.success)
            throw new AppError(
              'AGENT_FORMAT',
              'The agent’s observations did not pass validation. No scores were generated.',
            )
          return { extraction: extraction.data, runId }
        }
        if (['FAILED', 'CANCELLED'].includes(run.data.status)) {
          finished = true
          const failure = z
            .object({
              code: z.string().optional(),
              category: z.string().optional(),
              message: z.string().optional(),
            })
            .safeParse(run.data.error)
          const details = failure.success ? failure.data : undefined
          // Map provider diagnostics to fixed messages; never expose raw upstream text.
          if (
            /policy|policies|moderation/i.test(`${details?.code ?? ''} ${details?.message ?? ''}`)
          )
            throw new AppError(
              'PROVIDER_POLICY',
              `TinyFish declined this inspection under its usage policies before a report was available. No scores were generated. Contact TinyFish support with run ID ${runId}.`,
              422,
            )
          if (details?.category === 'BILLING_FAILURE')
            throw new AppError(
              'PROVIDER_CREDITS',
              'TinyFish could not start the inspection because of account billing or credits. Check the TinyFish dashboard. No scores were generated.',
            )
          throw new AppError(
            'AGENT_FAILED',
            'TinyFish could not inspect this listing. Try a public employer careers link.',
          )
        }
      }
      throw new AppError(
        'AGENT_TIMEOUT',
        'The inspection reached its time limit. Try the direct employer listing.',
      )
    } finally {
      if (!finished) {
        try {
          await this.json(`${AGENT}/v1/runs/${runId}/cancel`, {}, AbortSignal.timeout(10000))
        } catch {
          /* Provider duration limit is the final bound. */
        }
      }
    }
  }
}
