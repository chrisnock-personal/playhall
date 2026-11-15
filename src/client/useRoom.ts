import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMessage, RoomSnapshot, ServerMessage } from '../shared/protocol';

export type ConnState = 'connecting' | 'open' | 'reconnecting' | 'locked' | 'gone';

export interface RoomConn {
  snap: RoomSnapshot | null;
  /** Date.now() when the snapshot arrived, for counting clocks down. */
  receivedAt: number;
  state: ConnState;
  goneReason: string | null;
  error: { message: string; at: number } | null;
  send(msg: ClientMessage): void;
}

// Close codes the server uses when reconnecting won't help.
const FINAL: Record<number, string> = {
  4401: 'Your session has expired. Sign in again.',
  4404: 'There’s no room with that code.',
  4410: 'The host closed this room.',
};

export function useRoom(code: string, token: string, pass: string | null): RoomConn {
  const [snap, setSnap] = useState<RoomSnapshot | null>(null);
  const [receivedAt, setReceivedAt] = useState(0);
  const [state, setState] = useState<ConnState>('connecting');
  const [goneReason, setGoneReason] = useState<string | null>(null);
  const [error, setError] = useState<RoomConn['error']>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let stopped = false;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setState('connecting');

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/ws?room=${encodeURIComponent(code)}&token=${encodeURIComponent(token)}${pass ? `&pass=${encodeURIComponent(pass)}` : ''}`);
      wsRef.current = ws;
      ws.onopen = () => { retry = 0; setState('open'); };
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data) as ServerMessage;
        if (msg.t === 'snapshot') { setSnap(msg.snapshot); setReceivedAt(Date.now()); }
        else if (msg.t === 'error') setError({ message: msg.message, at: Date.now() });
      };
      ws.onclose = (e) => {
        if (stopped) return;
        if (e.code === 4403) { setState('locked'); return; }
        if (FINAL[e.code]) { setState('gone'); setGoneReason(FINAL[e.code]); return; }
        setState('reconnecting');
        timer = setTimeout(connect, Math.min(10_000, 500 * 2 ** retry++));
      };
    };
    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      wsRef.current?.close();
    };
  }, [code, token, pass]);

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    else setError({ message: 'Not connected: trying again', at: Date.now() });
  }, []);

  return { snap, receivedAt, state, goneReason, error, send };
}
