# Sailing School — M0 spike

Proving the pipe. There are no boats yet: this build exists to answer one
question before anything expensive gets built on top of it —

> **Does WebRTC actually work in the Chromecast Ultra's browser?**

It is not documented either way and it varies by Chromecast generation. It also
tells you what JavaScript your device can parse, which sets the build target for
everything after M1.

Done when: dragging the slider on your phone moves the bar on both hosts, from
the same build, and the Cast one survives a 10-minute idle.

---

## What's here

| Path | Runs on | Job |
|---|---|---|
| `/` | anywhere | Landing page — *Cast to TV* / *Host here* |
| `/host/` | **Chromecast or any browser** | Claims a room, shows code + QR, logs every byte |
| `/play/#CODE` | phones | One axis, sent at 30 Hz, with a live RTT readout |
| `/cast/` | Chrome, one device | Cast button + 20 s heartbeat |

No build step, no framework, no runtime CDN calls. PeerJS and the QR encoder are
vendored in `vendor/`. Everything is served as-is from GitHub Pages.

---

## Deploy

1. Push this directory to the repo you serve Pages from.
2. **Settings → Pages → Source: Deploy from a branch**, branch `main`, folder `/ (root)`.
3. Wait for the green tick, then open `https://<you>.github.io/<repo>/`.

`.nojekyll` is already present so Pages serves the tree verbatim.

Paths are all relative and the base path is derived at runtime, so this works
both at a repo subpath (`/sailing-school/`) and at the root of a
`<user>.github.io` repo. Nothing to configure.

---

## Try browser hosting first

It needs no registration and takes a minute.

1. Open `/host/` on a laptop → **Start hosting**.
2. Scan the QR with a phone on the same wifi, or type the code at `/play/`.
3. Drag. The bar on the laptop should track your thumb.

Keyboard on the browser host: <kbd>F</kbd> fullscreen, <kbd>~</kbd> toggle the
diagnostics drawer.

---

## Then the Chromecast

The Cast app is already registered and wired up:

- Application ID **`FB21C379`** — "Sailing School", Custom Receiver, **Unpublished**
- Test device **`9911C91V8N`** — Chromecast Ultra, *Ready For Testing*

Because the app is unpublished it will **only** launch on that serial number.
That is the right state for M0 — publish later, when someone else needs to run it.

### Before it will work

1. **Point the receiver URL at `/host/`, not the site root.** In the developer
   console, edit the application and set the URL to
   `https://mitchyc24.github.io/host/` — with the trailing `host/`. The bare
   root is the landing page, which contains no receiver code, so casting it puts
   a page with two buttons on the TV and nothing else happens. Cast requires
   HTTPS for a published app and GitHub Pages provides it.

   > **Use Chrome for the sender, not Edge.** Edge is Chromium-based but does
   > not reliably ship Google's media-router component, so no Cast receiver is
   > ever discovered and the Cast button has nothing to offer. Firefox and iOS
   > Safari cannot do it at all. `/cast/` now detects Edge and says so.
2. **Wait 15 minutes after registering the device, then reboot the Chromecast.**
   The registration genuinely is not live before that. This is the single most
   common reason a correctly-built receiver refuses to launch.
3. Open `/cast/` in Chrome (desktop or Android — **not** iOS Safari), press the
   Cast button, pick the Ultra.
4. **Leave that tab open.** A Cast session ends when its last sender
   disconnects. The tab heartbeats every 20 s; the receiver raises
   `maxInactivity` to an hour to match.

### What to read off the TV

The diagnostics drawer, bottom of the screen:

- **RTCPeerConnection / RTCDataChannel** — if either says `NO` in red, the M0
  answer is no, and the fallback is the Firebase transport in the plan.
- **chromium M<nn>** and the magenta verdict line — this is what to put in
  `build.target` when Vite arrives before M2. The Ultra is expected to be old
  enough to need the downlevelled bundle; the log line says which one loaded.
- **optional chaining** — if `NO`, note that the published PeerJS bundle would
  have blank-screened this device. `src/shared/peer-loader.js` handles it.

If the screen stays blank or shows a red banner, that banner *is* the result.
`src/shared/boot-diag.js` is deliberately ES5 so it can still paint an error on
a device that cannot parse anything else.

### Remote debugging

Once the device is registered, DevTools attaches over the LAN at
`http://<chromecast-ip>:9222`. Useful, but the on-screen log is usually faster
from the sofa.

---

## Query overrides

Both `/host/` and `/play/` accept these, and the host copies them into the QR so
the phone can't end up on a different broker:

| Param | Effect |
|---|---|
| `?peer=host:port` | Use your own PeerServer instead of the PeerJS cloud |
| `?peerpath=/x` | Broker path (default `/`) |
| `?stun=off` | Drop the public STUN servers — correct on a single LAN, and necessary where STUN is blocked |

Running your own broker is about three lines if the shared cloud one becomes a
problem:

```bash
npm i peer express
node -e "const e=require('express')(),h=require('http').createServer(e);\
e.use('/',require('peer').ExpressPeerServer(h,{path:'/'}));h.listen(9000,'0.0.0.0')"
```

Then `/host/?peer=<your-lan-ip>:9000&stun=off`.

---

## Layout

```
index.html            landing
host/index.html       the game — Chromecast AND browser, one build
play/index.html       phone controller
cast/index.html       Cast sender + heartbeat
src/
  host/               boot capability + the two lifecycle shells
    capability.js       the ONLY place that knows Cast from browser
    cast-loader.js      CrKey detection + fetches the receiver framework
    cast-shell.js       maxInactivity, heartbeat ack, sender events
    browser-shell.js    fullscreen, wake lock, keys, unload guard
  net/
    protocol.js         wire messages — no DOM, no PeerJS, testable in Node
    peer-host.js        room claiming, players, latest-input, telemetry
    peer-client.js      connect, 30 Hz send, RTT, backoff reconnect
  shared/
    config.js           config + query overrides (classic script)
    boot-diag.js        ES5 diagnostics + watchdog. Do not modernise.
    peer-loader.js      picks the modern or downlevelled PeerJS bundle
    profile.js          device-local profile, versioned key
    qr.js               inline-SVG QR
    ui.css
vendor/
  peerjs-1.5.5.min.js       as published — needs Chromium 80+
  peerjs-1.5.5.legacy.js    esbuild --target=chrome69
  qrcode-generator-2.0.4.js
```

### Boundaries worth keeping

- **`src/host/` is the only place that knows Cast from browser.** If
  `cast.framework` shows up anywhere else, the dual-host story has started to
  rot. Everything else reads capability flags.
- **`src/net/protocol.js` has no DOM and no PeerJS.** It stays testable in Node,
  which is where the physics tests will live from M1.
- **Nothing here is written in syntax newer than ES2019**, so the same files run
  on the laptop and on an old Chromecast without a build step. That constraint
  ends when Vite arrives; until then, no `?.`, no `??`, no class fields.

---

## Verified

An end-to-end run in Chromium (host page + controller page, real WebRTC
DataChannel through a real broker) checks:

- room claim with collision retry, and the 4-char code lands in the QR
- QR renders as inline SVG and carries the broker override
- phone reaches `connected` and appears on the host
- axis pushed to +1 and −1 arrives on the host; release springs it to centre
- phone measures RTT from the host's telemetry echo (7–26 ms locally)
- input stream sustains ~30 Hz
- reconnecting with the same profile id reclaims the same slot, no duplicate player
- no uncaught errors on either page

A second run spoofs a Chromecast Ultra user agent and checks the Cast path:
the receiver framework is actually fetched, the start gate is skipped (no
cursor on a TV), the room still opens, and a failed framework fetch produces a
readable banner instead of a blank screen.

Not covered by either run, because it needs your hardware and network: the
PeerJS *cloud* broker, phone-to-laptop over real wifi, and the Chromecast
itself. That's the part M0 is asking you to do.

### Two bugs these runs caught

- **The receiver framework was never loaded.** `window.cast.framework` does not
  exist on a Chromecast by magic — `cast_receiver_framework.js` defines it.
  Without it the receiver never calls `ctx.start()`, Cast decides the app failed
  to load, and the TV drops back to the backdrop with no error at all. Fixed in
  `src/host/cast-loader.js`. Note the subtlety: you cannot detect Cast by looking
  for `cast.framework`, because loading the library is what defines it — so
  detection reads the `CrKey` token out of the user agent instead.
- **A temporal dead zone in `play/index.html`** meant *scanning* the QR failed
  while *typing* the code worked. Auto-join now runs last.

---

## Next

M1 — one boat, real physics, headless polar sweep. `src/core/` stays DOM-free so
the whole simulation runs in Node and the polar can be validated in CI rather
than by squinting at a TV.
