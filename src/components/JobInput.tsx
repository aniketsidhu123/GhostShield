import { useId, useState, type FormEvent } from 'react'
import { ArrowUpRight, Link2, LoaderCircle, ShieldCheck } from 'lucide-react'
import { normalizeJobUrl } from '../lib/analysis'

interface JobInputProps {
  onInspect: (url: string) => void
  busy: boolean
  compact?: boolean
}

export function JobInput({ onInspect, busy, compact = false }: JobInputProps) {
  const id = useId()
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  function submit(event: FormEvent) {
    event.preventDefault()
    try {
      const normalized = normalizeJobUrl(url)
      setError('')
      onInspect(normalized)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enter a valid job link.')
    }
  }
  return (
    <div className={`job-input-wrap ${compact ? 'compact' : ''}`}>
      <form className={`job-input ${error ? 'has-error' : ''}`} onSubmit={submit} noValidate>
        <Link2 size={20} strokeWidth={1.6} className="input-link-icon" aria-hidden="true" />
        <label className="sr-only" htmlFor={id}>
          Job listing URL
        </label>
        <input
          id={id}
          inputMode="url"
          autoComplete="url"
          spellCheck={false}
          placeholder="Paste job link to inspect…"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value)
            if (error) setError('')
          }}
          aria-invalid={!!error}
          aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`}
          disabled={busy}
        />
        <button className="button button-mint" type="submit" disabled={busy}>
          {busy ? (
            <>
              <LoaderCircle size={17} className="spin" />
              <span>Opening demo</span>
            </>
          ) : (
            <>
              <span>Inspect job</span>
              <ArrowUpRight size={18} />
            </>
          )}
        </button>
      </form>
      {error && (
        <p id={`${id}-error`} className="input-error" role="alert">
          {error}
        </p>
      )}
      <p id={`${id}-help`} className="input-helper">
        <ShieldCheck size={13} /> No sign-up. No résumé. Just a little clarity.
        <span className="demo-inline">Demo mode</span>
      </p>
    </div>
  )
}
