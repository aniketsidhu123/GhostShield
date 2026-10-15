import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import {
  ArrowDown,
  ArrowRight,
  Bookmark,
  CircleHelp,
  Ghost,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { VideoBackground } from './VideoBackground'
import tracking from '../data/videoTracking.json'
import { filmPhase, navigateFilm, rectStyle, trackedRect, visibleCardRect } from '../lib/cinema'
import { normalizeJobUrl } from '../lib/analysis'
import type { JobAnalysis, Scenario } from '../types/analysis'

gsap.registerPlugin(ScrollTrigger)

interface Props {
  analysis: JobAnalysis
  busy: boolean
  suspended: boolean
  watchlistCount: number
  onInspect: (url: string) => void
  onSample: (scenario: Scenario) => void
  onScore: (kind: 'ghost' | 'scam') => void
  onProbe: () => void
  onWatchlist: () => void
  onHelp: () => void
}

const chapters = [
  { id: 'listings', number: '01', label: 'The job board', progress: 0 },
  { id: 'inspection', number: '02', label: 'Look closer', progress: 0.45 },
  { id: 'scanner', number: '03', label: 'Unmask the listing', progress: 1 },
] as const

export function CinematicExperience({
  analysis,
  busy,
  suspended,
  watchlistCount,
  onInspect,
  onSample,
  onScore,
  onProbe,
  onWatchlist,
  onHelp,
}: Props) {
  const trackRef = useRef<HTMLElement>(null)
  const [progress, setProgress] = useState(0)
  const [frameTime, setFrameTime] = useState(0)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [systemReduced, setSystemReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const [manualReduced, setManualReduced] = useState(false)
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const focusRequested = useRef(false)
  const reducedMotion = systemReduced || manualReduced
  const phase = filmPhase(frameTime)
  const scannerVisible = phase === 'scanner'
  const cardVisible = phase === 'listings' && frameTime < 3.29 && ready
  const cubeVisible = frameTime >= 3.6 && frameTime < 7.1 && ready
  const handleFrame = useCallback((time: number) => setFrameTime(time), [])
  const handleReady = useCallback(() => setReady(true), [])
  const handleFailure = useCallback(() => {
    setFailed(true)
    setReady(true)
  }, [])

  useEffect(() => {
    const trigger = ScrollTrigger.create({
      trigger: trackRef.current,
      start: 'top top',
      end: 'bottom bottom',
      invalidateOnRefresh: true,
      onUpdate: (self) => setProgress(self.progress),
      onRefresh: (self) => setProgress(self.progress),
    })
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setSystemReduced(media.matches)
    media.addEventListener('change', update)
    return () => {
      trigger.kill()
      media.removeEventListener('change', update)
    }
  }, [])

  useEffect(() => {
    if (!scannerVisible || !focusRequested.current) return
    const input = ['film-url', 'touch-url']
      .map((id) => document.getElementById(id))
      .find((element) => element && element.getClientRects().length > 0)
    if (input) {
      input.focus({ preventScroll: true })
      focusRequested.current = false
    }
  }, [scannerVisible, frameTime])

  function jumpToScanner() {
    focusRequested.current = true
    if (scannerVisible) {
      const input = ['film-url', 'touch-url']
        .map((id) => document.getElementById(id))
        .find((element) => element && element.getClientRects().length > 0)
      input?.focus({ preventScroll: true })
      focusRequested.current = false
    } else navigateFilm(1, reducedMotion)
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    try {
      const normalized = normalizeJobUrl(url)
      setError('')
      onInspect(normalized)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Enter a public job listing URL.')
    }
  }

  function field(id: string) {
    return (
      <>
        <label className="sr-only" htmlFor={id}>
          Paste job link to inspect
        </label>
        <input
          id={id}
          type="text"
          inputMode="url"
          autoComplete="url"
          spellCheck={false}
          value={url}
          placeholder="Paste job link to inspect"
          className={url ? 'has-value' : ''}
          onChange={(event) => {
            setUrl(event.target.value)
            setError('')
          }}
          aria-invalid={!!error}
          aria-describedby={error ? 'film-input-error' : 'film-input-description'}
          disabled={busy}
        />
        <button
          type="submit"
          className={`film-scan-button ${busy ? 'is-busy' : ''}`}
          disabled={busy}
          aria-label={busy ? 'Opening sample report' : 'Scan posting'}
        >
          <span>
            {busy ? (
              <>
                <LoaderCircle size={16} className="spin" /> Opening sample
              </>
            ) : (
              <>
                Scan posting <ArrowRight size={15} />
              </>
            )}
          </span>
        </button>
      </>
    )
  }

  return (
    <main
      ref={trackRef}
      className={`film-scroll-track ${reducedMotion ? 'reduced-film' : ''}`}
      id="main"
    >
      <h1 className="sr-only">The Haunted Job Board. Unmask ghosts and scams.</h1>
      <button className="skip-link" onClick={jumpToScanner}>
        Skip to job scanner
      </button>

      <div className="film-viewport">
        <div className="film-canvas">
          <VideoBackground
            progress={progress}
            reducedMotion={reducedMotion}
            suspended={suspended}
            onFrame={handleFrame}
            onReady={handleReady}
            onFailure={handleFailure}
          />

          <div
            className="film-hit-layer"
            inert={!cardVisible}
            aria-label="Interactive sample job listings"
            style={{ visibility: cardVisible ? 'visible' : 'hidden' }}
          >
            {tracking.cards.map((card) => {
              const rect = visibleCardRect(trackedRect(card.frames, frameTime))
              if (!rect) return null
              return (
                <button
                  key={card.id}
                  className={`film-hotspot card-hotspot ${card.scenario}`}
                  style={rectStyle(rect)}
                  onClick={() => onSample(card.scenario as Scenario)}
                  aria-label={`${card.label}: open fictional ${card.scenario === 'active' ? 'active' : card.scenario} sample report`}
                >
                  <span className="hotspot-label">
                    Explore {card.scenario === 'active' ? 'active' : card.scenario} sample{' '}
                    <ArrowRight size={12} />
                  </span>
                </button>
              )
            })}
          </div>

          <button
            className="film-hotspot cube-hotspot"
            hidden={!cubeVisible}
            tabIndex={cubeVisible ? 0 : -1}
            style={rectStyle(
              trackedRect(
                [
                  [3.6, 430, 200, 420, 390],
                  [5.5, 415, 204, 450, 410],
                  [6.3, 350, 120, 570, 520],
                  [7.1, 180, 0, 920, 720],
                ],
                frameTime,
              ),
            )}
            onClick={onProbe}
            aria-label="Inspect the rotating cube: how the listing is checked"
          >
            <span className="hotspot-label">
              <ScanLine size={14} /> See what’s behind the listing
            </span>
          </button>

          <div
            className="film-hit-layer scanner-layer"
            inert={!scannerVisible}
            style={{ visibility: scannerVisible ? 'visible' : 'hidden' }}
          >
            <h2 className="sr-only">Unmask ghosts and scams. Inspect a job listing.</h2>
            <button
              className="film-hotspot dial-hotspot ghost"
              style={rectStyle(trackedRect(tracking.ghostDial, frameTime))}
              onClick={() => onScore('ghost')}
              aria-label={`Ghost likelihood: ${analysis.ghost.value} out of 100 in the selected sample. Open signals and explanation.`}
            >
              <span className="dial-hover-value">
                <strong>
                  {analysis.ghost.value}
                  <small>/100</small>
                </strong>
                <span>GHOST LIKELIHOOD · SAMPLE</span>
              </span>
              <span className="hotspot-label">
                View ghost signals <ArrowRight size={12} />
              </span>
            </button>
            <form
              className="film-form"
              style={rectStyle(trackedRect(tracking.form, frameTime))}
              onSubmit={submit}
              noValidate
            >
              {field('film-url')}
            </form>
            <button
              className="film-hotspot dial-hotspot scam"
              style={rectStyle(trackedRect(tracking.scamDial, frameTime))}
              onClick={() => onScore('scam')}
              aria-label={`Scam risk: ${analysis.scam.value} out of 100 in the selected sample. Open signals and explanation.`}
            >
              <span className="dial-hover-value">
                <strong>
                  {analysis.scam.value}
                  <small>/100</small>
                </strong>
                <span>SCAM RISK · SAMPLE</span>
              </span>
              <span className="hotspot-label">
                View scam signals <ArrowRight size={12} />
              </span>
            </button>
            <p className="film-demo-note" id="film-input-description">
              Interactive demo · entered links are not fetched
            </p>
          </div>
        </div>
      </div>

      <header className="film-toolbar">
        <button
          className="film-brand"
          onClick={() => navigateFilm(0, reducedMotion)}
          aria-label="GhostJob Shield: return to the job board"
        >
          <ShieldCheck size={19} />
          <span>
            GHOSTJOB <b>SHIELD</b>
          </span>
        </button>
        <div className="film-toolbar-actions">
          <span className="film-demo-chip">INTERACTIVE DEMO</span>
          <button
            onClick={onWatchlist}
            aria-label={`Open watchlist, ${watchlistCount} saved samples`}
          >
            <Bookmark size={15} />
            <span>Watchlist</span>
            {watchlistCount > 0 && <small>{watchlistCount}</small>}
          </button>
          <button className="film-top-scan" onClick={jumpToScanner}>
            Skip to scanner <ArrowRight size={14} />
          </button>
        </div>
      </header>

      {!ready && (
        <div className="film-loading" role="status">
          <LoaderCircle size={16} className="spin" /> Loading the experience…
        </div>
      )}
      {failed && (
        <p className="film-fallback-note" role="status">
          Video unavailable. The scanner and sample reports still work.
        </p>
      )}

      <div className={`film-mobile-panel ${scannerVisible ? 'scanner-mobile' : ''}`}>
        {scannerVisible ? (
          <>
            <span className="film-mobile-eyebrow">UNMASK GHOSTS & SCAMS</span>
            <form className="touch-form" onSubmit={submit} noValidate>
              {field('touch-url')}
            </form>
            <div className="mobile-score-actions">
              <button onClick={() => onScore('ghost')}>
                <Ghost size={15} /> Ghost likelihood <b>{analysis.ghost.value}</b>
              </button>
              <button onClick={() => onScore('scam')}>
                <ShieldAlert size={15} /> Scam risk <b>{analysis.scam.value}</b>
              </button>
            </div>
            <span className="mobile-demo-note">Sample data · your link is not fetched</span>
          </>
        ) : phase === 'listings' ? (
          <>
            <p>
              Every listing has a story.
              <br />
              <span>Tap a card to look closer.</span>
            </p>
            <div className="mobile-sample-actions">
              <button onClick={() => onSample('ghost')}>
                <Ghost size={15} />
                Ghost
              </button>
              <button onClick={() => onSample('scam')}>
                <ShieldAlert size={15} />
                Scam
              </button>
              <button onClick={() => onSample('active')}>
                <ShieldCheck size={15} />
                Active
              </button>
            </div>
          </>
        ) : (
          <>
            <p>Look beyond the listing.</p>
            <button className="mobile-inspect" onClick={onProbe}>
              <ScanLine size={16} /> Explore the inspection <ArrowRight size={14} />
            </button>
          </>
        )}
      </div>

      {error && (
        <p id="film-input-error" className="film-error" role="alert">
          {error}
        </p>
      )}

      <footer className="film-controls">
        <div className="film-guidance" aria-live="polite">
          <span className="film-guidance-line" />
          {phase === 'listings'
            ? 'Click a listing. Scroll into the unknown.'
            : phase === 'inspection'
              ? 'Follow the signal. Click the cube to look closer.'
              : 'Paste a link. Inspect the signals. Know your next move.'}
          <ArrowDown size={13} />
        </div>
        <div className="film-controls-row">
          <nav className="film-chapters" aria-label="Scenes">
            {chapters.map((chapter) => (
              <button
                key={chapter.id}
                onClick={() => navigateFilm(chapter.progress, reducedMotion)}
                disabled={failed && chapter.id !== 'scanner'}
                aria-current={phase === chapter.id ? 'step' : undefined}
              >
                <span>{chapter.number}</span>
                <strong>{chapter.label}</strong>
              </button>
            ))}
          </nav>
          <div className="film-utilities">
            <button
              onClick={() => {
                setManualReduced(!manualReduced)
              }}
              aria-pressed={reducedMotion}
              aria-label={
                systemReduced
                  ? 'System reduced motion is enabled'
                  : reducedMotion
                    ? 'Enable smooth video motion'
                    : 'Use still scenes to reduce motion'
              }
              disabled={systemReduced}
            >
              {reducedMotion ? <Play size={14} /> : <Pause size={14} />}
              <span>{reducedMotion ? 'Still scenes' : 'Motion on'}</span>
            </button>
            <button
              onClick={() => navigateFilm(0, reducedMotion)}
              aria-label="Replay from the first scene"
              disabled={failed}
            >
              <RotateCcw size={14} />
            </button>
            <button onClick={onHelp} aria-label="How this interactive experience works">
              <CircleHelp size={15} />
            </button>
          </div>
        </div>
        <label className="sr-only" htmlFor="film-progress">
          Explore the video timeline
        </label>
        <input
          id="film-progress"
          className="film-progress"
          type="range"
          min="0"
          max="1000"
          step="1"
          value={Math.round(progress * 1000)}
          aria-valuetext={`${Math.round(progress * 100)} percent, ${phase}`}
          onChange={(event) => navigateFilm(Number(event.target.value) / 1000, true)}
          disabled={failed}
          style={{ '--film-progress': `${progress * 100}%` } as CSSProperties}
        />
      </footer>
      <p role="status" aria-live="polite" className="sr-only">
        {busy ? 'Opening a fictional sample report. Your URL has not been fetched.' : ''}
      </p>
    </main>
  )
}
