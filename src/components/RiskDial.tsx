import { useEffect, useRef } from 'react'
import { Ghost, ShieldAlert, Info } from 'lucide-react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import type { RiskScore } from '../types/analysis'
import { scoreBand } from '../lib/analysis'

gsap.registerPlugin(ScrollTrigger)

export function RiskDial({ score, kind }: { score: RiskScore; kind: 'ghost' | 'scam' }) {
  const root = useRef<HTMLDivElement>(null)
  const number = useRef<HTMLSpanElement>(null)
  const arc = useRef<SVGCircleElement>(null)
  const circumference = 2 * Math.PI * 84
  const band = score.value !== null ? scoreBand(score.value) : 'low'
  const Icon = kind === 'ghost' ? Ghost : ShieldAlert

  useEffect(() => {
    const media = gsap.matchMedia()
    media.add(
      {
        reduced: '(prefers-reduced-motion: reduce)',
        motion: '(prefers-reduced-motion: no-preference)',
      },
      (context) => {
        const count = { value: 0 }
        const update = () => {
          if (number.current) number.current.textContent = String(Math.round(count.value))
          if (arc.current)
            arc.current.style.strokeDashoffset = String(circumference * (1 - count.value / 100))
        }
        if (context.conditions?.reduced) {
          count.value = score.value ?? 0
          update()
          return
        }
        update()
        gsap.to(count, {
          value: score.value ?? 0,
          duration: 1.5,
          ease: 'power3.out',
          onUpdate: update,
          scrollTrigger: { trigger: root.current, start: 'top 92%', once: true },
        })
      },
    )
    return () => media.revert()
  }, [score.value, circumference])

  return (
    <div ref={root} className={`risk-dial ${kind} ${band}`}>
      <div className="dial-heading">
        <Icon size={17} />
        <span>{kind === 'ghost' ? 'Ghost likelihood' : 'Scam risk'}</span>
        <Info size={13} aria-hidden="true" />
      </div>
      <div
        className="dial-visual"
        role="img"
        aria-label={`${kind === 'ghost' ? 'Ghost likelihood' : 'Scam risk'}: ${score.value} out of 100. ${score.label}. ${score.confidence} confidence.`}
      >
        <svg viewBox="0 0 210 210" aria-hidden="true">
          <circle className="dial-outer" cx="105" cy="105" r="100" />
          <circle className="dial-track" cx="105" cy="105" r="84" />
          <circle
            ref={arc}
            className="dial-progress"
            cx="105"
            cy="105"
            r="84"
            strokeDasharray={circumference}
            strokeDashoffset={circumference}
            transform="rotate(-90 105 105)"
          />
        </svg>
        <div className="dial-number" aria-hidden="true">
          <span ref={number}>0</span>
          <small>/ 100</small>
        </div>
        <span className="dial-caption">SIGNAL INDEX</span>
      </div>
      <div className="score-label">
        <span />
        {score.label}
      </div>
      <p>{score.summary}</p>
      <div className="confidence">{score.confidence} confidence</div>
    </div>
  )
}
