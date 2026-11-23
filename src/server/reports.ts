// Reports (#21): anyone in a room can report it, or a person in it. The
// report keeps the room's recent chat, so an admin can see what happened.
// Admins list and resolve them from the platform settings page.

import { Router } from 'express';
import { rateLimit, type Auth } from './auth';
import type { Db } from './db';
import type { RoomManager } from './rooms/manager';
import { REPORT_DETAILS_MAX, REPORT_REASONS, type AdminReport, type ReportReason } from '../shared/platform';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHAT_KEPT = 30;

/** What's wrong with a report as sent, or null. */
export function reportProblem(body: { reason?: unknown; details?: unknown; userId?: unknown }, reporterId: string): string | null {
  if (typeof body.reason !== 'string' || !(body.reason in REPORT_REASONS)) return 'Choose a reason';
  if (body.details !== undefined && (typeof body.details !== 'string' || body.details.length > REPORT_DETAILS_MAX)) return `Say what happened in ${REPORT_DETAILS_MAX} characters or fewer`;
  if (body.userId !== undefined && body.userId !== null && (typeof body.userId !== 'string' || !UUID.test(body.userId))) return 'No such person';
  if (body.userId === reporterId) return 'You can’t report yourself';
  return null;
}

/** POST /api/rooms/:code/report: report the room, or (with userId) a person in it. */
export function reportRoute(opts: { auth: Auth; db: Db; rooms: RoomManager }): Router {
  const { auth, db, rooms } = opts;
  const r = Router();
  r.post('/rooms/:code/report', auth.requireUser, rateLimit(10, 60 * 60_000), async (req, res) => {
    const me = req.user!;
    const body = req.body ?? {};
    const problem = reportProblem(body, me.id);
    if (problem) { res.status(400).json({ error: problem }); return; }
    const room = await rooms.get(String(req.params.code));
    if (!room) { res.status(404).json({ error: 'No such room' }); return; }
    let targetName: string | null = null;
    if (body.userId) {
      const { rows } = await db.query<{ display_name: string }>('SELECT display_name FROM users WHERE id = $1', [body.userId]);
      if (!rows[0]) { res.status(404).json({ error: 'No such person' }); return; }
      targetName = rows[0].display_name;
    }
    const { rows: chat } = await db.query<{ name: string; channel: string; body: string; created_at: Date }>(
      `SELECT m.name, m.channel, m.body, m.created_at FROM chat_messages m JOIN rooms r ON r.id = m.room_id
        WHERE r.code = $1 AND m.kind <> 'system' ORDER BY m.id DESC LIMIT ${CHAT_KEPT}`, [room.rec.code]);
    const lines = chat.reverse().map((l) => ({ name: l.name, channel: l.channel, text: l.body, at: new Date(l.created_at).toISOString() }));
    await db.query(
      `INSERT INTO reports (reporter_id, reporter, room_code, room_name, target_id, target_name, reason, details, chat)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [me.id, me.name, room.rec.code, room.rec.name, body.userId ?? null, targetName, body.reason as ReportReason, (body.details ?? '').trim(), JSON.stringify(lines)]);
    console.log(`[report] ${me.name} reported ${targetName ?? `room ${room.rec.code}`} (${body.reason})`);
    res.status(201).json({ ok: true });
  });
  return r;
}

interface ReportRow {
  id: string; reporter: string; room_code: string; room_name: string; target_id: string | null; target_name: string | null; reason: ReportReason; details: string;
  chat: AdminReport['chat']; created_at: Date; resolved_at: Date | null; resolved_by: string | null; note: string | null;
}
const toReport = (r: ReportRow): AdminReport => ({
  id: r.id, reporter: r.reporter, roomCode: r.room_code, roomName: r.room_name, target: r.target_name, targetId: r.target_id, reason: r.reason, details: r.details,
  chat: r.chat, createdAt: new Date(r.created_at).toISOString(),
  resolved: r.resolved_at ? { at: new Date(r.resolved_at).toISOString(), by: r.resolved_by ?? '', note: r.note ?? '' } : null,
});

/** The admin side, mounted under /api/admin (admins only). */
export function adminReportRoutes(db: Db): Router {
  const r = Router();
  r.get('/reports', async (req, res) => {
    const all = req.query.all === '1';
    const { rows } = await db.query<ReportRow>(
      `SELECT * FROM reports ${all ? '' : 'WHERE resolved_at IS NULL'} ORDER BY created_at DESC LIMIT 200`);
    const { rows: open } = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM reports WHERE resolved_at IS NULL');
    res.json({ reports: rows.map(toReport), open: open[0].n });
  });
  r.put('/reports/:id', async (req, res) => {
    const id = String(req.params.id);
    const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, REPORT_DETAILS_MAX) : '';
    const reopen = req.body?.resolved === false;
    if (!UUID.test(id)) { res.status(404).json({ error: 'No such report' }); return; }
    const { rows } = await db.query<ReportRow>(
      reopen
        ? 'UPDATE reports SET resolved_at = NULL, resolved_by = NULL, note = NULL WHERE id = $1 RETURNING *'
        : 'UPDATE reports SET resolved_at = now(), resolved_by = $2, note = $3 WHERE id = $1 RETURNING *',
      reopen ? [id] : [id, req.user!.name, note]);
    if (!rows[0]) { res.status(404).json({ error: 'No such report' }); return; }
    console.log(`[admin] ${req.user!.name} ${reopen ? 'reopened' : 'resolved'} report ${id}`);
    res.json({ report: toReport(rows[0]) });
  });
  return r;
}
