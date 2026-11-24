// One port for HTTPS and plain HTTP: a TLS handshake goes to the HTTPS
// server, anything else (an old http:// link) to the redirect. A connection
// that sends nothing at all is dropped after a while (#67), so idle ones
// can't pile up; once it has spoken, the server it went to looks after it.

import type net from 'node:net';

export const FIRST_BYTE_MS = 10_000;

export function frontHandler(tls: { emit(event: 'connection', s: net.Socket): unknown }, plain: { emit(event: 'connection', s: net.Socket): unknown }, firstByteMs = FIRST_BYTE_MS) {
  return (socket: net.Socket): void => {
    socket.setTimeout(firstByteMs, () => socket.destroy());
    socket.once('data', (first) => {
      socket.setTimeout(0);
      socket.pause();
      socket.unshift(first);
      (first[0] === 0x16 ? tls : plain).emit('connection', socket);
      process.nextTick(() => socket.resume());
    });
    socket.on('error', () => socket.destroy());
  };
}
