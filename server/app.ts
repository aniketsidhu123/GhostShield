import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { randomUUID, randomBytes } from 'node:crypto'
import { z } from 'zod'
import { AppError, publicError } from './errors'
import { assertPublicUrl } from './urls'
import { TinyFish } from './tinyfish'
import type { BrightData } from './bright-data'
import { Store } from './store'
import { analyze, cacheKey } from './pipeline'
import type { AnalysisTask } from '../src/lib/api-schema'
import { analyzeDescription } from './description-analysis'

type Task = AnalysisTask & { owners: Set<string>; createdAt: number }
interface Options {
  key?: string
  store: Store
  origin?: string
  provider?: TinyFish
  fallback?: BrightData
  validate?: typeof assertPublicUrl
  run?: typeof analyze
  staticDirectory?: string
}
export function createApp(options: Options) {
  const tasks = new Map<string, Task>(),
    inflight = new Map<string, string>()
  const sessions = new Map<string, number>(),
    limits = new Map<string, { count: number; until: number }>()
  const provider = options.provider ?? new TinyFish(options.key ?? '')
  const allowed = new Set([
    options.origin ?? 'http://127.0.0.1:5173',
    'http://localhost:5173',
    'http://127.0.0.1:5174',
    'http://localhost:5174',
    'http://127.0.0.1:3001',
    'http://localhost:3001',
    'http://127.0.0.1:4173',
    'http://localhost:4173',
  ])
  const run = options.run ?? analyze,
    validate = options.validate ?? assertPublicUrl
  let active = 0
  const json = (res: ServerResponse, status: number, data: unknown) => {
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    })
    res.end(JSON.stringify(data))
  }
  function session(req: IncomingMessage, res: ServerResponse) {
    const now = Date.now()
    for (const [id, time] of sessions) if (now - time > 86400000) sessions.delete(id)
    let id = req.headers.cookie?.match(/(?:^|;\s*)gs_session=([a-f0-9]{48})(?:;|$)/)?.[1]
    if (!id || !sessions.has(id)) {
      if (sessions.size >= 1000) sessions.delete(sessions.keys().next().value!)
      id = randomBytes(24).toString('hex')
      res.setHeader(
        'Set-Cookie',
        `gs_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${options.origin?.startsWith('https:') ? '; Secure' : ''}`,
      )
    }
    sessions.set(id, now)
    return id
  }
  async function handler(req: IncomingMessage, res: ServerResponse) {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'no-referrer')
    const path = new URL(req.url ?? '/', 'http://local').pathname
    try {
      if (path === '/api/health' && req.method === 'GET') {
        json(res, 200, {
          configured: !!options.key,
          provider: 'TinyFish',
          indeedFallbackConfigured: !!options.fallback,
        })
        return
      }
      if (path.startsWith('/api/')) {
        const owner = session(req, res)
        if (
          ['/api/analyses', '/api/description-analyses'].includes(path) &&
          req.method === 'POST'
        ) {
          const textOnly = path === '/api/description-analyses'
          if (!req.headers.origin || !allowed.has(req.headers.origin))
            throw new AppError(
              'ORIGIN_DENIED',
              'This origin is not allowed to start analyses.',
              403,
            )
          if (!req.headers['content-type']?.startsWith('application/json'))
            throw new AppError('INVALID_BODY', 'Send an application/json request.', 415)
          for (const [id, task] of tasks)
            if (Date.now() - task.createdAt > 3600000 && task.status !== 'running') tasks.delete(id)
          for (const [ip, limit] of limits) if (limit.until < Date.now()) limits.delete(ip)
          const ip = req.socket.remoteAddress ?? 'local'
          const limit = limits.get(ip) ?? { count: 0, until: Date.now() + 60000 }
          if (limit.count >= 5 || limits.size > 10000)
            throw new AppError(
              'RATE_LIMIT',
              'Please wait a minute before starting another check.',
              429,
            )
          limit.count++
          limits.set(ip, limit)
          let body = ''
          for await (const chunk of req) {
            body += chunk.toString()
            if (Buffer.byteLength(body) > (textOnly ? 200000 : 4096))
              throw new AppError('BODY_TOO_LARGE', 'The request is too large.', 413)
          }
          let decoded: unknown
          try {
            decoded = JSON.parse(body)
          } catch {
            throw new AppError('INVALID_BODY', 'The request is not valid JSON.', 400)
          }
          if (textOnly) {
            const report = analyzeDescription(decoded)
            json(res, 200, {
              id: report.id,
              status: 'completed',
              stage: 'User-provided text analysed; source unverified.',
              report,
            })
            return
          }
          const parsed = z
            .object({ url: z.string().max(2048), probe: z.boolean().default(false) })
            .strict()
            .safeParse(decoded)
          if (!parsed.success)
            throw new AppError(
              'INVALID_BODY',
              'Provide a job URL and an optional probe boolean.',
              400,
            )
          if (!options.key)
            throw new AppError(
              'NOT_CONFIGURED',
              'Live checks need a TinyFish API key. Add TINYFISH_API_KEY to the server .env file, then restart the API.',
              503,
            )
          const url = await validate(parsed.data.url),
            key = cacheKey(url, parsed.data.probe)
          const existing = inflight.get(key)
          if (existing) {
            const task = tasks.get(existing)!
            task.owners.add(owner)
            json(res, 202, { id: task.id, status: task.status, stage: task.stage })
            return
          }
          if (tasks.size >= 200) {
            const complete = [...tasks.values()].find(
              (task) => task.status === 'completed' || task.status === 'failed',
            )
            if (complete) tasks.delete(complete.id)
            else
              throw new AppError('BUSY', 'The analysis queue is full. Please retry shortly.', 429)
          }
          const cached = await options.store.cached(key, 3600000)
          const shared = inflight.get(key)
          if (shared) {
            const task = tasks.get(shared)!
            task.owners.add(owner)
            json(res, 202, { id: task.id, status: task.status, stage: task.stage })
            return
          }
          const task: Task = {
            id: randomUUID(),
            status: cached ? 'completed' : 'queued',
            stage: cached ? 'Loaded a recently checked report.' : 'Starting the inspection…',
            owners: new Set([owner]),
            createdAt: Date.now(),
            ...(cached ? { report: cached } : {}),
          }
          if (!cached && active >= 2)
            throw new AppError(
              'BUSY',
              'Two analyses are already running. Please try again shortly.',
              429,
            )
          tasks.set(task.id, task)
          if (!cached) {
            active++
            inflight.set(key, task.id)
            task.status = 'running'
            void run(
              url,
              parsed.data.probe,
              provider,
              options.store,
              (message) => {
                task.stage = message
              },
              AbortSignal.timeout(360000),
              options.fallback,
            )
              .then((report) => {
                task.status = 'completed'
                task.stage = 'Evidence check complete.'
                task.report = report
              })
              .catch((error) => {
                task.status = 'failed'
                task.stage = 'The check could not finish.'
                task.error = publicError(error)
              })
              .finally(() => {
                active--
                inflight.delete(key)
              })
          }
          json(res, cached ? 200 : 202, {
            id: task.id,
            status: task.status,
            stage: task.stage,
            ...(cached ? { report: cached } : {}),
          })
          return
        }
        const match = path.match(/^\/api\/analyses\/([a-f0-9-]+)$/)
        if (match && req.method === 'GET') {
          const task = tasks.get(match[1])
          if (!task || !task.owners.has(owner))
            throw new AppError(
              'NOT_FOUND',
              'This check is unavailable or belongs to another browser session. Start a new check.',
              404,
            )
          const { owners: _owners, createdAt: _createdAt, ...response } = task
          json(res, 200, response)
          return
        }
        throw new AppError('NOT_FOUND', 'API endpoint not found.', 404)
      }
      if (!['GET', 'HEAD'].includes(req.method ?? ''))
        throw new AppError('METHOD_NOT_ALLOWED', 'Method not allowed.', 405)
      const root = resolve(options.staticDirectory ?? 'dist')
      let file = resolve(root, `.${decodeURIComponent(path)}`)
      if (!file.startsWith(root + sep) && file !== root)
        throw new AppError('NOT_FOUND', 'Not found.', 404)
      let metadata
      try {
        metadata = await stat(file)
        if (metadata.isDirectory()) throw new Error()
      } catch {
        if (extname(path)) throw new AppError('NOT_FOUND', 'Not found.', 404)
        file = resolve(root, 'index.html')
        metadata = await stat(file)
      }
      const mime: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.mp4': 'video/mp4',
        '.jpg': 'image/jpeg',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
      }
      const headers: Record<string, string | number> = {
        'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
        'Accept-Ranges': 'bytes',
        'Cache-Control': extname(file) === '.html' ? 'no-cache' : 'public, max-age=3600',
      }
      const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/)
      let start = 0,
        end = metadata.size - 1,
        status = 200
      if (req.headers.range) {
        if (!range) {
          res.writeHead(416, { 'Content-Range': `bytes */${metadata.size}` })
          res.end()
          return
        }
        start = Number(range[1])
        end = range[2] ? Math.min(Number(range[2]), end) : end
        if (start > end || start >= metadata.size) {
          res.writeHead(416, { 'Content-Range': `bytes */${metadata.size}` })
          res.end()
          return
        }
        headers['Content-Range'] = `bytes ${start}-${end}/${metadata.size}`
        status = 206
      }
      headers['Content-Length'] = Math.max(0, end - start + 1)
      res.writeHead(status, headers)
      if (req.method === 'HEAD' || !metadata.size) {
        res.end()
        return
      }
      const stream = createReadStream(file, { start, end })
      stream.on('error', () => res.destroy())
      res.on('close', () => stream.destroy())
      stream.pipe(res)
    } catch (error) {
      if (!res.headersSent)
        json(res, error instanceof AppError ? error.status : 500, { error: publicError(error) })
      else res.end()
    }
  }
  return createServer((req, res) => {
    void handler(req, res)
  })
}
