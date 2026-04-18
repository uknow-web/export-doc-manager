// ============================================================================
// API proxy: Email sending (Resend / SendGrid)
//
// Request body (JSON):
//   {
//     "provider": "resend" | "sendgrid",
//     "to":   "someone@example.com",
//     "subject": "Subject text",
//     "body": "plain text body",
//     "from": "sender@kmt.kyoto"   (optional; defaults to env var)
//   }
//
// Keys are read from environment variables:
//   RESEND_API_KEY       for provider=resend
//   SENDGRID_API_KEY     for provider=sendgrid
//   SENDGRID_FROM_EMAIL  fallback From address
// ============================================================================

import {
  allowMethods, validateOrigin, applyCors, rateLimit,
  requireClientToken, clientIp, applyResponseHeaders,
} from '../_lib/security.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  applyResponseHeaders(res);
  applyCors(req, res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (!allowMethods(req, res, ['POST'])) return;
  if (!validateOrigin(req)) { res.status(403).json({ error: 'Origin not allowed' }); return; }

  const ip = clientIp(req);
  const rl = rateLimit(`mail:${ip}`, 10, 60_000);
  if (!rl.ok) {
    res.status(429).setHeader('Retry-After', String(rl.retryAfter));
    res.json({ error: `Rate limit exceeded. Retry in ${rl.retryAfter}s` });
    return;
  }

  const token = requireClientToken(req);
  if (!token.ok) { res.status(token.status).json({ error: token.error }); return; }

  const body = req.body || {};
  const provider = body.provider || 'resend';
  const to       = body.to;
  const subject  = body.subject;
  const text     = body.body;
  const from     = body.from || process.env.SENDGRID_FROM_EMAIL;

  if (!to || !EMAIL_RE.test(to))         { res.status(400).json({ error: 'Invalid to' }); return; }
  if (!from || !EMAIL_RE.test(from))     { res.status(400).json({ error: 'Invalid from' }); return; }
  if (!subject || subject.length > 200)  { res.status(400).json({ error: 'Invalid subject' }); return; }
  if (!text || text.length > 50_000)     { res.status(400).json({ error: 'Invalid body' }); return; }

  try {
    if (provider === 'resend') {
      const key = process.env.RESEND_API_KEY;
      if (!key) { res.status(503).json({ error: 'RESEND_API_KEY not configured' }); return; }
      const upstream = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({ from, to: [to], subject, text }),
      });
      const json = await upstream.json();
      res.status(upstream.status).json(json);
      return;
    }
    if (provider === 'sendgrid') {
      const key = process.env.SENDGRID_API_KEY;
      if (!key) { res.status(503).json({ error: 'SENDGRID_API_KEY not configured' }); return; }
      const upstream = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: from },
          subject,
          content: [{ type: 'text/plain', value: text }],
        }),
      });
      if (upstream.status === 202) {
        res.status(200).json({ ok: true });
      } else {
        const errBody = await upstream.text();
        res.status(upstream.status).json({ error: errBody });
      }
      return;
    }
    res.status(400).json({ error: `Unknown provider: ${provider}` });
  } catch (e) {
    res.status(500).json({ error: 'Mail proxy error: ' + e.message });
  }
}
