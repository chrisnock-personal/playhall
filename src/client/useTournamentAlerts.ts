// Tournaments (#61): say when your game is ready, wherever you are in
// Playhall: a browser notification (when allowed) and the tab's title.
import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import type { TournamentSummary } from '../shared/tournament';

const EVERY_MS = 15_000;
const TITLE_MARK = '● Your game is ready · ';

/** Your tournament games that are ready now (polled while signed in with an account). */
export function useTournamentAlerts(token: string | undefined, guest: boolean): TournamentSummary[] {
  const [ready, setReady] = useState<TournamentSummary[]>([]);
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!token || guest) return;
    let live = true;
    const load = () => api<{ tournaments: TournamentSummary[] }>('/tournaments', { token }).then((r) => {
      if (!live) return;
      const now = r.tournaments.filter((t) => t.myRoom);
      // Notify about rooms that weren't ready last time (not on the first look).
      if (seen.current) {
        for (const t of now) {
          if (seen.current.has(t.myRoom!) || location.hash === `#/r/${t.myRoom}`) continue;
          try {
            if ('Notification' in window && Notification.permission === 'granted') {
              const n = new Notification(`Your ${t.name} game is ready`, { body: `${t.gameName}: tap to go to the game`, tag: t.myRoom! });
              n.onclick = () => { window.focus(); location.hash = `#/r/${t.myRoom}`; n.close(); };
            }
          } catch { /* notifications aren't available here */ }
        }
      }
      seen.current = new Set(now.map((t) => t.myRoom!));
      setReady(now);
    }).catch(() => {});
    load();
    const timer = setInterval(load, EVERY_MS);
    return () => { live = false; clearInterval(timer); };
  }, [token, guest]);

  // The tab title, outside the game's own room.
  useEffect(() => {
    const strip = () => { if (document.title.startsWith(TITLE_MARK)) document.title = document.title.slice(TITLE_MARK.length); };
    const apply = () => {
      strip();
      if (ready.some((t) => location.hash !== `#/r/${t.myRoom}`)) document.title = TITLE_MARK + document.title;
    };
    apply();
    const timer = setInterval(apply, 2000);
    return () => { clearInterval(timer); strip(); };
  }, [ready]);
  return ready;
}

/** Ask the browser for permission to notify (from a button press). */
export async function askToNotify(): Promise<NotificationPermission | 'unsupported'> {
  if (!('Notification' in window)) return 'unsupported';
  try { return await Notification.requestPermission(); } catch { return 'denied'; }
}
