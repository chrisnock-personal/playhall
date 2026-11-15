# OpenBOR rooms (planned phase)

Asked for on 2026-11-15: a room where the server runs OpenBOR, the host picks
which mod to play, the game is streamed to everyone in the room, and up to
four players control their characters from their own browsers.

[OpenBOR](https://github.com/DCurrent/openbor) is a 2D side-scrolling engine
for beat 'em ups (and shooters and platformers). It's BSD-3-Clause, written in
C on SDL2, builds on Linux, takes up to four players, and loads games as `.pak`
mods. That makes it a good fit: it's open, small, and its games are naturally
couch co-op.

## How it fits Playhall

It's the same shape as phase 3 (sharing a game from your PC), with the server
as the host's PC. So it uses the same pieces:

| Piece | Phase 3 (a host's PC) | OpenBOR (the server) |
|---|---|---|
| Room, seats as controller slots, watchers, chat | Shared | Shared |
| Video and sound to the room | Host browser or app → LiveKit | Server container → LiveKit |
| Input from players | Data channel → host app → virtual controllers | Data channel → server → the game |
| Who runs the game | The host's PC | A container per room on the server |

Building OpenBOR first would prove the streaming and input path without the
hardest parts of phase 3 (a Windows driver, an installer, someone else's
network). I'd do it before phase 3.

## The pieces

**A runner per room.** Starting an OpenBOR room starts one container
(`playhall-openbor`, from our own image): OpenBOR built for Linux, a virtual
display (Xvfb), a null audio sink (PulseAudio/PipeWire), and a small Playhall
agent. The controller starts and stops runners over the podman API socket (as
Parley's health page reads containers today), with CPU and memory limits and a
cap on runners at once. Stopping the room or an idle timeout removes the
runner.

**Video and sound out.** OpenBOR games run at small sizes (320×240 to
960×540). The agent captures the virtual screen at its native size and 60 fps
with GStreamer (`ximagesrc`/`pulsesrc` → H.264 + Opus) and publishes into the
room's LiveKit session as a participant called "the game". The browser scales
it up with crisp pixel edges. At these sizes the CPU encodes easily; the PC's
NVENC is a later option.

**Input in.** Each seat is a player slot (P1-P4). The browser reads the
player's gamepad (Gamepad API) or keyboard, sends the button state 60 times a
second on the LiveKit data channel, tagged with their room token; the agent
checks the sender is seated in that slot and turns it into input for the game.
Two ways to do that, to try in a spike:
- **Keyboard injection** (XTest into the virtual display): OpenBOR's per-player
  key bindings, set in its config. No special permissions; the safe default.
- **Virtual gamepads** (uinput): truer analogue and more buttons, but the
  container needs `/dev/uinput`.

**Nothing is supplied (user, 2026-11-15).** The Playhall repo, its images and
its releases contain no OpenBOR games and no OpenBOR engine. Playhall only
provides the mechanism; the people running it bring both.

**The engine: the admin fetches it.** OpenBOR is BSD-3-Clause, which would let
us redistribute it, but Playhall doesn't by default. Instead the admin's
console has an **OpenBOR** page:
- **Download OpenBOR**: fetches a Linux build from the official releases
  (github.com/DCurrent/openbor), shows the version and its licence, checks it
  against a SHA-256 the admin can see, and stores it on a volume. The admin
  clicks to accept the licence first.
- **Or upload your own build**, for an admin who compiles it themselves.
- The runner image (`playhall-openbor`) contains only the parts to run it
  (Xvfb, audio, GStreamer, the Playhall agent) and mounts the engine from
  that volume. With no engine installed, OpenBOR rooms simply aren't offered.

**The games: users import them.** A game for OpenBOR is a `.pak` mod. Hosts
import mods into **their own library** (upload a `.pak`, give it a name,
picture and player count); a mod is only offered in that host's rooms. The
admin can also keep a **shared library** for everyone, turn importing off,
and set a size limit and a per-user quota. Before an upload, the importer
confirms they have the right to use the mod; most OpenBOR mods are fan games
using other people's characters, so the responsibility is theirs and the docs
say so. Mods are checked to be a valid `.pak` (header and size) and are only
ever opened by the engine inside the runner container, never by the main
server. Save data stays per mod on the volume.

This needs an **admin role** in Playhall, which doesn't exist yet: the
accounts named in `ADMIN_USERNAMES` get an Admin page (OpenBOR engine, shared
mod library, import settings, later other admin tasks).

**In the room.** The stage is the stream (the remote-play mock-up, screen 4),
the side panel's game tab shows the four slots with each player's device and
latency, and the host can pause, restart the mod or stop the runner.
Watchers just watch.

## Points and stats

OpenBOR doesn't report winners, so these rooms are casual: no leaderboard
points. Session time per mod could go on a player's stats later.

## Risks and questions for a spike

- **Latency.** Capture → encode → SFU → browser and back should land around
  60-120 ms on a LAN; beat 'em ups tolerate that, fighting games less so.
  Measure it before building the UI.
- **OpenBOR headless.** Confirm the Linux build runs under Xvfb with SDL2 and
  sound, and that four sets of key bindings can be set from a config file
  (not only through its menus).
- **Resources.** One runner per room: measure CPU per stream to set the cap.
  The PC is also a gaming machine; the planned home server would host these
  better.
- **Mod rights.** Imported by users into their own libraries (or the admin's
  shared one); no public mod browsing or sharing between users.
- **The engine download.** Pin a release and its checksum; if the official
  releases stop offering a Linux build, the admin uploads their own.

## Depends on

Phase 2 (LiveKit in rooms, HTTPS). The input path and slot UI built here are
then reused by phase 3.

## Spike first (about a day)

1. Build or download OpenBOR outside the repo; run a mod we have the right to
   use under Xvfb in the runner container (nothing committed).
2. Stream it with GStreamer to a LiveKit room; watch it in a browser.
3. Send key presses from a second browser over a data channel; measure
   end-to-end latency with an on-screen timer.
4. Four players at once; CPU and memory per runner.
