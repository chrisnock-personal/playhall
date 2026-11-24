// Security headers for every response (#65): defence in depth. The session
// token lives in localStorage, so the content security policy keeps scripts
// to the app's own (and the transcript worklet's blob:), styles and fonts to
// the app and Google Fonts, connections to this host, and the app out of
// other sites' frames.

import type { NextFunction, Request, Response } from 'express';

export function contentSecurityPolicy(host: string): string {
  const here = host.replace(/[^\w.:[\]-]/g, '');
  return [
    "default-src 'self'",
    "script-src 'self' blob:",
    "worker-src 'self' blob:",
    // React sets inline style attributes; Google Fonts' stylesheet.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    // The room's WebSocket and LiveKit's signalling both come back to this host.
    `connect-src 'self'${here ? ` wss://${here} ws://${here}` : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Content-Security-Policy', contentSecurityPolicy(req.headers.host ?? ''));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  // HSTS only over HTTPS (plain HTTP redirects there). Not includeSubDomains: it's often an address on a home network.
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
  next();
}
