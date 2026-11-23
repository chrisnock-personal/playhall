// Progression (#50): where the signed-in player is on the ladder, if they're on it.
import { useEffect, useState } from 'react';
import { api, type Session } from './api';
import type { MyProgression } from '../shared/progression';

export function useProgression(session: Session): MyProgression | null {
  const [p, setP] = useState<MyProgression | null>(null);
  useEffect(() => {
    if (session.user.guest) return;
    let live = true;
    const load = () => api<MyProgression>('/progression', { token: session.token }).then((x) => { if (live) setP(x); }).catch(() => {});
    load();
    window.addEventListener('focus', load);
    return () => { live = false; window.removeEventListener('focus', load); };
  }, [session.token, session.user.guest]);
  return p;
}
