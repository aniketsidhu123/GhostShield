# Backend handoff

This document is an integration proposal. No live API or TinyFish credential is configured in the frontend.

## Data model

`src/types/analysis.ts` defines `JobAnalysis`, `RiskScore`, `Signal`, and `JobAnalysisProps`. UI components receive data through these types. Keep `ghost` and `scam` independent. `mode: 'demo'` must never be presented as an inspected live posting.

A live `JobAnalysis` should include:

- A stable analysis ID, canonical analyzed URL, UTC check timestamp, and the matched posting identity.
- Separate score, explanation, and confidence values for ghost likelihood and scam risk.
- Dated observations, signal contributions, and actual supporting source URLs.
- Accurate coverage flags. A failed or unrequested probe must not become a reassuring observation.
- An explicit next-step recommendation, written as observations rather than accusations.

Add a separate evidence-capture type when the probe is implemented: capture ID, verified object-storage URL, MIME type, capture timestamp, redaction status, and associated signal IDs. Show an unavailable state when screenshots are absent.

## Suggested endpoints

| Endpoint                         | Purpose                                                                      |
| -------------------------------- | ---------------------------------------------------------------------------- |
| `POST /v1/analyses`              | Normalize a public posting URL; return a fresh cached report or enqueue work |
| `GET /v1/analyses/:id`           | Poll queued work or retrieve a completed report                              |
| `POST /v1/analyses/:id/probes`   | Explicitly request an isolated apply-flow probe                              |
| `GET /v1/postings/:id/snapshots` | Retrieve dated posting snapshots and changes                                 |
| `POST /v1/watchlist`             | Save a canonical posting for server-side monitoring                          |
| `DELETE /v1/watchlist/:id`       | Remove monitoring and the saved item                                         |
| `POST /v1/reports`               | Submit a community observation for moderation                                |
| `GET /v1/employers/:id`          | Return aggregate, sourced observations with uncertainty                      |

The extension can consume the same analysis endpoint through a separately scoped, rate-limited client. Do not expose a TinyFish key in a `VITE_*` variable, bundle, extension, or browser storage.

Example request:

```json
{
  "url": "https://careers.example.com/jobs/product-designer",
  "probe": false
}
```

Suggested async response:

```json
{
  "id": "analysis-id",
  "status": "queued",
  "pollAfterMs": 2000
}
```

A completed response contains a validated `JobAnalysis`, with `mode: 'live'`. Add runtime schema validation before accepting network responses; TypeScript alone does not validate JSON. Display partial/failure states without substituting fixtures into a live report.

## Cache-first pipeline

1. **Normalize:** canonicalize board URLs while preserving job IDs. The frontend helper removes obvious tracking parameters; authoritative canonicalization belongs on the server.
2. **Match:** use employer domain, source job ID, normalized title/location, and description similarity to avoid merging unrelated roles.
3. **Cache:** cache by canonical posting and deduplicate employer career-page fetches. Use a single-flight lock to collapse concurrent checks.
4. **Snapshot:** store content hashes, first/last seen times, source timestamps, and changes. A refreshed date alone is weak evidence of reposting.
5. **Search and fetch:** use TinyFish for employer careers pages and independent context. Scope news and reports carefully to the correct employer and period.
6. **Probe on demand:** use an isolated browser for redirects and the application path. Stop before submission; do not enter real personal data, upload a résumé, pay, log in, or bypass a CAPTCHA. Capture the evidence actually observed.
7. **Score:** aggregate independent, traceable contributions. Separate lack of evidence from negative evidence; return confidence and coverage alongside scores.
8. **Monitor:** schedule rechecks for opted-in watchlist entries and notify only on meaningful, confirmed changes.

The supplied project brief assumes 5 searches/minute and 25 fetches/minute. Treat these as configurable initial budgets, not a verified current service entitlement. Use shared rate-limit buckets, caching, exponential backoff, `Retry-After`, and work queues. Verify current provider limits before deployment.

## Deployment boundaries

- Cloud Run: separate stateless API and worker services.
- PostgreSQL: normalized employers/postings, snapshots, reports, subscriptions, and analysis history.
- Object storage: access-controlled, expiring, redacted screenshot evidence.
- Queue / scheduler: cached fetches, on-demand probes, and watchlist rechecks.
- Secret Manager: TinyFish credentials and service credentials.

The frontend has no service credentials and does not contact entered URLs. A production fetching service must enforce URL scheme, DNS and resolved-address validation, public-address allowlisting, every redirect hop, bounded responses, and isolated networking. The frontend URL validator is a convenience feature, not an SSRF boundary.

## Calibration and communication

The current mock formula is a sum of category-specific weights capped at 100. Every demo score matches its displayed contributions. These weights are illustrative, unvalidated signal indices, not probabilities.

For the proposed 100-posting labelled set, document collection dates, source geography, label definitions, class counts, uncertainty, and reviewer agreement. Evaluate ghost signals and scam signals independently on held-out examples; report precision, recall, false positives, and confidence intervals. Keep synthetic fixtures outside the evaluation dataset. Do not conflate closed jobs, evergreen hiring, ghost suspicion, and fraud.

Employer-index publication and paid active-listing badges need a transparent verification protocol, expiration, correction/appeal process, and a clear separation from risk scoring. Payment must not alter observed risk signals.
