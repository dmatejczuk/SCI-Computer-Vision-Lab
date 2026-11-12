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

## 60-minute workshop (part 1 + part 2)

The workshop has two parts on the same station: **Część 1: Czytnik tablic** (classical image
processing, about 40 minutes) and **Część 2: AI Challenge** (gestures and the game, 10–15
minutes). After the camera hub the station chooses a part; the part switcher under the header
changes parts without losing the camera or the paired phone. See [PLATES.md](PLATES.md).

| Time | Part | What the facilitator does |
| --- | --- | --- |
| 0–10 min | Introduction: how a computer "sees" a picture | Show pixels and brightness; one image → many small operations. Open **Część 1** on the projector, level 1, and add **Odcienie szarości** together. |
| 10–20 min | Building plates | Groups compose their own number from the tiles in the frame (paper tiles are the fallback). Only the configured characters are printed. |
| 20–30 min | Level 1 **Pierwsza tablica** | Groups connect Odcienie szarości → Progowanie → Odwróć kolory until **Wynik** shows 7 / 7, then **Uruchom czytnik tablic**. Hints: **Podpowiedź**. Target: ≤ 5 minutes without help. |
| 30–45 min | Level 2 **Twoja tablica**, then level 3 **Trudne warunki** | Own plate in front of the camera (or **Obraz ćwiczebny**). Type the plate in **Moja tablica**. Level 3: tilt, shadow (cover half with a hand), a bit of "dirt" (small paper dots). |
| 45–50 min | Challenges | Swap plates between groups. "Fool the reader": 0/O, 8/B, 1/I, 5/S, 2/Z. Discuss the similarity percentages and the "next in line" characters. |
| 50–60 min | **Część 2: AI Challenge** and wrap-up | If time allows: gestures and the game (10–15 min). Wrap-up: rules written by people (part 1) vs. rules learned from examples (part 2). |

Questions for the wrap-up: Which block made the biggest difference? Why must the characters be
white on black? When did the reader make mistakes and why (light, tilt, similar characters)? What
did part 2 learn by itself that we had to set by hand in part 1?

### Preparing part 1

- [ ] Print the tiles with the configured font and character set (see `plates.config.json` and
      [PLATES.md](PLATES.md)); assemble one test plate per station.
- [ ] On every station run **Test wydajności czytnika tablic** (Ctrl+Shift+D) with the camera on;
      the verdict should say ≥ 10 fps at 640 px. Use **Kopiuj wyniki** to keep the numbers.
- [ ] Open **Część 1**, solve level 1, then point the camera at the test plate on level 2 and check
      that the reader reads it. Keep the plate filling about half of the image width.
- [ ] Level 3: try the reference solution (**Wczytaj rozwiązanie poziomu 3** in the instructor
      panel) with a tilted plate and a shadow.
- [ ] Press **Nowa grupa** and confirm part 1 is back on level 1 with an empty graph.

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
The left panel shows the live preview. Once the camera shows an image, **Część 1: Czytnik
tablic** opens the plate reader; once the model is also ready, **Część 2: Przejdź do AI
Challenge** opens the gesture workshop. Switching sources or resetting a group returns
to setup; the same video element is retained when entering the challenge.

The first screen selects the workstation or camera role. Phones can enter the six-character
invitation code instead of scanning the QR; every new device still needs desktop approval.
Camera network diagnostics are available only in instructor mode.
