// ============================================================================
// Shared security helpers for Vercel Serverless Functions.
//
// These helpers are imported by every API handler to enforce:
//   - Origin / Referer validation
//   - HTTP method restriction
//   - Basic in-memory rate limiting (per IP + per key)
//   - CORS headers
//   - Secure JSON response formatting
//
// NOTE: Rate limiting is in-memory and per-function-invocation, which is a
// best-effort measure. For higher-traffic production use, swap to Vercel KV
// or Upstash Redis for shared state across cold starts.
// ============================================================================

const rateBuckets = new Map(); // key => [{ ts }, ...]

/** Extract the client IP (Vercel forwards via x-forwarded-for). */
export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'] || req.headers.get?.('x-forwarded-for');
  if (!fwd) return 'unknown';
  return String(fwd).split(',')[0].trim();
}

/** Allow only specified HTTP methods; sends 405 otherwise. */
export function allowMethods(req, res, methods) {
  if (!methods.includes(req.method)) {
    res.status(405).setHeader('Allow', methods.join(', '));
    res.json({ error: 'Method not allowed' });
    return false;
  }
  return true;
}

/** Validate that Origin/Referer matches one of the allowed hosts. */
export function validateOrigin(req) {
  const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  // Always allow the current deployment URL
  const host = req.headers.host || req.headers.get?.('host') || '';
  if (host) allowed.push(`https://${host}`);
  const origin = req.headers.origin || req.headers.get?.('origin') || '';
  const referer = req.headers.referer || req.headers.get?.('referer') || '';
  const source = origin || referer;
  if (!source) return true; // same-origin requests often lack Origin
  try {
    const sourceUrl = new URL(source);
    return allowed.some(a => sourceUrl.origin === a);
  } catch {
    return false;
  }
}

/** Apply CORS headers. */
export function applyCors(req, res) {
  const host = req.headers.host || '';
  const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim());
  if (host) allowed.push(`https://${host}`);
  const origin = req.headers.origin || '';
  if (allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Client-Token');
  res.setHeader('Access-Control-Max-Age', '600');
}

/**
 * Simple sliding-window rate limiter.
 * @param {string} key — unique identifier (e.g. ip + ":" + route)
 * @param {number} limit — max requests
 * @param {number} windowMs — window size in milliseconds
 * @returns {{ ok: boolean, remaining: number, retryAfter: number }}
 */
export function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  const bucket = rateBuckets.get(key) || [];
  const fresh = bucket.filter(t => now - t < windowMs);
  if (fresh.length >= limit) {
    const oldest = fresh[0];
    return { ok: false, remaining: 0, retryAfter: Math.ceil((windowMs - (now - oldest)) / 1000) };
  }
  fresh.push(now);
  rateBuckets.set(key, fresh);
  // Periodically clean memory
  if (rateBuckets.size > 5000) {
    for (const [k, v] of rateBuckets) {
      if (v[v.length - 1] < now - windowMs) rateBuckets.delete(k);
    }
  }
  return { ok: true, remaining: limit - fresh.length, retryAfter: 0 };
}

/** Reject if the configured signing secret is missing or a client token is not present. */
export function requireClientToken(req) {
  const signingSecret = process.env.API_PROXY_SIGNING_SECRET;
  if (!signingSecret) {
    return { ok: false, status: 503, error: 'API proxy not configured (missing secret)' };
  }
  const token = req.headers['x-client-token'] || req.headers.get?.('x-client-token') || '';
  if (!token) {
    return { ok: false, status: 401, error: 'Missing X-Client-Token' };
  }
  // Token format: base64url(HMAC-SHA256(ts:user:signingSecret))
  // We accept any non-empty token for now; proper validation requires matching
  // user identity from the frontend session, which the frontend app provides.
  // Upgrade path: exchange client token for a short-lived signed JWT.
  return { ok: true, token };
}

/** Attach default secure response headers. */
export function applyResponseHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
}
