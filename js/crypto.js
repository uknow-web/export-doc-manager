// ============================================================================
// IndexedDB encryption helpers — KEK-DEK pattern for multi-user access.
//
// Design:
//   - DEK (Data Encryption Key): a random 256-bit AES-GCM key used to encrypt
//     the SQLite database bytes. One DEK per database.
//   - KEK (Key Encryption Key): derived from each user's password via PBKDF2.
//     Each user has an "envelope" — the DEK encrypted under their KEK.
//
// Why KEK-DEK:
//   * Changing one user's password only requires re-wrapping their envelope,
//     not re-encrypting the entire database.
//   * Multiple users share access to the same data without sharing a password.
//
// Algorithms:
//   - KEK derivation: PBKDF2-SHA-256, 250_000 iterations, 16-byte salt
//   - DEK generation: crypto.getRandomValues(32 bytes) imported as AES-GCM key
//   - Envelope / DB encryption: AES-GCM with 12-byte IV
// ============================================================================

const KEK_ITERATIONS = 250000;
const KEK_SALT_BYTES = 16;
const IV_BYTES = 12;

// ---- Base64 helpers -------------------------------------------------------
export function bytesToB64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
export function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---- KEK (password → AES-GCM key) -----------------------------------------
/**
 * Derive a KEK from a user's plaintext password.
 * @param {string} password
 * @param {Uint8Array} salt — 16 bytes (generate via generateSalt() when making a new envelope)
 * @returns {Promise<CryptoKey>} — AES-GCM key usable for wrapping DEKs
 */
export async function deriveKek(password, salt) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: KEK_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey'],
  );
}

export function generateSalt() {
  return crypto.getRandomValues(new Uint8Array(KEK_SALT_BYTES));
}

// ---- DEK (random data encryption key) -------------------------------------
/** Generate a fresh 256-bit AES-GCM key for database encryption. */
export async function generateDek() {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // extractable — we need to wrap it with the KEK
    ['encrypt', 'decrypt'],
  );
}

/** Re-import a raw 32-byte DEK (for loading from memory). */
export async function importDek(rawBytes) {
  return crypto.subtle.importKey(
    'raw', rawBytes, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt'],
  );
}

/** Export a DEK to raw bytes (used when storing in sessionStorage). */
export async function exportDek(dek) {
  const raw = await crypto.subtle.exportKey('raw', dek);
  return new Uint8Array(raw);
}

// ---- Envelope: DEK encrypted under a KEK -----------------------------------
/**
 * @returns {Promise<{salt: string, iv: string, ciphertext: string}>} — Base64 fields
 */
export async function wrapDek(dek, password) {
  const salt = generateSalt();
  const kek = await deriveKek(password, salt);
  const rawDek = await exportDek(dek);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, kek, rawDek));
  return {
    salt: bytesToB64(salt),
    iv: bytesToB64(iv),
    ciphertext: bytesToB64(ct),
  };
}

/**
 * @throws {Error} on wrong password (AES-GCM throws on tag mismatch)
 */
export async function unwrapDek(envelope, password) {
  const salt = b64ToBytes(envelope.salt);
  const iv = b64ToBytes(envelope.iv);
  const ct = b64ToBytes(envelope.ciphertext);
  const kek = await deriveKek(password, salt);
  const raw = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, kek, ct));
  return importDek(raw);
}

// ---- Data encryption (DEK wraps the DB bytes) -----------------------------
const DB_MAGIC = new TextEncoder().encode('EDM2'); // EDM v2 = encrypted in IndexedDB

/** Encrypt a Uint8Array (SQLite bytes) under the DEK. Returns storable bytes. */
export async function encryptWithDek(plainBytes, dek) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, dek, plainBytes));
  // Layout: MAGIC(4) | IV(12) | CIPHERTEXT
  const out = new Uint8Array(DB_MAGIC.length + iv.length + ct.length);
  out.set(DB_MAGIC, 0);
  out.set(iv, DB_MAGIC.length);
  out.set(ct, DB_MAGIC.length + iv.length);
  return out;
}

/** Detect EDM2 format and decrypt. Throws if magic doesn't match or key is wrong. */
export async function decryptWithDek(storedBytes, dek) {
  const magic = storedBytes.slice(0, 4);
  for (let i = 0; i < 4; i++) {
    if (magic[i] !== DB_MAGIC[i]) throw new Error('Not an encrypted DB');
  }
  const iv = storedBytes.slice(4, 4 + IV_BYTES);
  const ct = storedBytes.slice(4 + IV_BYTES);
  const pt = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, dek, ct));
  return pt;
}

export function isEncryptedDb(bytes) {
  if (!bytes || bytes.length < 4) return false;
  return bytes[0] === DB_MAGIC[0] && bytes[1] === DB_MAGIC[1]
      && bytes[2] === DB_MAGIC[2] && bytes[3] === DB_MAGIC[3];
}
