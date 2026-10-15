import { resolve } from 'node:path'
import { createApp } from './app'
import { Store } from './store'

const port = Number(process.env.PORT) || 3001
const app = createApp({
  key: process.env.TINYFISH_API_KEY?.trim(),
  store: new Store(resolve(process.env.DATA_DIR || '.data')),
  origin: process.env.PUBLIC_ORIGIN,
  staticDirectory: 'dist',
})
app.listen(port, process.env.HOST || '127.0.0.1', () => {
  console.log(
    `GhostJob Shield API listening on port ${port}. TinyFish ${process.env.TINYFISH_API_KEY ? 'configured' : 'not configured; add TINYFISH_API_KEY to .env and restart'}.`,
  )
})
app.requestTimeout = 15000
app.headersTimeout = 10000
for (const event of ['SIGINT', 'SIGTERM'] as const)
  process.on(event, () => app.close(() => process.exit(0)))
