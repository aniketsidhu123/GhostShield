import { useState, type FormEvent } from 'react'
import { FileText, LoaderCircle } from 'lucide-react'

export function DescriptionFallback({
  busy,
  onAnalyze,
}: {
  busy: boolean
  onAnalyze: (description: string) => Promise<void>
}) {
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setError('')
    try {
      await onAnalyze(description)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The text could not be analysed.')
    }
  }
  return (
    <form className="description-fallback" onSubmit={submit}>
      <div className="report-banner unverified-banner">
        <FileText size={20} />
        <p>
          <strong>User-provided · unverified</strong>
          <br />
          Scores will assess your pasted wording only. We cannot confirm that it matches the
          original listing or that the employer is hiring.
        </p>
      </div>
      <label htmlFor="pasted-description">Job description</label>
      <p id="description-help">
        Put the job title on its own first line, then paste the full description, responsibilities,
        requirements and application instructions. Use 240–30,000 characters.
      </p>
      <textarea
        id="pasted-description"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        required
        minLength={240}
        maxLength={30000}
        rows={10}
        disabled={busy}
        aria-describedby="description-help description-privacy description-length"
        aria-invalid={!!error}
      />
      <small id="description-length">
        {description.trim().length.toLocaleString()} / 30,000 characters
      </small>
      <p id="description-privacy" className="modal-fineprint">
        Sent only to this app’s backend for text analysis, without calling TinyFish or Bright Data.
        The description is not saved on the server. Avoid personal details. Saving the report stores
        its quoted excerpts in this browser.
      </p>
      {error && (
        <p className="description-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="button button-mint"
        type="submit"
        disabled={busy || description.trim().length < 240}
      >
        {busy ? <LoaderCircle size={17} className="spin" /> : <FileText size={17} />}
        {busy ? 'Analysing pasted text…' : 'Analyse pasted description'}
      </button>
    </form>
  )
}
