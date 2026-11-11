# Running a workshop

## Choose the workstation address

On a computer running Docker, start with `docker compose up -d --build` and open
`http://localhost`. No hosts file or certificate is needed; HTTP localhost supports camera
permission because browsers treat it as a secure context.

For multiple computers using one server, follow [DEPLOYMENT.md](DEPLOYMENT.md): configure
`APP_HOST`, client DNS (or hosts entries), and trusted HTTPS using the network Compose variant.
A plain LAN IP over HTTP is not sufficient for camera access. Public deployments use a real
domain and a public certificate. Verify each station's URL and trust before participants arrive.
Use `docker compose ps` and `docker compose logs --tail=100 app` locally; add
`-f docker-compose.network.yml` for the network variant.

## Before the first group

- [ ] Verify light, framing and camera height; keep the background reasonably uncluttered.
- [ ] Close other applications using the camera and unnecessary browser tabs.
- [ ] Complete one real-hand training/test/game loop on each station.
- [ ] Press **Ctrl + Shift + D** to inspect camera, samples, prediction latency/FPS, game FPS, backend and tensor memory. The small footer link opens the same panel.
- [ ] Check the default thresholds first. Adjust only if needed and retest a fast OPEN → FIST → OPEN gesture. Avoid unnecessarily slow inference rates.
- [ ] Confirm **Nowa grupa** on every station and leave START visible.
- [ ] Remind pairs to swap people after the first game and observe the difference before improving the data.

Suggested timing: introduction 30s; first person's data/training/test 2min; game 1min; swap/test 1min; second person's examples/retrain 2min; final game and discussion 1–2min. No facilitator needs to operate the wizard for participants.

## Acceptance checks

See [QA.md](QA.md) and [VERIFICATION.md](VERIFICATION.md). Automated tests use a synthetic camera
with real ML and game code. Recognition quality, lighting and physical camera compatibility must
be checked with the actual participants and workstations.

## Using phones

Prepare trusted network HTTPS on the computer and every phone before the group arrives; follow
[PHONE_CAMERA.md](PHONE_CAMERA.md). Select **Telefon**, compare the pairing code before approval,
and ask the phone user to start the rear camera. Keep the phone awake and the page foregrounded.
All data collection, training, game and laboratory actions remain on the computer. Stop or reset
between groups; old invitations cannot be reused. If video freezes, wait for bounded recovery or select **Spróbuj ponownie** to pair again before continuing. The instructor panel's **Uruchom kamerę ponownie** also re-pairs the phone.

## Camera setup hub

Before the challenge, choose the computer camera or pair a phone using the QR code.
The left panel shows the live preview. Once the camera and model are ready, select
**Przejdź do AI Challenge** to begin. Switching sources or resetting a group returns
to setup; the same video element is retained when entering the challenge.

The first screen selects the workstation or camera role. Phones can enter the six-character
invitation code instead of scanning the QR; every new device still needs desktop approval.
Camera network diagnostics are available only in instructor mode.
