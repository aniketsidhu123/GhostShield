import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { liveAnalysisSchema } from '../src/lib/api-schema'
import type { JobAnalysis } from '../src/types/analysis'

export type Snapshot = { observedAt: string; contentHash: string; postedDate: string | null }
const snapshotSchema = z
  .array(
    z.object({
      observedAt: z.string().datetime(),
      contentHash: z.string().regex(/^[a-f0-9]{64}$/),
      postedDate: z.string().nullable(),
    }),
  )
  .max(90)
export function digest(text: string) {
  return createHash('sha256').update(text).digest('hex')
}
export class Store {
  constructor(private directory: string) {}
  private path(key: string, kind: string) {
    return join(this.directory, `${digest(key)}.${kind}.json`)
  }
  private async read(key: string, kind: string): Promise<unknown> {
    try {
      return JSON.parse(await readFile(this.path(key, kind), 'utf8'))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT' || error instanceof SyntaxError)
        return null
      throw error
    }
  }
  private async write(key: string, kind: string, data: unknown) {
    await mkdir(this.directory, { recursive: true })
    const path = this.path(key, kind),
      temp = `${path}.${randomUUID()}.tmp`
    await writeFile(temp, JSON.stringify(data), { mode: 0o600 })
    await rename(temp, path)
  }
  async cached(key: string, ttlMs: number): Promise<JobAnalysis | null> {
    const parsed = liveAnalysisSchema.safeParse(await this.read(key, 'report'))
    return parsed.success && Date.now() - Date.parse(parsed.data.checkedAt) < ttlMs
      ? { ...parsed.data, cached: true }
      : null
  }
  async save(key: string, report: JobAnalysis) {
    await this.write(key, 'report', report)
  }
  async snapshots(url: string): Promise<Snapshot[]> {
    const parsed = snapshotSchema.safeParse(await this.read(url, 'history'))
    return parsed.success ? parsed.data : []
  }
  async addSnapshot(url: string, snapshot: Snapshot) {
    const history = await this.snapshots(url)
    if (!history.some((item) => item.observedAt.slice(0, 10) === snapshot.observedAt.slice(0, 10)))
      history.push(snapshot)
    await this.write(url, 'history', history.slice(-90))
    return history.slice(-90)
  }
}
