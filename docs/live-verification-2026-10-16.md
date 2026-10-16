# Live verification — 16 October 2026

Both server-side keys were configured. Tests used the actual local API, real provider requests, independent fresh quote checks and cached-report checks. Reports were then opened in the frontend and evidence expanded. No fixture data was used for these results.

| Source / listing | Result | Ghost / Scam | Quotes independently checked |
| --- | --- | --- | --- |
| Naukri, Unifybrains Infotech Fresher, `200520500046` | Passed, TinyFish Browser | 0 / 0 | 2 |
| LinkedIn, Nasuni Software Engineer, `4478701453` | Passed, TinyFish Fetch | 0 / 0 | 2 |
| Workday, Senior Director Context and Semantics Engineering, `JR-0109923` | Passed, TinyFish Fetch; exact-ID search recovered the `/job/` URL | 0 / 0 | 3 |
| Greenhouse, Deliveroo Staff Software Engineer, `8202442` | Passed, TinyFish Fetch | 0 / 0 | 4 |
| Older LinkedIn link, `4479816430` | Unreadable on this run | No report | — |
| Indeed US, `8e4910cd87f05566` | HTTP 400 on initial scan; a diagnostic request returned a crawler `rate_limit` error inside HTTP 200 | No report | — |
| Indeed India, `34797a0025b9529d` | Bright Data snapshot `sd_mvb4cfiuk86595i06` exceeded the scan time limit and remained running on follow-up | No report | — |
| Indeed US, `c5dc4011bcc76ffd` | Bright Data snapshot `sd_mvb4id4ogk3wf2k4v` exceeded the scan time limit | No report | — |

The successful scores indicate no weighted signals in the retrieved text, with low confidence. They do not establish safety or current hiring intent. All four successful reports were checked in the app with TinyFish attribution and source evidence; the UI correctly disclosed cache use.

**Indeed remains unverified.** A configured key and passing fixture tests are not evidence of a successful Indeed scan. No complete Bright Data Indeed record was received during this test run, so its score/evidence UI could not be verified with real data. Existing pending snapshots should be checked in Bright Data before resubmitting jobs. There was no login, CAPTCHA completion or application submission.

The integration now recognizes HTTP-200 scraper `rate_limit` records and surfaces a clear source-limit message without forwarding raw provider errors. The development server excludes `.qa` and `.data` from its watcher so test artifacts and cache writes do not trigger page reloads. Tests: 39 passed; production build passed with the existing bundle-size warning.

Local detailed outputs (ignored by Git):

- `.qa/live-smoke-2026-10-16T15-23-55-366Z.json` — Indeed failures
- `.qa/live-smoke-2026-10-16T15-25-39-658Z.json` — original LinkedIn, Workday and Naukri
- `.qa/live-smoke-2026-10-16T15-27-29-511Z.json` — Nasuni and Deliveroo
- `.qa/bright-latest-response.json` — sanitized crawler error response
- `.qa/workday-bright-regression.png`, `.qa/linkedin-bright-regression.png`, `.qa/naukri-bright-regression.png` — UI evidence captures
