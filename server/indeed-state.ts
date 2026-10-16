import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { z } from 'zod'
import { AppError } from './errors'

const entrySchema = z.object({
  url: z.string().url(),
  status: z.enum(['submitting', 'pending', 'ready', 'failed']),
  startedAt: z.number(),
  updatedAt: z.number(),
  snapshotId: z
    .string()
    .regex(/^sd?_[a-zA-Z0-9_-]{1,100}$/)
    .optional(),
  retryAt: z.number().optional(),
  reason: z.string().optional(),
  // Only validated, selected job fields; discarded after the one-hour reuse window.
  data: z.unknown().optional(),
})
const stateSchema = z.object({
  cooldownUntil: z.number(),
  jobs: z.record(z.string().regex(/^[a-f0-9]{16}$/), entrySchema),
})
export type IndeedEntry = z.infer<typeof entrySchema>
type State = z.infer<typeof stateSchema>

/** Persist provider state separately from reports, with atomic claims across local processes. */
export class IndeedState {
  private memory: State = { cooldownUntil: 0, jobs: {} }
  private queue: Promise<unknown> = Promise.resolve()
  constructor(private file?: string) {}

  transaction<T>(update: (state: State) => T): Promise<T> {
    const result = this.queue.then(() => this.locked(update))
    this.queue = result.catch(() => {})
    return result
  }

  private async locked<T>(update: (state: State) => T): Promise<T> {
    if (!this.file) return update(this.memory)
    await mkdir(dirname(this.file), { recursive: true })
    const lockPath = `${this.file}.lock`
    let lock
    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        lock = await open(lockPath, 'wx', 0o600)
        break
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
        await delay(20)
      }
    }
    if (!lock)
      throw new AppError(
        'INDEED_STATE_BUSY',
        'Indeed checks are busy. Retry shortly; no duplicate collection was started.',
        503,
      )
    try {
      let state: State
      try {
        state = stateSchema.parse(JSON.parse(await readFile(this.file, 'utf8')))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
          throw new AppError(
            'INDEED_STATE_INVALID',
            'Saved Indeed collection state could not be read. Ask the server administrator to check it before retrying; no new collection was started.',
            503,
          )
        state = { cooldownUntil: 0, jobs: {} }
      }
      const result = update(state)
      const temp = `${this.file}.${randomUUID()}.tmp`
      await writeFile(temp, JSON.stringify(state), { mode: 0o600 })
      await rename(temp, this.file)
      return result
    } finally {
      await lock.close()
      await unlink(lockPath)
    }
  }
}
