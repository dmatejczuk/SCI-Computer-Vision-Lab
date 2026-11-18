# SCI Computer Vision Lab

Teach a model to recognize gestures, use it to control a game, and explore how it makes decisions.
SCI Computer Vision Lab is an interactive workshop that takes participants from webcam examples
to their own image classifier – without writing code.

Participants collect open-hand and closed-fist examples, train a model, and put it to the test
in a gesture-controlled game. Switching the person in front of the camera reveals what the model
has learned and where it struggles. A wrong prediction becomes the next experiment: collect
better examples, retrain, and compare the results.

## Features

- **Plate reader (part 1)** – build an OpenCV image-processing chain in a node editor until only
  the characters are left, then watch the reader read your own printed plate (three levels).
- **Plate generator** – `/?role=plate-generator` prints EU-style SCI plates as a PDF.
- **Phone camera** – pair a phone over HTTPS/WebRTC; the computer still runs all ML and gameplay.
- **Guided workshop** – collect OPEN/FIST examples, train a classifier, and test predictions live.
- **Gesture-controlled game** – an open hand arms the next jump; closing the fist triggers it.
- **Interactive AI laboratory** – freeze a frame and inspect its pixels, extracted features, and actual model outputs.
- **Hands-on experiments** – compare two images, explore a map of training examples, and measure how masking image regions changes predictions.
- **Instructor tools** – diagnostics, settings, and a session reset for the next group.

The application interface is in Polish. Built with React, TypeScript, TensorFlow.js, Phaser 3,
OpenCV.js and React Flow.

## Deploy with Docker

Requirements: a running Docker Engine or Docker Desktop in Linux-container mode, Docker Compose
v2, and a free TCP port 80. From the repository directory:

```sh
docker compose up -d --build
```

Open [http://localhost](http://localhost) on the Docker host, choose **Uruchom stanowisko**, then **Kamera komputera**, and allow camera
access. Check the preview, then select **Część 1: Czytnik tablic** (plate reader) or
**Część 2: Przejdź do AI Challenge**. No hosts-file edits, certificates, TLS warnings, `.env` file or environment variables are
needed. Browsers treat HTTP localhost as a secure context, so webcam access is available with
user permission. The port is bound to loopback; this default mode is for the host computer only.

The first build downloads dependencies/base images and runs project checks; it can take several minutes.

```sh
docker compose ps
docker compose logs -f app
docker compose stop
docker compose start
```

Run `docker compose up -d --build` again after updating the source. `docker compose down` removes
the container; the next `up` recreates it.

For other computers, use the separate HTTPS variant with `APP_HOST`. See the
[deployment guide](docs/DEPLOYMENT.md) for LAN/private CA, public domains, ports and troubleshooting.
An ordinary LAN IP over HTTP does not enable camera access.

## Phone camera on the LAN

On Windows, run `.\scripts\start-lan.ps1`, trust the exported public CA on both devices, and open
the printed HTTPS URL on the computer. Select **Telefon**, scan the QR, approve the matching code,
and start the phone camera. See the [phone camera guide](docs/PHONE_CAMERA.md) for Android/iOS
trust, public-domain deployment, optional TURN and troubleshooting.

## Public server: open these ports

On a server reached over the internet (for example a school using its own network while the app
runs elsewhere), pairing goes through HTTPS, but the phone video is sent over WebRTC. Restrictive
networks, NAT and mobile data usually block a direct connection, so run the TURN relay
(`docker-compose.turn.yml`) next to the app and allow these inbound ports:

| Port        | Protocol  | Used for                                                  |
| ----------- | --------- | --------------------------------------------------------- |
| 80          | TCP       | Certificate issuance/renewal (ACME) and redirect to HTTPS |
| 443         | TCP       | The application and signaling (UDP 443 optional, HTTP/3)  |
| 3478        | TCP + UDP | TURN relay: STUN/TURN requests                            |
| 49160–49219 | UDP       | TURN relay: media ports                                   |

Open them in every firewall between the clients and the server: the provider's network firewall
or security group (one inbound "allow" rule per row, source "any") and the server's own firewall,
for example with `ufw`:

```sh
sudo ufw allow 80/tcp
sudo ufw allow 443
sudo ufw allow 3478
sudo ufw allow 49160:49219/udp
```

Then set `TURN_SECRET` (a long random value), `TURN_PUBLIC_IP` and
`TURN_URLS=turn:<APP_HOST>:3478?transport=udp,turn:<APP_HOST>:3478?transport=tcp` in `.env`, start
the relay with `docker compose -p vision-turn --env-file .env -f docker-compose.turn.yml up -d`,
and restart the app so signaling hands out TURN credentials. Keep the secret out of version
control.

On a public server, add these settings to the same `.env`:

```dotenv
# A whole school usually reaches the server from one address: do not limit sockets per IP.
CLIENT_SOCKET_LIMIT=0
# Keep the relay from reaching private networks behind the server, and disable TCP relaying.
TURN_EXTRA_ARGS=--no-tcp-relay --denied-peer-ip=10.0.0.0-10.255.255.255 --denied-peer-ip=172.16.0.0-172.31.255.255 --denied-peer-ip=192.168.0.0-192.168.255.255 --denied-peer-ip=100.64.0.0-100.127.255.255 --denied-peer-ip=fc00::-fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff --denied-peer-ip=fe80::-febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff
```

Wrong manual pairing codes stay limited per address. Do not use `TURN_EXTRA_ARGS` blocking private
networks for a LAN relay whose `TURN_PUBLIC_IP` is itself a private address.

If a network allows nothing but TCP 443, plain TURN on 3478 cannot pass; such networks
need TURN over TLS on 443 on a separate address (see the [phone camera guide](docs/PHONE_CAMERA.md)).

## Run locally without Docker

For development or a quick local preview, install Node.js 24 and npm:

```sh
npm ci
npm run dev
```

Open [localhost:5173](http://localhost:5173). See the [development guide](docs/DEVELOPMENT.md)
for build commands and testing instructions.

## Privacy and offline operation

Camera processing, training, and inference run on the computer. A paired phone sends encrypted
video to that computer over WebRTC, optionally through TURN. The application/signaling server
does not receive or store video frames, training examples or results. Session data stays in the current tab's memory;
closing the tab or using the new-group reset clears it.

The pretrained model and application assets are bundled locally. Once the deployment is prepared,
the workshop can run without Internet access. Participant computers still need a connection
to the application server over the local network.

## Documentation

- [Changelog](CHANGELOG.md)

- [Additional network configuration, HTTPS, and offline deployment](docs/DEPLOYMENT.md)
- [Workshop preparation and facilitation](docs/WORKSHOP.md)
- [Plate reader (part 1)](docs/PLATES.md)
- [Interactive AI laboratory](docs/LABORATORY.md)
- [Development and testing](docs/DEVELOPMENT.md)
- [Application architecture](docs/ARCHITECTURE.md)
- [Pretrained model and licensing](docs/MODEL.md)
- [QA checklist](docs/QA.md) and [verification results](docs/VERIFICATION.md)
