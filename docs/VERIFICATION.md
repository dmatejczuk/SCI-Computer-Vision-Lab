# Plate reader (part 1) - 2026-11-12

New workshop part on branch `feature/plate-reader`: part selection after the camera hub, the
node editor with OpenCV.js in a Web Worker, character recognition by template matching, the
reader screen, three levels with hints, facilitator diagnostics and "Pokaż kod". See
[PLATES.md](PLATES.md).

- `npm run check`: TypeScript, ESLint, 101 unit tests in 19 files (41 new plate reader tests:
  graph engine, OpenCV operations and `cv.Mat` release, recognition on generated plate photos,
  levels, session) and the production build passed.
- Playwright, full suite: 25/25 passed, including the 19 existing scenarios (gestures, game,
  laboratory, phone WebRTC) and 6 new ones: performance page, unmirrored camera and frame
  freezing, editor (insert, refused connection bubble, undo/redo, delete, preview), hub → part 1
  → level 1 → reader → New group, facilitator panel, and a camera reading a generated plate video
  (`--use-file-for-fake-video-capture`).
- CSP: `vite preview` serves the Caddy policy (`script-src 'self' 'wasm-unsafe-eval'`); OpenCV.js
  loads and runs under it thanks to the build-time embind patch (no `'unsafe-eval'`).

Indicative performance (Chromium headless, fake camera 640×480, production build; developer
laptop with AMD Ryzen AI 9 HX 370, so school computers will be slower):

| Measurement | 640 px | 320 px |
| --- | --- | --- |
| Phase-0 page: camera → worker → 8 operations + 8 thumbnails, fps | 64 | 97 |
| Frame time mean / p95 | 15.6 / 19.4 ms | 10.3 / 14.1 ms |
| Unreleased `cv.Mat` | 0 | 0 |

OpenCV.js loads in about 0.5 s from the local server (10.3 MB, 3.5 MB with gzip). Level 3
reference graph (8 processing blocks, live camera): 13–14 passes/s at the 15 Hz cap, 8–9 ms per
pass, reading 7/7 characters; over 2 minutes `cv.Mat` stayed 0 and OpenCV memory stayed at
128 MB. The largest main-thread gap during the benchmark was 230–280 ms (headless browser,
includes start-up); check editor smoothness on the real computers.

Not yet verified: the room computers (phase-0 measurement on site), the real tile font and 3D
tiles in room light (≥ 95 % target), a 10-minute soak on site, and level 1 with 2–3 students.

# Phone viewfinder controls and disconnection screen - 2026-11-11

While streaming, the phone page shows a plain full-screen viewfinder instead of the step page with
the crop square and hand hint. A toolbar (bottom in portrait, right edge in landscape, with
safe-area insets) offers camera switch, left-right flip, upside-down flip, fullscreen and stop.
Flips redraw camera frames into a canvas whose `captureStream` track replaces the sent track via
`replaceTrack` (no renegotiation); with no flip the camera track is sent directly. The preview
applies the same flips in CSS, so the computer receives exactly what the phone shows. A 90°
rotation was tried and dropped after a phone test: an unrotated preview with a rotated output was
confusing, and browsers already rotate camera frames with the device. The setting is stored per
phone in `localStorage`. After approval the phone starts the camera by itself (once per pairing;
**Uruchom aparat** stays as a fallback), so fullscreen is entered with the **Pełny ekran** button,
since browsers require a tap for it. No notice covers the viewfinder while streaming, and a Wake
Lock keeps the screen on while live. Pairing notices no longer prefix the computer's name ("Komputer
Windows: ..."); the phone's name is still shown in the approval request.

On the computer, a paired phone without fresh frames now opens a full-screen **Rozłączono
urządzenie** overlay with a spinner (while the pairing can resume), **Połącz nowe urządzenie** and
**Użyj kamery komputera**; it closes by itself when frames return. The same overlay (`CameraLost`)
handles every lost camera image, phone or local camera (**Rozłączono kamerę** with **Spróbuj
ponownie** and **Użyj telefonu**), in all stages including camera setup and the laboratory, and
replaces the inline "Utracono połączenie z kamerą" error; collect actions stay hidden while it is
shown. The overlay uses a solid tint:
a `backdrop-filter` blur over live video delayed the page by about 10 s in the software-rendered
test browser and would burden weak classroom PCs. The QR panel's manual address now uses the
server's public origin (the one encoded in the QR) instead of the desktop page URL.

- TypeScript, ESLint and Prettier passed. Unit tests (`tests/PhoneView.test.ts`) cover the flip
  preview transforms and storage fallbacks; all 60 unit tests passed.
- Playwright: the viewfinder scenario checks the toolbar at 390×844 and 844×390 without horizontal
  scroll, auto fullscreen toggling, and that each flip moves the fake camera's timestamp in the
  frames received by the computer (bottom-left for upside down, top-right for left-right).
  Pairing scenarios check the disconnection overlay, its auto-close on recovery and re-pairing from
  it, plus the manual address; the local camera-loss scenario now recovers through the overlay.
  Full suite: 19/19 passed. Under parallel load single unrelated scenarios (`snapshot pipeline`,
  `complete real ML workshop`) each failed once in earlier runs and passed on rerun.

A first physical phone test led to the flip-only design and the QR address fix. The browser's own
fullscreen notice briefly covers the toolbar; this is accepted. Not yet verified on hardware: the
flip controls, the disconnection overlay, iPhone Safari layout and canvas capture performance on
older devices.

# Workshop view with a paired phone - 2026-11-11

After pairing, the workshop view no longer shows the phone pairing banner or the
**Kamera komputera** / **Telefon** source switch. Re-pairing remains available through the error
retry and the instructor panel; the camera setup screen is unchanged. Playwright scenarios were
updated accordingly. TypeScript, ESLint and Prettier passed; the Docker network deployment was rebuilt.
Playwright was not re-run.

# Phone connection resilience - 2026-11-11

Fixed review findings in the phone pairing path. The desktop now releases the previous peer
connection and stats timer on `reconnecting`/re-approval, so an orphaned peer can no longer exhaust
the restart budget and end a resumed session. `disconnected` gets a 4-second grace period before an
ICE restart, and the per-peer recovery budget resets after each successful connection. The server
limits restarts to two per 60 seconds instead of two per room, drops late answers/ICE candidates
from superseded negotiations instead of ending the room, and lets a valid resume token replace a
socket that still looks open after a network change. Capture failures now report a dedicated
`capture` error; `start()`/`train()` no longer change the stage while another operation runs.
The coturn example refuses loopback, `0.0.0.0/8` and link-local peers. `start-lan.ps1` prefers
adapters with a default route (skipping host-only adapters such as VirtualBox) and documentation
uses `<SERVER_IP>` placeholders instead of concrete addresses.

- TypeScript and ESLint passed. New/updated signaling tests (restart window, stale negotiation,
  half-open resume takeover) and a peer recovery test (disconnect grace, per-incident budget)
  passed under Node's test runner before the Docker build.
- Docker network images rebuilt via scripts/start-lan.ps1; `npm run check` inside the build passed
  (TypeScript, ESLint, all unit tests, model integrity, production builds). Both services reached
  healthy; HTTPS `/phone`=200 and `/api/health`=200 with the exported private CA.

Not verified: Playwright browser scenarios and physical phone reconnects after these changes.

# Roles, manual pairing and recovery - 2026-11-11

Implemented role selection, editable user-agent name suggestions, six-character manual invitations,
large QR/code display, six input boxes with paste support, instructor-only transport diagnostics
and dismissible snackbars. Approved peers have a bounded authenticated reconnect window;
new-device pairing revokes the old room. Fresh frames restore capture/prediction, while games
remain paused until explicitly resumed.

- Full npm run check and Docker image build passed: TypeScript, ESLint, model integrity, production
  frontend/backend compilation and 53 unit/integration tests, including manual-code limits, approval,
  invitation replay, authenticated resume, grace expiry, replacement and suggested device names.
- The full browser run passed 16/17 scenarios; CPU fallback was interrupted by development hot
  reload and passed its focused rerun. Hub, full phone workshop and stale-frame scenarios passed
  again after the recovery changes.
- Both final recovery scenarios passed (30.1 seconds): typed code/approval, real WebSocket close
  and reconnect, video track replacement, camera-only suspension/foreground recovery, prediction
  restart, game pause preservation, and revocation when connecting a new device.
- Trusted Docker HTTPS/WSS verification passed manual-code approval and authenticated resume.
- Desktop QR setup fits at 1366x768 without scrolling. Role selection and six-box phone entry
  were visually inspected at 390x844; technical camera stats are absent from ordinary pairing UI.

Camera suspension and visibility events were simulated with real Chromium media/WebRTC. Physical
Android/iPhone screen-lock behavior, OS eviction, school Wi-Fi and WAN recovery still require
hardware checks. Browser background execution is not guaranteed. A discarded page or expired
60-second server grace period requires pairing again.

# Camera setup hub - 2026-11-11

The entry screen now pairs a left-hand live preview with camera selection on the right.
Selecting a source replaces the choices with connection controls. Phone approval replaces
the QR; changing the source returns to selection. Challenge entry requires a ready camera
and model and preserves the video track.

The full 15-scenario browser suite passed before the final compact-panel refinement.
After that refinement, all four focused hub/phone scenarios passed (29.9 seconds), including
a 1366x768 no-scroll assertion for the QR panel, returning to selection, preservation of the
video track, the complete phone workshop and connection recovery. Desktop and mobile hub
screenshots were inspected.

# Phone UI refinement - 2026-11-11

Phone pairing now presents three steps, hides the confirmation code after approval and keeps
the live preview and camera controls prominent. Desktop connection metrics are collapsed by
default. Help and privacy details remain available on demand.

TypeScript and ESLint passed. Both phone Playwright scenarios passed (30.5 seconds), covering
parsing the invitation, approval, capture, training, laboratory, gameplay, freeze recovery and
reset. The live phone layout at 390x844 and desktop gameplay at 1366x768 were visually inspected.

# Phone camera implementation - 2026-11-11

Implemented local/phone video sources, single-use pairing with explicit approval, a separate phone
entrypoint, native WebRTC, RAM-only signaling, stale-frame gating, bounded ICE recovery, source/reset
cleanup, transport diagnostics and optional authenticated TURN. The supplied analysis plan remains
unchanged as historical input; current operation is documented in PHONE_CAMERA.md.

Verified on Windows with Chromium synthetic cameras and real ML, Phaser, WebRTC and signaling:

- Full npm run check passed: TypeScript, ESLint, 48 unit/integration tests, model integrity,
  frontend production build and compiled Node backend.
- All 14 Playwright scenarios passed in 3.6 minutes, including local-camera regression, the full
  phone workshop and media freeze/re-pair/group-reset behavior.
- Real WebSocket tests isolated 30 rooms / 60 connections and verified cleanup. Unit/integration
  checks cover approval races, invitation replay, roles, TTL, stale negotiation generations,
  Origin rejection, schema/size validation, TURN credential expiry and pending-source cancellation.
- Forced relay passed the complete phone workshop against Docker coturn (27.4 seconds), with
  temporary backend-issued credentials, iceTransportPolicy=relay and a selected TURN pair.
  This proves the tested single-host path, not 30 physical Wi-Fi pairs or every NAT topology.
- Docker application and signaling images built successfully. Both network services reached healthy;
  signaling port 3001 remained internal. Local HTTP mode was also exercised.
- Trusted HTTPS and WSS approval passed at the host LAN IP. The verification script checked the
  certificate chain and IP, /phone=200, /api/health=200, missing API=404 and missing asset=404.
  No browser TLS bypass, OS certificate installation or firewall changes were performed.
- The Windows helper scripts/start-lan.ps1 -Address <SERVER_IP> completed end-to-end, exported
  the public CA certificate and left both services healthy. HTTPS/WSS checks passed using that export.
- The production /phone entry loaded four asset bundles and no TensorFlow, Phaser or workshop
  bundle; HTTP localhost reported a secure context.
- The network CSP includes its explicit same-origin wss URL; camera-only Permissions-Policy remains.
  Caddy default_sni is configured for IP clients that omit SNI behind Docker NAT.
- Phone UI (390x844) and desktop gameplay screenshots were visually inspected. A separate repeated
  phone workshop test passed after adding the screenshot checks (26.4 seconds).
- npm audit --omit=dev reported no production dependency advisories during implementation.

Not verified: physical Android/iPhone behavior, phone OS trust installation, actual camera quality,
Wi-Fi interruption/screen-lock timing on hardware, 30 real pairs over 45 minutes, WAN routing,
public ACME issuance or end-to-end video latency. Follow the physical checklist in PHONE_CAMERA.md.
The existing Caddy volume had an expired intermediate after being offline; Caddy renewed it, and
recreating the container with the current configuration produced a valid chain. The root was retained.

Earlier reports below describe previous versions, not additional tests of this feature.

# Deployment configuration update – 2026-10-06

Default startup now serves HTTP localhost on loopback TCP 80, without environment variables,
hosts edits, certificates or redirects. The standalone network Compose variant requires
`APP_HOST` and supports private (`internal`) or public (`acme`) certificate issuers.
Shared Caddy settings preserve security headers, caching and the internal health endpoint.
Playwright no longer bypasses certificate errors or remaps deployment hostnames to loopback.

Validation results:

- Full `npm run check` passes: TypeScript, ESLint, 36 unit tests, model integrity and production build.
- Docker image builds successfully, including its own full `npm run check`.
- Default Compose starts successfully and reaches `healthy`; internal `/health` returns `ok`.
- `http://localhost/` returns HTTP 200 with no `Location` header. Only `127.0.0.1:80` is published.
- CSP, camera-only Permissions Policy, `nosniff` and `no-referrer` are present.
- Chromium on HTTP localhost reports `isSecureContext: true`; `getUserMedia` opens one live
  synthetic video track with no insecure-context or certificate bypass flags.
- Network Compose with `APP_HOST=vision.example.test` and `internal` starts successfully;
  HTTPS returns 200 over TLS 1.3 with verified CA chain and hostname. HTTP redirects to the
  configured HTTPS hostname (308). No OS certificate trust or hosts entries were changed.
- Caddy validates both local and network configurations, including the `acme` issuer variant.
- Two browser scenarios pass against the HTTP Docker container (57.1 seconds): the complete
  real-ML workshop with repeated resets and the text-header/favicon scenario.
- Repository audit finds no remaining legacy hostname or em dash in tracked source/documentation.
- Public certificate issuance and access from a separate physical LAN client were not tested:
  these require a real domain/reachable server and client DNS/trust setup.
- Physical webcam permissions/hardware remain subject to the on-site checklist; browser checks
  use a synthetic camera with real application code.

Older sections are
historical application test records; their preview ports and prior HTTPS deployment do not
specify current startup behavior. See [DEPLOYMENT.md](DEPLOYMENT.md) for current instructions.

# Text header and favicon update – 2026-10-06

The header again displays the original `SCI_` text mark with its green underscore and divider.
The school link remains available. The supplied PNG is retained only for browser and Apple touch
icons. TypeScript, ESLint and the targeted browser scenario pass. The scenario verifies the text
mark, absence of header images and local icon references.

# Logo asset update – 2026-10-06

The shared header uses the supplied `logo100.png`, stored locally as `public/branding/sci-logo.png`
(88×100), unchanged from the attachment. SHA-256:
`99b7488bb7c2a83154f82eb3c5cffad69a60eb386450737976b77ec26eb1e319`.
The same local PNG is configured as the browser favicon and Apple touch icon.
The previous SVG asset was removed. TypeScript, ESLint and the production build pass.
The branding browser scenario passes against the production preview, verifying favicon and Apple
touch icon references, rendered proportions, local asset integrity, responsive layout and both external links.
The older asset-specific checks below describe earlier versions.

# SCI branding verification – 2026-10-06

- TypeScript strict checks, ESLint, all **36 unit tests** and all **12 browser scenarios** pass.
  The browser regression took 2.9 minutes and covers capture, training, test, Phaser, participant
  swap, basic/detailed laboratory, new-group reset, instructor mode and camera recovery.
- The local PNG is byte-for-byte identical to the supplied attachment; SHA-256:
  `74d7b3cdfdfb7cbdd984fca396a2ea266c645c9a04292f087e050ff4164fc66f`.
- The dedicated branding test verifies the served asset hash, natural/rendered aspect ratios,
  exact footer text `© 2026 DM`, author-link text, both exact destinations, `_blank`,
  `noopener noreferrer`, keyboard focus outlines, new-tab creation and null `window.opener`.
  The current application's URL, OPEN stage and 30 collected examples survive both link clicks.
  External destination pages are intercepted by the test; normal app use requests no external assets.
- Desktop START, camera/test, game, detailed laboratory and 320px mobile screenshots were inspected.
  START remains within 1366×768; the mobile page has no horizontal overflow. Header height,
  game geometry and camera processing are unchanged. Footer copyright shares the existing bottom row.
- No ML, game, dataset, snapshot or session lifecycle code was changed. Existing background-tab
  game pausing remains the established behavior; links contain no application-state handlers.
- The year is a literal `2026`, not a system-date lookup. The school asset remains local and
  unmodified; no font, script, analytics or tracking dependency was added.

- Production build passes with **1,329 modules** (3m 31s); local model integrity is verified.
  The TensorFlow and Phaser chunk hashes are unchanged. No new build warnings were introduced.
- Both production smoke scenarios pass at http://localhost:4173 (56.1 seconds total): the complete
  real-ML workshop and branding/link-state checks. The branding test also verifies no extra START
  scrolling at 1920×1080; the Full HD screenshot was visually inspected.

Earlier verification reports follow.

# Interactive explanation extension – 2026-10-04

- TypeScript strict checks, ESLint and all **36 unit tests** pass.
- All **10 browser regression scenarios** pass (3.6 minutes), including the complete workshop,
  CPU fallback, independent clients, camera recovery, Phaser controls and the expanded laboratory.
- The detailed UI scenario verifies patch sizes and independent zoom, RGB and normalized values,
  brightness, mobile overflow, PCA filters and point inspection, actual occlusion output, A/B/difference
  inspection, retraining, game return and session reset. The isolated scenario passed in 42.3 seconds.
- The real-model integration harness independently recomputes the first masked region's class score
  and delta, verifies unchanged source pixels and TensorFlow tensor count, cancels a replacement
  analysis without replacing the cached result, adds the exact frozen embedding to the explicitly
  chosen FIST class, retrains, then resets during another occlusion run. Reset leaves zero tensors
  and zeroed image/input/feature buffers for both retained snapshots.
- The additional challenge UI scenario passes (23.5 seconds): direct freeze into detailed
  classification, 8×8 occlusion cancellation, disabled add/retrain until a human label is selected,
  actual retraining, OPEN 30/FIST 31 sample counts and model revision 2 after retesting.
  Together with the regression suite, all **11 browser scenarios** have passed.
- The real-model memory/occlusion harness was rerun after the cancellation fix and passes (15.7 seconds).
- Unit coverage includes full-dimensional Euclidean/cosine metrics (including zero vectors), original
  per-class sample IDs, patch edge bounds, RGB difference excluding alpha, 54/46 ambiguity wording,
  threshold failure, and the explicit distinction between controller preview and game action.
- An additional cancellation review found and fixed the final-iteration yield race. Dedicated tests
  cancel immediately after the last inference and inject an inference failure; temporary buffers are
  cleared, source pixels are preserved, and no canceled result is returned or stored.
- Desktop and 390px mobile screenshots were visually inspected. Source selection and Canvas patch
  match; wide patches scroll within their own container. PCA and occlusion describe their limitations.
- Physical hand/camera accuracy remains an on-site check. Browser tests use a synthetic camera with
  the real packaged MobileNet, Dense classifier and Phaser, never fabricated predictions.
- Docker has not been redeployed for this extension.

- Production build passes: **1,326 modules**, local model integrity verified, 5m 43s compilation.
  No new runtime dependencies were added.
- Both production-preview scenarios pass at http://localhost:4173: the full laboratory (41.5 seconds,
  including arrow movement from the image edge) and the human-labelled challenge/retraining flow
  (24.1 seconds). The served asset hash matches the final build. Final vector comparison screenshots
  were inspected as well.

Earlier verification reports follow; their test counts refer to those versions.

# Detailed laboratory verification – 2026-10-04

- TypeScript strict checking and ESLint pass. All 28 unit tests pass.
- Production Vite build passes with 1,322 transformed modules; all local model shards pass integrity
  verification. No additional runtime dependencies were introduced.
- The complete detailed/basic laboratory scenario also passes against the production build at
  http://localhost:4173 (36.8 seconds), including PCA, actual activation maps and game return.
- All 10 development-browser regression scenarios pass (3.5 minutes), including CPU fallback,
  camera recovery/cancellation, five isolated clients and real Phaser gesture/SPACE behavior.
- The detailed UI scenario passes with the real packaged model and classifier: source pixel and RGB
  inspection, channel matrix, histogram, normalization control, actual tensor shape and planes,
  full feature plot/heatmap/statistics, 61-point PCA for 60 training samples plus the current frame,
  16 intermediate activation maps, thresholds, eight stages, two-image comparison, second-person
  experiment, additive retraining, basic route, game return and group reset.
- The real-model memory harness passes repeated captures, PCA and activation extraction without
  increasing retained TensorFlow tensor counts. The live GestureController remains unchanged.
  Captured input floats and feature values match direct recomputation from the same frozen pixels.
  Reset during activation extraction clears both retained comparison frames and leaves zero tensors.
- Tests cover exact pixel/histogram values, crop/mirror mapping, floating-point tensor indexing,
  population statistics, PCA against analytically known data, class means over original samples,
  bounded chronological history, two-snapshot cleanup and serialized inference-loop restarts.
- Pixel inspection screenshots at 1366px and 390px were inspected. The mobile layout scrolls
  vertically without horizontal overflow. Plots use Canvas; PCA has at most 361 lightweight points.
- Physical cameras, real-hand recognition quality and pupil completion time remain on-site checks.
  Synthetic camera tests use real ML and Phaser; production code contains no mock predictions.
- Docker has not been redeployed for this extension; the prior container deployment is historical.

The reports below describe earlier versions, including the previous five-step module.

# Explanation module verification – 2026-10-04

- TypeScript and ESLint pass; 21 unit tests pass.
- Production Vite build and local model integrity verification pass (1,316 modules).
- The complete explanation/experiment/retraining/game/reset browser scenario also passes against
  the built production files at http://localhost:4173 (35.5 seconds).
- All 10 Chromium end-to-end tests pass against the development server, including the original
  workshop, CPU fallback, camera errors, multi-client isolation and real Phaser transition tests.
- The new UI scenario exercises a real frozen frame, all five steps, Back/Next without another
  analysis, two-frame comparison, second-person experiment, additive retraining, cross-revision
  score comparison, return to the trained game and a complete new-group reset.
- A separate real-model integration test repeats capture eight times. Snapshot scores equal direct
  classifier output for the captured embedding; confidence equals its maximum output. Navigation
  preserves the pixel buffer and snapshot identity. Tensor counts do not increase across captures,
  the original GestureController is unchanged, and reset during capture leaves zero tensors and no
  retained snapshot or comparison.
- Preprocessing tests verify the actual central crop, horizontal reversal and normalized pixel values.
  Unit tests also check a single camera draw/read per capture, feature aggregation for vectors of
  0/1/7/256/1024/2049 values and comparison retention across model revisions.
- Desktop and 390px-wide feature screens were visually inspected. The mobile flow has vertical
  scrolling without horizontal overflow.
- Interactive inspection in the in-app browser reached the camera permission wait. A full physical
  camera walkthrough could not be completed there. End-to-end tests use a synthetic camera, real
  MobileNet/classifier computation and real Phaser; no user-facing inference is mocked.
- The running Docker container described below is the earlier application build. This module is
  available on the development server; the container has not been redeployed as part of this change.

The earlier baseline verification follows for historical deployment context.

# Verification report – 2026-10-03

## Verified automatically

- TypeScript strict checking and ESLint pass.
- 15 unit tests pass: gesture transitions, held inputs, rearming, stability/threshold/reset checks, dataset limits/balancing, serialized inference cancellation, pending permission cancellation and repeated real classifier train/reset cycles.
- Three unit-tested training/reset cycles return TensorFlow tensor counts to baseline.
- Eight Chromium end-to-end scenarios have passed. They cover the full workshop, second-person flow, additive retraining, two complete model load/train/play/reset sessions, five concurrent isolated browser contexts, denied/pending camera permission, camera-loss recovery, CPU fallback, the independent instructor game and real Phaser gesture/SPACE integration.
- Browser resets with the actual packaged MobileNet return to zero retained tensors. No uncaught page errors occur in the full workshop test.
- The full workshop passes while all external-origin browser requests are blocked. No external requests are attempted.
- Desktop START, TEST and GAME screenshots were inspected at 1366×768; principal controls and game fit the viewport. START was additionally checked at 1920×1080 (no scrolling) and 390×844 (vertical scrolling, no horizontal overflow).
- Local MobileNet topology and all 55 shards pass SHA-256 integrity checks.
- Production Vite build succeeds and a Docker image builds successfully.
- Docker Compose starts Caddy successfully; container health check passes.
- the historical private-CA HTTPS endpoint returns HTTP 200 through Caddy on loopback with TLS 1.3. A separate Node HTTPS client verifies both the certificate chain against the exported CA and the configured hostname with `rejectUnauthorized: true`.
- Caddy sends the same-origin Content Security Policy, camera-only Permissions Policy and static assets.
- Dependency audit after updating Vitest reports zero known advisories.

## Final production-container result

The final `ai-vision-challenge:1.0.0` image passed its embedded `npm run check` (TypeScript, lint, 15 unit tests, model integrity and Vite build), was started with Docker Compose and reached healthy status. Its `/srv` contents were copied to the workspace `dist` directory.

Against that exact container at the historical private-CA HTTPS endpoint, Playwright reported **7 passed, 1 intentionally skipped** in 2.6 minutes. Passing cases include the complete workshop with repeated resets and blocked external origins, five concurrent isolated clients, CPU-only training/prediction, camera denial, camera-loss recovery, diagnostic game restart/replay and cancellation of pending camera permission. The skipped isolated Phaser scene harness imports source modules through Vite, so it is development-only; it passed separately with the final Phaser distribution, confirming both gesture-triggered jumps and SPACE behavior.

TLS was checked independently with explicit CA trust and hostname validation before the production browser run. The browser used only the verified certificate's SPKI pin, without changing system trust settings. These are historical HTTPS-only deployment results, not current startup instructions. Current default deployment is HTTP localhost; see DEPLOYMENT.md for optional network HTTPS.

## Test limits / required on-site acceptance

Camera integration tests use Chromium's synthetic video device. Models, TensorFlow operations and Phaser are real. The five-client test uses five independent browser contexts on one machine, not five physical school workstations. It does not prove real-hand recognition accuracy or a 60 FPS target on the target hardware.

Physical webcams, permission policies, camera-in-use behavior, real device removal/reconnection, two people, lighting/hand-distance variation, natural gesture latency and the under-five-minute first-use target still require the on-site checklist in QA.md. Physical client configuration was not changed by those historical tests. DNS and private CA trust apply only to the optional LAN mode.

The HTTPS test uses an explicitly supplied trusted root. It does not modify Windows system trust or imply that a participant browser already trusts this development CA. Offline coverage blocks external browser origins while keeping the LAN-equivalent server available; physical WAN-disconnection acceptance remains an on-site check.
