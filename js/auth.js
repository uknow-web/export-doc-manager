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

const SESSION_KEY = 'edm_session_v1';
const PBKDF2_ITERATIONS = 310000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

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

export async function login(username, password) {
  const user = getUserByUsername(username);
  if (!user) {
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
  const ok = await verifyPassword(password, user.password_salt, user.password_hash);
  if (!ok) {
    await appendAuditLog({
      action: 'login_failed', actor_user_id: user.id, actor_username: user.username,
      summary: 'パスワード不一致',
    });
    return { ok: false, reason: 'ユーザー名またはパスワードが違います' };
  }
  await updateUser(user.id, { last_login_at: new Date().toISOString() });
  setSession({ user_id: user.id, username: user.username, role: user.role, loggedInAt: Date.now() });
  await appendAuditLog({
    action: 'login', actor_user_id: user.id, actor_username: user.username,
    summary: `ログイン（ロール: ${user.role}）`,
  });
  return { ok: true, user };
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
  await updateUser(userId, { password_salt, password_hash });
  await appendAuditLog({
    action: 'password_changed', actor_user_id: userId,
    target_type: 'user', target_id: userId,
    summary: `パスワード変更`,
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
