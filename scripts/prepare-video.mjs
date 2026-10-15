import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const { path: ffmpeg } = require('@ffmpeg-installer/ffmpeg')
const result = spawnSync(ffmpeg, [
  '-y', '-i', resolve('Frontend video.mp4'),
  '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
  '-g', '1', '-keyint_min', '1', '-sc_threshold', '0', '-bf', '0',
  '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
  resolve('public/media/haunted-job-board-scrub.mp4'),
], { stdio: 'inherit' })
process.exit(result.status ?? 1)
