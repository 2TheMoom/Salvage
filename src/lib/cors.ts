import { NextRequest, NextResponse } from 'next/server'

// Only the Mini App's own origin gets cross-origin access to these routes —
// not a wildcard. They write to the database and will be called from
// client-side code running inside an embedded webview (Base App, Farcaster),
// which is a genuine cross-origin browser request, not a server-to-server one.
const ALLOWED_ORIGINS = [
  'https://salvage-miniapp.vercel.app',
  'http://localhost:3000', // mini app local dev — adjust if it runs elsewhere
]

function allowedOrigin(req: NextRequest): string | null {
  const origin = req.headers.get('origin')
  return origin && ALLOWED_ORIGINS.includes(origin) ? origin : null
}

// Drop-in replacement for `NextResponse.json(...)` that also attaches the
// CORS header when the request's Origin is on the allow-list.
export function corsJson(
  req: NextRequest,
  data: unknown,
  init?: ResponseInit
): NextResponse {
  const res = NextResponse.json(data, init)
  const origin = allowedOrigin(req)
  if (origin) {
    res.headers.set('Access-Control-Allow-Origin', origin)
    res.headers.set('Vary', 'Origin')
  }
  return res
}

// Preflight (OPTIONS) response for the same routes.
export function corsPreflight(req: NextRequest): NextResponse {
  const res = new NextResponse(null, { status: 204 })
  const origin = allowedOrigin(req)
  if (origin) {
    res.headers.set('Access-Control-Allow-Origin', origin)
    res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS')
    res.headers.set('Access-Control-Allow-Headers', 'Content-Type')
    res.headers.set('Vary', 'Origin')
  }
  return res
}
