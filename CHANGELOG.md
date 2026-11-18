# Changelog

## 2.0.0 – 2026-11-18

AI Vision Challenge is now **SCI Computer Vision Lab**. This release adds a new workshop part, the
plate reader, and lets a phone be used as the camera.

### What's new

#### Part 1: Plate reader (new)

- **Node editor for image processing:** students connect OpenCV blocks until only the plate
  characters are left. The editor runs full screen.
- **Character recognition:** the reader uses template matching to read the plate the students
  printed themselves.
- **Three levels:** each level has hints and practice images, and a "Show code" view shows the code
  that matches the graph.
- **Live view on the phone:** a paired phone shows the plates being read.
- **Plate generator:** `/?role=plate-generator` prints EU-style SCI plates to PDF.
- **Facilitator tools:** diagnostics, a performance test and reference solutions for each level.

#### Phone as a camera

- Pair a phone with a QR code or a manual code; it sends video over WebRTC. All processing and
  training still run on the computer.
- The phone has a viewfinder with rotation and mirroring. The computer shows a camera-lost screen
  with recovery.
- The signaling server keeps its state in RAM only, limits connections and protects pairing codes
  against guessing.
- An optional TURN relay (coturn) carries the video through school networks and mobile data.

#### Part 2: AI Challenge

- The game speeds up during a round, from 270 to 600 px/s over about 55 seconds. A **TEMPO ×1.0…**
  label shows the current speed-up.

### Improvements and fixes

- **Faster station start:** TensorFlow.js and Phaser load only when needed. A station that runs only
  the plate reader skips about 2 MB of scripts.
- **Plate reader:** freezing a frame now handles double clicks and worker errors, the plate list
  sent to the phone is capped at 50 entries, and image memory is released when a processing pass
  fails.
- **Pairing:** correct codes no longer use up the global attempt limit, and the limit of 10 wrong
  codes per IP address always applies.

### Deployment notes for administrators

- A public server must allow inbound **80/TCP, 443/TCP, 3478/TCP+UDP and 49160–49219/UDP**.
  **443/UDP** is optional and enables HTTP/3. See "Public server: open these ports" in the README.
- New `.env` settings:
  - `HTTPS_PORT`: HTTPS port, 443 by default,
  - `TURN_SECRET`, `TURN_PUBLIC_IP` and `TURN_URLS`: TURN relay configuration,
  - `TURN_EXTRA_ARGS`: extra coturn options; on a public server, use it to block relaying to
    private networks,
  - `CLIENT_SOCKET_LIMIT=0`: recommended when a whole school reaches the server from one IP
    address.
- Keep the TURN secret only in `.env` on the server, never in the repository.
- The Docker image is now tagged `ai-vision-challenge:2.0.0`.
- Local mode (`docker compose up`) and `start-lan.ps1` work as in 1.0.0.

### Verification

- Type check, ESLint, 137 unit tests and the production build pass.
- `npm audit` reports no vulnerabilities in production dependencies.
- The workshop and game end-to-end tests pass.
- On the public server, the Let's Encrypt certificate, the site, WebSocket signaling and TURN
  relaying over UDP and TCP were checked.

## 1.0.0 – 2026-10-06

First release: guided gesture workshop (collect OPEN/FIST examples, train a classifier in the
browser), gesture-controlled game, interactive AI laboratory, instructor tools and Docker
deployment for localhost and HTTPS.
