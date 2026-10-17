import { useEffect, useRef, useState } from 'react'
import {
  ArrowUpRight,
  Bookmark,
  Check,
  CircleHelp,
  Clock3,
  Eye,
  FileSearch,
  Fingerprint,
  Ghost,
  Globe2,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { SmoothScroll } from './components/SmoothScroll'
import { CinematicExperience } from './components/CinematicExperience'
import { RiskDial } from './components/RiskDial'
import { SignalTimeline } from './components/SignalTimeline'
import { Modal } from './components/Modal'
import { DescriptionFallback } from './components/DescriptionFallback'
import { mockAnalyses } from './data/mockAnalysis'
import { emptyAnalysis } from './data/emptyAnalysis'
import { inspectJob, inspectDescription } from './lib/api'
import { readWatchlist, writeWatchlist } from './lib/analysis'
import type { JobAnalysis, SavedListing, Scenario } from './types/analysis'

type Dialog =
  | 'report'
  | 'watchlist'
  | 'methodology'
  | 'privacy'
  | 'evidence'
  | 'probe'
  | 'help'
  | 'description'
  | null

function App() {
  const [scenario, setScenario] = useState<Scenario>('ghost')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [scoreKind, setScoreKind] = useState<'ghost' | 'scam'>('ghost')
  const [busy, setBusy] = useState(false)
  const [requestedUrl, setRequestedUrl] = useState<string | null>(null)
  const [report, setReport] = useState<JobAnalysis | null>(null)
  const [scanStatus, setScanStatus] = useState('')
  const [scanError, setScanError] = useState('')
  const [watchlist, setWatchlist] = useState<SavedListing[]>(readWatchlist)
  const [toast, setToast] = useState('')
  const requestController = useRef<AbortController | null>(null)
  const analysis = report ?? emptyAnalysis
  const isLive = analysis.mode === 'live'
  const isProvided = analysis.mode === 'user-provided'
  const isSample = analysis.mode === 'demo'
  const saved = watchlist.some((item) => item.id === analysis.id)

  useEffect(
    () => () => {
      requestController.current?.abort()
    },
    [],
  )
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(''), 4200)
    return () => clearTimeout(timer)
  }, [toast])
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'ghostjob-shield:watchlist:v1') setWatchlist(readWatchlist())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  async function inspect(url: string, probe = false) {
    if (busy) return
    setRequestedUrl(url)
    setBusy(true)
    setDialog(null)
    setReport(null)
    setScanError('')
    setScanStatus('Starting live inspection…')
    const controller = new AbortController()
    requestController.current = controller
    try {
      const result = await inspectJob(url, probe, setScanStatus, controller.signal)
      if (controller.signal.aborted) return
      setReport(result)
      setScenario(result.scenario)
      setDialog('report')
    } catch (error) {
      if (!controller.signal.aborted)
        setScanError(error instanceof Error ? error.message : 'The check failed. Try again.')
    } finally {
      if (!controller.signal.aborted) {
        setBusy(false)
        setScanStatus('')
      }
    }
  }

  function toggleSave() {
    const next = saved
      ? watchlist.filter((item) => item.id !== analysis.id)
      : [
          ...watchlist,
          {
            id: analysis.id,
            scenario: analysis.scenario,
            title: analysis.job.title,
            employer: analysis.job.employer,
            savedAt: new Date().toISOString(),
            mode: analysis.mode,
            ...(!isSample ? { report: analysis } : {}),
          },
        ]
    setWatchlist(next)
    const stored = writeWatchlist(next)
    setToast(
      stored
        ? saved
          ? 'Report removed from your watchlist.'
          : 'Report saved to this browser’s watchlist.'
        : 'Browser storage is unavailable. Saved for this session only.',
    )
  }

  function removeSaved(id: string) {
    const next = watchlist.filter((item) => item.id !== id)
    setWatchlist(next)
    setToast(
      writeWatchlist(next)
        ? 'Listing removed from your watchlist.'
        : 'Removed for this session; browser storage is unavailable.',
    )
  }

  function goToSample() {
    setRequestedUrl(null)
    setReport(mockAnalyses[scenario])
    setDialog('report')
  }

  async function inspectText(description: string) {
    if (busy) return
    setBusy(true)
    const controller = new AbortController()
    requestController.current = controller
    try {
      const result = await inspectDescription(description, requestedUrl, controller.signal)
      if (controller.signal.aborted) return
      setReport(result)
      setRequestedUrl(result.requestedUrl)
      setScenario(result.scenario)
      setScanError('')
      setDialog('report')
    } finally {
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  return (
    <SmoothScroll paused={dialog !== null}>
      <div className="film-app">
        <CinematicExperience
          analysis={analysis}
          busy={busy}
          scanStatus={scanStatus}
          scanError={scanError}
          suspended={dialog !== null}
          watchlistCount={watchlist.length}
          onInspect={inspect}
          onPasteDescription={() => setDialog('description')}
          onSample={(next) => {
            if (busy) return
            setScanError('')
            setScenario(next)
            setReport(mockAnalyses[next])
            setRequestedUrl(null)
            setDialog('report')
          }}
          onScore={(kind) => {
            if (!report) {
              setToast('Paste a public job link to inspect these signals.')
              return
            }
            setScoreKind(kind)
            setDialog('evidence')
          }}
          onProbe={() => setDialog('probe')}
          onWatchlist={() => setDialog('watchlist')}
          onHelp={() => setDialog('help')}
        />
        {toast && !dialog && (
          <div className="toast" role="status">
            <Check size={16} />
            {toast}
            <button aria-label="Dismiss notification" onClick={() => setToast('')}>
              <X size={14} />
            </button>
          </div>
        )}
        {dialog === 'report' && (
          <Modal title="A little more clarity." onClose={() => setDialog(null)} wide>
            <div className="report-banner">
              <Sparkles size={18} />
              <div>
                <strong>
                  {isProvided
                    ? 'User-provided text · unverified'
                    : isLive
                      ? `${analysis.analysisMethod === 'bright-data-rules' ? 'Bright Data · Indeed fallback' : analysis.analysisMethod === 'fetch-rules' ? 'TinyFish Fetch · page-text check' : analysis.analysisMethod === 'browser-rules' ? 'TinyFish Browser · page-text check' : 'TinyFish evidence check'}${analysis.cached ? ' · cached within the last hour' : ''}`
                      : 'Sample report — no live scan performed'}
                </strong>
                <p>
                  {isProvided
                    ? `Analysed ${new Date(analysis.checkedAt).toLocaleString('en-IN')}. No website was read. Scores and quotes refer only to your pasted text; the original listing and employer are unverified.`
                    : isLive
                      ? `Checked ${new Date(analysis.checkedAt).toLocaleString('en-IN')}. Scores reflect the cited observations and coverage below.`
                      : 'Explore a fictional listing to see how separate ghost and scam signals work.'}
                </p>
              </div>
            </div>
            {requestedUrl && (
              <div className="requested-url">
                <span>
                  {isProvided
                    ? 'ORIGINAL LINK · NOT VERIFIED · REFERENCE ONLY'
                    : isLive
                      ? 'SUBMITTED LINK'
                      : 'SAMPLE LINK'}
                </span>
                <p>{requestedUrl}</p>
              </div>
            )}
            {isLive && analysis.resolution && (
              <div className="requested-url">
                <span>
                  {analysis.resolution.platform} ·{' '}
                  {analysis.resolution.method === 'exact-id-search'
                    ? 'SAME JOB FOUND BY SEARCH'
                    : analysis.resolution.method === 'cloud-render'
                      ? 'CLOUD-RENDERED PAGE'
                      : analysis.resolution.method === 'bright-data'
                        ? 'BRIGHT DATA FALLBACK'
                        : 'DIRECT LISTING'}
                </span>
                <p>
                  <a
                    href={analysis.resolution.resolvedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {analysis.resolution.resolvedUrl}
                  </a>
                </p>
                <p>
                  Job ID: {analysis.resolution.jobId ?? 'See source URL'}. Evidence covers this
                  listing only.
                </p>
              </div>
            )}
            {isSample && (
              <div className="sample-tabs" role="group" aria-label="Choose sample scenario">
                {(
                  [
                    { id: 'ghost', label: 'Ghost signals', icon: Ghost },
                    { id: 'scam', label: 'Scam signals', icon: ShieldAlert },
                    { id: 'active', label: 'Active role', icon: ShieldCheck },
                  ] as const
                ).map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    aria-pressed={scenario === id}
                    className={scenario === id ? 'selected' : ''}
                    onClick={() => {
                      setScenario(id)
                      setReport(mockAnalyses[id])
                    }}
                  >
                    <Icon size={13} />
                    {label}
                  </button>
                ))}
              </div>
            )}
            <div className="report-job">
              <span className="eyebrow">
                {isProvided
                  ? 'USER-PROVIDED TEXT · UNVERIFIED'
                  : isLive
                    ? 'LIVE SOURCE OBSERVATIONS'
                    : 'FICTIONAL SAMPLE'}
              </span>
              <h3>{analysis.job.title}</h3>
              <p>
                {analysis.job.employer} · {analysis.job.location}
              </p>
            </div>
            <div className="dual-dials report-dials">
              <RiskDial kind="ghost" score={analysis.ghost} />
              <RiskDial kind="scam" score={analysis.scam} />
            </div>
            <div className="report-recommendation">
              <ShieldCheck size={19} />
              <div>
                <strong>A sensible next step</strong>
                <p>{analysis.recommendation}</p>
              </div>
            </div>
            <div className="report-coverage">
              <span>
                {analysis.coverage.careerPage ? <Check size={13} /> : <X size={13} />}{' '}
                {isSample ? 'Careers-page sample' : 'Careers-page match'}
              </span>
              <span>
                {analysis.coverage.history ? <Check size={13} /> : <X size={13} />}{' '}
                {isSample ? 'Seeded history' : 'Multiple snapshot dates'}
              </span>
              <span>
                {analysis.coverage.applyFlow ? <Check size={13} /> : <X size={13} />} Apply flow{' '}
                {analysis.coverage.applyFlow ? 'inspected' : 'not inspected'}
              </span>
            </div>
            <p className="modal-fineprint">
              Scores are transparent signal indices, not calibrated probabilities. Low scores do not
              establish safety or hiring intent. Review the evidence and missing coverage.
            </p>
            <h3 className="modal-subheading">Signals observed</h3>
            <SignalTimeline key={analysis.id} analysis={analysis} />
            {!isSample && (
              <>
                <h3 className="modal-subheading">Coverage and limitations</h3>
                <ul className="analysis-limitations">
                  {analysis.limitations?.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
                <h3 className="modal-subheading">
                  {isProvided ? 'Evidence origin' : 'Sources fetched'}
                </h3>
                {isProvided && (
                  <p className="modal-body-copy">
                    All quotes come from user-provided, unverified text. No external sources were
                    fetched and no website snapshots were saved.
                  </p>
                )}
                <ul className="analysis-sources">
                  {analysis.sources?.map((source) => (
                    <li key={source.url}>
                      <a href={source.url} target="_blank" rel="noopener noreferrer">
                        {source.title} <ArrowUpRight size={12} />
                      </a>
                      <small>{new Date(source.fetchedAt).toLocaleString('en-IN')}</small>
                    </li>
                  ))}
                </ul>
                {!isProvided && (
                  <p className="modal-fineprint">
                    {analysis.history?.length ?? 0} dated snapshot(s) saved ·{' '}
                    {analysis.scoringVersion}. Screenshots are not captured by this integration.
                  </p>
                )}
              </>
            )}
            {toast && (
              <p className="dialog-status" role="status">
                {toast}
              </p>
            )}
            <div className="modal-actions">
              <button className="button button-mint" onClick={toggleSave}>
                <Bookmark size={16} />
                {saved ? 'Remove saved report' : 'Save report to watchlist'}
              </button>
              <button className="button button-outline" onClick={() => setDialog('methodology')}>
                How scoring works <ArrowUpRight size={14} />
              </button>
            </div>
          </Modal>
        )}

        {dialog === 'description' && (
          <Modal
            title="Analyse the description you have."
            onClose={() => {
              requestController.current?.abort()
              setBusy(false)
              setDialog(null)
            }}
            wide
          >
            <DescriptionFallback busy={busy} onAnalyze={inspectText} />
          </Modal>
        )}

        {dialog === 'watchlist' && (
          <Modal title="Keep an eye on it." onClose={() => setDialog(null)}>
            <p className="modal-intro">
              Saved reports and sample scenarios, stored only in this browser. Live reports retain
              their original check time.
            </p>
            {watchlist.length === 0 ? (
              <div className="empty-watchlist">
                <span>
                  <Bookmark size={31} strokeWidth={1.2} />
                </span>
                <h3>No ghosts on your radar. Yet.</h3>
                <p>Save an analysis report to revisit its evidence.</p>
                <button className="button button-mint" onClick={goToSample}>
                  Explore a sample <ArrowUpRight size={16} />
                </button>
              </div>
            ) : (
              <div className="watchlist-items">
                {watchlist.map((item) => (
                  <div className="watchlist-item" key={item.id}>
                    <span className="mini-icon mint">
                      <Bookmark size={18} />
                    </span>
                    <button
                      onClick={() => {
                        setScenario(item.scenario)
                        setReport(item.mode !== 'demo' ? item.report! : mockAnalyses[item.scenario])
                        setRequestedUrl(item.report?.requestedUrl ?? null)
                        setDialog('report')
                      }}
                    >
                      <strong>{item.title}</strong>
                      <span>
                        {item.employer} ·{' '}
                        {item.mode === 'user-provided'
                          ? 'User-provided · unverified'
                          : item.mode === 'live'
                            ? 'Saved live check'
                            : 'Sample data'}
                      </span>
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Remove ${item.title} from watchlist`}
                      onClick={() => removeSaved(item.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="watchlist-note">
              <Clock3 size={17} />
              <p>
                Automatic rechecks and disappearance alerts are not enabled. Paste the URL again for
                a new check after the one-hour cache expires.
              </p>
            </div>
          </Modal>
        )}

        {dialog === 'methodology' && (
          <Modal title="The reasoning, in the open." onClose={() => setDialog(null)}>
            <p className="modal-intro">
              Two independent signal indices, from 0 to 100. Each observed signal contributes a
              disclosed weight to its own category.
            </p>
            <div className="formula">
              <span>SIGNAL INDEX</span>
              <code>min(100, sum(signal weights))</code>
            </div>
            <div className="method-bands">
              <span>
                <i className="mint-dot" />
                0–34 <strong>Few signals</strong>
              </span>
              <span>
                <i className="amber-dot" />
                35–64 <strong>Mixed signals</strong>
              </span>
              <span>
                <i className="violet-dot" />
                65–100 <strong>Strong signals</strong>
              </span>
            </div>
            <h3 className="modal-subheading">Current report: {analysis.job.title}</h3>
            <div className="weight-table">
              {analysis.signals
                .filter((s) => s.weight > 0)
                .map((signal) => (
                  <div key={signal.id}>
                    <span>
                      {signal.title}
                      <small>{signal.kind} signal</small>
                    </span>
                    <strong>+{signal.weight}</strong>
                  </div>
                ))}
            </div>
            <div className="method-note">
              <CircleHelp size={19} />
              <p>
                These weights have not been calibrated against a labelled dataset. Observations are
                extracted using local text rules. Live reports quote retrieved content;
                user-provided reports quote pasted text without verifying its source. Scores do not
                establish intent or fraud. Confidence describes coverage separately from the score.
              </p>
            </div>
            <h3 className="modal-subheading">What a live check needs</h3>
            <p className="modal-body-copy">
              The current scan covers the public listing text and starts dated snapshots.
              Cross-source employer verification and application-flow inspection are not included. A
              low scam score does not verify safety; a missing careers-page match does not prove a
              ghost job.
            </p>
          </Modal>
        )}

        {dialog === 'privacy' && (
          <Modal title="Your link. Your control." onClose={() => setDialog(null)}>
            <div className="privacy-points">
              <div>
                <Fingerprint size={22} />
                <h3>No account or résumé</h3>
                <p>This frontend preview does not request your name, résumé, or contact details.</p>
              </div>
              <div>
                <Globe2 size={22} />
                <h3>Your URL is sent to the retrieval provider</h3>
                <p>
                  Scanning sends the public URL to our API and TinyFish for reading and inspection.
                  If TinyFish cannot read an Indeed listing, its URL may also be sent to Bright
                  Data. The server caches reports and dated content hashes. Avoid links containing
                  private access tokens or personal information. Pasted-description analysis sends
                  text only to this app’s backend, without calling a retrieval provider or saving
                  the description on the server.
                </p>
              </div>
              <div>
                <Bookmark size={22} />
                <h3>Local watchlist only</h3>
                <p>
                  Saved reports, source URLs, evidence excerpts and save dates are stored in this
                  browser. Remove individual items in the watchlist or clear site data to remove
                  these local copies.
                </p>
              </div>
              <div>
                <Eye size={22} />
                <h3>No analytics in this preview</h3>
                <p>
                  Fonts and the video are served by this app. There are no analytics scripts or
                  third-party tracking pixels.
                </p>
              </div>
            </div>
          </Modal>
        )}

        {dialog === 'evidence' && (
          <Modal
            title={
              scoreKind === 'ghost' ? 'Ghost likelihood. The evidence.' : 'Scam risk. The evidence.'
            }
            onClose={() => setDialog(null)}
          >
            <p className="modal-intro">
              {isProvided
                ? 'User-provided text · unverified'
                : isLive
                  ? 'Live source observations'
                  : 'Fictional sample'}
              : {analysis.job.title} at {analysis.job.employer}.{' '}
              {isProvided
                ? 'Quotes refer only to your pasted text. The original source was not verified.'
                : isLive
                  ? 'Review the supporting sources and check time.'
                  : 'These signals belong to a demo.'}
            </p>
            <div className="evidence-dialog-dial">
              <RiskDial kind={scoreKind} score={analysis[scoreKind]} />
            </div>
            <SignalTimeline
              analysis={{
                ...analysis,
                signals: analysis.signals.filter(
                  (signal) => signal.kind === scoreKind || signal.kind === 'verified',
                ),
              }}
            />
            <div className="modal-actions">
              <button className="button button-mint" onClick={() => setDialog('report')}>
                Open full report <ArrowUpRight size={14} />
              </button>
              <button className="button button-outline" onClick={() => setDialog('methodology')}>
                How scoring works
              </button>
            </div>
          </Modal>
        )}
        {dialog === 'probe' && (
          <Modal title="Look inside the listing." onClose={() => setDialog(null)}>
            <p className="modal-intro">
              TinyFish reads the public posting, using cloud rendering when needed. An optional
              Bright Data fallback retrieves Indeed descriptions when TinyFish cannot. The server
              extracts exact excerpts and calculates two independent signal indices using disclosed
              text rules. Application steps and employer identity are not independently inspected.
            </p>
            <div className="pipeline-steps">
              <article>
                <FileSearch size={23} />
                <div>
                  <span>01 / FIND THE SOURCE</span>
                  <h3>Read the public job description</h3>
                  <p>
                    Resolve your board or ATS link to one specific role and retain source links,
                    exact excerpts and the check time.
                  </p>
                </div>
              </article>
              <article>
                <Clock3 size={23} />
                <div>
                  <span>02 / FOLLOW THE HISTORY</span>
                  <h3>A new role, or the same old listing?</h3>
                  <p>
                    Save a dated content hash on each day you scan. A first check cannot establish
                    reposting.
                  </p>
                </div>
              </article>
              <article>
                <ScanLine size={23} />
                <div>
                  <span>03 / SCORE OBSERVED TEXT</span>
                  <h3>What does this page actually say?</h3>
                  <p>
                    Explicit payment requests and future-opening language can add points. Every
                    contribution links to a quote. Hidden application steps remain outside this
                    check.
                  </p>
                </div>
              </article>
            </div>
            <button className="button button-mint" onClick={goToSample}>
              Explore the sample findings <ArrowUpRight size={14} />
            </button>
          </Modal>
        )}
        {dialog === 'help' && (
          <Modal title="The film is the interface." onClose={() => setDialog(null)}>
            <div className="privacy-points">
              <div>
                <ScanLine size={22} />
                <h3>Scroll to move through the video</h3>
                <p>
                  Scroll down to move forward, and up to reverse. You can also use the scene buttons
                  or the timeline at the bottom.
                </p>
              </div>
              <div>
                <Ghost size={22} />
                <h3>Click what you see</h3>
                <p>
                  The floating job cards open fictional sample reports. The rotating cube explains
                  the checks. In the final scene, the input, scan button, and both dials are
                  interactive.
                </p>
              </div>
              <div>
                <ShieldCheck size={22} />
                <h3>Keyboard and motion controls</h3>
                <p>
                  Tab through visible controls and press Enter or Space. Use arrow keys on the
                  timeline. “Still scenes” replaces continuous movement with three fixed frames.
                  Your system reduced-motion preference is respected.
                </p>
              </div>
              <div>
                <CircleHelp size={22} />
                <h3>Live checks and clearly labelled samples</h3>
                <p>
                  Pasted URLs start TinyFish checks and may use provider credits. Floating cards
                  still open fictional examples. Live scores use quoted source evidence; missing
                  coverage is disclosed. A server API key is required.
                </p>
              </div>
            </div>
            <div className="modal-actions">
              <button className="button button-outline" onClick={() => setDialog('methodology')}>
                Methodology
              </button>
              <button className="button button-outline" onClick={() => setDialog('privacy')}>
                Privacy
              </button>
            </div>
          </Modal>
        )}
      </div>
    </SmoothScroll>
  )
}
export default App
