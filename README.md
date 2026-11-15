# Playhall

**Game rooms where a host invites people in, some of them play, and everyone
else pulls up a chair and watches.** Each room has a host, players (the game
decides how many seats) and watchers, with a table chat for everyone and a
gallery chat the players can't read during a game.

Phase 1 has chess, built for more games: every game is a plug-in with its own
seats, rules and board, and the room around it stays the same. Voice and video,
sharing a game running on your own PC with remote players using controllers,
and web-game plug-ins are the next phases. See [docs/design.md](docs/design.md).

## What works now

- **Accounts and guests.** Sign up with a username and password, or join from
  an invite link with just a display name. Hosting needs an account.
- **Rooms and roles.** Create a room, play in it yourself or just host. Free
  seats are open to anyone, or only to people the host seats; watchers ask for
  a seat and wait in a queue. After each game: same players, winner stays, or
  both rotate out.
- **Chess.** Moves are checked on the server; clocks with increments,
  draw offers, resigning, promotion, checkmate, stalemate, repetition and the
  50-move rule. The board is lichess's chessground.
- **Chat.** Table (everyone reads it; watchers write only between games unless
  the host allows it) and Gallery (watchers only; hidden from players while a
  game is on).
- **A room layout that gets out of the way.** The top bar, players, watchers
  and side panel each expand, shrink or hide; Default, Focus and Social
  layouts; your layout is remembered per game. Works on a phone.
- **Host rules.** Seat policy, guests playing, the after-game rule, time
  control, chat permissions, listing in the lobby, closing the room.

## Run it

```bash
cp .env.example .env    # fill in POSTGRES_PASSWORD and JWT_SECRET
podman build -t localhost/playhall:latest .
podman-compose up -d --force-recreate
```

Then open http://localhost:8450. (Build with `podman build` before
`podman-compose up`: `up --build` on its own has left the old container
running.)

| Setting | Meaning |
|---|---|
| `POSTGRES_PASSWORD` | Database password (`python3 -c "import secrets;print(secrets.token_hex(24))"`) |
| `JWT_SECRET` | Signs sessions; at least 32 random characters or the server won't start |
| `ALLOW_SIGNUP` | `false` stops new accounts (guests still work) |
| `PLAYHALL_PORT` | Port on the host (default 8450) |

## Develop

```bash
npm install
npm test                 # game rules and room engine
npm run typecheck
DATABASE_URL=postgres://... JWT_SECRET=... npm run dev:server   # :8450
npm run dev:client       # Vite on :5173, proxying /api and /ws
node scripts/smoke.mjs http://localhost:8450   # end-to-end check against a running server
```

## Layout

```
src/shared/game.ts         the contract every built-in game implements
src/shared/games/chess.ts  chess (chess.js), with clocks and draw offers
src/shared/protocol.ts     room settings, snapshots and WebSocket messages
src/server/rooms/room.ts   one room: roles, seats, queue, chat, game lifecycle
src/server/rooms/manager.ts loading, saving and unloading rooms
src/server/ws.ts           /ws: one snapshot per person after each change
src/client/room/           the room layout and its collapsible panels
src/client/games/          each game's stage, side-panel tab and settings
migrations/                numbered SQL, applied at start-up
```

## Licence

GPL-3.0-only. See [LICENSE](LICENSE).
