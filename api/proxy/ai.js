// ============================================================================
// API proxy: AI (Claude / OpenAI)
//
// The browser POSTs the request here; this function forwards it to the real
// AI provider with the server-side API key. The browser NEVER sees the key.
//
// Request body:
//   {
//     "provider": "anthropic" | "openai",
//     "model": "claude-sonnet-4-5" | "gpt-4o" | ...,
//     "messages": [{ role: "user", content: "..." }, ...],
//     "max_tokens": 1024
//   }
//
// Response: the upstream provider's JSON, verbatim.
// ============================================================================

import {
  allowMethods, validateOrigin, applyCors, rateLimit,
  requireClientToken, clientIp, applyResponseHeaders,
} from '../_lib/security.js';

const MAX_BODY_BYTES = 64 * 1024; // 64KB hard cap for incoming requests

export default async function handler(req, res) {
  applyResponseHeaders(res);
  applyCors(req, res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (!allowMethods(req, res, ['POST'])) return;
  if (!validateOrigin(req)) { res.status(403).json({ error: 'Origin not allowed' }); return; }

  // Rate limit: 20 requests / minute per IP
  const ip = clientIp(req);
  const rl = rateLimit(`ai:${ip}`, Number(process.env.API_RATE_LIMIT_PER_MINUTE) || 20, 60_000);
  if (!rl.ok) {
    res.status(429).setHeader('Retry-After', String(rl.retryAfter));
    res.json({ error: `Rate limit exceeded. Retry in ${rl.retryAfter}s` });
    return;
  }

  const token = requireClientToken(req);
  if (!token.ok) { res.status(token.status).json({ error: token.error }); return; }

  // Parse body (Vercel Node runtime auto-parses JSON when Content-Type is application/json)
  const body = req.body || {};
  const bodyBytes = JSON.stringify(body).length;
  if (bodyBytes > MAX_BODY_BYTES) {
    res.status(413).json({ error: 'Request body too large' });
    return;
  }

  const provider = body.provider;
  const model    = body.model;
  const messages = body.messages;
  const max_tokens = Math.min(Number(body.max_tokens) || 1024, 4096);

  if (!provider || !model || !Array.isArray(messages) || !messages.length) {
    res.status(400).json({ error: 'Invalid request: provider, model, and messages[] required' });
    return;
  }

  try {
    let upstreamUrl, upstreamHeaders, upstreamBody;
    if (provider === 'anthropic') {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) { res.status(503).json({ error: 'ANTHROPIC_API_KEY not configured' }); return; }
      upstreamUrl = 'https://api.anthropic.com/v1/messages';
      upstreamHeaders = {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      };
      upstreamBody = JSON.stringify({ model, messages, max_tokens });
    } else if (provider === 'openai') {
      const key = process.env.OPENAI_API_KEY;
      if (!key) { res.status(503).json({ error: 'OPENAI_API_KEY not configured' }); return; }
      upstreamUrl = 'https://api.openai.com/v1/chat/completions';
      upstreamHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      };
      upstreamBody = JSON.stringify({ model, messages, max_tokens });
    } else {
      res.status(400).json({ error: `Unknown provider: ${provider}` });
      return;
    }

    const upstream = await fetch(upstreamUrl, {
      method: 'POST',
      headers: upstreamHeaders,
      body: upstreamBody,
    });
    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', 'application/json');
    res.send(text);
  } catch (e) {
    res.status(500).json({ error: 'Proxy error: ' + e.message });
  }
}
