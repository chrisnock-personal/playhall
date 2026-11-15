// The room WebSocket: /ws?room=CODE&token=JWT[&pass=ROOM_PASS]. One connection per open room
// tab. Every change in a room sends each connection its own snapshot (what a
// player may see differs from a watcher), coalesced to one send per tick.

import type { IncomingMessage, Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import type { Auth } from './auth';
import type { RoomManager } from './rooms/manager';
import { RoomError, type Room } from './rooms/room';
import type { ClientMessage, ServerMessage, SessionUser } from '../shared/protocol';

interface Conn {
  ws: WebSocket;
  user: SessionUser;
  alive: boolean;
}

export class RoomSockets {
  private conns = new Map<Room, Set<Conn>>();
  private pending = new Set<Room>();
  private wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });

  constructor(private auth: Auth, private getManager: () => RoomManager) {}

  attach(server: Server): void {
    server.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url ?? '/', 'http://x');
      if (url.pathname !== '/ws') { socket.destroy(); return; }
      this.wss.handleUpgrade(req, socket, head, (ws) => { void this.accept(ws, req); });
    });
    const beat = setInterval(() => {
      for (const set of this.conns.values()) for (const c of set) {
        if (!c.alive) { c.ws.terminate(); continue; }
        c.alive = false;
        c.ws.ping();
      }
    }, 30_000);
    beat.unref();
  }

  private async accept(ws: WebSocket, req: IncomingMessage): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://x');
    const user = this.auth.verify(url.searchParams.get('token'));
    if (!user) { ws.close(4401, 'Sign in again'); return; }
    const room = await this.getManager().get(url.searchParams.get('room') ?? '');
    if (!room) { ws.close(4404, 'No such room'); return; }
    if (!room.admitsWithoutPassword(user.id)
      && !this.auth.verifyRoomPass(url.searchParams.get('pass'), user.id, room.rec.code, room.rec.passwordHash!)) {
      ws.close(4403, 'This room needs its password');
      return;
    }

    const conn: Conn = { ws, user, alive: true };
    let set = this.conns.get(room);
    if (!set) { set = new Set(); this.conns.set(room, set); }
    set.add(conn);
    room.join(user);

    ws.on('pong', () => { conn.alive = true; });
    ws.on('message', (data) => {
      let msg: ClientMessage;
      try { msg = JSON.parse(String(data)); } catch { return; }
      try {
        room.handle(user, msg);
      } catch (err) {
        if (err instanceof RoomError) this.send(ws, { t: 'error', message: err.message });
        else {
          console.error('[ws] handler error:', err);
          this.send(ws, { t: 'error', message: 'Something went wrong' });
        }
      }
    });
    ws.on('close', () => {
      set!.delete(conn);
      if (set!.size === 0) this.conns.delete(room);
      room.leave(user.id);
    });
  }

  /** Called by the room manager whenever a room changes. */
  changed(room: Room): void {
    if (this.pending.has(room)) return;
    this.pending.add(room);
    queueMicrotask(() => {
      this.pending.delete(room);
      for (const c of this.conns.get(room) ?? []) {
        this.send(c.ws, { t: 'snapshot', snapshot: room.snapshotFor(c.user.id) });
      }
    });
  }

  /** Disconnect everyone from a room that has been closed. */
  closeRoom(room: Room): void {
    for (const c of this.conns.get(room) ?? []) c.ws.close(4410, 'The host closed this room');
    this.conns.delete(room);
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  }
}
