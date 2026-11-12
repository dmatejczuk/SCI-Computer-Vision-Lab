# Phone camera over WebRTC

The computer owns the dataset, classifier, game and laboratory. The phone loads a separate
client with no TensorFlow.js or Phaser imports and sends video only, using native WebRTC.
The Node signaling service handles JSON control messages in RAM, never video frames. Media
travels between browsers, optionally through an authenticated TURN relay as encrypted packets.
Neither client nor server records images. P2P does not imply that traffic stays inside the LAN.

## Local computer camera

```sh
docker compose up -d --build
```

Open `http://localhost`, choose **Uruchom stanowisko**, then **Kamera komputera**. No hosts entry or certificate is needed.
The default also starts the internal signaling service, but phone pairing requires the network
HTTPS origin. A localhost QR cannot reach the computer from a phone and is deliberately refused.

## Windows LAN quick start

Start Docker Desktop with Linux containers. From the repository directory run:

```powershell
.\scripts\start-lan.ps1
# Or explicitly choose the computer's actual LAN IPv4 address:
.\scripts\start-lan.ps1 -Address <SERVER_IP>
```

The script checks Docker, lists eligible network interfaces and existing TCP listeners, starts
the standalone network Compose file, waits for health and exports `caddy-root.crt` plus its SHA256
fingerprint. It does not install certificates or change the firewall. Choose Wi-Fi/Ethernet,
not WSL/Docker/VPN, and reserve the address in DHCP. A conflicting listener may make startup
fail; inspect its owning process before stopping it.

Manual equivalent. Replace `<SERVER_IP>` with the computer's LAN IPv4 address (for example from
`ipconfig`):

```powershell
$env:APP_HOST = '<SERVER_IP>'
$env:APP_TLS_ISSUER = 'internal'
docker compose -f docker-compose.network.yml up -d --build --wait
docker compose -f docker-compose.network.yml cp app:/data/caddy/pki/authorities/local/root.crt ./caddy-root.crt
Get-FileHash .\caddy-root.crt -Algorithm SHA256
```

Open the HTTPS address printed by the script (`https://<SERVER_IP>`) on **both** devices, with no
certificate warning. Using an IP avoids
phone hosts-file changes. Plain LAN HTTP cannot access the phone camera. Desktop localhost is
a special secure-context exception, not an exception for arbitrary LAN IPs.

### One-time certificate trust

Transfer only the public root certificate through a trusted channel. Compare its SHA256 fingerprint
with the server output. Never transfer private keys or the Caddy volume.

- Windows: import the root into Trusted Root Certification Authorities for the intended account
  or managed computer, according to local policy. An administrator may use
  `certutil -addstore -f Root .\caddy-root.crt` for machine-wide trust.
- Android: use Settings / Security / Encryption and credentials / Install a certificate / CA
  certificate (names vary by manufacturer). Managed-device policy may prohibit user CAs.
  Open the link in Chrome rather than an embedded QR-scanner browser; verify trust there.
- iPhone/iPad: install the certificate profile, then explicitly enable full trust under
  Settings / General / About / Certificate Trust Settings. See
  [Apple's certificate trust instructions](https://support.apple.com/en-us/102390).

Trust is scoped to the Caddy instance. Keep `caddy_data`; `down -v` destroys its CA and requires
trust setup again. Changing IP requires a new URL and pairing. Do not bypass browser warnings.
For workshops with many personal phones, a public-domain certificate avoids distributing a CA.

### Network requirements

Allow TCP 80/443 to Caddy on the private network. UDP 443 is optional HTTP/3, not the WebRTC media
port. Browsers negotiate media ports independently; peer traffic must be permitted by host/network
policy. Wi-Fi guest isolation, VLAN boundaries, VPNs and AP client isolation can prevent P2P even
on the same SSID. Ask the network administrator to provide the appropriate network or TURN access;
do not disable the firewall. The signaling port 3001 is never published by Compose.

## Pair and use

1. On the computer choose **Uruchom stanowisko**, then **Telefon** in the camera hub. A QR and a large six-character invitation code appear.
2. On the phone scan the QR, or open the same HTTPS site, choose **Udostępnij kamerę** and enter the six-character code. The six boxes support paste, automatic advance and keyboard correction. Review the suggested device name and select **Dołącz do stanowiska**.
3. Compare the six-digit code on both screens. Approve only the intended request on the computer.
4. Once the computer approves it, the phone starts the camera by itself; allow camera permission.
   **Uruchom aparat** remains as a fallback if the automatic start fails (e.g. permission denied).
5. Check the desktop preview and select **Przejdź do AI Challenge**. Keep the phone page visible.
   The phone switches to a plain full-screen viewfinder (no crop frame or hints) with a control bar:
   **Zmień aparat**, **Odbij poziomo** (left-right), **Odbij pionowo** (upside down), **Pełny
   ekran** and **Zatrzymaj**. Flips are applied on the phone and shown in its preview, so the
   computer receives exactly what the phone shows; both flips together turn the image by 180° (a
   phone mounted upside down). There is no 90° rotation: browsers already rotate camera frames with
   the device. The desktop still applies its own central crop and mirror for the model. The setting
   is remembered on that phone. No notice covers the viewfinder while streaming. **Pełny ekran**
   enters fullscreen where the browser allows it (Android Chrome, iPad); browsers require a tap for
   this, so the automatic camera start cannot do it. The browser's own fullscreen notice may
   briefly cover the bar. iPhone Safari has no page fullscreen, so the button is hidden and the
   layout fills the visible screen. The screen is kept awake while streaming where the Wake Lock API
   is available.
6. Collect examples, train, test, play and open the laboratory on the computer as usual.
7. If the phone stops sending frames (locked screen, closed page, network drop), the computer shows
   **Rozłączono urządzenie** with a spinner while the pairing can still resume, and closes it by
   itself when frames return. **Połącz nowe urządzenie** starts a new pairing; **Użyj kamery
   komputera** switches to the local camera. Without a live pairing the spinner is hidden. The same
   screen (as **Rozłączono kamerę**, with **Spróbuj ponownie** and **Użyj telefonu**) replaces the old
   inline error for a lost local camera, in every stage including the camera setup and laboratory.

The phone prefers the rear camera, 1280x720 and 30 FPS, without audio. These are preferences;
constraints fall back on unsupported devices. A sustained bandwidth/CPU limitation lowers the
capture profile. Camera switching uses `replaceTrack`; devices that require releasing the old
camera may briefly interrupt video. Playback failures expose an explicit play button.

The instructor panel (Ctrl+Shift+D) shows decoded video FPS separately from prediction frequency, RTT separately from
model compute time, and P2P/TURN from the selected ICE pair (unknown until available). These
numbers do not measure end-to-end video latency.

## Lifecycle and recovery

No decoded-frame progress for two seconds blocks new capture/inference and pauses the game;
the polling interval is 250 ms. Source changes stop pending work and reset gesture state.
Existing examples/model remain until **Nowa grupa**. Game resume requires an explicit action.
Frozen laboratory snapshots remain available as snapshots, not as new live frames.

A `disconnected` WebRTC state gets a 4-second grace period before an ICE restart; `failed`
restarts immediately. Each interruption gets up to two restart attempts with 12-second retry
windows, and the budget resets after the connection recovers. The server ends a pair only if it
sees more than two restart requests within 60 seconds. Late answers and ICE candidates from a
superseded negotiation are dropped rather than treated as protocol errors. An unexpected signaling
closure retains an approved pair for 60 seconds. The client retries with backoff up to 5 seconds
and a 55-second reconnect deadline; connecting sockets time out after 8 seconds. A successful
resume rebuilds WebRTC negotiation using the existing approval and private resume credentials.
The phone attempts to reacquire its camera when the page returns to the foreground. Stale frames
remain blocked, and a paused game requires an explicit resume.

Screen lock may suspend JavaScript, networking or camera capture. Recovery is best effort; an OS
page discard, reload, server restart or expired grace period requires a new pairing. This is not
background recording. See [browser lifecycle limitations](https://developer.chrome.com/docs/web-platform/page-lifecycle-api).
Once the phone is paired, the workshop view hides the pairing banner and the camera source switch.
To revoke the old pair and issue a fresh invitation, use **Spróbuj ponownie** on a connection error,
**Uruchom kamerę ponownie** in the instructor panel (Ctrl+Shift+D), or **Połącz nowe urządzenie**
on the camera setup screen. Stop/reset
also ends the pair immediately rather than opening a recovery window.

Stop/reset closes tracks, peers, sockets and timers. Tokens live only in memory; invitation
fragments are removed from the phone address bar on load. No localStorage or student accounts.

## Signaling security and limits

One process owns up to 60 RAM-only rooms, supporting the target of 30 active pairs with headroom.
Each room has separate random 192-bit room, owner, invitation and approved-phone resume values.
Resume credentials stay in page memory and are accepted only for an approved member. A valid
resume also replaces a socket the server still considers open (half-open TCP after a network
change); old sockets cannot send after replacement. Reload requires a new room. Invitations expire after
5 minutes, attempts after 30 seconds, sessions after 2 hours. Six-character codes use a 32-character
alphabet without I/O/0/1, are unique among active rooms and permit only an approval request.
Manual code attempts are globally limited to 120/minute, in addition to socket limits.
Approval atomically consumes both QR and manual invitations and rejects other pending candidates
(at most three). Explicit leave deletes the room; unexpected close uses the bounded grace period.
A sweep runs every second. Names suggested from user-agent strings are editable convenience labels,
not verified hardware names or identity. The browser does not expose the user's device hostname.

WebSocket Origin must exactly match `APP_ORIGIN`; Caddy supplies same-origin HTTPS/WSS routing.
The protocol checks version, request IDs, roles, state, fields, sizes and negotiation generations.
Limits: 64 KiB messages, 48 KiB SDP, 4 KiB ICE messages, 160 messages per connection per 10 seconds,
180 sockets and 240 upgrade attempts per minute across the single server. Unauthenticated sockets
expire after 5 seconds; ping/pong detects dead sockets in up to 20 seconds. In addition, each client
IP (taken from Caddy's `X-Forwarded-For`) may hold `CLIENT_SOCKET_LIMIT` sockets (default 10),
open 30 sockets and try 10 manual codes per minute, so one device cannot exhaust the shared capacity.
On a public server reached by a whole school behind one NAT, set `CLIENT_SOCKET_LIMIT=0` to disable
the per-client limits; such a server still needs deployment-level abuse protection. There is no horizontal scaling or durable recovery.
Neither application logging nor signaling logs message bodies or tokens.

## Public-domain deployment

Set `APP_HOST` to a real domain, `APP_TLS_ISSUER=acme`, configure public A/AAAA records and reachable
TCP 80/443, then run the network Compose file. Caddy handles issuance and renewal. Open the same
HTTPS origin on both devices. No private CA installation is needed. See [DEPLOYMENT.md](DEPLOYMENT.md).
Private-only servers using DNS-01 need an appropriate Caddy DNS-provider build and configuration;
that alternative is not implemented by setting `acme` alone. This change does not publish a site.

## Optional TURN and forced-relay test

Use a dedicated reachable coturn server. The supplied standalone Compose example publishes TCP/UDP
3478 and UDP 49160-49219. It is suitable for testing on a trusted LAN with UDP connectivity.
It does not supply TURN/TLS on 5349; restrictive networks requiring TLS need an operator-managed
coturn certificate/listener and corresponding `turns:` URL. Media remains DTLS-SRTP encrypted.
On Docker Desktop verify NAT/relay mappings explicitly; a dedicated Linux relay is preferable
for deployment if advertised relay addresses cannot be reached. The example refuses to relay to
loopback, `0.0.0.0/8` and link-local (`169.254.0.0/16`, including cloud metadata) addresses.

PowerShell, on the Docker host (substitute its reachable IP):

```powershell
$env:TURN_PUBLIC_IP = '<SERVER_IP>'
$env:TURN_SECRET = node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
$env:TURN_URLS = "turn:$($env:TURN_PUBLIC_IP):3478?transport=udp"
$env:ICE_RELAY_ONLY = 'true'
$env:APP_HOST = '<SERVER_IP>'
$env:APP_TLS_ISSUER = 'internal'
docker compose -p vision-turn -f docker-compose.turn.yml up -d
docker compose -f docker-compose.network.yml up -d --build --wait
```

The same secret must reach coturn and signaling. Store operator secrets securely; never commit them
or put them in `VITE_*`. Signaling issues short-lived HMAC credentials only after approval, expiring
after 125 minutes (slightly longer than the maximum session). Pair again and verify that decoded
frames increase and diagnostics show **TURN**, not merely that a TURN URL was configured.
Stop the relay and confirm video stalls/pauses. Set `ICE_RELAY_ONLY=false` and recreate signaling
to restore automatic candidate selection. New credentials/configuration apply to new pairings.

## Troubleshooting and operations

```sh
docker compose -f docker-compose.network.yml ps
docker compose -f docker-compose.network.yml logs --tail=100 app signaling
docker compose -f docker-compose.network.yml exec app wget -qO- http://127.0.0.1:8080/health
docker compose -f docker-compose.network.yml exec signaling node -e "fetch('http://localhost:3001/api/health').then(r=>console.log(r.status))"
```

- QR shows localhost guidance: open the LAN HTTPS URL on the computer before pairing.
- Phone cannot load: inspect trust, server IP, firewall and Wi-Fi isolation. A desktop-only success
  does not validate the phone network.
- Pairing rejected: expired/reused invitation, wrong code, resource limit or Origin mismatch.
  Generate a new invitation. Do not paste tokens into support logs.
- Accepted but no video: grant camera permission, keep the page visible, close other camera apps,
  inspect ICE transport and try an authenticated relay if peer connectivity is blocked.
- Frozen video: collection and prediction stop. Resume/re-pair before continuing the workshop.
- After backend restart: all rooms are gone; create new pairings. No images or model data are on the backend.
- Missing `/api/*` and assets return errors, not the workshop HTML. Only `/phone` has a targeted
  HTML rewrite. Test direct phone links when changing proxy configuration.

## Physical acceptance checklist (not replaced by automated tests)

- [ ] Android Chrome and iPhone Safari: trusted HTTPS, QR, WSS, permission denial/retry and rear camera.
- [ ] Portrait/landscape viewfinder and control bar, flips reaching the desktop, fullscreen
      (Android) and its absence (iPhone), screen stays awake, safe-area, keyboard focus and
      screen-reader statuses.
- [ ] Lock the phone while streaming: the computer shows the disconnection screen with a spinner
      and closes it by itself after unlocking; **Połącz nowe urządzenie** re-pairs from it.
- [ ] Switch front/rear camera repeatedly; stop releases the camera indicator.
- [ ] Complete collect/train/test/game/lab with natural hands on each platform.
- [ ] Test Wi-Fi off/on and screen lock: short interruptions attempt recovery; expired grace, reload and backend restart require
      predictable recovery; stale frames never continue collecting or jumping.
- [ ] Reject wrong phones, race two candidates, replay an invitation, reload and reset ten times.
- [ ] Test 1, 5, 15 and 30 physical pairs on the target AP for 45 minutes; record FPS, bitrate, RTT,
      loss and resource use. Prefer Ethernet for computers. A 30-room socket test is not a Wi-Fi test.
- [ ] Force relay, verify the actual selected ICE pair, then interrupt TURN and observe safe pause.
- [ ] Measure end-to-end latency with a visible clock/action filmed together with the receiver screen.

## Reproduce automated verification

```sh
npm run check
npm run test:e2e
```

For the forced-relay browser scenario, first start coturn as described above, stop any separately
running development signaling process, and keep TURN_URLS, TURN_SECRET and ICE_RELAY_ONLY=true
in the shell that launches Playwright:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD\.browsers"
npm run test:e2e -- --grep 'phone WebRTC'
```

Playwright starts its own Vite/signaling services; a pre-existing service would retain its old ICE
configuration. This scenario generates a routable example QR and follows its fragment on the local
test origin. It uses real relay media, not a WebRTC mock, but does not test phone certificate trust.

For the running HTTPS deployment, without changing system trust:

```powershell
$env:APP_HOST = '<SERVER_IP>'
$env:CA_FILE = "$PWD\caddy-root.crt"
node scripts/verify-phone-deployment.mjs
```

This verifies TLS, direct routing, missing-route errors and real WSS approval. Public CAs can use
Node's default trust by omitting CA_FILE. After a long offline period, inspect Caddy logs if an
intermediate/leaf certificate is expired: check the system clock, allow Caddy to renew it and
restart the app if necessary. Preserve the root/data volume; never bypass certificate checks.

## User-facing feedback

Connection events use dismissible six-second snackbars. Codes, approval actions and recovery
controls remain in the page; technical transport/FPS/RTT details appear only in instructor mode.
The entry screen selects the workstation or camera role and does not load the workshop ML/game
bundles for a phone. A manual code grants no media access until explicit desktop approval and
phone camera permission.
