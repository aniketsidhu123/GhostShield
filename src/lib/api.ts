import { jobStatusSchema } from './api-schema'
import type { JobAnalysis } from '../types/analysis'

async function request(path: string, signal: AbortSignal, body?: unknown) {
  let response: Response
  try {
    response = await fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
      signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
    })
  } catch (error) {
    if (signal.aborted) throw error
    throw new Error(
      'The analysis API is unreachable. Start it with npm run dev:api, then try again.',
    )
  }
  let data: unknown
  try {
    data = await response.json()
  } catch {
    throw new Error('The analysis API did not return JSON. Check that the API server is running.')
  }
  if (!response.ok) {
    const message = (data as { error?: { message?: unknown } })?.error?.message
    throw new Error(
      typeof message === 'string' ? message : 'The live analysis request failed. Please try again.',
    )
  }
  const task = jobStatusSchema.safeParse(data)
  if (!task.success) throw new Error('The API response failed validation. No result was displayed.')
  return task.data
}
export async function inspectJob(
  url: string,
  probe: boolean,
  onProgress: (stage: string) => void,
  signal: AbortSignal,
): Promise<JobAnalysis> {
  let task = await request('/api/analyses', signal, { url, probe })
  const started = Date.now()
  while (true) {
    onProgress(task.stage)
    if (task.status === 'completed') {
      if (!task.report) throw new Error('The completed check contained no validated report.')
      return task.report
    }
    if (task.status === 'failed')
      throw new Error(task.error?.message ?? 'The check failed. No scores were generated.')
    if (Date.now() - started > 400000)
      throw new Error(
        'The check is taking too long. Retry shortly to retrieve the cached result if it completes.',
      )
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      }
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', abort)
        resolve()
      }, 2000)
      if (signal.aborted) abort()
      else signal.addEventListener('abort', abort, { once: true })
    })
    task = await request(`/api/analyses/${encodeURIComponent(task.id)}`, signal)
  }
}
