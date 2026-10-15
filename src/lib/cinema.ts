import type { CSSProperties } from 'react'

export const FILM_DURATION = 10
export const FILM_FPS = 24
export const LAST_FRAME_TIME = (FILM_DURATION * FILM_FPS - 1) / FILM_FPS
export type FilmPhase = 'listings' | 'inspection' | 'scanner'
export type TrackingKey = readonly number[]

export function filmPhase(time: number): FilmPhase {
  return time < 3.4 ? 'listings' : time < 7.75 ? 'inspection' : 'scanner'
}

/** Select an actual source frame. */
export function timeForProgress(progress: number, reducedMotion = false): number {
  const safe = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0
  if (reducedMotion) return safe < 0.34 ? 0 : safe < 0.775 ? 4.5 : LAST_FRAME_TIME
  return Math.floor(safe * (FILM_DURATION * FILM_FPS - 1)) / FILM_FPS
}

/** Interpolate measured coordinates in the video's 1280 × 720 coordinate system. */
export function trackedRect(keys: readonly TrackingKey[], time: number): number[] {
  if (!keys.length) return [0, 0, 0, 0]
  if (time <= keys[0][0]) return keys[0].slice(1, 5)
  if (time >= keys[keys.length - 1][0]) return keys[keys.length - 1].slice(1, 5)
  let left = 0
  let right = keys.length - 1
  while (right - left > 1) {
    const middle = Math.floor((left + right) / 2)
    if (keys[middle][0] <= time) left = middle
    else right = middle
  }
  const a = keys[left]
  const b = keys[right]
  const fraction = (time - a[0]) / (b[0] - a[0])
  return a.slice(1, 5).map((value, i) => value + (b[i + 1] - value) * fraction)
}

export function rectStyle(rect: readonly number[]): CSSProperties {
  return {
    left: `${rect[0] / 12.8}%`,
    top: `${rect[1] / 7.2}%`,
    width: `${rect[2] / 12.8}%`,
    height: `${rect[3] / 7.2}%`,
  }
}

/** Keep focus rings inside the film and omit cards that have left the frame. */
export function visibleCardRect(rect: readonly number[]): number[] | null {
  const [x, y, width, height] = rect
  const left = Math.max(0, x)
  const top = Math.max(0, y)
  const visibleWidth = Math.min(1280, x + width) - left
  const visibleHeight = Math.min(720, y + height) - top
  if (visibleWidth < 24 || visibleHeight < 24) return null
  return [left, top, visibleWidth, visibleHeight]
}

export function navigateFilm(progress: number, immediate = false) {
  window.dispatchEvent(new CustomEvent('ghostshield:seek', { detail: { progress, immediate } }))
}
