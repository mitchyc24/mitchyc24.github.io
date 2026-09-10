# Sailing School — M3, the harbour

A top-down sailing simulator for a television and a pile of phones. The TV runs
the world; everybody scans the QR code on screen and their phone becomes a
tiller, a mainsheet and a set of instruments.

As of M3 there is a **harbour**, and the harbour is the menu. What the room
plays is decided by sailing: four rings float on the water, each at a deliberate
angle to the wind, and holding one of them together is the vote. Nobody reads a
menu, nobody needs a cursor, and choosing the race means beating to windward
first — which is either a good time or a hint that you want the beginners' ring
on the beam reach instead.

Everything below M0 is history, kept because the Chromecast triage in it is
hard-won and you will want it again.

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

### If the sender says "no receivers found"

Discovery is filtered by whether a device offers the app you asked for, so this
one message has two very different causes. `/cast/` shows a triage panel that
splits them, using `?appid=CC1AD845` — Google's Default Media Receiver, which is
published and available on every Chromecast ever made.

**A Cast logo on an otherwise blank TV is what success looks like for that
test.** CC1AD845 is a media player with no media loaded; there is nothing more
to see. It only answers whether the device is reachable.

- **Default receiver connects, yours doesn't** → app availability. Confirm the
  serial, confirm 15 minutes have passed, then **pull the Chromecast's power for
  10 seconds**. The reboot is the step people skip.
- **Neither connects** → discovery. VPN on the PC first, then the Chromecast's
  network, then AP isolation. Fastest independent check: Chrome menu → **Cast**.

Note also that the application and the device must be registered under the
**same developer account**, and sender and receiver must be on the same network.

### Once your app does launch

If the TV shows the landing page with two buttons, the receiver URL is still the
site root — change it to `https://mitchyc24.github.io/host/`.

For anything else, attach DevTools over the LAN at `http://<chromecast-ip>:9222`,
or use `chrome://inspect`. Find the IP in Google Home → device → settings →
Information. Don't leave the debugger attached for long; it exhausts resources
on the receiver.

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
  core/                 DOM-free, network-free — runs headless in Node
    physics.js          apparent wind, sail force, drags, moments
    boat.js             one boat, plus the assist layer above the force model
    wind.js             shifts, gusts, wind shadow — deterministic from a seed
    world.js            fixed-step integration of the fleet
    harbour.js          the dock and the four rings; where they sit, and why
    lobby.js            the vote — claim, quorum, countdown, cancel, re-arm
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
    compass.js          wind direction, said unambiguously, in one place
    telltales.js        the bands the strip and the fleet list both read
    assists.js          the three levels, as constants — never a second physics
    boats.js            hull constants
    modes.js            what there is to play, and what can be adjusted
    ui.css
  controller/
    surfaces.js         tiller, mainsheet, hike
    dial.js             the boat-up points-of-sail dial
  render/
    scene.js            canvas: water, wind, boats, harbour, HUD insets
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

---

## M1 — the physics

`src/core/` is DOM-free, network-free and render-free, so the whole simulation
runs headless in Node. That is what makes the physics tunable at all: squinting
at a boat on a TV tells you almost nothing.

```bash
node tools/polar-sweep.js 6      # the polar at 6 m/s
node tools/trap-check.js         # bistability check
node --test "test/*.test.mjs"    # 24 emergent-behaviour tests
open dev/                        # sail it — keyboard, or scan the QR
```

`/dev/` is the sail lab: canvas, instruments, telltales, and a live tuning
overlay on `?tune=1`. Keys: arrows for tiller and mainsheet, space to hike,
`~` for tuning, `R` to reset, `+`/`-` to zoom. It also hosts a room, so the M0
phone controller can take the helm — scan the QR in the corner.

### What the polar says, at 6 m/s (12 kn)

| | |
|---|---|
| No-go zone | nothing below 25°, creeping at 30°, sailing by 40° |
| Best upwind VMG | 50°, with 45° at 99% of it — a flat groove, as real polars have |
| Fastest | 90° at 8.6 kn, planing |
| Best downwind VMG | **135°** — gybing down beats running dead |
| Dead run | 4.7 kn, 55% of max |

None of those are coded for. They fall out of the force model, and the test
suite asserts each one so a future change cannot quietly break them.

### Four things the numbers caught that watching never would

1. **Keel induced drag was missing.** A foil making side force also makes drag,
   rising with the square of that force. Without it the polar's knee was far too
   soft. It is the term that decides how high she points.
2. **An induced-drag death spiral.** Driven from sail force and forward speed,
   low speed made huge drag, which held speed down, which made more drag. She
   sailed fine in 8 m/s and stopped dead in 12. Induced drag belongs to the
   *keel* reaction at the *water* speed, and it needs a ceiling.
3. **Weather helm with nothing to push against.** Driven from sail force alone,
   a boat sitting still had a large yawing moment its stopped rudder could not
   answer, so she rounded up into irons from every standing start. It is a
   couple between sail and keel, limited by the smaller of the two.
4. **No directional stability at all.** Real hulls weathercock toward their
   direction of motion; that is what opposes weather helm and lets a boat
   track. `Ktrack` is left just shy of neutral, so a released helm creeps to
   windward and depowers rather than bearing away into a broach.

### Tuning it yourself

Every constant is in `src/shared/boats.js`, and `LAT_OVER_FWD` — how much harder
the keel resists sideways motion than the hull resists forward motion — is still
the one to touch first. After any change:

```bash
node tools/polar-sweep.js 6 && node tools/trap-check.js && node --test "test/*.test.mjs"
```

`tools/tune.js` does a grid search against what a real dinghy does, if you want
the machine to find it.

### Known and intended

- **Planing hysteresis.** Below hull speed she cannot push through the drag
  hump; already planing she stays up. Bear away in a gust to get her going, and
  she keeps going after it passes. `trap-check.js` reports these separately from
  real faults.
- **Yaw instability under fixed sheet.** Let go of the tiller and she wanders
  off, upwind or down. This is true of real dinghies and is why nobody does it.

---

---

## M2 — the controller

`/host/` now runs the real world: one boat per player, drawn on the shared
renderer, with the fleet and each player's telltale state down the side.
`/play/` is the real controller.

```bash
node --test "test/*.test.mjs"      # 35 tests, including the M2 gate
open host/                         # then scan the QR with a phone
```

### The controls

| | |
|---|---|
| **Tiller** | Horizontal zone. Absolute within its width, so you can slam it over; **springs back to centre** on release, because you hold a tiller against the water. |
| **Mainsheet** | Vertical zone. **Relative and it stays put** — you cleat a sheet and leave it. Down eases, up trims in. |
| **Hike** | Hold. Not a gesture; it has to work with cold thumbs. |
| **Telltale strip** | The teaching device. Five states, animated ribbons, a buzz as she comes into the groove and a different one as she falls out. |
| **Planing badge** | A second, separate lesson — see below. |

### The gate, automated

The milestone's real gate needs a person: can a non-sailor get upwind on the
telltales alone? What `test/telltale-pilot.test.mjs` checks is the claim
underneath it. The pilot in there is deliberately stupid — it reads **one
string** (`luffing` / `edge` / `good` / `over` / `stalled` / `running`) and
nothing else. No angle of attack, no speed, no apparent wind.

It finds the groove from any starting trim, holds it >80% of the time, stays
within ~90% of the best trim a full search can find, and beats to windward at
2.5 kn. A slow thumb still gets there. So the strip is a sufficient signal.

### What the strip cannot teach, and why it now says so

Two things came out of building that test, and both changed the design:

1. **Telltales cannot teach planing.** At the planing transition there are two
   stable states at the *same angle of attack* — displacement and planing — so
   a pilot in a perfect groove can be doing two thirds of the boat's speed.
   That is a real limitation of telltales, not a bug, so planing got its **own
   indicator** rather than being smuggled into the strip. It reads
   *displacing → on the hump → PLANING*.
2. **The strip used to nag on a run.** Squared off downwind the sail genuinely
   is stalled — a run is drag-driven — but the sheet is already at the stop and
   she is going as fast as she can. It said "ease out", which is advice you
   cannot take. Now it says RUNNING and asks for nothing. The rule: only tell
   the player to ease if easing is possible and would help.

The groove also narrowed from ±6° to ±5° after measuring what "drawing well"
actually cost in speed at each point of sail.

### Where the pieces live

```
src/shared/telltales.js   ONE definition of the bands, read by host,
                          controller, dev view and tests alike
src/controller/surfaces.js tiller / sheet / hold, and why they differ
src/render/scene.js       canvas renderer shared by host and dev view
src/net/protocol.js       v2 wire format — no DOM, no PeerJS
```

---

## Assist levels

Chosen **per player**, on the phone, and changeable mid-game without losing your
boat. A beginner on arcade sails in the same fleet as someone on strict.

| | |
|---|---|
| **Strict** | The real thing. In irons is real, capsizing is real. |
| **Assisted** | Holds her course with the tiller centred, steers at any speed, much harder to capsize. You still trim. |
| **Arcade** | The sail trims itself and she will not go over. Just steer. |

**The physics is not forked.** There is one force model — the real one — and
every level runs it. What changes is a handful of boat constants and a thin
layer over the player's input, both declared in `src/shared/assists.js`. A
second simplified simulation would drift out of step, and the polar sweep and
the emergent-behaviour suite would only ever cover one of them.

### Speed-neutral, and measured

Assists are **easier, not faster**. Auto-trim deliberately aims off the optimum,
and the offset was measured rather than guessed:

```bash
node tools/assist-balance.js     # arcade vs a strict boat sailed well
```

`AUTOTRIM_OFFSET_DEG = 12` puts arcade at **99%** of a well-sailed strict boat
across the points of sail and both wind strengths. Change it and re-run the
tool, or `test/assists.test.mjs` will fail you. A beginner who could simply
out-sail an expert by switching mode would make mixed-ability racing pointless
and remove any reason to learn the real boat.

One thing no assist removes: **you still cannot sail straight into the wind.**
There is a test for it. Take that away and there is no game left.

---

## Wind, said unambiguously

Wind direction is the most confusable thing in a sailing game, because the two
conventions point opposite ways: sailors name a wind by where it **comes from**,
arrows show where it **goes**. An early build drew the arrow 90° out and the
whole game felt arbitrary — you cannot learn a boat when the one cue telling you
where the wind is happens to be lying.

`src/shared/compass.js` owns that maths now, in one pure module the renderer and
the tests share. On top of it:

- **Drifting streaks on the water** — the only cue that cannot be misread,
  because it moves. Everything else is a caption for this.
- **A rose that states both facts**: "NORTHERLY 12 kn" and "from N → blowing S".
- **A points-of-sail dial on the phone**, drawn **boat-up** — your bow at the
  top, the wind swinging around it, the no-go zone a shaded wedge you can watch
  yourself heading into. The TV shows the fleet from above, which is the wrong
  frame when you are the one steering.
- **The point of sail named in words** — CLOSE HAULED, BEAM REACH, RUNNING — so
  an angle becomes a thing you can learn.

---

## M3 — the harbour lobby

Nobody watches a menu. So the menu is made of water: four dashed rings, each
sitting at a deliberate angle to the wind from the dock.

| Ring | Where | What it asks of you |
|---|---|---|
| **Sailing School** | ~96° off the wind | a beam reach — the easiest thing there is |
| **Cargo Run** | 58° to leeward side | a close reach |
| **Squall** | 58° the other way | a close reach |
| **Buoy Race** | **dead upwind** | unreachable except by beating |

**The map is the difficulty curve.** A room that cannot yet beat cannot
accidentally start a race, and the people who can are demonstrating it by
arriving. Nobody is tested; the geography just asks. The dock sits well downwind
of all four, so nothing is reachable by giving up and drifting.

Sail into a ring and the arc around it starts filling. When a majority of the
room is in the same ring for six seconds, that is the decision: ten seconds of
countdown, a horn, and a placard saying what was chosen.

### The four rules that stop it being griefable

1. **The denominator is *active* players** — anyone who has actually moved a
   control in the last 30 seconds. A phone face-down on a sofa still streams 30
   packets a second quite happily, so "a packet arrived" is not presence; the
   host watches for a control that *moved*. Without this, one abandoned handset
   holds a room of five hostage forever.
2. **A countdown is cancelled only by a majority claiming a different ring.**
   One person leaving cannot stop a room of six. Sail somewhere else together,
   or it happens.
3. **Rings disarm after a decision** and only re-arm once their crowd
   disperses — otherwise six boats parked in the race ring would re-start the
   race every eight seconds, forever.
4. **Three minutes with nothing claimed at all and the harbour gives in**: the
   race ring stands off to seaward and swings round to a beam reach on the empty
   side. The beat is not deleted, it is offered again next time; and every other
   ring is untouched.

Options are coarse in the world and fine on the phone. Standing in a ring grows
a panel of chips — laps, course size, wind strength — shared live with everyone
else in that ring, so you watch the room's mind change rather than discovering
it at the start gun. They are chips and never sliders, because the value *is*
the whole state: a dropped packet cannot leave two phones disagreeing about what
was decided.

The first player to join is the **harbourmaster** and gets a *Start now* on
their phone. It is deliberately narrow — it can only start what the room is
already looking at, and it still fires a countdown, because a race that begins
without a horn begins without half the fleet. If they leave, the next longest
standing inherits it without anyone being asked.

### Two bugs the tests caught, which watching would not have

**The drifting ring ate another one.** Rule 4 originally eased the race ring
onto a close reach — which is exactly where the squall ring already was. Three
minutes into a stuck room, the race ring slid over the top of a fleet parked in
squall, swallowed their positions and started a race nobody had voted for. It
looked like the re-arm guard failing. It was geometry. The fix is that the ring
stands *off to seaward first and only then swings round*, and the test asserts
the rings stay disjoint at every instant of the move, not just at the ends.

**Arcade would hold you head to wind.** The assist's heading hold means "keep
what I have", and left literal it will keep a heading that cannot be sailed: the
boat stops, the autopilot holds her there, and the player who chose arcade
precisely so they would not have to think about the wind is stuck forever with a
control that appears to be working. The hold now refuses to hold a course inside
the no-go zone and walks out to the nearest sailable angle. It steers; it does
not push — the balance figures above are unchanged by it, and there is a test
that strict still leaves you in irons, because that is the whole lesson.

(While fixing that: a heading hold on proportional gain alone oscillates. A boat
leaving the no-go zone with barely any way on swung to 50° off, then 8°, then
40°, then 12°, for as long as you cared to watch — worse than being stuck,
because it looks possessed rather than becalmed. It has a rate term now.)

### Verified

`test/lobby.test.mjs` — 38 headless tests covering every rule above plus the
geometry invariants. `verify-m3.mjs` drives two real phones over real WebRTC and
checks the things a unit test cannot reach: that an idle phone genuinely drops
out of the quorum while still connected, that an option tapped on one phone
appears on another, that the countdown on the TV matches the one in a pocket,
and that a non-harbourmaster pressing *Start now* does nothing at all.

### The debug handle

`window.SS` on the host — `SS.put('b0', 'race')` drops a boat in a ring without
sailing there, `SS.lobby.zones` shows claims and voters, `SS.harbour.drifted`
says whether the harbour gave in. `window.SSC` is the phone's client.

Deliberately unguarded rather than behind a query flag: the one place it really
matters is a Chromecast reached over the LAN at `http://<ip>:9222`, and you
cannot add a query parameter to a receiver URL that Google has on file. Anyone
who can run script on the host's own screen could already do anything.

---

## Next

M4 — the race. The course, the harbour-mouth start line with its 45-second
pre-start and over-early penalty, mark rounding, results, and the trip back to
the harbour with a placard on the dock. The lobby already hands it a mode and a
set of options; M4 is what happens after the horn.

Still owed from the television: the `chromium M<nn>` line from the diagnostics
drawer. Everything so far is hand-written ES2019 with no build step, and that
number is what sets Vite's `build.target` when the build step arrives.
