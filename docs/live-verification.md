# Live integration verification — 16 October 2026

Real TinyFish requests used the configured server-side key. No fixture data was substituted. API checks create a session, submit the URL, poll completion, validate the report schema, verify score totals and cache reuse, and request fresh provider content to compare evidence excerpts. Browser checks paste the supplied URL into the app and expand its evidence.

| Listing | Ghost / Scam | Report evidence | Verification |
| --- | --- | --- | --- |
| User Naukri `200520500046`, Fresher, Unifybrains Infotech | 0 / 0 | Role title and iPhone/iPad application experience | Real Browser report displayed in app; both quotes and cache reuse independently verified. An earlier recheck was temporarily unreadable, so access remains intermittent. |
| User LinkedIn `4479816430`, Machine Learning Intern, Dexter's Tech | 0 / 0 | Role title and machine-learning development duties | Exact supplied search-results URL resolved; both quotes independently verified; app evidence expanded. |
| User Workday `JR-0109923`, Senior Director, Context and Semantics Engineering (AI) | 0 / 0 | Role title, role details and no-payment notice | Exact supplied details URL resolved; all three quotes independently verified; app evidence expanded. |
| Additional LinkedIn `4478701453`, Software Engineer, Nasuni | 0 / 0 | Role title and description | Live API completion, two independently verified quotes and cache checks passed. |
| Greenhouse Deliveroo `8202442`, Staff Software Engineer | 0 / 0 | Four context observations | Live API completion, all quotes and cache checks passed. |
| Greenhouse Isar Aerospace `4587242101`, Controls & Automation Engineer | 20 / 0 | Four observations, including explicit talent-pool wording (+20 ghost) | Live API completion, all quotes and cache checks passed. |
| Indeed Capgemini `01e26c3f29de67ae` | Unassessed | No readable individual description | Full app attempt tried Fetch, Browser rendering and exact-ID Search; displayed an actionable failure and cleared previous scores. |
| Indeed Sardine `34797a0025b9529d` | Unassessed | No readable individual description | Fetch and Browser attempt unsuccessful. |
| Indeed Concentric AI `183731e015d806d3` | Unassessed | No readable individual description | Fetch attempt unsuccessful. |

Zero is a signal index indicating no weighted indicators observed in the retrieved text. It is not a probability, verification of active hiring, or guarantee of safety. Confidence is low, and application steps were not inspected. The no-payment disclaimer is context only and does not add scam points. The genuine talent-pool example checks that nonzero scores arise from real evidence.

The original Agent policy rejection is separate from these page-access and parser failures. The implementation uses the documented Fetch, Search and Browser interfaces, never retries that Agent task, and does not sign in, complete CAPTCHAs, or submit application forms. Indeed URL handling is implemented, but a successful Indeed report was **not** established in these tests. Naukri and LinkedIn access also varied between requests; cached reports show their original check time.

`npm test`: 33 passed. `npm run build`: passed, with a non-blocking frontend chunk-size warning. Local API and frontend were restarted for final verification. Local artifacts in ignored `.qa/` include dated live-test JSON and app screenshots; no API credentials are recorded there. `npm run test:live -- "<URL>"` can repeat verification and consumes provider allowance. It records failures as well as successes and exits nonzero on any verification failure.
