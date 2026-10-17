# Submission readiness — 17 October 2026

## Decision

Submit the working TinyFish-backed public-listing scanner. Treat Indeed as an experimental fallback with an explicit unavailable state, not a demonstrated working integration. Do not promise universal job-board coverage or verified hiring intent. No mock data was substituted for a failed live check.

## Today's real Indeed attempt

- Selected URL: https://in.indeed.com/viewjob?jk=34797a0025b9529d
- The saved cooldown had expired. That job's previous snapshot was already terminal-failed, so there was no active snapshot for this job to reuse. Exactly one fresh Bright Data collection was submitted. The browser joined the same in-flight API task.
- New snapshot: `sd_mvby9ucd2p530134f5`. Subsequent checks used GETs for this snapshot, never another collection POST.
- Bright Data reported snapshot progress `ready`, but the downloaded JSON contained only an error, not a job description:

  ```text
  timestamp: 2026-10-17T05:24:49.719Z
  error_code: rate_limit
  Crawler error: Navigation failed for https://in.indeed.com/viewjob?jk=34797a0025b9529d: too many requests
  ```

- The app displayed the unreadable/cooldown message; both scores stayed unchecked. There is still no real successful Indeed report to demonstrate.
- Cooldown ends **17 October 2026, 11:24:57 IST / 05:54:57 UTC**. This is the earliest local retry time, not a promise that Indeed will become accessible then. Overnight waiting did not fix the upstream limitation.
- The separate US snapshot `sd_mvb4id4ogk3wf2k4v` was not resubmitted. Its local entry still says pending, but its prior downloaded result (16 October) was also a terminal `rate_limit` record. That historical download is stronger evidence than the stale local label.
- Two initial smoke-test invocations could not reach localhost because of sandbox permissions; they never reached the backend and did not submit provider collections. The real attempt ran successfully outside that restriction and reached the providers.

Local evidence (ignored by Git): `.qa/live-smoke-2026-10-17T05-22-06-582Z.json`, `.qa/bright-sd_mvby9ucd2p530134f5.json`, `.qa/indeed-retry-2026-10-17.png`.

## Verified coverage, not a universal domain guarantee

| URL/source | Latest actual verification | Outcome |
| --- | --- | --- |
| Naukri selected `/job-listings-...-200520500046` (user's Unifybrains link) | 16 October | TinyFish Browser succeeded: Ghost 0, Scam 0; 2 source quotes checked |
| LinkedIn selected `/jobs/view/4478701453/` (Nasuni) | 16 October | TinyFish Fetch succeeded: 0 / 0; 2 quotes checked |
| LinkedIn user's search link with `currentJobId=4479816430` | 16 October | Correctly normalized to the selected job; that listing was unreadable on the latest check. Earlier success does not guarantee continued availability |
| Workday user's `/details/..._JR-0109923` link | 16 October | Exact-ID recovery to `/job/..._JR-0109923`; TinyFish Fetch succeeded: 0 / 0; 3 quotes checked |
| Greenhouse Deliveroo `/deliveroo/jobs/8202442` | 16 October, including during Indeed cooldown | TinyFish Fetch succeeded: 0 / 0; 4 quotes checked |
| Greenhouse Isar `/isaraerospace/jobs/4587242101` | **17 October, 10:54 IST** | Fresh TinyFish Fetch succeeded: **20 / 0**; 4 independently refetched quotes checked, cache checked, report and evidence expanded in app |
| Indeed India `34797a0025b9529d` | **17 October** | TinyFish unreadable; Bright Data crawler rate-limited; no report |
| Indeed US `c5dc4011bcc76ffd`, `8e4910cd87f05566` | 16 October | No complete description returned; no report |
| Other ATS providers such as Lever/Ashby, other employers and boards | Not established by these tests | Generic public-page handling exists; do not advertise them as live-verified |

The Isar score is based on explicit text saying recruitment is not currently active and applications are for a talent pool. This can be legitimate. It is evidence of limited current hiring intent, not proof of a deceptive ghost job. The fresh record is `.qa/live-smoke-2026-10-17T05-24-07-053Z.json`; app capture is `.qa/ats-live-2026-10-17.png`.

**Working input category:** a specific public job page with a readable description and stable identity. A direct employer page is not mandatory: the Naukri and LinkedIn successes demonstrate third-party-board support.

**Selection links:** LinkedIn search URLs work as input when `currentJobId` selects a job; Indeed `jk`/`vjk` selects a job. Tracking parameters are removed. A generic search/index page with no selected job is not one scorable listing.

**Unsupported/unreliable input category:** login-only pages, account dashboards, CAPTCHA/challenge pages, inaccessible/removed descriptions, and redirects to unrelated jobs. A user seeing a page in a logged-in personal browser does not establish that an anonymous cloud browser can read it.

**The boundary is both URL type and access behavior.** Domain-specific normalization helps identify a role; it cannot remove site restrictions. A public URL is necessary for the current anonymous workflow but is not sufficient. Conversely, one failed LinkedIn listing does not establish that all LinkedIn is unsupported. Workday/Greenhouse successes do not establish universal ATS coverage.

## Provider capabilities versus our implementation

### TinyFish

Our working route uses Fetch, read-only cloud Browser extraction where configured, and exact-ID Search recovery. It does not currently use the Web Agent for live scoring or traverse the application process. A prior Agent policy rejection is a separate condition from a site blocking anonymous retrieval; policy, authentication and billing failures are surfaced rather than hidden behind another provider.

TinyFish documents per-URL `bot_blocked`, `login_required`, `timeout` and other errors, which may appear inside HTTP 200. Credentials, account quotas, rate limits and service availability also affect access. Search snippets alone cannot prove the full job description or hiring intent. See [Fetch reference](https://docs.tinyfish.ai/fetch-api/reference) and [error codes](https://docs.tinyfish.ai/error-codes).

TinyFish does support authorized logged-in workflows through [Browser Context Profiles](https://docs.tinyfish.ai/key-concepts/browser-context-profiles). This app has not integrated them. Sessions can expire, require MFA and encounter CAPTCHAs; profiles are not a universal access guarantee. No login or CAPTCHA flow was forced in these tests.

Application budgets are currently 5 searches/minute, 25 fetches/minute and 20 browser sessions/hour/process. These are local protections, not claims about the user's current provider entitlement; dashboard allowance and provider responses remain authoritative.

### Bright Data

Our adapter uses the dedicated Indeed scraper only. Bright Data offers other products and datasets, but they are not implemented here. Naukri, LinkedIn and ATS scans still use TinyFish.

A synchronous request can return HTTP 202 and a snapshot ID, which must be polled/downloaded. The app implements this supported lifecycle. Snapshot `ready` means the collection finished; the actual records still need validation. Today's finished snapshot contained an upstream navigation/rate-limit failure. This does not identify whether Indeed's internal limit was based on IP, geography or another rule, and it does not show an API-key authentication failure. See [supported request lifecycle](https://docs.brightdata.com/api-reference/scrapers/synchronous-requests).

The documented free tier is a shared 5,000 monthly credits for eligible new accounts, not unlimited access or a guarantee of target-site readability. Account balance and eligibility were not audited today. See [free-tier documentation](https://docs.brightdata.com/general/account/billing-and-pricing/free-tier).

## What is already fixed and what is still missing

Implemented: URL normalization, exact-job checks, quote grounding, one-hour caches, pending-snapshot persistence, same-job deduplication, durable submission claims, at least 30-minute Indeed rate-limit cooldown, and honest no-score errors. These prevent duplicate work; they do not unblock Indeed. Cooldown survives backend restart. The wording now says “No duplicate collection was started,” which is accurate for both a first failed attempt and a blocked repeat.

All **47 regression tests passed** after the wording adjustment. A real Isar scan and app rendering passed; a real Indeed scan failed as described. Passing regression tests does not change the Indeed conclusion. No retrieval/scoring behavior was changed this turn.

Scores are local, English rule-based signal indices, not probabilities supplied by either API. A 0 means no weighted signals were observed in retrieved text, not verified safety. Employer identity, fees requested later in an application flow, paraphrased/non-English/image-only signals and true hiring intent can be missed. Longitudinal snapshots exist, but broad repost-history validation and a labelled precision/recall evaluation are not complete.

## Priority plan for the 18 October submission

1. **Use the verified TinyFish flow as the live demo.** Lead with the Isar talent-pool example (nonzero score plus source quote); include a successful Naukri or LinkedIn check and a Workday/Greenhouse check. Availability can change, so retain genuine timestamped captures as clearly labelled prior results, never as a fake live response. Fetch/Browser/Search usage already demonstrates the requested provider integration.
2. **Keep Indeed explicitly experimental.** Do not spend the remaining submission time repeatedly retrying it or switching APIs on an unsupported promise. Open a Bright Data support ticket with the URL, dataset `gd_l4dx9j9sscpvs7no2`, snapshot `sd_mvby9ucd2p530134f5`, timestamp and exact error above. This is the concrete route for investigating their managed Indeed crawler. No support message was sent on the user's behalf.
3. **Best small resilience feature, if another implementation slot is available:** allow pasted job-description text after a blocked fetch, labelled “user-provided text; source not verified.” Reuse the evidence/scoring engine and quote the supplied text. This preserves useful analysis without requiring users to find an employer URL. It cannot claim live retrieval or prove listing authenticity and is **not implemented yet**.
4. **Next automatic improvement:** discover a public employer/ATS counterpart, then require strong identity evidence (employer and requisition ID where available, plus title/location) before using it. Show both submitted and resolved URLs. If a blocked board exposes no reliable identifying details, request those details or stop; never substitute a similar job or score search snippets. This is **not implemented yet** and cannot guarantee a match for every listing.
5. **Later reliability work:** consented provider-supported sessions or authorized job feeds; shared transactional state before multi-instance Cloud Run deployment. Current file-based duplicate protection covers processes sharing the same data directory, not independent machines. None of these options promises unrestricted, free access to every board.

There is no honest client-side code change that guarantees immediate readable Indeed data from a provider currently returning only crawler errors. The current submission can accurately demonstrate a working evidence-based public-listing scanner with tested exclusions.
