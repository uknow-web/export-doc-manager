// ============================================================================
// Authentication module — PBKDF2 password hashing + role-based access.
// ============================================================================
// Password storage:
//   password_salt  = base64(16 random bytes)
//   password_hash  = base64(PBKDF2-SHA-256, 310_000 iterations, 32-byte output)
//
// Session:
//   sessionStorage is cleared on browser close — safer than localStorage for
//   a single-device login. We store only the user id; user row is refetched
//   on demand so role changes take effect on next action.
//
// Roles:
//   admin   — full access, user management, audit log, settings
//   editor  — case/party/model CRUD, book payments/costs, issue docs
//   viewer  — read only, amounts are masked
// ============================================================================

import {
  createUser, updateUser, getUser, getUserByUsername, usersCount,
  appendAuditLog, listUsers,
  getBootstrapMeta, saveBootstrapMeta,
  loadEncryptedDb, encryptExistingDb, setDek, clearDek, hasDek, getDek,
} from './db.js';
import { verifyTotp } from './totp.js';
import { generateDek, wrapDek, unwrapDek } from './crypto.js';

const SESSION_KEY = 'edm_session_v1';
const PBKDF2_ITERATIONS = 310000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

// ---- Brute force protection ------------------------------------------------
const MAX_FAILED_ATTEMPTS = 5;    // 5 failures → account lock
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// ---- Session timeout ------------------------------------------------------
const SESSION_IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000;     // 8 hours of inactivity
const SESSION_ABSOLUTE_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hour absolute

// ---- Progressive delay on login attempts (anti brute force) ---------------
// Per failed attempt, add cumulative delay that applies before the next
// attempt completes. This adds a speed bump even for online attackers.
function attemptDelay(failedCount) {
  // 0=>0ms, 1=>500ms, 2=>1s, 3=>2s, 4=>5s, 5=>10s, 6+=>15s
  const table = [0, 500, 1000, 2000, 5000, 10000];
  return table[Math.min(failedCount, table.length - 1)] || 15000;
}

async function sleep(ms) {
  if (!ms) return;
  await new Promise(r => setTimeout(r, ms));
}

// ---- Password hashing -----------------------------------------------------

function b64encode(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function b64decode(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveHash(password, saltBytes) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']
  );
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial, HASH_BYTES * 8
  );
  return new Uint8Array(derived);
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await deriveHash(password, salt);
  return { password_salt: b64encode(salt), password_hash: b64encode(hash) };
}

export async function verifyPassword(password, saltB64, hashB64) {
  try {
    const salt = b64decode(saltB64);
    const expected = b64decode(hashB64);
    const derived = await deriveHash(password, salt);
    if (derived.length !== expected.length) return false;
    // Constant-time compare
    let diff = 0;
    for (let i = 0; i < derived.length; i++) diff |= derived[i] ^ expected[i];
    return diff === 0;
  } catch {
    return false;
  }
}

// ---- Session --------------------------------------------------------------

export function getSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s?.user_id) return null;
    return s;
  } catch {
    return null;
  }
}

export function setSession(session) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

export function getCurrentUser() {
  const s = getSession();
  if (!s) return null;
  const u = getUser(s.user_id);
  if (!u || !u.is_active) return null;
  return u;
}

// ---- Login / Logout -------------------------------------------------------

/**
 * Login. Returns one of:
 *   { ok: true, user }                        — logged in successfully
 *   { ok: false, reason }                      — login failed
 *   { ok: false, need_totp: true, user_id }    — password OK, TOTP required
 *   { ok: false, locked: true, retryAt }       — account locked, cannot attempt
 *   { ok: false, needs_admin_reset: true }     — user exists but has no DEK envelope
 */
export async function login(username, password) {
  const meta = await getBootstrapMeta();
  const encryptionEnabled = !!(meta && meta.encryption_enabled);

  // Phase 1: Pre-DB authentication (when DB is encrypted, the users table is
  // inaccessible until we unwrap the DEK). We verify against bootstrap_meta
  // first, then load & decrypt DB, then do the full user-row checks.
  if (encryptionEnabled) {
    const bUser = meta.users.find(u => u.username === username);
    if (!bUser) {
      // Dummy work to mask user-existence timing
      await sleep(attemptDelay(1) + 200);
      await appendAuditLog({
        action: 'login_failed', actor_username: username,
        summary: `ユーザー不明: ${username}`,
      });
      return { ok: false, reason: 'ユーザー名またはパスワードが違います' };
    }
    const okPwd = await verifyPassword(password, bUser.password_salt, bUser.password_hash);
    if (!okPwd) {
      await sleep(attemptDelay(1));
      await appendAuditLog({
        action: 'login_failed', actor_username: username,
        summary: 'パスワード不一致（暗号化DB）',
      });
      return { ok: false, reason: 'ユーザー名またはパスワードが違います' };
    }
    if (!bUser.dek_envelope) {
      await appendAuditLog({
        action: 'login_failed', actor_username: username,
        summary: '暗号化エンベロープ未設定 → 管理者による再発行が必要',
      });
      return { ok: false, needs_admin_reset: true,
        reason: '暗号化設定がこのアカウントに適用されていません。管理者にパスワードリセットを依頼してください。' };
    }
    // Unwrap DEK with the user's password
    let dek;
    try {
      dek = await unwrapDek(bUser.dek_envelope, password);
    } catch {
      // Should not happen if password_hash verify succeeded, but just in case
      return { ok: false, reason: 'DEKの復号に失敗しました' };
    }
    // Decrypt DB and load into sql.js
    try {
      await loadEncryptedDb(dek);
    } catch (e) {
      return { ok: false, reason: 'DBの復号に失敗しました: ' + e.message };
    }
    // Now users table is accessible — continue with full user-row checks
  }

  const user = getUserByUsername(username);

  // Deliberately dummy-hash when user not found to prevent user-enumeration
  // via timing; then return after delay.
  if (!user) {
    await verifyPassword('nope', 'AAAAAAAAAAAAAAAAAAAAAA==', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
    await sleep(attemptDelay(1));
    await appendAuditLog({
      action: 'login_failed', actor_username: username,
      summary: `ユーザー不明: ${username}`,
    });
    return { ok: false, reason: 'ユーザー名またはパスワードが違います' };
  }
  if (!user.is_active) {
    await appendAuditLog({
      action: 'login_failed', actor_user_id: user.id, actor_username: user.username,
      summary: '無効化されたアカウント',
    });
    return { ok: false, reason: 'このアカウントは無効化されています' };
  }

  // Check lockout
  if (user.lock_until) {
    const until = new Date(user.lock_until).getTime();
    if (Date.now() < until) {
      const remainMin = Math.ceil((until - Date.now()) / 60000);
      await appendAuditLog({
        action: 'login_locked', actor_user_id: user.id, actor_username: user.username,
        summary: `ロック中のアクセス試行（あと約${remainMin}分）`,
      });
      return { ok: false, locked: true, reason: `アカウントがロックされています。${remainMin}分後に再試行してください` };
    }
  }

  // Progressive delay — scales with current failed_login_count
  await sleep(attemptDelay(user.failed_login_count || 0));

  const ok = await verifyPassword(password, user.password_salt, user.password_hash);
  if (!ok) {
    const newCount = (user.failed_login_count || 0) + 1;
    const patch = { failed_login_count: newCount };
    if (newCount >= MAX_FAILED_ATTEMPTS) {
      patch.lock_until = new Date(Date.now() + LOCK_DURATION_MS).toISOString();
      patch.failed_login_count = 0; // reset counter when locking
    }
    await updateUser(user.id, patch);
    await appendAuditLog({
      action: 'login_failed', actor_user_id: user.id, actor_username: user.username,
      summary: newCount >= MAX_FAILED_ATTEMPTS
        ? `連続失敗${MAX_FAILED_ATTEMPTS}回到達 → アカウントをロック`
        : `パスワード不一致（${newCount}/${MAX_FAILED_ATTEMPTS}回目）`,
    });
    if (patch.lock_until) {
      return { ok: false, locked: true, reason: `連続失敗のためアカウントをロックしました。15分後に再試行してください` };
    }
    return { ok: false, reason: 'ユーザー名またはパスワードが違います' };
  }

  // Password is correct — but if TOTP enabled, require second factor
  if (user.totp_enabled) {
    // Keep attempts counter so it still matters, but we don't reset yet.
    return { ok: false, need_totp: true, user_id: user.id };
  }

  // Password is correct. If encryption is not yet enabled (fresh install or
  // legacy deploy), and this user is an admin, auto-enable encryption now.
  if (!encryptionEnabled && user.role === 'admin') {
    try {
      await enableEncryptionForAdmin(user, password);
    } catch (e) {
      console.error('Failed to enable encryption:', e);
      // Don't fail the login — just log and continue without encryption.
      await appendAuditLog({
        action: 'encryption_enable_failed',
        actor_user_id: user.id, actor_username: user.username,
        summary: `暗号化有効化エラー: ${e.message}`,
      });
    }
  }

  // Success — reset lockout/failed counters, record login
  await updateUser(user.id, {
    last_login_at: new Date().toISOString(),
    failed_login_count: 0,
    lock_until: null,
  });
  setSession({
    user_id: user.id, username: user.username, role: user.role,
    loggedInAt: Date.now(), lastActivityAt: Date.now(),
  });
  await appendAuditLog({
    action: 'login', actor_user_id: user.id, actor_username: user.username,
    summary: `ログイン（ロール: ${user.role}）`,
  });
  return { ok: true, user };
}

/**
 * Called on first admin login when encryption hasn't been enabled yet.
 * Generates a DEK, wraps it with the admin's password, mirrors user hashes
 * into bootstrap_meta, encrypts the current DB and persists it.
 *
 * Non-admin users are added to bootstrap_meta with `dek_envelope: null` and
 * will need their password reset by an admin before they can log in again.
 */
async function enableEncryptionForAdmin(adminUser, adminPassword) {
  const dek = await generateDek();
  const adminEnvelope = await wrapDek(dek, adminPassword);

  const allUsers = listUsers(); // id, username, role, is_active, etc.
  const mirrorEntries = [];
  for (const u of allUsers) {
    const full = getUser(u.id);
    if (u.id === adminUser.id) {
      mirrorEntries.push({
        username: u.username,
        password_salt: full.password_salt,
        password_hash: full.password_hash,
        dek_envelope: adminEnvelope,
      });
    } else {
      mirrorEntries.push({
        username: u.username,
        password_salt: full.password_salt,
        password_hash: full.password_hash,
        dek_envelope: null, // needs admin reset
      });
    }
  }
  const meta = {
    version: 1,
    encryption_enabled: true,
    enabled_at: new Date().toISOString(),
    users: mirrorEntries,
  };
  await saveBootstrapMeta(meta);
  await encryptExistingDb(dek);
  setDek(dek);

  await appendAuditLog({
    actor_user_id: adminUser.id, actor_username: adminUser.username,
    action: 'encryption_enabled',
    summary: `DBを暗号化しました。${mirrorEntries.length - 1}名の他ユーザーは管理者によるパスワードリセットが必要`,
  });
}

/**
 * Sync a single user's row in bootstrap_meta — used when creating a user,
 * changing their password, or rewrapping their envelope. Caller must have
 * a valid DEK available (via hasDek()) when creating a fresh envelope.
 */
export async function syncBootstrapMetaForUser(user, newPassword, dekIfAvailable) {
  const meta = (await getBootstrapMeta()) || { version: 1, encryption_enabled: false, users: [] };
  if (!meta.encryption_enabled) return; // Nothing to do when encryption is off

  let envelope = null;
  if (newPassword && dekIfAvailable) {
    envelope = await wrapDek(dekIfAvailable, newPassword);
  }

  // Find full user row for current hash
  const row = getUser(user.id);

  const idx = meta.users.findIndex(u => u.username === user.username);
  const entry = {
    username: user.username,
    password_salt: row.password_salt,
    password_hash: row.password_hash,
    dek_envelope: envelope !== null ? envelope : (idx >= 0 ? meta.users[idx].dek_envelope : null),
  };
  if (idx >= 0) meta.users[idx] = entry; else meta.users.push(entry);
  await saveBootstrapMeta(meta);
}

export async function removeFromBootstrapMeta(username) {
  const meta = await getBootstrapMeta();
  if (!meta) return;
  meta.users = meta.users.filter(u => u.username !== username);
  await saveBootstrapMeta(meta);
}


/**
 * Second-factor (TOTP) verification called after login() returns need_totp.
 */
export async function verifySecondFactor(userId, totpCode) {
  const user = getUser(userId);
  if (!user) return { ok: false, reason: 'セッションが無効です' };
  if (!user.totp_enabled || !user.totp_secret) {
    return { ok: false, reason: '2FAが設定されていません' };
  }
  const ok = await verifyTotp(user.totp_secret, totpCode);
  if (!ok) {
    await appendAuditLog({
      action: 'totp_failed', actor_user_id: user.id, actor_username: user.username,
      summary: 'TOTPコード不一致',
    });
    return { ok: false, reason: '認証コードが正しくありません' };
  }
  await updateUser(user.id, {
    last_login_at: new Date().toISOString(),
    failed_login_count: 0,
    lock_until: null,
  });
  setSession({
    user_id: user.id, username: user.username, role: user.role,
    loggedInAt: Date.now(), lastActivityAt: Date.now(),
  });
  await appendAuditLog({
    action: 'login', actor_user_id: user.id, actor_username: user.username,
    summary: `ログイン成功（2FA、ロール: ${user.role}）`,
  });
  return { ok: true, user };
}

// ---- Session timeout management ------------------------------------------

/**
 * Returns true if the session is still valid; updates lastActivityAt if so.
 * Called on every user-initiated action.
 */
export function touchSession() {
  const s = getSession();
  if (!s) return false;
  const now = Date.now();
  const idleElapsed = now - (s.lastActivityAt || s.loggedInAt);
  const absoluteElapsed = now - (s.loggedInAt || now);
  if (idleElapsed > SESSION_IDLE_TIMEOUT_MS || absoluteElapsed > SESSION_ABSOLUTE_TIMEOUT_MS) {
    clearSession();
    return false;
  }
  s.lastActivityAt = now;
  setSession(s);
  return true;
}

export async function logout() {
  const u = getCurrentUser();
  if (u) {
    await appendAuditLog({
      action: 'logout', actor_user_id: u.id, actor_username: u.username,
      summary: 'ログアウト',
    });
  }
  clearSession();
  clearDek();
}

// ---- First-time setup -----------------------------------------------------

export function needsInitialSetup() {
  return usersCount() === 0;
}

export async function createInitialAdmin(username, password, displayName) {
  const { password_salt, password_hash } = await hashPassword(password);
  const id = await createUser({
    username,
    display_name: displayName || username,
    password_hash,
    password_salt,
    role: 'admin',
    is_active: 1,
  });
  await appendAuditLog({
    actor_user_id: id, actor_username: username,
    action: 'user_created', target_type: 'user', target_id: id,
    summary: `初期adminアカウント作成: ${username}`,
  });
  return id;
}

export async function changePassword(userId, newPassword) {
  const { password_salt, password_hash } = await hashPassword(newPassword);
  await updateUser(userId, {
    password_salt, password_hash,
    password_changed_at: new Date().toISOString(),
  });
  // If encryption is enabled, re-wrap this user's DEK envelope with the new password
  const meta = await getBootstrapMeta();
  if (meta && meta.encryption_enabled) {
    const user = getUser(userId);
    const dek = getDek();
    if (dek && user) {
      await syncBootstrapMetaForUser(user, newPassword, dek);
    } else {
      // DEK not in memory — sync only the password hash (envelope stays)
      if (user) await syncBootstrapMetaForUser(user, null, null);
    }
  }
  await appendAuditLog({
    action: 'password_changed', actor_user_id: userId,
    target_type: 'user', target_id: userId,
    summary: `パスワード変更`,
  });
}

// ---- 2FA management --------------------------------------------------------

export async function enableTotp(userId, secret) {
  await updateUser(userId, { totp_secret: secret, totp_enabled: 1 });
  await appendAuditLog({
    action: 'totp_enabled', actor_user_id: userId,
    target_type: 'user', target_id: userId,
    summary: '2FA（TOTP）を有効化',
  });
}

export async function disableTotp(userId) {
  await updateUser(userId, { totp_secret: null, totp_enabled: 0 });
  await appendAuditLog({
    action: 'totp_disabled', actor_user_id: userId,
    target_type: 'user', target_id: userId,
    summary: '2FA（TOTP）を無効化',
  });
}

// ---- Admin: unlock a user's account ---------------------------------------

export async function unlockUser(userId) {
  await updateUser(userId, { failed_login_count: 0, lock_until: null });
  await appendAuditLog({
    action: 'user_unlocked', actor_user_id: userId,
    target_type: 'user', target_id: userId,
    summary: 'アカウントロック解除',
  });
}

// ---- Role helpers ---------------------------------------------------------

export const ROLES = [
  { key: 'admin',  label: '管理者', desc: 'すべての操作が可能（ユーザー管理・監査ログ含む）' },
  { key: 'editor', label: '編集者', desc: '案件・書類の編集・発行が可能（ユーザー管理は不可）' },
  { key: 'viewer', label: '閲覧者', desc: '読み取り専用。金額・入金はマスキング表示' },
];

export function roleLabel(key) {
  return ROLES.find(r => r.key === key)?.label || key;
}

export function hasRole(user, ...allowed) {
  if (!user) return false;
  return allowed.includes(user.role);
}

export function canEdit(user) { return hasRole(user, 'admin', 'editor'); }
export function canManageUsers(user) { return hasRole(user, 'admin'); }
export function canViewAudit(user)   { return hasRole(user, 'admin'); }
export function canSeeAmounts(user)  { return hasRole(user, 'admin', 'editor'); }
