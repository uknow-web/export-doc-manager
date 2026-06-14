// ============================================================================
// /api/invite — Buyer / AP Holder をポータルに招待する（管理者専用）
// ----------------------------------------------------------------------------
// 流れ:
//   1. クライアントは admin の Supabase アクセストークン(JWT)を Bearer で送る
//   2. このサーバー関数が anon キーでトークンを検証し、profiles.role=admin を確認
//   3. service_role キーで auth.admin.inviteUserByEmail を実行（招待メール送信）
//   4. 作成されたユーザーの profiles に role(buyer|ap_holder) と party_id を設定
//
// service_role キーはサーバー側 env (SUPABASE_SERVICE_ROLE_KEY) にのみ存在し、
// ブラウザには一切渡らない。
//
// 必要な Vercel 環境変数:
//   SUPABASE_URL                  例: https://xxxx.supabase.co
//   SUPABASE_ANON_KEY             公開anonキー（JWT検証用）
//   SUPABASE_SERVICE_ROLE_KEY     service_role キー（招待・profiles更新用）
//   PORTAL_REDIRECT_URL (任意)    招待リンクの着地先。未設定なら リクエスト元 + /set-password
// ============================================================================

import {
  allowMethods, validateOrigin, applyCors, rateLimit,
  clientIp, applyResponseHeaders,
} from './_lib/security.js';

const ALLOWED_PORTAL_ROLES = ['buyer', 'ap_holder'];

async function sb(path, { method = 'GET', token, body, useServiceRole = false } = {}) {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apikey = useServiceRole ? svc : anon;
  const auth = token ? `Bearer ${token}` : `Bearer ${apikey}`;
  const res = await fetch(url + path, {
    method,
    headers: {
      'apikey': apikey,
      'Authorization': auth,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  return { status: res.status, ok: res.ok, json };
}

export default async function handler(req, res) {
  applyResponseHeaders(res);
  applyCors(req, res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (!allowMethods(req, res, ['POST'])) return;
  if (!validateOrigin(req)) { res.status(403).json({ error: 'Origin not allowed' }); return; }

  // env チェック
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    res.status(503).json({ error: 'サーバー側のSupabase環境変数が未設定です（SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY）' });
    return;
  }

  // レート制限: 招待は 1分20件/IP
  const ip = clientIp(req);
  const rl = rateLimit(`invite:${ip}`, 20, 60_000);
  if (!rl.ok) {
    res.status(429).setHeader('Retry-After', String(rl.retryAfter));
    res.json({ error: `送信が多すぎます。${rl.retryAfter}秒後に再試行してください` });
    return;
  }

  // 1. 管理者トークンの検証
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) { res.status(401).json({ error: '認証トークンがありません' }); return; }

  const me = await sb('/auth/v1/user', { token });
  if (!me.ok || !me.json?.id) {
    res.status(401).json({ error: 'トークンが無効です。再ログインしてください' });
    return;
  }
  const callerUid = me.json.id;

  // 呼び出し元が admin か確認（service_role で profiles 参照、RLSバイパス）
  const prof = await sb(`/rest/v1/profiles?id=eq.${callerUid}&select=role,is_active`, { useServiceRole: true });
  const callerProfile = Array.isArray(prof.json) ? prof.json[0] : null;
  if (!callerProfile || !callerProfile.is_active || callerProfile.role !== 'admin') {
    res.status(403).json({ error: '招待を送れるのは管理者のみです' });
    return;
  }

  // 2. リクエストボディ
  const body = req.body || {};
  const email = String(body.email || '').trim().toLowerCase();
  const role = String(body.role || '').trim();
  const partyId = body.party_id != null ? Number(body.party_id) : null;
  const displayName = body.display_name ? String(body.display_name).trim() : null;

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!EMAIL_RE.test(email)) { res.status(400).json({ error: 'メールアドレスが不正です' }); return; }
  if (!ALLOWED_PORTAL_ROLES.includes(role)) {
    res.status(400).json({ error: 'role は buyer または ap_holder のみ指定できます' });
    return;
  }
  if (!partyId) { res.status(400).json({ error: 'party_id が必要です' }); return; }

  // 3. リダイレクト先（招待リンクの着地点）
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const redirectTo = process.env.PORTAL_REDIRECT_URL || `${proto}://${host}/set-password`;

  // 4. 招待送信（service_role）
  const invite = await sb('/auth/v1/invite', {
    method: 'POST',
    useServiceRole: true,
    body: {
      email,
      data: { display_name: displayName || email, invited_role: role, invited_party_id: partyId },
      redirect_to: redirectTo,
    },
  });

  let invitedUserId = invite.json?.id || invite.json?.user?.id || null;

  // 既に登録済みのメールは invite が 422 を返す → 既存ユーザーのprofilesを更新する
  if (!invite.ok) {
    const msg = invite.json?.msg || invite.json?.error_description || invite.json?.message || '';
    const alreadyExists = invite.status === 422 || /already|registered|exists/i.test(msg);
    if (alreadyExists) {
      // 既存ユーザーのIDを取得（admin API のユーザー一覧から email 一致を探す）
      const list = await sb(`/auth/v1/admin/users?per_page=200`, { useServiceRole: true });
      const users = list.json?.users || [];
      const found = users.find(u => (u.email || '').toLowerCase() === email);
      if (!found) {
        res.status(409).json({ error: 'このメールは既に登録済みですが、ユーザー情報を取得できませんでした' });
        return;
      }
      invitedUserId = found.id;
    } else {
      res.status(invite.status || 500).json({ error: '招待送信に失敗: ' + (msg || JSON.stringify(invite.json)) });
      return;
    }
  }

  // 5. profiles に role / party_id / display_name を設定（service_role で upsert）
  if (invitedUserId) {
    const patch = {
      id: invitedUserId,
      role,
      party_id: partyId,
      display_name: displayName || email,
      username: email,
      is_active: true,
    };
    const up = await sb('/rest/v1/profiles?on_conflict=id', {
      method: 'POST',
      useServiceRole: true,
      body: patch,
    });
    // Prefer resolution: merge-duplicates
    if (!up.ok) {
      // PATCH にフォールバック
      await sb(`/rest/v1/profiles?id=eq.${invitedUserId}`, {
        method: 'PATCH',
        useServiceRole: true,
        body: { role, party_id: partyId, display_name: displayName || email, username: email, is_active: true },
      });
    }
  }

  res.status(200).json({
    ok: true,
    user_id: invitedUserId,
    reinvited: !invite.ok,
    message: invite.ok ? '招待メールを送信しました' : '既存ユーザーにポータル権限を付与しました',
  });
}
