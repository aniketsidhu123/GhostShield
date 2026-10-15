# TinyFish backend: setup and contract

## Configure and run

Install with `npm ci`. Copy `.env.example` to `.env` if it does not exist, add `TINYFISH_API_KEY`, and run `npm run dev:api`. In a second terminal run `npm run dev`, then open http://127.0.0.1:5173. Restart the API after editing `.env`. A key is deliberately not included in this repository. No `VITE_*` secret is used.

For a built app, run `npm run build` followed by `npm start`; Node serves the frontend, byte-range video, and API on port 3001. `PORT`, `HOST`, `PUBLIC_ORIGIN`, `DATA_DIR` and `TINYFISH_RUNS_PER_HOUR` are configurable. The Vite development proxy targets port 3001; update `vite.config.ts` if changing that port during development.

TinyFish Fetch and Search have account-dependent allowances; Agent uses wallet credits. Check the current dashboard rather than assuming the original project brief's free-tier limits. One uncached scan starts one Agent run, with or without the optional deeper apply-flow inspection. No other LLM provider or key is required.

## Provider contract

Implemented against the official references:

- [Fetch](https://docs.tinyfish.ai/fetch-api/reference): `POST https://api.fetch.tinyfish.ai`, `{urls, format:"markdown", links:true, ttl:0, per_url_timeout_ms:45000}`. Both HTTP failures and per-URL failures in a successful HTTP response are handled.
- [Search](https://docs.tinyfish.ai/search-api/reference): `GET https://api.search.tinyfish.ai?query=...&location=IN&language=en`. Results are candidate URLs only; snippets do not become scoring evidence.
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

The optional `probe` flag is chosen by the scanner checkbox. It permits public Apply-link navigation, but the agent is instructed not to enter data, submit, log in, pay, consent to agreements, message anyone or bypass a CAPTCHA. This is a provider goal constraint, not a locally enforced browser action policy. The agent runs in TinyFish infrastructure; external navigation and redirect isolation depend on the provider. Only independently refetchable quotes become scoring evidence. Screenshots and recordings are not exposed in this version.

## Evidence and scoring

`src/lib/api-schema.ts` validates completed API payloads before rendering or loading saved live reports. `server/extraction.ts` validates agent output. `server/scoring.ts` assigns fixed weights; the agent cannot supply its own numerical scores.

A result requires a specific readable job and a title excerpt that matches the fetched posting. Supporting evidence URLs are validated and fetched independently (maximum four supporting pages). Each observation's quote must be present in fetched text after whitespace/Markdown normalization. Unvisited URLs, invented quotes and unsupported observations are excluded with a limitation. Semantic classification is still model-assisted and can be wrong; matching a quotation verifies the text, not the interpretation.

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

The local API binds to loopback by default. It limits analysis starts to five per minute per socket IP, two concurrent runs, 200 in-memory tasks and 1,000 browser sessions. Provider budgets are 25 Fetch calls/minute, five Search calls/minute, and 20 Agent runs/hour by default. Account limits may be lower. Responses are bounded, JSON request bodies are capped, unsafe schemes/credentials/custom ports/private and reserved DNS addresses are rejected. Fetch's redirect protection is provider-enforced; returned final URLs are also checked.

Same-origin/session checks are not user authentication. Before exposing the service publicly, add account authentication and per-user spending quotas. Rate limits, sessions and tasks currently live in one process. For multi-instance Cloud Run use a durable queue/worker, shared rate limiting, a shared database/object store, and Secret Manager. The included Node container is ready for single-instance testing, not a claim of a fully scalable production deployment. Mounted DATA_DIR must be writable by the container's node user.

## Verification

`npm test` includes the existing frontend helper tests and backend tests for URL/DNS rejection, independent scoring, rule deduplication, invented quotes, absent sources, fee-disclaimer false positives, closed/old listings, blocked pages, provider errors, redirect validation, the full API/pipeline with a simulated TinyFish transport, cache persistence, session-scoped reads, missing keys and foreign origins. These tests do not contact TinyFish or consume credits.

`npm run build` checks frontend and server TypeScript. Browser QA confirmed the real frontend POST reaches the API and shows the key-configuration error while both scores remain unassessed.

An authenticated browser smoke test on 2026-10-15 submitted Deliveroo's Staff Software Engineer listing (`https://job-boards.greenhouse.io/deliveroo/jobs/8202442`) with public apply-flow inspection enabled. Fetch read the posting, but TinyFish Agent run `0ba3b6ff-40e7-4e7b-b001-0d90444ab3a1` failed with `AGENT_FAILURE` and a usage-policy rejection before any browser steps (0 steps). No live report or scores were produced. This is not a successful end-to-end scoring verification; that remains pending provider resolution. Terminal policy/billing failures now have specific sanitized messages and regression coverage. Policy rejections are not automatically retried.
