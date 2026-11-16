# Phase 2: voice, video and the camera table (plan)

Talking is half of a games night. Phase 2 puts voice and video in every
room, split the same way as the chat, and with video comes the **camera
table**: any real board game, played on someone's own table, with Playhall
keeping score.

## What players get

- **Voice in every room.** Mic off until you turn it on; push to talk or
  open mic; a ring round whoever is talking; volume per person.
- **The same split as the chat.** Players talk at the **table**; watchers
  talk in the **gallery**. Watchers hear the table; players don't hear the
  gallery while a game is on (when the host hides the gallery, as today).
- **Video, optional.** Players' cameras on their seat cards; watchers'
  cameras in the gallery strip only if the host allows it. Cameras are
  always off until you switch yours on.
- **Said lines in the chat.** Speech written down by the shared Whisper
  server, marked *said*, in the right channel (from Parley's transcriber).
  Off unless the host turns it on.
- **The camera table** (below).

## How it works

| Piece | Choice |
|---|---|
| Media server | **LiveKit** (Apache-2.0), self-hosted, one container next to Playhall. Scales a room to dozens of watchers; handles the network (ICE, TURN) |
| Table and gallery | **Two LiveKit rooms per Playhall room** (`CODE-table`, `CODE-gallery`). Playhall's server hands each person a token that says what they may do in each: players publish and listen at the table; watchers listen at the table and publish in the gallery; players join the gallery's listening side only when it's allowed. The rules stay in Playhall, not in the browser |
| Watcher delay and live media | Audio and video can't simply be delayed. When the host sets a watcher delay, watchers don't receive the players' voice or video at all during play (the gallery still works); it comes back between games |
| Push to talk, mute | In the browser (enabling the mic track), as in Parley: instant, no round trip |
| Talking ring | LiveKit's active-speaker events |
| Transcripts | Built (phase 2.5) in the **speaker's own browser** instead of a hidden listener (no native WebRTC module on the server, works in Chrome, Firefox and Safari): while the room has transcripts on and your mic is live, an AudioWorklet reads the same mic track voice uses, downsamples to 16 kHz, cuts utterances at pauses (an energy-based detector: 700 ms of quiet, 15 s at most) and posts each as a WAV to `POST /api/rooms/:code/said/:channel`. The server checks you may talk in that channel, sends it to Whisper (`WHISPER_URL`) and posts a *said* line; the audio is dropped. A host rule (off by default); `TRANSCRIPTS=off` or no `WHISPER_URL` turns it off for the whole server. Everyone in voice sees "Transcribing" while it's on |
| HTTPS | **TLS only, self-signed by default** (decided 2026-11-15, the same way as Alfoir): Playhall generates a certificate on first start and keeps it in a volume, so redeploys don't change it. People accept it once per device (the browser warns the first time). An **admin uploads a real certificate** later (server certificate plus intermediates as one PEM, and the key) under Admin → TLS certificate: Playhall checks the pair matches and hasn't expired, then swaps it in without dropping anyone (Node's `setSecureContext`). LiveKit's signalling is proxied through the same address, so one certificate covers both |
| Friends outside the home network | Forward one TCP port (443) and LiveKit's UDP range on the router, or use LiveKit's built-in TURN on 443 |

## The camera table

A game type for **any** board game that isn't built in.

- **Setting up.** The host makes a *Camera table* room, types the game's
  name ("Ticket to Ride", "our own house rules"), picks 2-8 seats.
- **The board camera.** The host (or anyone they choose) opens the room on
  a phone on a stand and taps **Use this device as the table camera**: it
  joins without a seat and sends a big, high-resolution board view that
  fills the stage for everyone. Players' own cameras stay on their cards.
- **The room keeps the rest:** whose turn it is (a **Next turn** button), a
  shared **dice roller** (any number of d4/d6/d8/d10/d12/d20, rolled on the
  server and shown to everyone, so nobody doubts a roll), a **score pad**
  everyone can see (the host edits, or each player edits their own), the
  move timer, and the chat.
- **The result.** At the end the host enters the places (1st, 2nd...); each
  player confirms with one click; once everyone has, it counts like any
  other game (3 points, 1 for second). If anyone disputes, it doesn't count.
- **Leaderboards** get a "Camera table" tab, per game name typed (so
  "Catan" games compare with each other).

## Build order

1. **Infrastructure**: LiveKit container, HTTPS (self-signed, then admin upload), token
   endpoint, the device picker and mic test. The browser test learns to use
   a fake mic.
2. **Voice**: table and gallery, push to talk, talking ring, mute and volume,
   the watcher-delay rule.
3. **Video** (built, issue #3): seat-card video, gallery video (host rule), the stage's video
   layout with Focus/Social presets (Social gives video more room).
   - [x] Camera on/off in the voice dock (off by default, the camera chosen
     in Settings, a red "Camera on" indicator), on the same LiveKit
     connection as voice.
   - [x] Players' cameras on their seat cards (your own mirrored), with the
     talking ring; avatars while a camera is off.
   - [x] Watchers' cameras in the gallery strip (full), only with the host's
     **Watchers can turn their cameras on** rule (off by default).
   - [x] Rights on the server: `mediaRights()` gives each channel `listen`,
     `talk` and `video`; players send video only to the table, watchers only
     to the gallery when the rule is on. Tokens and live updates use LiveKit's
     `canPublishSources` (microphone, or microphone and camera), so the
     camera is refused by LiveKit itself, not just hidden in the page.
   - [x] Seeing both: while you're in one channel's voice, a second,
     video-only connection shows the other channel's cameras when you may
     see it (watchers see the players; players see the gallery when it isn't
     hidden). Watcher delay: no table video for watchers during play.
   - [x] Bandwidth: 640x360 with a 320x180 simulcast layer, adaptive stream
     and dynacast; a camera is only received while its tile is on screen
     (compact gallery shows avatars only).
   - [x] Layouts: Focus shrinks the seats to small round tiles, Social widens
     the seat tiles and gallery tiles (also a button on the players panel);
     on a phone tiles stay small under the board.
4. **The camera table** (built, issue #4): the game type, board-camera
   device, dice, score pad, results with confirmation.
   - [x] Camera table rooms: the host types the game's name (1-60
     characters, plain text, required) and picks 2-8 seats (seats 7 and 8
     are the kit's new red and slate). It shows as "Camera table · Catan ·
     4 seats".
   - [x] The table camera device (below): a phone on a stand, no account,
     no seat; its picture fills the stage. Everyone who may see the table
     sees it without joining voice (a video-only view of the table channel,
     the same one watchers already use), and players' cameras still show on
     their seat cards.
   - [x] Turns (a turn bar: "Kai's turn", round, the move timer, **Next
     turn** for that player or the host, who can also pass to anyone), the
     move timer passing the turn on, the dice roller (any mix of up to 10
     d4/d6/d8/d10/d12/d20, rolled on the server, each roll said in the
     table chat), the score pad (everyone sees it; the host edits any score,
     players their own unless the host turns that off; also on the seat
     cards), a Rolls tab.
   - [x] Results: the host enters the places (ties allowed; it starts from
     the score pad). Each player sees them and confirms or disputes, with
     who has confirmed shown to all; a seated host's own entry counts as
     their confirmation. When everyone has, it's recorded and counts like
     any other game (scoring.ts, and the room's usual rules: casual rooms
     and guests don't count). A dispute sends it back: the host changes
     the places and asks again, or ends the game without a result (not
     counted). A player who drops out isn't put out of the game; the game
     waits for them.
   - [x] Leaderboards: the Camera table tab has a tab per game name typed
     (most played first, plus "every game together"); the standings shown
     after a game are among games of the same name.
5. **Transcripts**: *said* lines, from each speaker's browser (built).

### How a device becomes the table camera (built)

Only the host can make one, and the device never gets a session:

1. In a camera table room the host presses **Table camera**. The server
   (`POST /api/rooms/:code/table-camera`, host only, voice and video on)
   gives the room a random device id (18 random bytes, kept on the room,
   never sent to browsers in snapshots) and returns a link,
   `#/camera/CODE?k=KEY`, shown with a QR code. KEY is signed by the server
   (scope `table-camera`, the room code and the device id, 12 hours).
2. The phone opens the link (no sign-in) and taps **Start the table
   camera** (the tap matters on iPhones). It opens the rear camera at
   1280x720, then swaps KEY for a LiveKit token
   (`POST /api/camera/token`). The server checks the signature, that the
   room exists, and that the device id is still the room's current one.
3. The token is for the room's table channel only, as identity
   `camera:<id>`, with `canSubscribe: false` and `canPublishSources:
   [camera]`: LiveKit itself refuses anything else (no microphone, no screen
   share, no data, and it can't receive anyone's voice or video). It's
   published with simulcast (720p, 360p and 180p layers), not mirrored.
4. **New link** gives a new device id and **Stop the table camera** clears
   it: either way the old link stops working, and the media sync removes
   the old device from LiveKit at once. A session token can't be used as a
   camera key and a camera key can't be used as a session.

Why it's safe: a leaked link lets someone show a picture on that room's
stage until the host stops it (12 hours at most), and nothing more: no
seat, no chat, no voice, nothing to see or hear. **Use this device as the
table camera** on the host's own phone opens the same link.

Multiplatform: the camera page uses `playsInline`, a muted preview and a
tap to start (iOS Safari), asks the screen to stay awake (Wake Lock, where
the browser has it; otherwise it says to keep the screen on) and restarts
the camera if the phone stopped it while the page was in the background.

## To decide

- ~~Friends outside the home network~~: decided, self-signed by default;
  an admin can upload a real certificate (for a domain name) whenever there
  is one.
- **Where it runs**: the PC for now (it's the GPU box and already runs
  Whisper); the planned home server later.
