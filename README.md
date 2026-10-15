# GhostJob Shield — The Haunted Job Board

An interactive React experience built around the supplied `Frontend video.mp4`. Scroll forward or backward through the actual film, click its floating listings and cube, and use the scanner and risk dials in the final scene.

## Run locally

Requires Node.js 22.12+.

```sh
npm ci
npm run dev
```

For a production build:

```sh
npm test
npm run build
npm run preview
```

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
- Local URL validation and normalization, inline errors, loading feedback, and sample reports.
- A browser-local watchlist with persistence, removal, storage-error handling, and cross-tab synchronization.
- Native modal dialogs with Escape dismissal, focus return, and scrollable contents.
- Local fonts and media, Tailwind color tokens, Lucide icons, and no analytics.

## Demo scope

**Live analysis is not connected.** Entered links are validated locally and displayed as **not fetched**. They do not determine sample scores and are not stored. The app clearly labels fictional results at the point of use.

The watchlist stores sample metadata under `ghostjob-shield:watchlist:v1`; it does not monitor postings or send alerts. TinyFish searches, apply-flow probes, captured evidence, a public employer index, and the extension are future backend integrations. The sample fixtures are not a labelled research dataset. See `docs/backend-contract.md` for the API and cache-first architecture handoff.

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

## Optional static Cloud Run container

```sh
docker build -t ghostjob-shield .
docker run --rm -p 8080:8080 ghostjob-shield
```

The container serves the frontend with nginx on port 8080, including MP4 byte ranges. It is a deployment scaffold, not a deployed service or live analysis backend.
