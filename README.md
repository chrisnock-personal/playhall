<img src="brand/mark.svg" width="72" alt="Playhall logo: a pawn walking into an arched hall">

# Playhall

**Game rooms where a host invites people in, some of them play, and everyone
else pulls up a chair and watches.** Each room has a host, players (the game
decides how many seats) and watchers, with a table chat for everyone and a
gallery chat the players can't read during a game.

Phase 1 has chess (eight more games are planned on a shared kit of boards,
pieces, cards and dice: [docs/games.md](docs/games.md)), built for more games: every game is a plug-in with its own
seats, rules and board, and the room around it stays the same. Voice and video,
sharing a game running on your own PC with remote players using controllers,
OpenBOR rooms run on the server ([docs/openbor.md](docs/openbor.md)), and
web-game plug-ins are the next phases. See [docs/design.md](docs/design.md).

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
- **Points, leaderboards and stats.** 3 points for a win, 1 for a draw, 0
  for a loss. Leaderboards for this week, this month and all time (ranked from
  5 games); each player's record, results as White and Black, points per
  week, how games ended, recent games and head-to-head records. When a game
  ends, the room shows the points, new totals, ranks and the head-to-head.
  Only games between account holders in rooms set to count are counted.
- **Private rooms.** A host can give a room a password; everyone else needs
  it to get in (the host and seated players don't). Changing it makes everyone
  else enter the new one.
- **Host rules.** Seat policy, guests playing, the after-game rule, time
  control, chat permissions, listing in the lobby, closing the room.

## Run it

```bash
cp .env.example .env    # fill in POSTGRES_PASSWORD and JWT_SECRET
podman build -t localhost/playhall:latest .
podman-compose up -d --force-recreate
```

Then open http://localhost:8450. To try it with data (eight players, five
rooms and two months of games; prints the demo players' password):

```bash
podman-compose exec app node dist/server/demo.js            # load
podman-compose exec app node dist/server/demo.js --remove   # remove
```
 (Build with `podman build` before
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
node tests/browser.mjs http://localhost:8450   # the same in a real browser (Playwright)
npm run demo             # demo data into DATABASE_URL (--remove to take it out)
```

CI (`.github/workflows/ci.yml`) runs the typecheck, unit tests, build, the
end-to-end and browser tests against a real Postgres, loads and removes the
demo data, audits runtime dependencies and scans for secrets; a second job
builds the image and runs it with compose. A `v*` tag publishes a multi-arch
image to `ghcr.io/chrisnock-personal/playhall` once CI has passed on that
commit.

## Layout

```
src/shared/game.ts         the contract every built-in game implements
src/shared/games/chess.ts  chess (chess.js), with clocks and draw offers
src/shared/protocol.ts     room settings, snapshots and WebSocket messages
src/server/rooms/room.ts   one room: roles, seats, queue, chat, game lifecycle
src/server/rooms/manager.ts loading, saving and unloading rooms
src/server/ws.ts           /ws: one snapshot per person after each change
src/server/stats.ts        results, leaderboards, a player's stats
src/server/demo.ts         demo data (load / --remove)
src/client/room/           the room layout and its collapsible panels
src/client/games/          each game's stage, side-panel tab and settings
migrations/                numbered SQL, applied at start-up
brand/                     the logo (a pawn walking into the hall) and icons
```

## Licence

GPL-3.0-only. See [LICENSE](LICENSE).
