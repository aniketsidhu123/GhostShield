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
import { mockAnalyses } from './data/mockAnalysis'
import { readWatchlist, writeWatchlist } from './lib/analysis'
import type { SavedListing, Scenario } from './types/analysis'

type Dialog =
  'report' | 'watchlist' | 'methodology' | 'privacy' | 'evidence' | 'probe' | 'help' | null

function App() {
  const [scenario, setScenario] = useState<Scenario>('ghost')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [scoreKind, setScoreKind] = useState<'ghost' | 'scam'>('ghost')
  const [busy, setBusy] = useState(false)
  const [requestedUrl, setRequestedUrl] = useState<string | null>(null)
  const [watchlist, setWatchlist] = useState<SavedListing[]>(readWatchlist)
  const [toast, setToast] = useState('')
  const inspectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const analysis = mockAnalyses[scenario]
  const saved = watchlist.some((item) => item.id === analysis.id)

  useEffect(
    () => () => {
      if (inspectTimer.current) clearTimeout(inspectTimer.current)
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
  function inspect(url: string) {
    if (busy) return
    setRequestedUrl(url)
    setBusy(true)
    inspectTimer.current = setTimeout(() => {
      setBusy(false)
      setDialog('report')
    }, 850)
  }

  function toggleSave() {
    const next = saved
      ? watchlist.filter((item) => item.id !== analysis.id)
      : [
          ...watchlist,
          {
            id: analysis.id,
            scenario,
            title: analysis.job.title,
            employer: analysis.job.employer,
            savedAt: new Date().toISOString(),
            mode: analysis.mode,
          },
        ]
    setWatchlist(next)
    const stored = writeWatchlist(next)
    setToast(
      stored
        ? saved
          ? 'Sample removed from your watchlist.'
          : 'Sample saved to this browser’s watchlist.'
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
    setDialog('report')
  }

  return (
    <SmoothScroll paused={dialog !== null}>
      <div className="film-app">
        <CinematicExperience
          analysis={analysis}
          busy={busy}
          suspended={dialog !== null}
          watchlistCount={watchlist.length}
          onInspect={inspect}
          onSample={(next) => {
            setScenario(next)
            setRequestedUrl(null)
            setDialog('report')
          }}
          onScore={(kind) => {
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
                <strong>Sample report — no live scan performed</strong>
                <p>
                  {requestedUrl
                    ? 'Your link was validated locally. The findings below belong to a fictional sample, not the URL you entered.'
                    : 'Explore a fictional listing to see how separate ghost and scam signals work.'}
                </p>
              </div>
            </div>
            {requestedUrl && (
              <div className="requested-url">
                <span>YOUR LINK · NOT FETCHED</span>
                <p>{requestedUrl}</p>
              </div>
            )}
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
                  onClick={() => setScenario(id)}
                >
                  <Icon size={13} />
                  {label}
                </button>
              ))}
            </div>
            <div className="report-job">
              <span className="eyebrow">FICTIONAL SAMPLE</span>
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
                <Check size={13} /> Careers-page sample
              </span>
              <span>
                <Check size={13} /> Seeded history
              </span>
              <span>
                <X size={13} /> Apply flow not inspected
              </span>
            </div>
            <p className="modal-fineprint">
              Sample scores are transparent signal indices, not calibrated probabilities. Live
              fetches, isolated browsing, screenshots, and automated alerts require the backend
              described in the project documentation.
            </p>
            {toast && (
              <p className="dialog-status" role="status">
                {toast}
              </p>
            )}
            <div className="modal-actions">
              <button className="button button-mint" onClick={toggleSave}>
                <Bookmark size={16} />
                {saved ? 'Remove saved sample' : 'Save sample to watchlist'}
              </button>
              <button className="button button-outline" onClick={() => setDialog('methodology')}>
                How scoring works <ArrowUpRight size={14} />
              </button>
            </div>
          </Modal>
        )}

        {dialog === 'watchlist' && (
          <Modal title="Keep an eye on it." onClose={() => setDialog(null)}>
            <p className="modal-intro">
              Your saved samples, in one place. Stored only in this browser.
            </p>
            {watchlist.length === 0 ? (
              <div className="empty-watchlist">
                <span>
                  <Bookmark size={31} strokeWidth={1.2} />
                </span>
                <h3>No ghosts on your radar. Yet.</h3>
                <p>Save a sample report to try the watchlist.</p>
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
                        setRequestedUrl(null)
                        setDialog('report')
                      }}
                    >
                      <strong>{item.title}</strong>
                      <span>{item.employer} · Sample data</span>
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
                Automatic rechecks and disappearance alerts are planned. This local demo saves
                samples; it doesn’t monitor postings.
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
            <h3 className="modal-subheading">Current sample: {analysis.job.title}</h3>
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
                These example weights are illustrative and have not been validated on a labelled
                dataset. Scores do not establish intent or fraud. Confidence describes sample
                coverage and is separate from the score.
              </p>
            </div>
            <h3 className="modal-subheading">What a live check needs</h3>
            <p className="modal-body-copy">
              A cross-source listing match, dated snapshots, independent source evidence, and
              optional apply-flow checks. A low scam score does not verify safety; a missing
              careers-page match does not prove a ghost job.
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
                <h3>Your URL stays in this session</h3>
                <p>
                  Links are validated in your browser and are not fetched or sent to an analysis
                  service. They are not stored in the watchlist.
                </p>
              </div>
              <div>
                <Bookmark size={22} />
                <h3>Local watchlist only</h3>
                <p>
                  Saved sample titles, IDs, and save dates are stored in this browser’s local
                  storage. Remove individual items in the watchlist or clear site data to delete
                  them.
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
              Fictional sample: {analysis.job.title} at {analysis.job.employer}. These signals
              belong to the selected demo, not a live listing.
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
                Open full sample report <ArrowUpRight size={14} />
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
              The cube represents the inspection process. This preview explains the checks; it
              doesn't run a live browser probe.
            </p>
            <div className="pipeline-steps">
              <article>
                <FileSearch size={23} />
                <div>
                  <span>01 / FIND THE SOURCE</span>
                  <h3>Does the employer list this role?</h3>
                  <p>Match the job to the employer’s own careers page and compare the details.</p>
                </div>
              </article>
              <article>
                <Clock3 size={23} />
                <div>
                  <span>02 / FOLLOW THE HISTORY</span>
                  <h3>A new role, or the same old listing?</h3>
                  <p>
                    Compare dated snapshots to surface long-running and repeatedly posted roles.
                  </p>
                </div>
              </article>
              <article>
                <ScanLine size={23} />
                <div>
                  <span>03 / INSPECT THE APPLY FLOW</span>
                  <h3>What happens after you click apply?</h3>
                  <p>
                    Planned: an isolated, on-demand check for fees, contact mismatches, and
                    suspicious redirects. It stops before submission.
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
                <h3>Sample evidence, clearly labelled</h3>
                <p>
                  No submitted link is fetched in this frontend demo. Scores describe fictional
                  signals; the live analysis backend has not been connected.
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
