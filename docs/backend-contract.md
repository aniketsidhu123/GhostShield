# TinyFish backend: setup and contract

## Configure and run

Install with `npm ci`. Copy `.env.example` to `.env` if it does not exist, add `TINYFISH_API_KEY`, and run `npm run dev:api`. In a second terminal run `npm run dev`, then open http://127.0.0.1:5173. Restart the API after editing `.env`. A key is deliberately not included in this repository. No `VITE_*` secret is used.

For a built app, run `npm run build` followed by `npm start`; Node serves the frontend, byte-range video, and API on port 3001. `PORT`, `HOST`, `PUBLIC_ORIGIN`, `DATA_DIR` and `TINYFISH_RUNS_PER_HOUR` are configurable. The Vite development proxy targets port 3001; update `vite.config.ts` if changing that port during development.

The active scan starts with **TinyFish Fetch** and applies local English text rules. If a Naukri or Indeed description is unreadable, it uses **TinyFish Browser** for read-only client rendering. Known job IDs can then use **TinyFish Search** to locate the exact same posting. It starts no Agent run and requires no other LLM key. Allowances and Browser charges are account-dependent; check the current TinyFish dashboard.

### Supported pasted links

- LinkedIn `/jobs/view/ID` or search-result links containing `currentJobId`: resolve to the selected job, dropping filters and tracking.
- Naukri `/job-listings-...-ID`: preserve the listing ID and remove tracking.
- Indeed `jk` or `vjk`: resolve to `/viewjob?jk=ID`, including supported country domains. Actual access varies; the real Indeed tests below did not yield readable individual descriptions.
- Workday `/job/` and `/details/`: preserve the requisition and tenant; exclude search results preceding the selected description.
- Other public employer and ATS job URLs continue through Fetch and the same evidence validation.

Search pages without a selected ID return `SELECT_JOB`. Recovery reads at most two Search candidate URLs with the same platform and job ID (and the same Workday tenant). Returned redirects must retain that identity. Search snippets, unrelated vacancies and unreadable/error pages never produce a report. A failed recovery returns `LISTING_UNAVAILABLE`; it does not demand that users locate an employer careers page.

## Provider contract

Implemented against the official references:

- [Fetch](https://docs.tinyfish.ai/fetch-api/reference): `POST https://api.fetch.tinyfish.ai`, `{urls, format:"markdown", links:true, ttl:0, per_url_timeout_ms:45000, purpose}`. The purpose explicitly describes the job-risk page-text report. HTTP failures, per-URL failures, application-error pages and non-job content are handled without inventing scores.
- [Search](https://docs.tinyfish.ai/search-api/reference): `GET https://api.search.tinyfish.ai?query=...&location=IN&language=en`. Results are candidate URLs only; snippets do not become scoring evidence.
- [Browser](https://docs.tinyfish.ai/browser-api/reference): `POST https://api.browser.tinyfish.ai` with `{url, timeout_seconds:60}`, then `playwright-core` connects to the returned CDP endpoint. Read visible page text, headings and links only; no local browser installation is needed. `DELETE /:session_id` runs in cleanup on success or failure, with one termination retry. No persistent login profile, form submission or access-check interaction is used.
- [Agent](https://docs.tinyfish.ai/agent-api/reference): `POST https://agent.tinyfish.ai/v1/automation/run-async`, with a natural-language read-only goal, a supported `output_schema`, `browser_profile:"lite"`, and a 180-second provider duration limit. No profile or vault credentials are enabled. Beta-gated max_steps, strict mode and capture settings are intentionally omitted.
- [Runs](https://docs.tinyfish.ai/key-concepts/runs): poll `GET /v1/runs/:id`; validate the completed result, not just the COMPLETED status. An interrupted/timed-out run is cancelled with `POST /v1/runs/:id/cancel` when its ID is known. Run creation is not automatically retried because an ambiguous timeout may already have started billable work.

All provider calls use a server-side `X-API-Key` header. Provider response bodies/errors and credentials are never logged or returned verbatim to the browser. Providers are fixed HTTPS destinations; this API does not fetch user URLs directly from the host machine.

## Local API

| Endpoint | Behavior |
| --- | --- |
| `GET /api/health` | Returns provider name and a boolean indicating whether a key is configured. It does not validate or reveal the key. |
| `POST /api/analyses` | JSON `{ "url": "https://employer.com/jobs/123", "probe": false }`. Returns 202 with a task ID, or 200 with a cached report. Requires a recognized Origin and JSON content type. |
| `GET /api/analyses/:id` | Returns `queued`, `running`, `completed`, or `failed`, plus a human-readable stage and eventual report/error. Requires the same HttpOnly session cookie as the originating request. |

The frontend polls every two seconds. Failures show actionable messages for missing configuration, authentication, exhausted credits, rate limits, blocked/login-only sources, malformed results and timeouts. No fixture fallback exists in the live request path. Scores remain unassessed when no readable specific posting can be established.

The scanner labels its scope as a TinyFish Fetch or Browser page-text check. The old `probe` flag is accepted for API compatibility, but never starts an Agent run; if true, the report explicitly states that application-flow inspection is unavailable. `coverage.applyFlow` is false. No form is filled or submitted. Screenshots and recordings are not exposed by the scan. `analysisMethod` is `fetch-rules` or `browser-rules`; `providerRunId` is absent. `resolution` contains platform, submitted URL, resolved URL, job ID and method (`direct`, `cloud-render`, `exact-id-search`).

## Evidence and scoring

`src/lib/api-schema.ts` validates completed payloads before rendering or loading saved reports. `server/page-analysis.ts` requires a specific posting URL, an identifiable title and job-description content, then extracts exact paragraphs using conservative English patterns. `server/scoring.ts` assigns fixed weights. No model supplies numerical scores.

A result requires a specific readable job and a title excerpt that matches the fetched posting. Each observation's quote must be present in the same fetched text after whitespace/Markdown normalization. The source URL and fetch timestamp accompany it. Text matching verifies the excerpt, not the interpretation. Patterns can miss paraphrases, non-English text, image content, or hidden requests. Common role URLs on employer sites and ATS hosts, plus Naukri job-listings URLs, are recognized when their actual content is readable; job indexes and site error pages are rejected.

The active Fetch extractor implements explicit future-opening language, hiring pauses for this role, pre-interview payment requests, pre-offer bank requests, WhatsApp-only applications, ISO original posting dates and explicitly closed roles. It does not infer recruiter-domain mismatches or independently establish an official employer match. Readable role details, Apply headings and no-payment notices are context signals worth zero points. The weights below also document legacy Agent categories, but only observed supported rules contribute.

| Observed signal | Category | Points |
| --- | --- | ---: |
| Original posting date at least 90 days old, supported by a date quote | Ghost | 15 |
| Explicit future-opportunity/talent-pool language | Ghost | 20 |
| Explicit hiring pause applicable to this role/team | Ghost | 25 |
| Applicant payment before hiring | Scam | 45 |
| Bank details requested before an offer | Scam | 35 |
| Applications explicitly restricted to WhatsApp | Scam | 15 |
| Documented recruiter identity inconsistency | Scam | 20 |
| Readable listing / matching employer careers listing / explicitly closed role | Context | 0 |

Rules contribute at most once. Each category is summed independently and capped at 100. Fee disclaimers, an ordinary WhatsApp contact, generic layoffs, an inaccessible careers page, third-party ATS domains, and missing historical data are not automatically risk indicators. A closed role has no ghost penalties; its closed status is shown explicitly.

Indices are **not calibrated probabilities**, and do not establish intent or fraud. Zero means no supported weighted indicators were observed in the covered sources, not verified safety or active hiring. Confidence stays low for ghost intent without careers and historical coverage, and for scam assessment without an inspected apply flow. Limits are shown alongside evidence, source timestamps and the scoring version.

## Cache, snapshots, and watchlist

Completed reports are stored under SHA-256 filenames in `.data` for reuse for one hour. Cache keys include canonical URL, probe mode and scoring version. Concurrent identical checks share work; a probe result is never silently substituted for a different requested coverage mode.

A content hash and observed timestamp are saved per canonical posting per UTC day, up to 90 snapshots per posting. The current snapshot includes a supported original posting date when available. No historical dates are invented. This establishes longitudinal observations, but the current scorer does not treat changed text or dates as proven reposts. Reports and snapshot files persist across local API restarts; in-progress jobs and browser-session ownership do not.

There is no automatic deletion of old per-posting files; `.data` retention is an operator responsibility. Reports include public URLs and evidence excerpts, so do not submit private/token-bearing URLs. Full page bodies are processed in memory, not persisted by this app. TinyFish has its own provider retention policies.

The browser watchlist stores saved live reports (including original check time, source links and excerpts) or sample metadata in local storage. Opening a saved live report does not replace it with a demo or silently rerun it. Automatic monitoring, notifications and server watchlist subscriptions are not implemented.

## Limits and deployment

The local API binds to loopback by default. It limits analysis starts to five per minute per socket IP, two concurrent runs, 200 in-memory tasks and 1,000 client sessions. Provider budgets are 25 Fetch calls/minute, five Search calls/minute, 20 Browser starts/hour, and 20 legacy Agent runs/hour by default. Account limits may be lower. Responses are bounded, JSON request bodies are capped, unsafe schemes/credentials/custom ports/private and reserved DNS addresses are rejected. Fetch's redirect protection and cloud browser network isolation are provider-enforced; returned final URLs are also checked.

Same-origin/session checks are not user authentication. Before exposing the service publicly, add account authentication and per-user spending quotas. Rate limits, sessions and tasks currently live in one process. For multi-instance Cloud Run use a durable queue/worker, shared rate limiting, a shared database/object store, and Secret Manager. The included Node container is ready for single-instance testing, not a claim of a fully scalable production deployment. Mounted DATA_DIR must be writable by the container's node user.

## Verification

`npm test` includes the existing frontend helper tests and backend tests for URL/DNS rejection, independent scoring, rule deduplication, invented quotes, absent sources, fee-disclaimer false positives, closed/old listings, blocked pages, provider errors, redirect validation, the full API/pipeline with a simulated TinyFish transport, cache persistence, session-scoped reads, missing keys and foreign origins. These tests do not contact TinyFish or consume credits.

`npm run build` checks frontend and server TypeScript. Browser QA confirmed the real frontend POST reaches the API and shows the key-configuration error while both scores remain unassessed.

On 2026-10-15 the original Agent runs `0ba3b6ff-40e7-4e7b-b001-0d90444ab3a1` and `b7b42b36-d079-4e02-93d8-6702dccc536a` returned `AGENT_FAILURE`, a usage-policy rejection, and zero browser steps. The provider did not identify an exact triggering phrase or URL. Its [error reference](https://docs.tinyfish.ai/error-codes) documents content-policy rejections separately from authentication, billing and site blocking. No claim is made that prompt wording or a particular employer caused this rejection. The blocked Agent workflow is not retried or disguised; the active feature is a narrower, transparent Fetch page-text report.

Successful authenticated browser scans after this change:

| Public posting | Ghost | Scam | Evidence |
| --- | ---: | ---: | --- |
| [Deliveroo Staff Software Engineer](https://job-boards.greenhouse.io/deliveroo/jobs/8202442) | 0 | 0 | Four quoted context signals, including a no-payment notice; no weighted risk signals observed. |
| [Isar Aerospace Controls & Automation Engineer](https://job-boards.greenhouse.io/isaraerospace/jobs/4587242101) | 20 | 0 | Explicit text that recruitment is not active and the listing builds a talent pool; +20 ghost points. |

`npm run test:live` verifies API completion, numeric totals, source links, all excerpts against independently re-fetched TinyFish page text, and cache persistence. Both reports and all eight excerpts passed on 2026-10-15. The initial browser requests were uncached; later audit requests reused those reports and fetched fresh source content for verification. `.qa/live-smoke-results.json` records check and verification times. This is integration verification, not precision/recall or probability calibration.

The user-supplied Naukri posting ending `200520500046` returned an application error through TinyFish Fetch. On 2026-10-16, the supported Browser fallback successfully rendered its actual Fresher description from Unifybrains Infotech. The app displayed both indices and expandable source excerpts. LinkedIn `currentJobId=4479816430` and Workday requisition `JR-0109923` also produced reports in the app. Their original failures were URL-selection/description-parsing issues, distinct from the earlier Agent policy rejection.

Three real Indeed IDs (`34797a0025b9529d`, `01e26c3f29de67ae`, `183731e015d806d3`) returned unreadable individual pages through Fetch. Browser attempts for the first two and exact-ID recovery for the second also did not establish readable descriptions. The second was tested through the app and correctly left both scores unassessed. No successful Indeed scan is claimed. LinkedIn and Naukri availability also varied between requests; final independent quote verification succeeded for all three user-supplied listings. Cached reports retain their original check time and show that they are cached. See [the full verification matrix](live-verification.md).
