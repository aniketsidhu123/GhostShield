import { useState } from 'react'
import { ArrowUpRight, ChevronDown, Check, Ghost, ShieldAlert } from 'lucide-react'
import type { JobAnalysisProps } from '../types/analysis'

export function SignalTimeline({ analysis }: JobAnalysisProps) {
  const [openId, setOpenId] = useState<string | null>(null)
  return (
    <div className="signal-timeline">
      {analysis.signals.map((signal, index) => {
        const Icon = signal.kind === 'ghost' ? Ghost : signal.kind === 'scam' ? ShieldAlert : Check
        const open = openId === signal.id
        return (
          <article
            key={signal.id}
            className={`signal-item ${signal.kind} ${open ? 'is-open' : ''}`}
          >
            <div className="timeline-marker">
              <Icon size={15} />
            </div>
            <button
              className="signal-toggle"
              onClick={() => setOpenId(open ? null : signal.id)}
              aria-expanded={open}
              aria-controls={`signal-${signal.id}`}
            >
              <span>
                <span className="signal-date">
                  {new Date(
                    signal.observedAt.includes('T')
                      ? signal.observedAt
                      : `${signal.observedAt}T12:00:00`,
                  ).toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                  })}{' '}
                  <span>·</span> SIGNAL {String(index + 1).padStart(2, '0')}
                </span>
                <strong>{signal.title}</strong>
                <span className="signal-source">{signal.source}</span>
              </span>
              <ChevronDown size={17} className="signal-chevron" />
            </button>
            <div id={`signal-${signal.id}`} hidden={!open} className="signal-details">
              <p>{signal.description}</p>
              {signal.quote && <blockquote className="evidence-quote">“{signal.quote}”</blockquote>}
              <div className="signal-weight">
                {signal.weight > 0
                  ? `+${signal.weight} ${signal.kind} signal points`
                  : 'Context signal · no added risk points'}
                {signal.sourceUrl && /^https?:\/\//.test(signal.sourceUrl) && (
                  <a href={signal.sourceUrl} target="_blank" rel="noopener noreferrer">
                    Source <ArrowUpRight size={12} />
                  </a>
                )}
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}
