# Playhall design

Game rooms where a host invites people in, some of them play, and everyone
else watches, with chat now and voice and video next. The aim is a universal
platform: built-in games, other people's web games, and games running on
someone's own PC shared with remote players who join with a controller.

Mockups: the "Game Rooms mockups" design canvas (private; screens 1-6: lobby,
chess room as host/player/watcher, host rules, remote-play room, the
collapsible room layout, and sharing a game from a PC).

## Decisions (2026-11-15)

| Question | Decision |
|---|---|
| Name | Playhall |
| Accounts | Local accounts (username + password) and guests (display name only). Hosting needs an account; guests watch, and play if the room allows it |
| Licence | GPL-3.0. Lets us reuse LibreRemotePlay (GPL-3.0) and lichess's chessground (GPL-3.0). Web-game plug-ins talk to the room over messages from a sandboxed frame, so they're separate programs and can use any licence. Running a server doesn't oblige anyone to publish changes (that would be AGPL) |
| Media | LiveKit (Apache-2.0, self-hosted SFU) for voice, video, screen share and data channels. Parley's SIP stack (drachtio, rtpengine, FreeSWITCH) is audio-only and mixed, the wrong shape for video and data |
| Chess rules | chess.js (BSD-2) on the server, the same code in the browser for legal-move hints |

## Roles

Seats belong to the game, roles belong to the room.

- **Host**: a flag on the room. Can also sit in a seat. Seats people, moves
  them to watching, starts games, sets the rules, hands hosting to someone
  else, closes the room. Must have an account.
- **Player**: anyone in a seat. The game decides how many seats there are
  (chess: White and Black; a shared PC game: 1-4 controller slots).
- **Watcher**: everyone else present. Can ask for a seat (a raised hand; a
  queue, oldest first).

**Two conversations**, because watchers talking to players spoils games like
chess:
- **Table**: everyone reads it; players write; watchers write only between
  games unless the host allows it.
- **Gallery**: the watchers' own. Hidden from players while a game is on
  (host can turn that off); visible again once it ends.
Voice in phase 2 follows the same split (a watcher's mic reaches the gallery).
A team game can add one more private, audio-only conversation per side, gated
like the team chat and given a fresh room for each game.

**After each game**: same players / winner stays / both rotate out. Seats go
to people asking for one; with nobody asking, the players stay. Then the
host starts the next game, or the players do by all asking for a rematch
(everyone seated after the rule above; not in rooms where the host seats
people).

## Game types

Every game ships a manifest-like module: seats, config, what input it takes,
what it needs, and its own side-panel tab.

| Type | Runs where | Decides what's legal | Examples | Phase |
|---|---|---|---|---|
| Built-in rules | Playhall server | Server; watchers can be given a delayed view | Chess, draughts, Connect Four, cards (with a per-seat view for hidden hands) | 1 (chess) |
| Camera table | A real board on a camera | The people | Board games, tabletop RPGs; plus dice and a score pad | 2 |
| OpenBOR room | An OpenBOR engine in a container on the server, streamed | The engine | Beat-'em-ups (players import their own) | 3 |
| Share a local game | The host's PC | The game itself | Anything with local multiplayer on Windows | 4 |
| Web game plug-in | Sandboxed frame in each browser, bridged to the room | The host's copy, or a server module | Any HTML5 game, third-party ones included | 5 |
| Built-in real-time | Server ticks | Server | Pong-style | not scheduled ([backlog](backlog.md)) |

The room engine (seats, host, queue, chat, voice) doesn't change by type; only
the stage and the game's tabs do.

### The built-in game contract (src/shared/game.ts)

A game module is pure: `create(config, now)`, `act(state, seat, action, now)`
returns the new state or an error, `tick`/`nextDeadline` for clocks,
`result`, and `view(state, now)` for what the room sees. The browser half
(src/client/games/types.ts) supplies the `Stage`, one side-panel tab, a
`seatExtra` slot on seat cards (the chess clock), and a `ConfigPicker`.

**Computer players** (#18): a bot is a pure function in `src/shared/bots.ts`
from its seat's own `view` (and its seat) to an action, so it knows only what
a person there would. The room asks it whenever the game is waiting on a bot
seat (`waitingFor`, or `turn`), after a short pause, and falls back to the
game's `timeout` move if its answer is refused. Games with a bot never count.
A model-backed player (#32) will use the same interface.

### Sharing a local game (phase 4)

Following LibreRemotePlay's split, which works:
- **v1**: the host's browser captures the window with `getDisplayMedia` and
  publishes it to LiveKit. A small **Playhall Host** app (Go + Pion, built
  from LibreRemotePlay's code) takes input off a data channel and creates
  virtual Xbox controllers (ViGEm on Windows). A browser can't feed input
  into another program, so the app is needed.
- **v2**: capture in the app (Windows Graphics Capture, NVENC, per-process
  game audio so voice chat isn't fed back), for lower latency.
- **Input**: gamepads send whole-state snapshots 60-120 times a second over an
  unreliable channel; keys over a reliable one. Only seated players' input
  counts (checked against their room token). Keyboard and mouse are off
  unless the host allows them per slot and only reach the shared window while
  it has focus. A hotkey on the host stops all remote input.
- **Network**: the stream goes through the SFU so watchers get it too; a
  direct host-to-player path can be added if latency needs it. Remote players
  need TURN or a forwarded port to reach a home server.
- **Risk**: ViGEmBus was retired in 2023; it works but is unmaintained.
  Windows first, Linux later (uinput, PipeWire).

### Web game plug-ins (phase 5)

An HTML5 game in an `<iframe sandbox>` with a small bridge over postMessage:
it's told the seats and who's in them, sends actions, and receives state. In
the simplest mode the host's copy is the authority and the room relays; a
plug-in may also ship a server module in the built-in contract's shape.

## Room layout

The stage always gets the space; every other panel collapses:

| Panel | Expanded | Compact | Hidden |
|---|---|---|---|
| Top bar | Full | Thin strip | - |
| Players | Video tiles with clocks | Avatars with clocks | Edge tab |
| Watchers | Video strip | Avatar row + count | Edge tab |
| Side panel (Table, Gallery, People, game tab) | Tabs | Icon rail with unread badges | Edge tab |

Presets: Default, Focus, Social; custom layouts are remembered per game type
on the device. Clocks and whose turn it is stay visible in every state. On a
phone, panels stack under a full-width stage. During a game an expanded
players panel shows compact (the game shows the players), and on windows
901-1599 px wide an expanded side panel shows as its rail until opened.

## What's borrowed from where

- **Parley**: controller conventions (Express + TS, `pg`, numbered
  migrations, JWT, fail-closed secrets), the conversation model for chat (and,
  in phase 2, said/typed lines from the shared Whisper server), push-to-talk
  by gating the mic in the browser, speech detection for the talking ring.
- **open-chess** (MIT): room shape (players + spectators, reconnecting to your
  seat), draw offers, clocks; its LLM opponent idea for a later "bot seat" on
  the shared Ollama.
- **LibreRemotePlay** (GPL-3.0): phase 3's input path and host app.

## Platforms: Windows, macOS and Linux

Everything should work on all three wherever possible (user, 2026-11-15).

| Part | Windows | macOS | Linux |
|---|---|---|---|
| Playing (the browser app) | Yes | Yes (Safari included) | Yes |
| Running a Playhall server (containers) | Docker Desktop or Podman | Docker Desktop or Podman | Podman or Docker |
| Phase 2 voice and video | Yes | Yes | Yes |
| Phase 3 OpenBOR rooms | The server runs OpenBOR in a Linux container on any host; players use any browser | | |
| Phase 4 host app: capture | Windows Graphics Capture / browser | ScreenCaptureKit / browser (needs Screen Recording permission) | PipeWire / browser |
| Phase 4 host app: virtual gamepads | ViGEm | No supported virtual-gamepad driver without a signed DriverKit extension: keyboard and mouse input first, gamepads later | uinput |
| Phase 4 host app: build | Go + Wails, one codebase for all three | | |

Where a platform can't do something yet, the app says so and offers the
fallback, rather than leaving it out silently.

## Phases

1. **Done (2026-11-15)**: rooms and roles, the seat queue, Table/Gallery chat,
   local accounts and guests, private rooms, the collapsible room layout,
   host rules, the move timer and watcher delay, points, leaderboards, stats
   and replays, a light theme, and nine games on one shared kit: chess,
   checkers, Four in a Row, Snakes and Ladders, Ludo, Sea Battle, Blackjack,
   Colour Clash and Texas Hold'em ([games.md](games.md)).
2. **Done (2026-11-16)**: **voice and video, and any board game at all.** LiveKit in every room:
   voice with the same table/gallery split as the chat, push to talk, the
   talking ring, players' video on their seat cards, transcripts from the
   shared Whisper. With video comes the **camera table**: the host points a
   camera (a phone on a stand works) at a real board, moves the pieces for
   everyone, and the room supplies the rest: seats and turns, a shared dice
   roller, a score pad, a move timer, and the chat. That opens Playhall to
   any board game, including ones nobody has written a plug-in for. Games
   played this way are scored by hand: the host enters the placings at the
   end, and they count if the players confirm. Needs HTTPS (getUserMedia).
   Plan: [phase2.md](phase2.md).
3. **OpenBOR rooms**: the server runs OpenBOR in a container per room, the
   host picks a mod, the game is streamed and up to four players control it
   from their browsers. Same streaming and input path as sharing a local
   game, without the Windows parts, so it comes first: see
   [openbor.md](openbor.md).
4. Sharing a local game, v1: a host app for Windows, macOS and Linux (see
   Platforms above for what each can do).
5. The web-game plug-in SDK; sharing a local game, v2.

Built since phase 1, outside the phases: Letterworks, Realm Duel, Manor
Mystery and Ship2Shore; animations and table sounds; computer players for
ten games; Hold'em and Blackjack for up to 8 and 7; the roomier room layout;
the leaderboard podium. Ideas not in a phase yet: [backlog.md](backlog.md).

## Known gaps in phase 1 (both fixed)

- ~~Server downtime counts against the player whose clock was running.~~
  Fixed: a game loaded again moves its clocks on by the time it was away
  (`pause`, `aliveAt`).
- ~~The WebSocket takes the session token in its URL.~~ Fixed (#24): the
  token goes in the first message.
