import { useEffect, useRef, useState } from 'react'
import { LAST_FRAME_TIME, timeForProgress } from '../lib/cinema'

interface VideoBackgroundProps {
  src?: string
  progress: number
  reducedMotion: boolean
  suspended?: boolean
  onFrame: (time: number) => void
  onReady: () => void
  onFailure: () => void
}

/** Unfiltered film, with semantic controls composited in the same coordinate space. */
export function VideoBackground({
  src = '/media/haunted-job-board-scrub.mp4',
  progress,
  reducedMotion,
  suspended = false,
  onFrame,
  onReady,
  onFailure,
}: VideoBackgroundProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)
  const callbacks = useRef({ onFrame, onReady, onFailure })
  const desired = useRef(0)
  const suspendedRef = useRef(suspended)
  const requestSeek = useRef<() => void>(() => {})
  callbacks.current = { onFrame, onReady, onFailure }
  suspendedRef.current = suspended
  desired.current = timeForProgress(progress, reducedMotion)

  useEffect(() => {
    const video = videoRef.current
    if (!video || failed) return
    let raf = 0
    let disposed = false
    let frameCallback: number | undefined
    const context = canvasRef.current?.getContext('2d', { alpha: false })
    const publish = (time = video.currentTime) => {
      if (context && video.readyState >= 2) {
        context.drawImage(video, 0, 0, 1280, 720)
        if (canvasRef.current) canvasRef.current.dataset.painted = 'true'
      }
      callbacks.current.onFrame(Math.min(LAST_FRAME_TIME, time))
    }
    const seek = () => {
      raf = 0
      if (
        disposed ||
        document.hidden ||
        suspendedRef.current ||
        video.seeking ||
        video.readyState < 2
      )
        return
      const target = Math.min(desired.current, Math.max(0, video.duration - 1 / 24))
      if (Math.abs(video.currentTime - target) < 0.02) {
        publish()
        return
      }
      video.currentTime = target + 0.001
    }
    const schedule = () => {
      if (!raf && !disposed) raf = requestAnimationFrame(seek)
    }
    requestSeek.current = schedule
    const loaded = () => {
      callbacks.current.onReady()
      publish()
      schedule()
    }
    const seeked = () => {
      publish()
      schedule()
    }
    const decoded = (_now: number, metadata: VideoFrameCallbackMetadata) => {
      if (disposed) return
      publish(metadata.mediaTime)
      frameCallback = video.requestVideoFrameCallback(decoded)
    }
    if ('requestVideoFrameCallback' in video)
      frameCallback = video.requestVideoFrameCallback(decoded)
    video.addEventListener('loadeddata', loaded)
    video.addEventListener('seeked', seeked)
    document.addEventListener('visibilitychange', schedule)
    if (video.readyState >= 2) loaded()
    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      if (frameCallback !== undefined) video.cancelVideoFrameCallback(frameCallback)
      video.removeEventListener('loadeddata', loaded)
      video.removeEventListener('seeked', seeked)
      document.removeEventListener('visibilitychange', schedule)
      requestSeek.current = () => {}
    }
  }, [src, failed])

  useEffect(() => {
    requestSeek.current()
  }, [progress, reducedMotion, suspended])

  return failed ? (
    <img className="film-video" src="/media/haunted-final.jpg" alt="" aria-hidden="true" />
  ) : (
    <div className="film-media" aria-hidden="true">
      <img className="film-poster" src="/media/haunted-poster.jpg" alt="" />
      <video
        ref={videoRef}
        className="film-video-source"
        src={src}
        poster="/media/haunted-poster.jpg"
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
        tabIndex={-1}
        onError={() => {
          setFailed(true)
          callbacks.current.onFrame(LAST_FRAME_TIME)
          callbacks.current.onFailure()
        }}
      />
      <canvas
        ref={canvasRef}
        className="film-frame"
        width={1280}
        height={720}
        data-painted="false"
      />
    </div>
  )
}

export const VideoScrubber = VideoBackground
