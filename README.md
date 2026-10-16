# GhostJob Shield — The Haunted Job Board

An interactive React experience built around the supplied `Frontend video.mp4`. Scroll forward or backward through the actual film, click its floating listings and cube, and use the scanner and risk dials in the final scene.

## Run locally

Requires Node.js 22.12+ (Node 24 recommended). The frontend and API run in separate terminals during development.

```sh
npm ci
Copy-Item .env.example .env        # skip if .env already exists
```

Edit `.env` and set `TINYFISH_API_KEY` to your TinyFish key. If you already have a `.env`, edit it instead of copying over it.

For the optional Indeed fallback, also add `BRIGHT_DATA_API_KEY=your_key`. TinyFish remains the first provider for every scan. Bright Data's dedicated Indeed scraper is used only when TinyFish cannot retrieve the selected Indeed description; it is never used for Naukri, LinkedIn or ATS links. See [Bright Data setup](docs/bright-data-setup.md) for the free-tier signup, API-key steps and live test command. Restart the API after changing `.env`.

> [!CAUTION]
> **Never commit your `.env` file or any real API keys to Git.**
> The `.gitignore` already excludes `.env` and all `.env.*` variants (except `.env.example`). The key is read server-side only — never use a `VITE_` prefix, which would expose it to the browser bundle. If you suspect a key was committed by mistake, rotate it immediately on the TinyFish dashboard.

```sh
# Terminal 1: API, port 3001
npm run dev:api
# Terminal 2: frontend, port 5173
npm run dev
```

Open http://127.0.0.1:5173, choose **Skip to scanner**, and paste a public job URL from Naukri, LinkedIn, Indeed or an employer/ATS. Restart the API after changing the key. With no key, the app returns an explicit setup message instead of sample scores. Scans use **TinyFish Fetch**, with **TinyFish Browser** rendering for unreadable Naukri/Indeed pages and **TinyFish Search** for exact-ID recovery. No Agent run is required. Application steps and employer identity are not independently verified. Some sites still deny access; support for their URL format does not guarantee every listing is readable.

For a production build:

```sh
npm test
npm run build
npm start
```

`npm start` serves both the built frontend and API at http://127.0.0.1:3001. `npm run preview` is also available at port 4173 when the API is running separately.

## The film is the interface

- The original 1280×720, 24 fps, 10-second composition remains visible at full brightness. There is no dark overlay, blur, or cover crop. Other aspect ratios preserve the complete 16:9 image.
- Lenis and GSAP ScrollTrigger connect page progress to video frames in both directions. Chapter buttons, replay, a keyboard-operable range control, and a skip-to-scanner button provide alternatives to scrolling.
- The MP4 is encoded with every frame as a keyframe to make seeking responsive. Seek requests coalesce through requestAnimationFrame; controls follow the decoded frame time rather than getting ahead of the video.
- An HTML5 video decodes frames, which are drawn without visual effects onto a canvas. This avoids the blank video-compositor behavior observed in the embedded browser. The canvas is decorative; actual controls are semantic React buttons, inputs, forms, and dialogs.
- Nineteen listing hotspots follow measured coordinates from the source video. Visible cards open active, ghost, or scam sample reports. Cards outside the film leave the keyboard tab order.
- The rotating cube opens an explanation of the inspection process. The final two dials open their respective evidence. The source's input and scan button have aligned native DOM controls.
- On portrait screens, larger input and score controls appear beneath the complete film. This preserves the composition while keeping the actions usable on small screens.
- Reduced-motion mode presents three still scenes. It respects the OS preference and can also be enabled in the bottom toolbar. Dialogs pause smooth scrolling and media seeking.

The source contains rendered words and interface artwork. Those pixels are preserved to match the supplied reference; accessible names, editable values, focus indicators, numeric scores, and reports are live DOM content. Replacing the source film requires regenerating its coordinate tracks.

## Working frontend features

- Three fictional scenarios with independent ghost and scam indices, animated score dials, and expandable signal timelines.
- Live TinyFish checks with progress, independently scored categories, source excerpts, timestamps, coverage, and failure states.
- A browser-local watchlist with persistence, removal, storage-error handling, and cross-tab synchronization.
- Native modal dialogs with Escape dismissal, focus return, and scrollable contents.
- Local fonts and media, Tailwind color tokens, Lucide icons, and no analytics.

## Live analysis and sample scope

Pasted URLs go to the local API and TinyFish. LinkedIn `currentJobId` links resolve to the selected role, Indeed `jk`/`vjk` links retain their job ID, Naukri tracking parameters are removed, and Workday `job/` and `details/` links are recognized. A search page without a selected job returns a specific instruction to select a role on that board; users do not have to find the employer careers page.

The server identifies a specific job description, extracts exact excerpts using conservative English text rules, and checks every quoted observation against the retrieved text before assigning independent risk points. Related-job sections are excluded. Reports display the submitted and resolved URLs, job ID, retrieval method, check time, weights and coverage limits. Search results are leads only; snippets and different job IDs never become evidence. Failed or unreadable pages never fall back to fixtures or receive zero-risk reports. The earlier Agent inspection was declined by TinyFish's content policy; the active feature is a narrower page-text check using supported Fetch, Search and Browser APIs. No Agent request is retried or disguised. Cloud browsers only read public content and are terminated after extraction; no sign-in, CAPTCHA or application form is completed.

Reports are cached for one hour in `.data`; one snapshot hash per URL per UTC day starts a real history. No synthetic repost history is used for live checks. A first scan cannot establish reposting. Scores are uncalibrated signal indices, not measured probabilities or proof of intent/fraud. Missing coverage is disclosed, and a closed listing is not automatically penalized as a ghost.

The floating cards still open explicitly fictional examples. The local watchlist saves complete live reports or demo metadata under `ghostjob-shield:watchlist:v1`. It does not monitor postings or send alerts. Screenshots, an employer index, the extension, and a calibrated research dataset remain outside this implementation. See [backend setup and contract](docs/backend-contract.md) for provider APIs, scoring rules, operational limits, and deployment details.

## Source map

```text
src/
  App.tsx                          Reports, sample selection, dialogs, watchlist
  components/
    CinematicExperience.tsx         Scene controls, tracked hotspots, native forms
    VideoBackground.tsx            Frame decoder, canvas presenter, seek scheduling
    SmoothScroll.tsx               Lenis / GSAP integration and modal pause
    RiskDial.tsx                   Animated, accessible SVG report dial
    SignalTimeline.tsx             Expandable evidence
    Modal.tsx                      Native dialog and focus management
  data/
    videoTracking.json             Measured film coordinates
    mockAnalysis.ts                Three explicitly fictional reports
  lib/
    cinema.ts                      Frame mapping, interpolation, hotspot bounds
    cinema.test.ts                 Film and tracking tests
    analysis.ts                    URL validation, score helpers, persistence
    analysis.test.ts               Analysis behavior tests
  types/analysis.ts                JobAnalysisProps and backend-facing types
  cinema.css                       Film composition and responsive controls
  styles.css                       Shared report, dial, and dialog styles
scripts/
  prepare-video.mjs                All-keyframe H.264 encoding
  track-video.py                   OpenCV coordinate tracking
public/media/
  haunted-job-board-scrub.mp4       Optimized film used by the app
  haunted-poster.jpg               First-frame loading image
  haunted-final.jpg                Usable scanner fallback if media fails
```

The original `Frontend video.mp4` is preserved. Run `npm run prepare:video` to regenerate the approximately 8.8 MB scrubbing copy. Regenerate tracking with `python scripts/track-video.py` (requires OpenCV and NumPy); inspect the coordinates visually if the film changes. Tracking JSON is committed output, so Python is not needed to run or build the app.

`lenis` is the maintained package used for smooth scrolling. Tailwind 4 loads the project's color configuration with `@config` and the Vite plugin.

## Verification

- Unit tests cover URL normalization, independent score totals, watchlist handling, bidirectional frame mapping, still scenes, tracking interpolation, and offscreen hotspot exclusion.
- `npm run build` validates TypeScript and creates optimized assets.
- Browser QA checked actual film rendering, card reports, the cube explanation, scanner focus, empty-input validation, valid URL submission, evidence expansion, Escape dismissal, and watchlist persistence/removal.
- Responsive QA checked 390×844 portrait rendering, the larger native scanner, report layout, and horizontal overflow. Keyboard timeline rewind and still-scene selection were exercised. Browser console checks were clean.
- Physical iOS/Safari testing, slower-device performance, and network/media failure simulation remain release checks.
- Backend integration tests use simulated provider responses to verify the API, source validation, scores, cache, and errors. Authenticated browser scans on 2026-10-15 returned Deliveroo Staff Software Engineer (Ghost 0, Scam 0) and Isar Aerospace Controls & Automation Engineer (Ghost 20, Scam 0). The latter explicitly describes a talent pool rather than active recruitment. These are signal indices, not probabilities or accusations.
- With the API running, `npm run test:live` repeats real API checks and independently retrieves each source through TinyFish Fetch or Browser to verify every quote, score total and cache response. It requires `.env` and uses provider allowance. Optional positional arguments supply other public job URLs. Results, including failures, are written incrementally to dated `.qa/live-smoke-*.json` files and finally `.qa/live-smoke-results.json`. Initial reports may be cached; quote verification always requests fresh source content. See the [16 October real-listing verification matrix](docs/live-verification.md) for board coverage and access limitations.

## Optional Node container

```sh
docker build -t ghostjob-shield .
docker run --rm -p 8080:8080 --env-file .env -e HOST=0.0.0.0 -e PORT=8080 -e PUBLIC_ORIGIN=http://localhost:8080 ghostjob-shield
```

The container serves the frontend and API with Node on port 8080, including MP4 byte ranges. Credentials are injected at runtime, not copied into the image. Cloud Run needs a persistent cache/database and durable worker queue before scaling beyond one instance; current in-memory jobs and limits are process-local. No service has been deployed.
