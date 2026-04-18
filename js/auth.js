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
  appendAuditLog,
} from './db.js';
import { verifyTotp } from './totp.js';

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
 */
export async function login(username, password) {
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
