// ============================================================================
// TOTP (RFC 6238) — Time-based One-Time Passwords, compatible with
// Google Authenticator, 1Password, Authy, etc.
//
// - 30-second time step
// - 6-digit code
// - HMAC-SHA-1 (the standard; while SHA-256 is allowed by RFC, most apps
//   default to SHA-1 and change would break QR scanning with Google Auth)
// ============================================================================

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Generate a new random TOTP secret (20 bytes → 32 Base32 chars). */
export function generateTotpSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return base32Encode(bytes);
}

/** Encode Uint8Array as Base32 (no padding). */
export function base32Encode(bytes) {
  let bits = 0, value = 0, out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  return out;
}

/** Decode a Base32 secret back to bytes. */
export function base32Decode(str) {
  const clean = str.replace(/=+$/, '').replace(/\s/g, '').toUpperCase();
  let bits = 0, value = 0;
  const out = [];
  for (const c of clean) {
    const idx = BASE32_ALPHABET.indexOf(c);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** Compute the 6-digit TOTP code for the given secret and time (seconds). */
export async function totpCode(secretBase32, timeSec = Math.floor(Date.now() / 1000)) {
  const step = 30;
  const counter = Math.floor(timeSec / step);
  const key = base32Decode(secretBase32);
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  // Big-endian 64-bit counter (JS can't do 64-bit ints directly, but TOTP
  // counters always fit in 32 bits for practical timescales.)
  view.setUint32(0, Math.floor(counter / 0x100000000));
  view.setUint32(4, counter >>> 0);

  const cryptoKey = await crypto.subtle.importKey(
    'raw', key, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
  );
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, buf));
  const offset = sig[sig.length - 1] & 0x0f;
  const code = ((sig[offset] & 0x7f) << 24) |
               ((sig[offset + 1] & 0xff) << 16) |
               ((sig[offset + 2] & 0xff) << 8)  |
               (sig[offset + 3] & 0xff);
  return String(code % 1000000).padStart(6, '0');
}

/**
 * Verify a 6-digit code against the secret. Allows +/- 1 step (30s window)
 * drift for clock skew.
 */
export async function verifyTotp(secretBase32, userCode) {
  if (!secretBase32 || !/^\d{6}$/.test(String(userCode).trim())) return false;
  const now = Math.floor(Date.now() / 1000);
  for (let offset = -1; offset <= 1; offset++) {
    const expected = await totpCode(secretBase32, now + offset * 30);
    if (expected === String(userCode).trim()) return true;
  }
  return false;
}

/**
 * Generate the otpauth://totp URL consumed by authenticator apps.
 * Issuer should be URL-safe; account is typically username@app.
 */
export function otpauthUrl({ secret, issuer, account }) {
  const enc = encodeURIComponent;
  return `otpauth://totp/${enc(issuer)}:${enc(account)}`
       + `?secret=${secret}&issuer=${enc(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

/** Lightweight QR code renderer using Google Chart API fallback URL.
 *  We return a URL that a <img> can load; the CSP must allow this host.
 *  Alternative: render as SVG locally — keeping simple for now. */
export function qrImageUrl(otpauth) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauth)}`;
}
