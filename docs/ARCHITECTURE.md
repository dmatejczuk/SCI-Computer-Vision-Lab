# Architecture

Caddy serves application assets and proxies the RAM-only signaling service. Each computer tab owns a SessionManager; there are no accounts, cookies, persistent session storage, image uploads or telemetry. Signaling rooms hold only temporary control state. Images live only in the video element and transient preprocessing tensors. DatasetManager retains fixed-length numeric embeddings in RAM, with a per-class cap.

## Application states

START -> LOADING -> OPEN -> FIST -> READY -> TRAINING -> TRAINED -> TEST -> GAME -> RESULT.
RESULT -> PARTNER -> TEST. TEST/RESULT -> OPEN (append examples) -> FIST -> READY -> TRAINING. RESULT -> END. Instructor reset transitions any state to START after cancelling work. Error recovery preserves collected embeddings and returns to the relevant stage. A generation token and AbortController prevent old asynchronous work from publishing into a new session.

## ML pipeline

Use the pretrained TensorFlow MobileNet v1 width 0.25, 224px LayersModel, packaged under public/models. Cut at conv_pw_13_relu and global-average-pool to a 256-element embedding. Center-square crop and mirror the camera in the same way for training and inference; scale pixels to [-1,1]. Store embeddings, never images. A small dense softmax classifier is trained locally with balanced batches. Fit and inference yield between operations. Only one capture/prediction operation runs at once. Dispose transient tensors in finally blocks, replace old classifier only after successful training, release all models on reset.

## Gesture controller

WAITING_FOR_OPEN -> two confident OPEN samples -> ARMED -> two confident FIST samples -> one jump and WAITING_FOR_OPEN. Uncertain samples clear the candidate streak. No timer debounce; thresholds and inference rate are centrally configured. Visibility loss and camera loss disarm the controller. This binary classifier is not a hand detector: confidence is not proof of a hand or accuracy. Unknown/background inputs can be misclassified; this is discussed in the workshop.

## Game integration

React owns the lifetime of a Phaser instance. A typed GameController bridges jump, score, FPS, pause and game-over events. Phaser owns movement, gravity, collision, obstacles and rendering. Stable OPEN is needed again on every new round. SPACE also emits a jump without changing the gesture controller. Collisions consume a round, never the dataset. Obstacle intervals allow the full jump arc; the opening seconds are clear.

## Deployment

Multi-stage Node build -> Caddy static server. Default Compose publishes loopback TCP 80 and
serves HTTP localhost without certificates or hostname configuration. Browsers allow camera
permission on this secure-context exception. The standalone network Compose variant uses
`APP_HOST` and HTTPS on TCP 443 (optional HTTP/3 on UDP 443), with HTTP redirects on TCP 80.
`APP_TLS_ISSUER=internal` uses a persistent private CA that LAN clients must trust;
`acme` uses public certificates for a real domain with reachable DNS/ports. Shared headers,
static-file handling and the internal loopback health endpoint are imported from
`Caddyfile.common`. See [DEPLOYMENT.md](DEPLOYMENT.md).

Application assets and signaling remain same-origin; WebRTC media uses negotiated peer/relay transports. Internet is needed to prepare dependencies/images,
not during a local/private-CA workshop; public certificate renewal requires connectivity.
The model download is explicit and checked-in assets are verified during builds.

## Phone source and signaling

`VideoSource` abstracts local and remote streams; `SessionManager` gates live consumers through
`FrameMonitor`. Source changes preserve examples/models, while group reset clears them and closes
all source resources. `/phone` dynamically imports a lightweight sender without ML/game modules.
The Node WebSocket registry owns expiring one-use invitations, approval and generation-checked
SDP/ICE routing in RAM. Caddy proxies `/api/*` and `/ws` to the unexposed signaling service and
rewrites only `/phone` to HTML. Video never enters the signaling service. Optional coturn relays
encrypted media using temporary credentials. See [PHONE_CAMERA.md](PHONE_CAMERA.md).
