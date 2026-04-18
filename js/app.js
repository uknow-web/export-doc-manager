// ============================================================================
// Application controller — wires UI tabs, forms, and document preview.
// ============================================================================

import {
  initDB, persist,
  listParties, saveParty, deleteParty, getParty,
  listVehicleModels, saveVehicleModel, deleteVehicleModel, getVehicleModel,
  listCases, saveCase, deleteCase, getCase, casesSummary,
  listAllTags, toggleFavorite,
  saveCaseDoc, getCaseDoc, listCaseDocs,
  replaceCaseEvents, listCaseEvents,
  savePayment, deletePayment, listPayments, paymentsTotal,
  saveCost, deleteCost, listCosts, costsTotal,
  savePhoto, deletePhoto, listPhotos, updatePhotoCaption,
  logDocIssued, listDocIssueLog,
  getSetting, setSetting, nextSequenceFromPattern,
  query, run,
  exportDB, importDB,
} from './db.js';
import { formToObject, fillForm, escapeHtml } from './util.js';
import {
  PROGRESS_STATUSES, PAYMENT_STATUSES,
  progressLabel, paymentLabel, progressColor, paymentColor,
  suggestProgressFromDocs,
} from './status.js';
import { renderSalesConfirmation } from './docs/sales-confirmation.js';
import { renderInvoice } from './docs/invoice.js';
import { renderShippingInstruction } from './docs/shipping-instruction.js';
import { renderExportCertificate } from './docs/export-certificate.js';
import { renderPreservedRecord } from './docs/preserved-record.js';
import { importCertFile } from './cert-import.js';
import { FIELD_LABELS as CERT_FIELD_LABELS } from './cert-parser.js';
import { HELP_SECTIONS } from './help-content.js';
import {
  needsInitialSetup, createInitialAdmin,
  login as authLogin, logout as authLogout,
  verifySecondFactor,
  getCurrentUser, getSession, touchSession,
  hashPassword, verifyPassword, changePassword,
  enableTotp, disableTotp, unlockUser,
  syncBootstrapMetaForUser, removeFromBootstrapMeta,
  canEdit, canManageUsers, canViewAudit, canSeeAmounts,
  ROLES, roleLabel,
} from './auth.js';
import { getDek } from './db.js';
import { generateTotpSecret, verifyTotp, otpauthUrl, qrImageUrl } from './totp.js';
import {
  createUser as dbCreateUser, updateUser as dbUpdateUser,
  deleteUser as dbDeleteUser, listUsers, getUser as dbGetUser,
  getUserByUsername, appendAuditLog, listAuditLog,
} from './db.js';

// Supported document types. Only 'sales_confirmation' is implemented now.
const DOC_TYPES = [
  { key: 'sales_confirmation',   label: 'Sales Confirmation',   termsDefault: 'CASH TERM',   implemented: true },
  { key: 'invoice',              label: 'Invoice',              termsDefault: 'CREDIT TERM', implemented: true },
  { key: 'shipping_instruction', label: 'Shipping Instruction', termsDefault: '',            implemented: true },
  { key: 'export_certificate',   label: 'Export Certificate',   termsDefault: '',            implemented: true },
  { key: 'preserved_record',     label: 'Preserved Record',     termsDefault: '',            implemented: true },
];

// ---- Boot -----------------------------------------------------------------
(async function boot() {
  await initDB();
  // Authentication gate — must come before any UI setup that queries user
  // context. showAuthOverlay() resolves when the user is logged in.
  await requireAuthentication();
  applyRoleToBody();
  setupTabs();
  setupHeader();
  setupParties();
  setupVehicleModels();
  setupCases();
  setupEditor();
  setupPreview();
  setupDashboard();
  setupReceivables();
  setupCsvMenu();
  setupCertImport();
  setupSettings();
  setupUserManagement();
  setupAuditViewer();
  setupUserMenu();
  setupPasswordChange();
  setup2FA();
  setupCryptoModal();
  startSessionMonitor();
  setupHelp();
  setupDetailView();
  setupValidation();
  setupCommandPalette();
  setupKeyboardShortcuts();
  startReminderScheduler();
  setupAuthRouting();
  renderCases();
  renderParties();
  renderVehicleModels();
  refreshPreviewOptions();
})();

// ============================================================================
// Authentication gate + current user helpers
// ============================================================================

// Wire the "reset all data" button — once per boot, always available on the
// auth overlay. Wipes IndexedDB completely and reloads.
function setupResetAllData() {
  const btn = document.getElementById('btn-reset-all-data');
  if (!btn || btn.dataset.wired) return;
  btn.dataset.wired = 'true';
  btn.addEventListener('click', async () => {
    const ok1 = confirm('⚠️ 全てのデータ（案件・ユーザー・設定・写真）を削除します。本当にリセットしますか？');
    if (!ok1) return;
    const ok2 = confirm('この操作は取り消せません。もう一度確認します — 本当にすべて削除しますか？');
    if (!ok2) return;
    try {
      // Clear session
      sessionStorage.clear();
      // Delete the entire IndexedDB database
      await new Promise((resolve, reject) => {
        const req = indexedDB.deleteDatabase('export-doc-mgr');
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        req.onblocked = () => {
          // Close other tabs with this app open
          alert('他のタブでこのアプリが開いている可能性があります。すべてのタブを閉じてから再試行してください。');
          reject(new Error('IndexedDB delete blocked'));
        };
      });
      alert('リセット完了。ページを再読み込みします。');
      window.location.href = '/setup';
    } catch (e) {
      alert('リセット失敗: ' + e.message + '\nDevToolsから手動で削除してください。');
    }
  });
}

async function requireAuthentication() {
  const overlay = document.getElementById('auth-overlay');
  setupResetAllData();

  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  const returnTo = params.get('return') || '/';

  // IMPORTANT: check bootstrap_meta FIRST. When encryption is enabled, the
  // in-memory DB is an empty shell until the user logs in and decrypts it —
  // so usersCount() would incorrectly return 0 and trigger initial setup.
  const { getBootstrapMeta, hasDek } = await import('./db.js');
  const meta = await getBootstrapMeta();
  const hasBootstrapUsers = !!(meta && Array.isArray(meta.users) && meta.users.length > 0);

  // Fresh install only when there is no bootstrap meta AND the plain DB has
  // no users. Legacy plain DBs fall through to the login branch below.
  const freshInstall = !hasBootstrapUsers && needsInitialSetup();
  if (freshInstall) {
    if (path !== '/setup') {
      history.replaceState({}, '', '/setup');
    }
    await runInitialSetup(overlay);
    history.replaceState({}, '', returnTo && returnTo !== '/login' ? returnTo : '/');
    return;
  }

  // Already installed. Even if session exists, if DB is encrypted we no
  // longer have the DEK in memory (page reloaded). Force re-login.
  if (getCurrentUser() && (!meta || !meta.encryption_enabled || hasDek())) {
    overlay.classList.add('hidden');
    if (path === '/login' || path === '/logout') {
      history.replaceState({}, '', returnTo && returnTo !== '/login' ? returnTo : '/');
    }
    return;
  }

  if (path !== '/login') {
    const q = (path !== '/' && path !== '/logout') ? `?return=${encodeURIComponent(path)}` : '';
    history.replaceState({}, '', '/login' + q);
  }
  await runLogin(overlay);
  const finalDestination = returnTo && returnTo !== '/login' && returnTo !== '/logout'
    ? returnTo : '/';
  history.replaceState({}, '', finalDestination);
}

function runInitialSetup(overlay) {
  return new Promise((resolve) => {
    overlay.classList.remove('hidden');
    document.getElementById('auth-subtitle').textContent = '初回セットアップ';
    document.getElementById('auth-login-form').classList.add('hidden');
    document.getElementById('auth-setup-form').classList.remove('hidden');
    const form = document.getElementById('auth-setup-form');
    const err = document.getElementById('auth-setup-error');
    form.onsubmit = async (e) => {
      e.preventDefault();
      err.classList.add('hidden');
      const d = new FormData(form);
      const username = String(d.get('username')).trim();
      const displayName = String(d.get('display_name') || '').trim();
      const p1 = String(d.get('password'));
      const p2 = String(d.get('password2'));
      if (p1 !== p2) {
        err.textContent = 'パスワードが一致しません';
        err.classList.remove('hidden');
        return;
      }
      if (p1.length < 8) {
        err.textContent = 'パスワードは8文字以上にしてください';
        err.classList.remove('hidden');
        return;
      }
      try {
        const id = await createInitialAdmin(username, p1, displayName);
        const result = await authLogin(username, p1);
        if (!result.ok) throw new Error(result.reason);
        overlay.classList.add('hidden');
        resolve();
      } catch (e2) {
        err.textContent = 'セットアップエラー: ' + e2.message;
        err.classList.remove('hidden');
      }
    };
  });
}

function runLogin(overlay) {
  return new Promise((resolve) => {
    overlay.classList.remove('hidden');
    document.getElementById('auth-subtitle').textContent = 'ログインしてください';
    const loginForm = document.getElementById('auth-login-form');
    const totpForm  = document.getElementById('auth-totp-form');
    loginForm.classList.remove('hidden');
    totpForm.classList.add('hidden');
    document.getElementById('auth-setup-form').classList.add('hidden');
    const err = document.getElementById('auth-error');
    const totpErr = document.getElementById('auth-totp-error');

    let pendingUserId = null;

    loginForm.onsubmit = async (e) => {
      e.preventDefault();
      err.classList.add('hidden');
      const d = new FormData(loginForm);
      const username = String(d.get('username')).trim();
      const password = String(d.get('password'));
      const result = await authLogin(username, password);
      if (result.ok) {
        overlay.classList.add('hidden');
        loginForm.reset();
        resolve();
        return;
      }
      if (result.need_totp) {
        pendingUserId = result.user_id;
        loginForm.classList.add('hidden');
        totpForm.classList.remove('hidden');
        totpForm.elements.totp_code.value = '';
        totpForm.elements.totp_code.focus();
        return;
      }
      if (result.needs_admin_reset) {
        err.innerHTML = '🔐 このアカウントはDB暗号化に対応していません。<br>管理者に「ユーザー管理」からパスワードをリセットしてもらってください。';
        err.classList.remove('hidden');
        return;
      }
      err.textContent = result.reason || 'ログインに失敗しました';
      err.classList.remove('hidden');
    };

    totpForm.onsubmit = async (e) => {
      e.preventDefault();
      totpErr.classList.add('hidden');
      if (!pendingUserId) return;
      const code = String(totpForm.elements.totp_code.value).trim();
      const result = await verifySecondFactor(pendingUserId, code);
      if (result.ok) {
        overlay.classList.add('hidden');
        loginForm.reset();
        totpForm.reset();
        pendingUserId = null;
        resolve();
        return;
      }
      totpErr.textContent = result.reason || '認証失敗';
      totpErr.classList.remove('hidden');
    };

    document.getElementById('btn-totp-back').onclick = () => {
      pendingUserId = null;
      totpForm.classList.add('hidden');
      loginForm.classList.remove('hidden');
      loginForm.elements.password.value = '';
      loginForm.elements.username.focus();
    };
  });
}

function currentRole() {
  const u = getCurrentUser();
  return u?.role || 'viewer';
}

// Handle browser back/forward — if user navigates to /login while logged in,
// bounce them back to /; if to / while logged out, prompt login.
function setupAuthRouting() {
  window.addEventListener('popstate', () => {
    const loggedIn = !!getCurrentUser();
    const path = window.location.pathname;
    if (path === '/login' && loggedIn) {
      history.replaceState({}, '', '/');
    } else if ((path === '/' || path === '/logout') && !loggedIn) {
      window.location.href = '/login';
    }
  });
}

function applyRoleToBody() {
  document.body.dataset.role = currentRole();
  const u = getCurrentUser();
  if (u) {
    document.getElementById('current-user-label').textContent = u.display_name || u.username;
    const roleBadge = document.getElementById('current-user-role');
    roleBadge.textContent = roleLabel(u.role);
    roleBadge.className = 'badge badge--' + (
      u.role === 'admin' ? 'indigo' : u.role === 'editor' ? 'blue' : 'gray'
    );
    document.getElementById('user-menu-name').textContent = u.display_name || u.username;
    document.getElementById('user-menu-username').textContent = `@${u.username}`;
  }
}

// Require edit permission for an action; show toast and return false if not allowed.
function requireEdit() {
  const u = getCurrentUser();
  if (!canEdit(u)) {
    toast('この操作には編集権限が必要です', 'error');
    return false;
  }
  return true;
}

// ---- Tabs -----------------------------------------------------------------
function setupTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}
function switchTab(name) {
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.id === `tab-${name}`));
  if (name === 'cases')       renderCases();
  if (name === 'parties')     renderParties();
  if (name === 'models')      renderVehicleModels();
  if (name === 'preview')     refreshPreviewOptions();
  if (name === 'dashboard')   renderDashboard();
  if (name === 'receivables') renderReceivables();
  if (name === 'settings')    renderSettings();
  if (name === 'editor')      { populateSellerSelect(); populateVehicleModelSelect(); populateNotifyPartySelect(); }
}

// ---- Header: DB export/import --------------------------------------------
function setupHeader() {
  document.getElementById('btn-export-db').addEventListener('click', async () => {
    if (!canManageUsers(getCurrentUser())) { toast('DBエクスポートは管理者のみ', 'error'); return; }
    const choice = confirm(
      'DBをエクスポートします。\n\n' +
      'OK = パスワード保護付きでエクスポート（推奨）\n' +
      'キャンセル = 暗号化なしで平文エクスポート'
    );
    const bytes = exportDB();
    let finalBytes, ext;
    if (choice) {
      const password = await promptEncryptionPassword({
        title: 'エクスポート用パスワード設定',
        intro: 'このパスワードでDBを暗号化します。復元時に必要になるので忘れないでください。',
        confirm: true,
      });
      if (!password) return;
      finalBytes = await encryptBytes(bytes, password);
      ext = 'edm'; // encrypted
    } else {
      finalBytes = bytes;
      ext = 'sqlite';
    }
    const blob = new Blob([finalBytes], { type: 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `export-docs-${new Date().toISOString().slice(0, 10)}.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
    await appendAuditLog({
      actor_user_id: getCurrentUser().id, actor_username: getCurrentUser().username,
      action: 'db_export', summary: choice ? 'DBエクスポート（暗号化）' : 'DBエクスポート（平文）',
    });
    toast('DBをエクスポートしました', 'success');
  });
  document.getElementById('file-import-db').addEventListener('change', async (e) => {
    if (!canManageUsers(getCurrentUser())) { toast('DBインポートは管理者のみ', 'error'); e.target.value = ''; return; }
    const f = e.target.files[0]; if (!f) return;
    try {
      let bytes = new Uint8Array(await f.arrayBuffer());
      // Detect encrypted format by magic bytes "EDM1"
      const magic = new TextDecoder().decode(bytes.slice(0, 4));
      if (magic === 'EDM1') {
        const password = await promptEncryptionPassword({
          title: '復号パスワード',
          intro: '暗号化されたDBを読み込みます。エクスポート時のパスワードを入力してください。',
          confirm: false,
        });
        if (!password) { e.target.value = ''; return; }
        try {
          bytes = await decryptBytes(bytes, password);
        } catch {
          toast('復号に失敗しました。パスワードをご確認ください。', 'error');
          e.target.value = '';
          return;
        }
      }
      if (!confirm('DBインポートで現在のデータが上書きされます。よろしいですか？')) {
        e.target.value = '';
        return;
      }
      await importDB(bytes);
      await appendAuditLog({
        actor_user_id: getCurrentUser().id, actor_username: getCurrentUser().username,
        action: 'db_import', summary: 'DBインポート',
      });
      renderCases(); renderParties(); refreshPreviewOptions();
      toast('DBをインポートしました。再読み込みします。', 'success');
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      toast('DBインポートに失敗: ' + err.message, 'error');
    } finally {
      e.target.value = '';
    }
  });
}

// ---- Parties --------------------------------------------------------------
function setupParties() {
  document.getElementById('parties-role-filter').addEventListener('change', renderParties);
  document.getElementById('btn-new-party').addEventListener('click', () => openPartyEditor(null));
  const form = document.getElementById('form-party');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = formToObject(form);
    if (!data.id) delete data.id;
    else data.id = Number(data.id);
    await saveParty(data);
    closePartyEditor();
    renderParties();
    populateSellerSelect();
    populateNotifyPartySelect();
    toast('Partyを保存しました', 'success');
  });
  document.getElementById('btn-party-cancel').addEventListener('click', closePartyEditor);
  document.getElementById('btn-party-delete').addEventListener('click', async () => {
    const id = Number(form.elements.id.value);
    if (!id) return;
    if (!confirm('このPartyを削除しますか？')) return;
    await deleteParty(id);
    closePartyEditor();
    renderParties();
    populateSellerSelect();
    toast('削除しました', 'success');
  });
}
function renderParties() {
  const role = document.getElementById('parties-role-filter').value;
  const rows = listParties(role);
  const tbody = document.querySelector('#table-parties tbody');
  const roleLabel = { seller: 'Seller', buyer: 'Buyer', notify: 'Notify' };
  tbody.innerHTML = rows.map(p => `
    <tr>
      <td>${roleLabel[p.role] || p.role}</td>
      <td>${escapeHtml(p.company_name)}</td>
      <td>${escapeHtml(p.address || '')}</td>
      <td>${escapeHtml(p.tel || '')}</td>
      <td><button class="btn" data-edit-party="${p.id}">編集</button></td>
    </tr>
  `).join('');
  tbody.querySelectorAll('[data-edit-party]').forEach(btn => {
    btn.addEventListener('click', () => openPartyEditor(Number(btn.dataset.editParty)));
  });
}
function openPartyEditor(id) {
  const panel = document.getElementById('party-editor');
  const form = document.getElementById('form-party');
  panel.classList.remove('hidden');
  if (id) {
    const p = getParty(id);
    fillForm(form, p);
    document.getElementById('party-editor-title').textContent = `Party編集 #${id}`;
    document.getElementById('btn-party-delete').classList.remove('hidden');
  } else {
    fillForm(form, null);
    form.elements.id.value = '';
    document.getElementById('party-editor-title').textContent = '新規Party';
    document.getElementById('btn-party-delete').classList.add('hidden');
  }
}
function closePartyEditor() {
  document.getElementById('party-editor').classList.add('hidden');
}

// ---- Vehicle Models -------------------------------------------------------
function setupVehicleModels() {
  document.getElementById('btn-new-model').addEventListener('click', () => openModelEditor(null));
  const form = document.getElementById('form-model');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = formToObject(form);
    if (!data.id) delete data.id;
    else data.id = Number(data.id);
    await saveVehicleModel(data);
    closeModelEditor();
    renderVehicleModels();
    populateVehicleModelSelect();
    toast('モデルを保存しました', 'success');
  });
  document.getElementById('btn-model-cancel').addEventListener('click', closeModelEditor);
  document.getElementById('btn-model-delete').addEventListener('click', async () => {
    const id = Number(form.elements.id.value);
    if (!id) return;
    if (!confirm('このモデルを削除しますか？（このモデルを参照している案件は参照が外れます）')) return;
    await deleteVehicleModel(id);
    closeModelEditor();
    renderVehicleModels();
    populateVehicleModelSelect();
    toast('削除しました', 'success');
  });
}

function renderVehicleModels() {
  const rows = listVehicleModels();
  const tbody = document.querySelector('#table-models tbody');
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#6b7280;padding:20px">モデルが登録されていません。</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(m => `
    <tr>
      <td>${escapeHtml(m.maker || '')}</td>
      <td>${escapeHtml(m.model_name || '')}</td>
      <td>${escapeHtml(m.model_code || '')}</td>
      <td>${escapeHtml(m.engine_capacity || '')}</td>
      <td>${escapeHtml(m.hs_code || '')}</td>
      <td><button class="btn" data-edit-model="${m.id}">編集</button></td>
    </tr>
  `).join('');
  tbody.querySelectorAll('[data-edit-model]').forEach(btn => {
    btn.addEventListener('click', () => openModelEditor(Number(btn.dataset.editModel)));
  });
}

function openModelEditor(id) {
  const panel = document.getElementById('model-editor');
  const form = document.getElementById('form-model');
  panel.classList.remove('hidden');
  if (id) {
    const m = getVehicleModel(id);
    fillForm(form, m);
    document.getElementById('model-editor-title').textContent = `車両モデル編集 #${id}`;
    document.getElementById('btn-model-delete').classList.remove('hidden');
  } else {
    fillForm(form, null);
    form.elements.id.value = '';
    document.getElementById('model-editor-title').textContent = '新規モデル';
    document.getElementById('btn-model-delete').classList.add('hidden');
  }
}

function closeModelEditor() {
  document.getElementById('model-editor').classList.add('hidden');
}

// ---- Cases list -----------------------------------------------------------
function setupCases() {
  document.getElementById('btn-new-case').addEventListener('click', () => openCaseEditor(null));
  document.getElementById('search-cases').addEventListener('input', renderCases);

  // Populate filter dropdowns
  const progressFilter = document.getElementById('filter-progress');
  progressFilter.innerHTML = `<option value="all">進捗: すべて</option>` +
    PROGRESS_STATUSES.map(s => `<option value="${s.key}">進捗: ${escapeHtml(s.label)}</option>`).join('');
  const paymentFilter = document.getElementById('filter-payment');
  paymentFilter.innerHTML = `<option value="all">決済: すべて</option>` +
    PAYMENT_STATUSES.map(s => `<option value="${s.key}">決済: ${escapeHtml(s.label)}</option>`).join('');

  progressFilter.addEventListener('change', renderCases);
  paymentFilter.addEventListener('change', renderCases);
  document.getElementById('filter-tag').addEventListener('change', renderCases);
  document.getElementById('filter-favorites').addEventListener('change', renderCases);
  document.getElementById('btn-filter-clear').addEventListener('click', () => {
    document.getElementById('search-cases').value = '';
    progressFilter.value = 'all';
    paymentFilter.value = 'all';
    document.getElementById('filter-tag').value = '';
    document.getElementById('filter-favorites').checked = false;
    renderCases();
  });
}

function populateTagFilter() {
  const sel = document.getElementById('filter-tag');
  if (!sel) return;
  const current = sel.value;
  const tags = listAllTags();
  sel.innerHTML = `<option value="">タグ: すべて</option>` +
    tags.map(t => `<option value="${escapeHtml(t)}">🏷 ${escapeHtml(t)}</option>`).join('');
  if (current) sel.value = current;
}

// Parse comma-separated tags from a case row into an array.
function parseTags(str) {
  if (!str) return [];
  return String(str).split(',').map(s => s.trim()).filter(Boolean);
}

function renderCases() {
  populateTagFilter();
  const q = document.getElementById('search-cases').value.trim();
  const filters = {
    progress_status: document.getElementById('filter-progress').value,
    payment_status:  document.getElementById('filter-payment').value,
    tag:             document.getElementById('filter-tag').value,
    favorites_only:  document.getElementById('filter-favorites').checked,
  };
  const rows = listCases(q, filters);
  const tbody = document.querySelector('#table-cases tbody');
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#6b7280;padding:20px">該当する案件がありません。</td></tr>';
  } else {
    tbody.innerHTML = rows.map(c => {
      const prog = c.progress_status || 'inquiry';
      const pay  = c.payment_status || 'unpaid';
      const tags = parseTags(c.tags);
      const tagsHtml = tags.length
        ? tags.slice(0, 3).map(t => `<span class="tag-chip">${escapeHtml(t)}</span>`).join('')
          + (tags.length > 3 ? `<span class="tag-chip" title="${escapeHtml(tags.slice(3).join(', '))}">+${tags.length - 3}</span>` : '')
        : '';
      return `
      <tr class="${c.is_favorite ? 'row-favorite' : ''}">
        <td>
          <button class="fav-star ${c.is_favorite ? 'fav-star--on' : ''}" data-fav-case="${c.id}" title="${c.is_favorite ? 'お気に入り解除' : 'お気に入りに追加'}">${c.is_favorite ? '★' : '☆'}</button>
          ${escapeHtml(c.case_code || '')}
          ${tagsHtml ? `<div style="margin-top:2px">${tagsHtml}</div>` : ''}
        </td>
        <td>${escapeHtml(c.invoice_ref_no || '')}</td>
        <td>${escapeHtml(`${c.maker || ''} ${c.model_name || ''}`.trim())}</td>
        <td>${escapeHtml(c.chassis_no || '')}</td>
        <td class="mask-amount">${c.amount_jpy ? '¥' + Number(c.amount_jpy).toLocaleString() : ''}</td>
        <td>${escapeHtml(c.etd || '')}</td>
        <td><span class="badge badge--${progressColor(prog)}">${escapeHtml(progressLabel(prog))}</span></td>
        <td><span class="badge badge--${paymentColor(pay)}">${escapeHtml(paymentLabel(pay))}</span></td>
        <td>
          <button class="btn" data-detail-case="${c.id}" title="詳細">詳細</button>
          <button class="btn" data-edit-case="${c.id}">編集</button>
          <button class="btn btn--primary" data-preview-case="${c.id}">書類</button>
          <button class="btn btn--ghost" data-duplicate-case="${c.id}" title="案件を複製">複製</button>
        </td>
      </tr>`;
    }).join('');
    tbody.querySelectorAll('[data-fav-case]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await toggleFavorite(Number(btn.dataset.favCase));
        renderCases();
      });
    });
    tbody.querySelectorAll('[data-detail-case]').forEach(btn => {
      btn.addEventListener('click', () => openCaseDetail(Number(btn.dataset.detailCase)));
    });
    tbody.querySelectorAll('[data-edit-case]').forEach(btn => {
      btn.addEventListener('click', () => openCaseEditor(Number(btn.dataset.editCase)));
    });
    tbody.querySelectorAll('[data-preview-case]').forEach(btn => {
      btn.addEventListener('click', () => {
        switchTab('preview');
        document.getElementById('preview-case').value = btn.dataset.previewCase;
        document.getElementById('btn-preview-render').click();
      });
    });
    tbody.querySelectorAll('[data-duplicate-case]').forEach(btn => {
      btn.addEventListener('click', () => duplicateCase(Number(btn.dataset.duplicateCase)));
    });
  }

  // Summary row
  const s = casesSummary(filters);
  document.getElementById('sum-count').textContent = s.totalCount;
  const sumAmountEl = document.getElementById('sum-amount');
  sumAmountEl.textContent = '¥' + s.totalAmount.toLocaleString();
  sumAmountEl.classList.add('mask-amount');
  document.getElementById('sum-paid-count').textContent = `${s.paidCount} / ${s.totalCount}`;
  document.getElementById('sum-paid-amount').textContent = '¥' + s.paidAmount.toLocaleString();
  const sumOutEl = document.getElementById('sum-outstanding');
  const sumProfitEl = document.getElementById('sum-profit');
  if (sumOutEl) sumOutEl.textContent = '¥' + s.outstanding.toLocaleString();
  if (sumProfitEl) sumProfitEl.textContent = '¥' + s.profit.toLocaleString();
}

// ---- Case editor ----------------------------------------------------------
function setupEditor() {
  const form = document.getElementById('form-case');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!requireEdit()) return;
    const data = formToObject(form);
    if (!data.id) delete data.id;
    else data.id = Number(data.id);
    if (data.seller_id) data.seller_id = Number(data.seller_id);
    if (data.vehicle_model_id) data.vehicle_model_id = Number(data.vehicle_model_id);
    if (data.notify_party_id) data.notify_party_id = Number(data.notify_party_id);

    // Normalize tags: trim + deduplicate + comma-join
    if (data.tags) {
      const uniq = [...new Set(parseTags(data.tags))];
      data.tags = uniq.join(', ') || null;
    } else {
      data.tags = null;
    }
    data.is_favorite = form.elements.is_favorite?.checked ? 1 : 0;

    // Detect status change to stamp updated_at
    const prev = data.id ? getCase(data.id) : null;
    if (!prev || prev.progress_status !== data.progress_status || prev.payment_status !== data.payment_status) {
      data.status_updated_at = new Date().toISOString();
    }

    const id = await saveCase(data);
    const u = getCurrentUser();
    await appendAuditLog({
      actor_user_id: u.id, actor_username: u.username,
      action: prev ? 'case_update' : 'case_create',
      target_type: 'case', target_id: id,
      summary: `${prev ? '案件更新' : '案件作成'}: ${data.case_code || '#' + id}`,
    });

    // Save registration events
    await replaceCaseEvents(id, collectRegEvents());

    // Save per-doc-type Buyer/terms
    for (const t of DOC_TYPES) {
      const buyerEl = form.querySelector(`[data-doc-field="buyer_id"][data-doc="${t.key}"]`);
      if (!buyerEl) continue;
      const termsEl = form.querySelector(`[data-doc-field="terms_condition"][data-doc="${t.key}"]`);
      const dateEl  = form.querySelector(`[data-doc-field="doc_date"][data-doc="${t.key}"]`);
      const refEl   = form.querySelector(`[data-doc-field="doc_ref_no"][data-doc="${t.key}"]`);
      if (!buyerEl.value && !termsEl?.value && !dateEl?.value && !refEl?.value) continue;
      await saveCaseDoc({
        case_id: id,
        doc_type: t.key,
        buyer_id: buyerEl.value ? Number(buyerEl.value) : null,
        terms_condition: termsEl?.value || null,
        doc_date: dateEl?.value || null,
        doc_ref_no: refEl?.value || null,
      });
    }

    toast('案件を保存しました', 'success');
    switchTab('cases');
    renderCases();
    refreshPreviewOptions();
  });

  // Vehicle model "apply" button — copies reusable fields from the selected
  // model into the case form. Existing values are overwritten (explicit action).
  document.getElementById('btn-apply-model').addEventListener('click', () => {
    const sel = document.getElementById('case-vehicle-model');
    const id = sel.value ? Number(sel.value) : null;
    if (!id) { toast('モデルを選択してください', 'error'); return; }
    const m = getVehicleModel(id);
    if (!m) return;
    const fields = ['maker','model_name','model_code','engine_capacity','displacement_cc',
                    'fuel','weight_kg','measurement_m3','hs_code','specification'];
    for (const f of fields) {
      const el = form.elements[f];
      if (el) el.value = m[f] ?? '';
    }
    toast(`モデル「${m.maker} ${m.model_name}」を適用しました`, 'success');
  });

  document.getElementById('link-manage-models').addEventListener('click', (e) => {
    e.preventDefault();
    switchTab('models');
  });

  document.getElementById('btn-case-cancel').addEventListener('click', () => switchTab('cases'));
  document.getElementById('btn-case-delete').addEventListener('click', async () => {
    if (!requireEdit()) return;
    const id = Number(form.elements.id.value);
    if (!id) return;
    if (!confirm('この案件を削除しますか？（関連書類も削除されます）')) return;
    const c = getCase(id);
    await deleteCase(id);
    const u = getCurrentUser();
    await appendAuditLog({
      actor_user_id: u.id, actor_username: u.username,
      action: 'case_delete', target_type: 'case', target_id: id,
      summary: `案件削除: ${c?.case_code || '#' + id}`,
    });
    toast('削除しました', 'success');
    switchTab('cases');
    renderCases();
  });

  renderDocSettings();
  renderRegEvents([]);
  renderPaymentsTable(null);
  renderCostsTable(null);
  setupPaymentsCosts();
  setupEditorTabs();
  document.getElementById('btn-add-reg-event').addEventListener('click', () => addRegEventRow({}));

  // Populate status selectors
  const progSel = document.getElementById('case-progress-status');
  progSel.innerHTML = PROGRESS_STATUSES
    .map(s => `<option value="${s.key}">${escapeHtml(s.label)}</option>`).join('');
  const paySel = document.getElementById('case-payment-status');
  paySel.innerHTML = PAYMENT_STATUSES
    .map(s => `<option value="${s.key}">${escapeHtml(s.label)}</option>`).join('');
}

// ---- Registration events UI -----------------------------------------------
const REG_EVENT_TYPES = [
  'New Registration',
  'Transfer of Ownership Registration',
  'Provisional Deregistration for Export',
  'Other',
];

function renderRegEvents(events) {
  const host = document.getElementById('reg-events');
  host.innerHTML = '';
  if (!events || !events.length) return;
  for (const ev of events) addRegEventRow(ev);
}

function addRegEventRow(ev) {
  const host = document.getElementById('reg-events');
  const h = escapeHtml;
  const row = document.createElement('div');
  row.className = 'panel';
  row.style.marginBottom = '8px';
  row.innerHTML = `
    <div class="form-grid">
      <label>Event Date
        <input data-f="event_date" type="date" value="${h(ev.event_date || '')}">
      </label>
      <label>Type of Registration
        <select data-f="event_type">
          ${REG_EVENT_TYPES.map(t => `<option value="${h(t)}"${ev.event_type === t ? ' selected' : ''}>${h(t)}</option>`).join('')}
        </select>
      </label>
      <label>Acceptance Number <input data-f="acceptance_number" value="${h(ev.acceptance_number || '')}"></label>
      <label>Registration Number <input data-f="registration_number" value="${h(ev.registration_number || '')}"></label>
      <label>Owner's Name <input data-f="owner_name" value="${h(ev.owner_name || '')}"></label>
      <label class="span-2">Owner's Address <input data-f="owner_address" value="${h(ev.owner_address || '')}"></label>
      <label>User's Name <input data-f="user_name" value="${h(ev.user_name || '')}"></label>
      <label class="span-2">User's Address <input data-f="user_address" value="${h(ev.user_address || '')}"></label>
      <label>Principal Place of Use <input data-f="principal_place_of_use" value="${h(ev.principal_place_of_use || '')}"></label>
      <label>Scheduled Export Date <input data-f="scheduled_export_date" type="date" value="${h(ev.scheduled_export_date || '')}"></label>
      <label class="span-2">Notes <input data-f="notes" value="${h(ev.notes || '')}"></label>
    </div>
    <div class="form-actions">
      <button type="button" class="btn btn--ghost" data-action="move-up">↑ 上へ</button>
      <button type="button" class="btn btn--ghost" data-action="move-down">↓ 下へ</button>
      <button type="button" class="btn btn--danger" data-action="remove">削除</button>
    </div>
  `;
  host.appendChild(row);
  row.querySelector('[data-action="remove"]').addEventListener('click', () => {
    row.remove();
    const caseId = Number(document.querySelector('#form-case [name="id"]').value);
    if (caseId) updateEditorTabBadges(caseId);
  });
  row.querySelector('[data-action="move-up"]').addEventListener('click', () => {
    if (row.previousElementSibling) host.insertBefore(row, row.previousElementSibling);
  });
  row.querySelector('[data-action="move-down"]').addEventListener('click', () => {
    if (row.nextElementSibling) host.insertBefore(row.nextElementSibling, row);
  });
}

function collectRegEvents() {
  const host = document.getElementById('reg-events');
  const rows = Array.from(host.querySelectorAll(':scope > .panel'));
  const events = [];
  for (const row of rows) {
    const ev = {};
    row.querySelectorAll('[data-f]').forEach(el => {
      ev[el.dataset.f] = el.value || null;
    });
    // Skip entirely empty rows
    const hasContent = Object.values(ev).some(v => v && String(v).trim());
    if (hasContent) events.push(ev);
  }
  return events;
}

function renderDocSettings() {
  const host = document.getElementById('doc-settings');
  const buyers = listParties('buyer');
  const buyerOpts = `<option value="">（未設定）</option>` +
    buyers.map(b => `<option value="${b.id}">${escapeHtml(b.company_name)}</option>`).join('');

  host.innerHTML = DOC_TYPES.map(t => `
    <div class="doc-setting-row">
      <div class="doc-type-label">${escapeHtml(t.label)}${t.implemented ? '' : ' <small style="color:#9ca3af">(未実装)</small>'}</div>
      <label>Buyer
        <select data-doc-field="buyer_id" data-doc="${t.key}">${buyerOpts}</select>
      </label>
      <label>Terms
        <input data-doc-field="terms_condition" data-doc="${t.key}" value="${escapeHtml(t.termsDefault)}">
      </label>
      <label>Doc Date
        <input type="date" data-doc-field="doc_date" data-doc="${t.key}">
      </label>
    </div>
  `).join('');
}

function populateSellerSelect() {
  const sel = document.querySelector('#form-case [name="seller_id"]');
  if (!sel) return;
  const sellers = listParties('seller');
  const current = sel.value;
  sel.innerHTML = `<option value="">（選択してください）</option>` +
    sellers.map(s => `<option value="${s.id}">${escapeHtml(s.company_name)}</option>`).join('');
  if (current) sel.value = current;
  // Rebuild doc settings to reflect buyer list changes.
  renderDocSettings();
}

function populateVehicleModelSelect() {
  const sel = document.getElementById('case-vehicle-model');
  if (!sel) return;
  const models = listVehicleModels();
  const current = sel.value;
  sel.innerHTML = `<option value="">（未選択）</option>` +
    models.map(m => `<option value="${m.id}">${escapeHtml(`${m.maker || ''} ${m.model_name || ''}${m.model_code ? ' — ' + m.model_code : ''}`.trim())}</option>`).join('');
  if (current) sel.value = current;
}

function populateNotifyPartySelect() {
  const sel = document.querySelector('#form-case [name="notify_party_id"]');
  if (!sel) return;
  const parties = listParties('notify');
  // Also allow buyer-role parties to be selected as notify in case someone assigned that role.
  const extras = listParties('buyer');
  const current = sel.value;
  sel.innerHTML = `<option value="">（未選択）</option>` +
    parties.map(p => `<option value="${p.id}">${escapeHtml(p.company_name)}</option>`).join('') +
    (extras.length ? `<optgroup label="Buyer から選択">` +
      extras.map(p => `<option value="${p.id}">${escapeHtml(p.company_name)}</option>`).join('') +
      `</optgroup>` : '');
  if (current) sel.value = current;
}

function openCaseEditor(id) {
  switchTab('editor');
  populateSellerSelect();
  populateVehicleModelSelect();
  populateNotifyPartySelect();
  resetEditorTabs();
  updateEditorTabBadges(id);
  const form = document.getElementById('form-case');
  const delBtn = document.getElementById('btn-case-delete');
  if (id) {
    const c = getCase(id);
    fillForm(form, c);
    // Checkbox is not handled by fillForm (which only sets .value)
    if (form.elements.is_favorite) form.elements.is_favorite.checked = !!c.is_favorite;
    renderTagSuggestions();
    delBtn.classList.remove('hidden');
    // Populate per-doc settings
    const issued = new Set();
    for (const t of DOC_TYPES) {
      const doc = getCaseDoc(id, t.key);
      if (!doc) continue;
      issued.add(t.key);
      const set = (field, v) => {
        const el = form.querySelector(`[data-doc-field="${field}"][data-doc="${t.key}"]`);
        if (el) el.value = v ?? '';
      };
      set('buyer_id', doc.buyer_id);
      set('terms_condition', doc.terms_condition);
      set('doc_date', doc.doc_date);
      set('doc_ref_no', doc.doc_ref_no);
    }
    renderRegEvents(listCaseEvents(id));
    renderPaymentsTable(id);
    renderCostsTable(id);
    renderPhotoAlbum(id, document.getElementById('editor-photo-album'), { editable: true });
    // Suggest progress status based on issued docs (non-destructive hint)
    const suggested = suggestProgressFromDocs(issued, c.progress_status);
    if (suggested && suggested !== c.progress_status) {
      const progEl = form.elements.progress_status;
      // Only bump if the current value is earlier in the order.
      const orderOf = k => PROGRESS_STATUSES.find(s => s.key === k)?.order ?? 0;
      if (orderOf(suggested) > orderOf(progEl.value)) {
        progEl.value = suggested;
        toast(`発行済み書類から進捗ステータスを「${progressLabel(suggested)}」に調整しました（保存時に反映）`, 'success');
      }
    }
  } else {
    fillForm(form, null);
    if (form.elements.is_favorite) form.elements.is_favorite.checked = false;
    renderTagSuggestions();
    form.elements.id.value = '';
    form.elements.qty.value = 1;
    form.elements.type_of_service.value = 'RO/RO';
    form.elements.delivery_term.value = 'CIF';
    form.elements.description.value = 'USED VEHICLE';
    // Auto-generate Case Code / Invoice Ref No from patterns (if configured)
    const caseCodePattern = getSetting('case_code_pattern', '');
    if (caseCodePattern) {
      form.elements.case_code.value = nextSequenceFromPattern(caseCodePattern, 'cases', 'case_code');
    }
    const invRefPattern = getSetting('invoice_ref_pattern', '');
    if (invRefPattern) {
      form.elements.invoice_ref_no.value = nextSequenceFromPattern(invRefPattern, 'cases', 'invoice_ref_no');
    }
    delBtn.classList.add('hidden');
    renderDocSettings();
    renderRegEvents([]);
    renderPaymentsTable(null);
    renderCostsTable(null);
    // Photo album for new case: empty placeholder, only usable after save
    const photoHost = document.getElementById('editor-photo-album');
    if (photoHost) photoHost.innerHTML = '<div style="color:#9ca3af;font-size:12px;padding:12px">案件を保存すると写真をアップロードできます。</div>';
  }
}

// ---- Preview --------------------------------------------------------------
function setupPreview() {
  document.getElementById('btn-preview-render').addEventListener('click', renderPreview);
  document.getElementById('btn-preview-print').addEventListener('click', () => {
    const sheet = document.querySelector('#doc-preview .doc-sheet');
    if (!sheet) {
      toast('先に書類を表示してください', 'error');
      return;
    }
    const caseId = Number(document.getElementById('preview-case').value);
    const docType = document.getElementById('preview-doc').value;

    const doPrint = () => {
      // Inject the correct @page size based on the sheet orientation.
      const isLandscape = sheet.classList.contains('doc-sheet--ec')
                       || sheet.classList.contains('doc-sheet--pr');
      let styleTag = document.getElementById('print-page-style');
      if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'print-page-style';
        document.head.appendChild(styleTag);
      }
      styleTag.textContent = `@media print { @page { size: A4 ${isLandscape ? 'landscape' : 'portrait'}; margin: 0; } }`;
      if (caseId && docType) logDocIssued(caseId, docType, 'print');
      window.print();
    };

    // Pre-flight validation
    if (caseId && docType) {
      const issues = validateBeforeIssue(caseId, docType);
      if (issues.filter(i => i.level === 'error').length > 0) {
        showValidationModal(caseId, docType, issues, doPrint);
        return;
      }
    }
    doPrint();
  });
  document.getElementById('btn-preview-bulk').addEventListener('click', bulkIssueCurrentCase);
  document.getElementById('btn-preview-log').addEventListener('click', toggleIssueLog);
  document.getElementById('btn-preview-mail').addEventListener('click', openMailDraft);
  document.getElementById('preview-case').addEventListener('change', renderPreview);
  document.getElementById('preview-doc').addEventListener('change', renderPreview);
}

function refreshPreviewOptions() {
  const sel = document.getElementById('preview-case');
  if (!sel) return;
  const cases = listCases();
  const current = sel.value;
  sel.innerHTML = `<option value="">（案件を選択）</option>` +
    cases.map(c => `<option value="${c.id}">${escapeHtml(`${c.case_code || '#' + c.id} — ${c.model_name || ''}`)}</option>`).join('');
  if (current) sel.value = current;
}

function renderPreview() {
  const caseId = document.getElementById('preview-case').value;
  const docType = document.getElementById('preview-doc').value;
  const host = document.getElementById('doc-preview');
  host.innerHTML = '';
  if (!caseId) return;
  const caseRow = getCase(Number(caseId));
  if (!caseRow) return;
  const seller = caseRow.seller_id ? getParty(caseRow.seller_id) : null;
  const doc = getCaseDoc(caseRow.id, docType);
  const buyer = doc?.buyer_id ? getParty(doc.buyer_id) : null;
  const notifyParty = caseRow.notify_party_id ? getParty(caseRow.notify_party_id) : null;

  let node;
  switch (docType) {
    case 'sales_confirmation':
      node = renderSalesConfirmation({ caseRow, seller, buyer, doc });
      break;
    case 'invoice':
      node = renderInvoice({ caseRow, seller, buyer, doc });
      break;
    case 'shipping_instruction':
      node = renderShippingInstruction({ caseRow, seller, buyer, doc, notifyParty });
      break;
    case 'export_certificate':
      node = renderExportCertificate({ caseRow, seller, doc });
      break;
    case 'preserved_record': {
      const events = listCaseEvents(caseRow.id);
      node = renderPreservedRecord({ caseRow, seller, doc, events });
      break;
    }
    default:
      toast('この書類はまだ未実装です', 'error');
      return;
  }
  host.appendChild(node);
}

// ============================================================================
// A1 & A3 — Payments and Costs sub-forms inside the case editor
// ============================================================================

function renderPaymentsTable(caseId) {
  const tbody = document.querySelector('#table-payments tbody');
  const sumHost = document.getElementById('payments-summary');
  if (!caseId) {
    tbody.innerHTML = '<tr><td colspan="6" class="muted">案件を保存すると入金が登録できます。</td></tr>';
    sumHost.innerHTML = '';
    return;
  }
  const rows = listPayments(caseId);
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="muted">入金明細がありません。</td></tr>';
  } else {
    tbody.innerHTML = rows.map(p => `
      <tr>
        <td>${escapeHtml(p.payment_date || '')}</td>
        <td style="text-align:right">¥${Number(p.amount_jpy || 0).toLocaleString()}</td>
        <td>${escapeHtml(p.method || '')}</td>
        <td>${escapeHtml(p.reference_no || '')}</td>
        <td>${escapeHtml(p.note || '')}</td>
        <td><button type="button" class="btn btn--danger" data-del-pay="${p.id}">削除</button></td>
      </tr>
    `).join('');
    tbody.querySelectorAll('[data-del-pay]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('この入金を削除しますか？')) return;
        await deletePayment(Number(btn.dataset.delPay));
        renderPaymentsTable(caseId);
        syncEditorPaymentStatus(caseId);
        updateEditorTabBadges(caseId);
        renderCases();
        toast('入金を削除しました', 'success');
      });
    });
  }
  const paid = paymentsTotal(caseId);
  const c = getCase(caseId);
  const due = Number(c?.amount_jpy || 0);
  const rem = Math.max(0, due - paid);
  sumHost.innerHTML = `
    <div class="stat-row__item"><span class="stat-row__label">請求額</span><span class="stat-row__value">¥${due.toLocaleString()}</span></div>
    <div class="stat-row__item"><span class="stat-row__label">入金済み</span><span class="stat-row__value">¥${paid.toLocaleString()}</span></div>
    <div class="stat-row__item"><span class="stat-row__label">残高</span><span class="stat-row__value">¥${rem.toLocaleString()}</span></div>
  `;
}

function renderCostsTable(caseId) {
  const tbody = document.querySelector('#table-costs tbody');
  const sumHost = document.getElementById('costs-summary');
  if (!caseId) {
    tbody.innerHTML = '<tr><td colspan="6" class="muted">案件を保存するとコストが登録できます。</td></tr>';
    sumHost.innerHTML = '';
    return;
  }
  const rows = listCosts(caseId);
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="muted">原価明細がありません。</td></tr>';
  } else {
    tbody.innerHTML = rows.map(c => `
      <tr>
        <td>${escapeHtml(c.cost_date || '')}</td>
        <td>${escapeHtml(c.cost_type || '')}</td>
        <td style="text-align:right">¥${Number(c.amount_jpy || 0).toLocaleString()}</td>
        <td>${escapeHtml(c.vendor || '')}</td>
        <td>${escapeHtml(c.note || '')}</td>
        <td><button type="button" class="btn btn--danger" data-del-cost="${c.id}">削除</button></td>
      </tr>
    `).join('');
    tbody.querySelectorAll('[data-del-cost]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('このコストを削除しますか？')) return;
        await deleteCost(Number(btn.dataset.delCost));
        renderCostsTable(caseId);
        updateEditorTabBadges(caseId);
        renderCases();
        toast('コストを削除しました', 'success');
      });
    });
  }
  const cost = costsTotal(caseId);
  const c = getCase(caseId);
  const cif = Number(c?.amount_jpy || 0);
  const profit = cif - cost;
  sumHost.innerHTML = `
    <div class="stat-row__item"><span class="stat-row__label">CIF</span><span class="stat-row__value">¥${cif.toLocaleString()}</span></div>
    <div class="stat-row__item"><span class="stat-row__label">原価合計</span><span class="stat-row__value">¥${cost.toLocaleString()}</span></div>
    <div class="stat-row__item"><span class="stat-row__label">粗利</span><span class="stat-row__value" style="color:${profit >= 0 ? '#059669' : '#dc2626'}">¥${profit.toLocaleString()}</span></div>
  `;
}

function syncEditorPaymentStatus(caseId) {
  const c = getCase(caseId);
  if (!c) return;
  const paySel = document.getElementById('case-payment-status');
  if (paySel && c.payment_status) paySel.value = c.payment_status;
}

function setupPaymentsCosts() {
  document.getElementById('btn-add-payment').addEventListener('click', async () => {
    const form = document.getElementById('form-case');
    const caseId = Number(form.elements.id.value);
    if (!caseId) { toast('先に案件を保存してください', 'error'); return; }
    const row = document.getElementById('new-payment-row');
    const data = { case_id: caseId };
    row.querySelectorAll('[data-new-pay]').forEach(el => { data[el.dataset.newPay] = el.value || null; });
    if (!data.amount_jpy) { toast('金額を入力してください', 'error'); return; }
    data.amount_jpy = Number(data.amount_jpy);
    await savePayment(data);
    row.querySelectorAll('[data-new-pay]').forEach(el => el.value = '');
    renderPaymentsTable(caseId);
    syncEditorPaymentStatus(caseId);
    updateEditorTabBadges(caseId);
    renderCases();
    toast('入金を追加しました', 'success');
  });
  document.getElementById('btn-add-cost').addEventListener('click', async () => {
    const form = document.getElementById('form-case');
    const caseId = Number(form.elements.id.value);
    if (!caseId) { toast('先に案件を保存してください', 'error'); return; }
    const row = document.getElementById('new-cost-row');
    const data = { case_id: caseId };
    row.querySelectorAll('[data-new-cost]').forEach(el => { data[el.dataset.newCost] = el.value || null; });
    if (!data.amount_jpy) { toast('金額を入力してください', 'error'); return; }
    data.amount_jpy = Number(data.amount_jpy);
    await saveCost(data);
    row.querySelectorAll('[data-new-cost]').forEach(el => el.value = '');
    renderCostsTable(caseId);
    updateEditorTabBadges(caseId);
    renderCases();
    toast('コストを追加しました', 'success');
  });
}

// ============================================================================
// B1 — Case duplication
// ============================================================================
async function duplicateCase(id) {
  const src = getCase(id);
  if (!src) return;
  if (!confirm(`「${src.case_code || '#' + id}」を複製しますか？`)) return;
  const copy = { ...src };
  delete copy.id;
  copy.case_code = (src.case_code || 'CASE') + '_COPY';
  copy.invoice_ref_no = '';
  copy.chassis_no = '';
  copy.engine_no = '';
  copy.invoice_date = '';
  copy.payment_due_date = '';
  copy.etd = '';
  copy.eta = '';
  copy.progress_status = 'inquiry';
  copy.payment_status = 'unpaid';
  copy.status_note = '';
  copy.status_updated_at = null;
  await saveCase(copy);
  renderCases();
  toast('案件を複製しました。編集画面で内容を調整してください。', 'success');
}

// ============================================================================
// A2 — Dashboard
// ============================================================================
let DASH_METRIC = 'amount';

function setupDashboard() {
  // Monthly metric tab switcher
  document.querySelectorAll('.dash-monthly__tabs .chip').forEach(btn => {
    btn.addEventListener('click', () => {
      DASH_METRIC = btn.dataset.metric;
      document.querySelectorAll('.dash-monthly__tabs .chip')
        .forEach(c => c.classList.toggle('chip--active', c.dataset.metric === DASH_METRIC));
      renderMonthlyTrend();
    });
  });
  document.getElementById('dash-months-range').addEventListener('change', renderMonthlyTrend);
  document.getElementById('dash-kanban-hide-done').addEventListener('change', renderKanban);
}

function renderDashboard() {
  renderTodayPanel();
  renderMonthlyTrend();
  renderKanban();
  renderBreakdownCharts();
}

// ---------------------------------------------------------------------------
// Today / month summary panel
// ---------------------------------------------------------------------------
function renderTodayPanel() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const ym = today.toISOString().slice(0, 7);
  const prevYm = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString().slice(0, 7);

  document.getElementById('dash-today-title').textContent =
    `${today.getFullYear()}年 ${today.getMonth() + 1}月のサマリー`;
  document.getElementById('dash-today-sub').textContent =
    today.toLocaleDateString('ja-JP', { weekday: 'long', month: 'long', day: 'numeric' });

  const allCases = listCases();
  const thisMonth = allCases.filter(r => (r.invoice_date || r.etd || '').slice(0, 7) === ym);
  const prevMonth = allCases.filter(r => (r.invoice_date || r.etd || '').slice(0, 7) === prevYm);

  const sum = (arr) => arr.reduce((s, r) => s + (Number(r.amount_jpy) || 0), 0);
  const profitOf = (arr) => arr.reduce((s, r) => s + ((Number(r.amount_jpy) || 0) - costsTotal(r.id)), 0);
  const paidOf = (arr) => arr.reduce((s, r) => s + paymentsTotal(r.id), 0);

  const thisAmount = sum(thisMonth);
  const prevAmount = sum(prevMonth);
  const thisProfit = profitOf(thisMonth);
  const prevProfit = profitOf(prevMonth);
  const thisShipped = thisMonth.filter(r =>
    ['shipped','arrived','completed'].includes(r.progress_status)).length;
  const thisPaid = paidOf(thisMonth);

  const delta = (cur, prev) => {
    if (!prev) return prev === cur ? '' : '—';
    const pct = ((cur - prev) / prev) * 100;
    const sign = pct >= 0 ? '▲' : '▼';
    const cls = pct >= 0 ? 'up' : 'down';
    return `<div class="dash-kpi__delta dash-kpi__delta--${cls}">${sign} ${Math.abs(pct).toFixed(1)}% 前月比</div>`;
  };

  document.getElementById('dash-month-kpis').innerHTML = `
    <div class="dash-kpi">
      <div class="dash-kpi__label">今月の売上</div>
      <div class="dash-kpi__value">¥${thisAmount.toLocaleString()}</div>
      ${delta(thisAmount, prevAmount)}
    </div>
    <div class="dash-kpi">
      <div class="dash-kpi__label">今月の案件数</div>
      <div class="dash-kpi__value">${thisMonth.length}</div>
      <div class="dash-kpi__delta">前月: ${prevMonth.length} 件</div>
    </div>
    <div class="dash-kpi">
      <div class="dash-kpi__label">今月の粗利</div>
      <div class="dash-kpi__value" style="color:${thisProfit >= 0 ? '#34d399' : '#fca5a5'}">¥${thisProfit.toLocaleString()}</div>
      ${delta(thisProfit, prevProfit)}
    </div>
    <div class="dash-kpi">
      <div class="dash-kpi__label">今月の出荷</div>
      <div class="dash-kpi__value">${thisShipped} <span style="font-size:13px;color:#9ca3af">/ ${thisMonth.length}</span></div>
      <div class="dash-kpi__delta">船積・入港・完了を含む</div>
    </div>
    <div class="dash-kpi">
      <div class="dash-kpi__label">今月の入金</div>
      <div class="dash-kpi__value">¥${thisPaid.toLocaleString()}</div>
      <div class="dash-kpi__delta">請求額の${thisAmount ? Math.round(thisPaid / thisAmount * 100) : 0}%</div>
    </div>
    <div class="dash-kpi">
      <div class="dash-kpi__label">総未回収残高</div>
      <div class="dash-kpi__value" style="color:#fca5a5">¥${casesSummary().outstanding.toLocaleString()}</div>
      <div class="dash-kpi__delta">全案件通算</div>
    </div>
  `;

  // Today's tasks
  renderTodayTasks(allCases, today);
}

function renderTodayTasks(allCases, today) {
  const host = document.getElementById('dash-today-tasks');
  const in7 = new Date(today); in7.setDate(in7.getDate() + 7);
  const fmtDays = (date, base) => {
    const d = Math.floor((date - base) / 86400000);
    if (d < 0) return { text: `${-d}日超過`, alert: true };
    if (d === 0) return { text: '本日', alert: true };
    return { text: `あと${d}日`, alert: d <= 3 };
  };

  // Group 1: Upcoming ETD (船積予定、7日以内)
  const etdSoon = allCases
    .filter(r => r.etd && r.progress_status !== 'shipped' && r.progress_status !== 'arrived'
                     && r.progress_status !== 'completed' && r.progress_status !== 'cancelled')
    .map(r => ({ ...r, due: new Date(r.etd) }))
    .filter(r => !Number.isNaN(+r.due) && r.due >= today && r.due <= in7)
    .sort((a, b) => a.due - b.due);

  // Group 2: Upcoming ETA (入港予定、7日以内)
  const etaSoon = allCases
    .filter(r => r.eta && r.progress_status !== 'arrived' && r.progress_status !== 'completed' && r.progress_status !== 'cancelled')
    .map(r => ({ ...r, due: new Date(r.eta) }))
    .filter(r => !Number.isNaN(+r.due) && r.due >= today && r.due <= in7)
    .sort((a, b) => a.due - b.due);

  // Group 3: Payment overdue
  const overdue = allCases
    .filter(r => r.payment_status !== 'paid' && r.payment_status !== 'cancelled' && r.payment_due_date)
    .map(r => ({ ...r, due: new Date(r.payment_due_date) }))
    .filter(r => !Number.isNaN(+r.due) && r.due < today && (Number(r.amount_jpy) || 0) - paymentsTotal(r.id) > 0)
    .sort((a, b) => a.due - b.due);

  // Group 4: Documents not yet issued on shipped cases (発行忘れ警告)
  const docsIncomplete = allCases
    .filter(r => r.progress_status === 'sc_issued' || r.progress_status === 'invoice_issued')
    .filter(r => r.etd && new Date(r.etd) <= in7);

  const renderGroup = (title, color, items, renderRight) => `
    <div class="today-task-group">
      <div class="today-task-group__head">
        <span>${escapeHtml(title)}</span>
        <span class="today-task-group__count">${items.length}</span>
      </div>
      ${items.length ? `<ul class="today-task-list">${items.slice(0, 5).map(r => `
        <li data-case-id="${r.id}">
          <span>${escapeHtml(r.case_code || '#' + r.id)} <span style="color:#6b7280">— ${escapeHtml(`${r.maker || ''} ${r.model_name || ''}`.trim())}</span></span>
          <span class="today-task-list__right">${renderRight(r)}</span>
        </li>`).join('')}</ul>
        ${items.length > 5 ? `<div class="today-task-empty">他 ${items.length - 5} 件</div>` : ''}
      ` : `<div class="today-task-empty">該当なし</div>`}
    </div>
  `;

  // Security alert: recent failed login attempts (admin only)
  let securityAlerts = '';
  if (canManageUsers(getCurrentUser())) {
    const last24h = Date.now() - 24 * 60 * 60 * 1000;
    const failures = listAuditLog({ limit: 100, action: 'login_failed' })
      .filter(r => new Date(r.created_at).getTime() > last24h);
    const lockouts = listAuditLog({ limit: 50, action: 'login_locked' })
      .filter(r => new Date(r.created_at).getTime() > last24h);
    if (failures.length >= 3 || lockouts.length > 0) {
      securityAlerts = `
        <div class="today-task-group" style="border-left:3px solid #dc2626;background:#fef2f2;padding:8px 12px;border-radius:4px;margin-bottom:10px">
          <div class="today-task-group__head" style="color:#991b1b">
            <span>⚠️ セキュリティアラート（24時間以内）</span>
          </div>
          <div style="font-size:12px;color:#991b1b">
            ログイン失敗: ${failures.length}件 / ロック発生: ${lockouts.length}件
            <br><small style="color:#7f1d1d">詳細は設定 → 監査ログを確認してください</small>
          </div>
        </div>
      `;
    }
  }

  host.innerHTML = `
    ${securityAlerts}
    ${renderGroup('船積予定（7日以内）', 'blue', etdSoon, r => {
      const d = fmtDays(r.due, today);
      return `<span style="color:${d.alert ? '#dc2626' : '#6b7280'}">${d.text}</span>`;
    })}
    ${renderGroup('入港予定（7日以内）', 'teal', etaSoon, r => {
      const d = fmtDays(r.due, today);
      return `<span style="color:${d.alert ? '#dc2626' : '#6b7280'}">${d.text}</span>`;
    })}
    ${renderGroup('入金遅延', 'red', overdue, r => {
      const d = fmtDays(r.due, today);
      const rem = (Number(r.amount_jpy) || 0) - paymentsTotal(r.id);
      return `<span style="color:#dc2626">${d.text}・¥${rem.toLocaleString()}</span>`;
    })}
    ${renderGroup('書類発行が遅れている可能性', 'amber', docsIncomplete, r => {
      return `<span style="color:#92400e">${escapeHtml(progressLabel(r.progress_status))}</span>`;
    })}
  `;
  host.querySelectorAll('[data-case-id]').forEach(li => {
    li.addEventListener('click', () => openCaseEditor(Number(li.dataset.caseId)));
  });
}

// ---------------------------------------------------------------------------
// Monthly trends (amount / count / profit / margin / new_cases / velocity)
// ---------------------------------------------------------------------------
function renderMonthlyTrend() {
  const months = Number(document.getElementById('dash-months-range').value);
  const now = new Date();
  const keys = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const allCases = listCases();

  const bucketsByKey = new Map(keys.map(k => [k, []]));
  for (const r of allCases) {
    const k = (r.invoice_date || r.etd || '').slice(0, 7);
    if (bucketsByKey.has(k)) bucketsByKey.get(k).push(r);
  }

  const data = keys.map(k => {
    const arr = bucketsByKey.get(k);
    const amount = arr.reduce((s, r) => s + (Number(r.amount_jpy) || 0), 0);
    const count = arr.length;
    const cost = arr.reduce((s, r) => s + costsTotal(r.id), 0);
    const profit = amount - cost;
    const margin = amount ? (profit / amount) * 100 : 0;
    const newCases = arr.length; // same as count since key is invoice month
    const velocity = avgPaymentVelocity(arr);
    return { k, amount, count, profit, margin, newCases, velocity };
  });

  const metric = DASH_METRIC;
  const getVal = (d) => ({
    amount: d.amount, count: d.count, profit: d.profit,
    margin: d.margin, new_cases: d.newCases, velocity: d.velocity ?? 0,
  }[metric]);
  const fmt = (v) => {
    if (v == null) return '—';
    if (metric === 'amount' || metric === 'profit') return '¥' + Math.round(v).toLocaleString();
    if (metric === 'margin') return v.toFixed(1) + '%';
    if (metric === 'velocity') return v ? v.toFixed(1) + '日' : '—';
    return String(v);
  };
  const max = Math.max(1, ...data.map(d => Math.abs(getVal(d) || 0)));

  const host = document.getElementById('dash-monthly-chart');
  host.innerHTML = data.map(d => {
    const v = getVal(d) || 0;
    const h = (Math.abs(v) / max) * 180;
    return `
      <div class="mchart-bar-group" data-month="${d.k}">
        <div class="mchart-value">${fmt(v)}</div>
        <div class="mchart-bar" style="height:${h}px;${v < 0 ? 'background:linear-gradient(180deg,#fca5a5,#ef4444);' : ''}">
          <div class="mchart-bar__tooltip">
            ${escapeHtml(d.k)}<br>
            売上: ¥${d.amount.toLocaleString()}<br>
            案件: ${d.count}件<br>
            粗利: ¥${d.profit.toLocaleString()} (${d.margin.toFixed(1)}%)<br>
            入金速度: ${d.velocity ? d.velocity.toFixed(1) + '日' : '—'}
          </div>
        </div>
        <div class="mchart-label">${escapeHtml(d.k.slice(5))}月</div>
      </div>
    `;
  }).join('');

  // Summary hint below chart
  const total = data.reduce((s, d) => s + (getVal(d) || 0), 0);
  const avg = total / data.length;
  const labels = {
    amount:    '売上金額（月次CIF合計）',
    count:     '案件数（計上月ベース）',
    profit:    '粗利（CIF − 原価）',
    margin:    '粗利率 = 粗利 / 売上',
    new_cases: '新規案件数',
    velocity:  '入金速度（請求→最終入金の平均日数）',
  };
  const hint = document.getElementById('dash-monthly-hint');
  hint.innerHTML = `
    <div><strong>${escapeHtml(labels[metric] || '')}</strong></div>
    <div>合計: ${fmt(total)} / 月平均: ${fmt(avg)}</div>
  `;
}

function avgPaymentVelocity(rows) {
  const diffs = [];
  for (const r of rows) {
    if (!r.invoice_date) continue;
    const pays = listPayments(r.id);
    if (!pays.length) continue;
    const last = pays[pays.length - 1];
    if (!last.payment_date) continue;
    const d0 = new Date(r.invoice_date);
    const d1 = new Date(last.payment_date);
    if (!Number.isNaN(+d0) && !Number.isNaN(+d1)) {
      diffs.push(Math.max(0, (d1 - d0) / 86400000));
    }
  }
  if (!diffs.length) return null;
  return diffs.reduce((s, v) => s + v, 0) / diffs.length;
}

// ---------------------------------------------------------------------------
// Kanban board
// ---------------------------------------------------------------------------
function renderKanban() {
  const host = document.getElementById('dash-kanban');
  const hideDone = document.getElementById('dash-kanban-hide-done').checked;
  const allCases = listCases();
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const visibleStatuses = PROGRESS_STATUSES.filter(s =>
    !hideDone || (s.key !== 'completed' && s.key !== 'cancelled'));

  host.style.gridTemplateColumns = `repeat(${visibleStatuses.length}, minmax(180px, 1fr))`;

  host.innerHTML = visibleStatuses.map(s => {
    const cards = allCases.filter(c => (c.progress_status || 'inquiry') === s.key);
    return `
      <div class="kanban-col kanban-col--${s.color}">
        <div class="kanban-col__head">
          <span class="kanban-col__title">${escapeHtml(s.label)}</span>
          <span class="kanban-col__count">${cards.length}</span>
        </div>
        ${cards.length ? cards.map(c => {
          const etd = c.etd ? new Date(c.etd) : null;
          let etdClass = '';
          if (etd && !Number.isNaN(+etd)) {
            const d = Math.floor((etd - today) / 86400000);
            if (d < 0 && s.key !== 'shipped' && s.key !== 'arrived' && s.key !== 'completed') etdClass = 'kanban-card__etd--alert';
          }
          return `
            <div class="kanban-card" data-case-id="${c.id}">
              <div class="kanban-card__code">${escapeHtml(c.case_code || '#' + c.id)}</div>
              <div class="kanban-card__vehicle">${escapeHtml(`${c.maker || ''} ${c.model_name || ''}`.trim())}</div>
              <div class="kanban-card__meta">
                <span class="kanban-card__amount">${c.amount_jpy ? '¥' + Number(c.amount_jpy).toLocaleString() : '—'}</span>
                <span class="kanban-card__etd ${etdClass}">${c.etd ? 'ETD ' + c.etd.slice(5) : ''}</span>
              </div>
            </div>`;
        }).join('') : '<div class="kanban-col__empty">なし</div>'}
      </div>
    `;
  }).join('');

  host.querySelectorAll('[data-case-id]').forEach(card => {
    card.addEventListener('click', () => openCaseEditor(Number(card.dataset.caseId)));
  });
}

// ---------------------------------------------------------------------------
// Breakdown charts (existing, unchanged except for progress chart added)
// ---------------------------------------------------------------------------
function renderBreakdownCharts() {
  const rows = listCases();
  const parties = listParties('all');
  const partyName = (id) => parties.find(p => p.id === id)?.company_name || '（未設定）';

  const buyerBuckets = aggregateSum(rows, r => {
    const d = getCaseDoc(r.id, 'invoice') || getCaseDoc(r.id, 'sales_confirmation');
    return d?.buyer_id ? partyName(d.buyer_id) : '（未設定）';
  }, r => Number(r.amount_jpy || 0));
  renderBarChart('dash-buyer-chart', buyerBuckets);

  const modelBuckets = aggregateSum(rows,
    r => `${r.maker || ''} ${r.model_name || ''}`.trim() || '（未設定）',
    r => Number(r.amount_jpy || 0));
  renderBarChart('dash-model-chart', modelBuckets);

  const payBuckets = aggregateSum(rows,
    r => paymentLabel(r.payment_status || 'unpaid'),
    r => Number(r.amount_jpy || 0));
  renderBarChart('dash-payment-chart', payBuckets);

  const progBuckets = aggregateSum(rows,
    r => progressLabel(r.progress_status || 'inquiry'),
    r => Number(r.amount_jpy || 0));
  renderBarChart('dash-progress-chart', progBuckets);
}

function aggregateSum(rows, keyFn, valFn) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    map.set(k, (map.get(k) || 0) + valFn(r));
  }
  return Array.from(map.entries()).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
}

// Horizontal bar chart (HTML-only, no external chart library).
function renderBarChart(hostId, buckets) {
  const host = document.getElementById(hostId);
  if (!host) return;
  if (!buckets.length) { host.innerHTML = '<div class="muted">データなし</div>'; return; }
  const max = Math.max(...buckets.map(([, v]) => v)) || 1;
  host.innerHTML = buckets.map(([label, val]) => `
    <div class="bar-row">
      <div class="bar-label" title="${escapeHtml(label)}">${escapeHtml(label)}</div>
      <div class="bar-track">
        <div class="bar-fill" style="width:${(val / max * 100).toFixed(1)}%"></div>
      </div>
      <div class="bar-value">¥${Number(val).toLocaleString()}</div>
    </div>
  `).join('');
}

// ============================================================================
// A4 — Receivables (upcoming / overdue payments)
// ============================================================================
function setupReceivables() {
  document.getElementById('rcv-filter').addEventListener('change', renderReceivables);
  document.getElementById('rcv-days').addEventListener('change', renderReceivables);
}

function renderReceivables() {
  const filter = document.getElementById('rcv-filter').value;
  const days = Math.max(1, Number(document.getElementById('rcv-days').value) || 7);
  const rows = listCases();
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const items = rows
    .filter(r => r.payment_status !== 'paid' && r.payment_status !== 'cancelled')
    .map(r => {
      const paid = paymentsTotal(r.id);
      const cif = Number(r.amount_jpy || 0);
      const remaining = Math.max(0, cif - paid);
      const due = r.payment_due_date ? new Date(r.payment_due_date) : null;
      const daysDiff = due ? Math.floor((due - today) / (1000 * 60 * 60 * 24)) : null;
      let state;
      if (daysDiff == null) state = '期日未設定';
      else if (daysDiff < 0) state = `${-daysDiff}日超過`;
      else if (daysDiff === 0) state = '本日';
      else state = `あと${daysDiff}日`;
      return { ...r, paid, remaining, daysDiff, state };
    })
    .filter(r => r.remaining > 0);

  let filtered = items;
  if (filter === 'upcoming') {
    filtered = items.filter(r => r.daysDiff != null && r.daysDiff >= 0 && r.daysDiff <= days);
  } else if (filter === 'overdue') {
    filtered = items.filter(r => r.daysDiff != null && r.daysDiff < 0);
  }
  filtered.sort((a, b) => (a.daysDiff ?? 9999) - (b.daysDiff ?? 9999));

  const tbody = document.querySelector('#table-receivables tbody');
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="muted" style="text-align:center;padding:20px">該当する案件がありません。</td></tr>';
  } else {
    const parties = listParties('all');
    const partyName = (id) => parties.find(p => p.id === id)?.company_name || '';
    tbody.innerHTML = filtered.map(r => {
      const buyer = (() => {
        const d = getCaseDoc(r.id, 'invoice') || getCaseDoc(r.id, 'sales_confirmation');
        return d?.buyer_id ? partyName(d.buyer_id) : '';
      })();
      const overdue = r.daysDiff != null && r.daysDiff < 0;
      return `
        <tr>
          <td>${escapeHtml(r.case_code || '')}</td>
          <td>${escapeHtml(buyer)}</td>
          <td>${escapeHtml(r.payment_due_date || '—')}</td>
          <td style="text-align:right">¥${Number(r.amount_jpy || 0).toLocaleString()}</td>
          <td style="text-align:right">¥${r.paid.toLocaleString()}</td>
          <td style="text-align:right;font-weight:600;color:${overdue ? '#dc2626' : '#1f2937'}">¥${r.remaining.toLocaleString()}</td>
          <td><span class="badge badge--${overdue ? 'red' : 'amber'}">${escapeHtml(r.state)}</span></td>
          <td><button class="btn" data-edit-case="${r.id}">編集</button></td>
        </tr>`;
    }).join('');
    tbody.querySelectorAll('[data-edit-case]').forEach(btn => {
      btn.addEventListener('click', () => openCaseEditor(Number(btn.dataset.editCase)));
    });
  }

  const totalRemain = filtered.reduce((s, r) => s + r.remaining, 0);
  document.getElementById('rcv-summary').innerHTML = `
    <div class="stat-row__item"><span class="stat-row__label">対象件数</span><span class="stat-row__value">${filtered.length}</span></div>
    <div class="stat-row__item"><span class="stat-row__label">残高合計</span><span class="stat-row__value">¥${totalRemain.toLocaleString()}</span></div>
  `;
}

// ============================================================================
// B2 & B3 — Bulk issue (HTML-in-ZIP) and issue log
// ============================================================================
async function bulkIssueCurrentCase() {
  const caseId = Number(document.getElementById('preview-case').value);
  if (!caseId) { toast('案件を選択してください', 'error'); return; }
  const docTypes = DOC_TYPES.filter(t => t.implemented).map(t => t.key);
  const caseCode = sanitizeFileName(getCase(caseId).case_code || 'case');
  const files = [];
  for (const docType of docTypes) {
    const node = buildDocNode(caseId, docType);
    if (!node) continue;
    const html = wrapStandaloneHtml(node.outerHTML, docType);
    files.push({ name: `${caseCode}_${docType}.html`, content: html });
    await logDocIssued(caseId, docType, 'bulk');
  }
  if (!files.length) { toast('発行可能な書類がありません', 'error'); return; }

  // Attach photos as a companion index (listed in photos/README) — saved as
  // text descriptions since the ZIP writer is text-only (by design for simplicity).
  const photos = listPhotos(caseId);
  if (photos.length) {
    const index = photos.map((p, i) =>
      `${i + 1}. ${p.filename || `photo_${p.id}`}${p.caption ? ' — ' + p.caption : ''}`
    ).join('\n');
    files.push({
      name: `${caseCode}_photos_index.txt`,
      content: `写真一覧（${photos.length}枚）\n\n${index}\n\n※ 写真本体はシステム内DBに保存されています。\n個別の画像ファイルが必要な場合は案件詳細ビューから1枚ずつダウンロードしてください。`,
    });
  }
  downloadZip(files, `${caseCode}_docs.zip`);
  toast(`${files.length}件のファイルを発行しました`, 'success');
  renderCases();
}

function buildDocNode(caseId, docType) {
  const caseRow = getCase(caseId);
  if (!caseRow) return null;
  const seller = caseRow.seller_id ? getParty(caseRow.seller_id) : null;
  const doc = getCaseDoc(caseRow.id, docType);
  const buyer = doc?.buyer_id ? getParty(doc.buyer_id) : null;
  const notifyParty = caseRow.notify_party_id ? getParty(caseRow.notify_party_id) : null;
  switch (docType) {
    case 'sales_confirmation':   return renderSalesConfirmation({ caseRow, seller, buyer, doc });
    case 'invoice':              return renderInvoice({ caseRow, seller, buyer, doc });
    case 'shipping_instruction': return renderShippingInstruction({ caseRow, seller, buyer, doc, notifyParty });
    case 'export_certificate':   return renderExportCertificate({ caseRow, seller, doc });
    case 'preserved_record':     return renderPreservedRecord({ caseRow, seller, doc, events: listCaseEvents(caseRow.id) });
    default: return null;
  }
}

function wrapStandaloneHtml(innerHtml, docType) {
  const isLandscape = docType === 'export_certificate' || docType === 'preserved_record';
  return `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8">
<title>${docType}</title>
<link rel="stylesheet" href="../css/app.css">
<link rel="stylesheet" href="../css/documents.css">
<style>
  body { margin: 0; background: #fff; display: flex; justify-content: center; padding: 12mm; }
  @media print { @page { size: A4 ${isLandscape ? 'landscape' : 'portrait'}; margin: 0; } body { padding: 0; } }
</style>
</head><body>
${innerHtml}
</body></html>`;
}

function sanitizeFileName(s) {
  return String(s).replace(/[\\/:*?"<>|]/g, '_');
}

// Minimal uncompressed-ZIP writer (store method, no compression). Suitable
// for small HTML payloads. No external dependencies required.
function downloadZip(files, filename) {
  const enc = new TextEncoder();
  const fileRecords = [];
  let offset = 0;
  const parts = [];
  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  const crc32 = (bytes) => {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const data = enc.encode(f.content);
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 0, true);
    dv.setUint16(8, 0, true); dv.setUint16(10, 0, true); dv.setUint16(12, 0, true);
    dv.setUint32(14, crc, true); dv.setUint32(18, data.length, true); dv.setUint32(22, data.length, true);
    dv.setUint16(26, nameBytes.length, true); dv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    parts.push(local, data);
    fileRecords.push({ nameBytes, crc, size: data.length, offset });
    offset += local.length + data.length;
  }
  const centralParts = [];
  let centralSize = 0;
  for (const r of fileRecords) {
    const cd = new Uint8Array(46 + r.nameBytes.length);
    const dv = new DataView(cd.buffer);
    dv.setUint32(0, 0x02014b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 20, true);
    dv.setUint16(8, 0, true); dv.setUint16(10, 0, true); dv.setUint16(12, 0, true); dv.setUint16(14, 0, true);
    dv.setUint32(16, r.crc, true); dv.setUint32(20, r.size, true); dv.setUint32(24, r.size, true);
    dv.setUint16(28, r.nameBytes.length, true); dv.setUint16(30, 0, true); dv.setUint16(32, 0, true);
    dv.setUint16(34, 0, true); dv.setUint16(36, 0, true); dv.setUint32(38, 0, true); dv.setUint32(42, r.offset, true);
    cd.set(r.nameBytes, 46);
    centralParts.push(cd);
    centralSize += cd.length;
  }
  const eocd = new Uint8Array(22);
  const dv = new DataView(eocd.buffer);
  dv.setUint32(0, 0x06054b50, true); dv.setUint16(4, 0, true); dv.setUint16(6, 0, true);
  dv.setUint16(8, fileRecords.length, true); dv.setUint16(10, fileRecords.length, true);
  dv.setUint32(12, centralSize, true); dv.setUint32(16, offset, true); dv.setUint16(20, 0, true);

  const blob = new Blob([...parts, ...centralParts, eocd], { type: 'application/zip' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function openMailDraft() {
  const caseId = Number(document.getElementById('preview-case').value);
  const docType = document.getElementById('preview-doc').value;
  if (!caseId) { toast('案件を選択してください', 'error'); return; }
  const c = getCase(caseId);
  if (!c) return;
  const doc = getCaseDoc(caseId, docType);
  const buyer = doc?.buyer_id ? getParty(doc.buyer_id) : null;

  const tokens = {
    '{case_code}':   c.case_code || '#' + caseId,
    '{buyer_name}':  buyer?.company_name || '[Buyer]',
    '{invoice_ref}': c.invoice_ref_no || '',
    '{vehicle}':     `${c.maker || ''} ${c.model_name || ''}`.trim(),
    '{chassis_no}':  c.chassis_no || '',
    '{amount}':      c.amount_jpy ? '¥' + Number(c.amount_jpy).toLocaleString() : '',
    '{etd}':         c.etd || '',
    '{eta}':         c.eta || '',
    '{signer_name}': getSetting('signer_name', 'MAKOTO Kubota'),
    '{signer_title}':getSetting('signer_title', 'Managing Director'),
  };
  const apply = (tpl) => {
    let s = tpl || '';
    for (const [k, v] of Object.entries(tokens)) s = s.split(k).join(v);
    return s;
  };
  const subject = apply(getSetting('mail_subject', 'Documents for {case_code}'));
  const body = apply(getSetting('mail_body',
    'Dear {buyer_name},\n\nPlease find attached the shipping documents for {case_code}.\n\nBest regards,\n{signer_name}'));
  const to = buyer?.email || '';
  const from = getSetting('mail_from', '');

  // Use mailto: for simple drafts. If a From address is set, append it as
  // a hint in the body (many mail clients ignore mailto "from" anyway).
  const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  // Offer both mailto and downloadable .eml for flexibility.
  const eml =
`From: ${from}
To: ${to}
Subject: ${subject}
Content-Type: text/plain; charset=UTF-8

${body}`;

  const choice = confirm(
    `メール下書きを生成します。\n\n宛先: ${to || '(未設定)'}\n件名: ${subject}\n\nOK = メーラーで開く\nキャンセル = .emlファイルをダウンロード`
  );
  if (choice) {
    window.location.href = mailto;
  } else {
    const blob = new Blob([eml], { type: 'message/rfc822' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(c.case_code || 'case')}_mail.eml`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
}

function toggleIssueLog() {
  const caseId = Number(document.getElementById('preview-case').value);
  const host = document.getElementById('doc-issue-log');
  if (!caseId) { toast('案件を選択してください', 'error'); return; }
  if (!host.classList.contains('hidden') && host.dataset.caseId === String(caseId)) {
    host.classList.add('hidden'); return;
  }
  host.dataset.caseId = String(caseId);
  const rows = listDocIssueLog(caseId);
  if (!rows.length) {
    host.innerHTML = '<h3>書類発行履歴</h3><div class="muted">まだ発行履歴がありません。</div>';
  } else {
    const typeLabel = (k) => DOC_TYPES.find(t => t.key === k)?.label || k;
    host.innerHTML = `
      <h3>書類発行履歴</h3>
      <table class="data-table">
        <thead><tr><th>発行日時</th><th>書類</th><th>版</th><th>発行元</th><th>メモ</th></tr></thead>
        <tbody>${rows.map(r => `
          <tr>
            <td>${escapeHtml(new Date(r.issued_at).toLocaleString('ja-JP'))}</td>
            <td>${escapeHtml(typeLabel(r.doc_type))}</td>
            <td>v${r.version}</td>
            <td>${escapeHtml(r.issued_by || '')}</td>
            <td>${escapeHtml(r.note || '')}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    `;
  }
  host.classList.remove('hidden');
}

// ============================================================================
// B4 — CSV import / export
// ============================================================================
function setupCsvMenu() {
  const wrap = document.querySelector('.menu-wrap');
  const btn = document.getElementById('btn-csv-menu');
  const menu = document.getElementById('csv-menu');
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('hidden');
  });
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) menu.classList.add('hidden');
  });
  menu.querySelectorAll('[data-csv-export]').forEach(b => {
    b.addEventListener('click', () => {
      exportCsv(b.dataset.csvExport);
      menu.classList.add('hidden');
    });
  });
  menu.querySelectorAll('[data-csv-import]').forEach(inp => {
    inp.addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const text = await f.text();
        await importCsv(inp.dataset.csvImport, text);
        toast('CSVをインポートしました', 'success');
        renderCases(); renderParties(); renderVehicleModels();
      } catch (err) {
        toast('CSVインポート失敗: ' + err.message, 'error');
      } finally {
        e.target.value = '';
        menu.classList.add('hidden');
      }
    });
  });
}

const CSV_SCHEMAS = {
  cases:         { table: 'cases',          keyColumns: ['case_code'] },
  parties:       { table: 'parties',        keyColumns: ['company_name', 'role'] },
  vehicle_models:{ table: 'vehicle_models', keyColumns: ['maker', 'model_name'] },
  payments:      { table: 'payments',       keyColumns: null },
  costs:         { table: 'costs',          keyColumns: null },
};

function exportCsv(kind) {
  const schema = CSV_SCHEMAS[kind];
  if (!schema) return;
  const rows = query(`SELECT * FROM ${schema.table}`);
  if (!rows.length) { toast('エクスポートするデータがありません', 'error'); return; }
  const cols = Object.keys(rows[0]);
  const lines = [cols.join(',')];
  for (const r of rows) {
    lines.push(cols.map(c => csvEscape(r[c])).join(','));
  }
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${kind}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function parseCsv(text) {
  const rows = [];
  let row = []; let cur = ''; let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else { inQuotes = false; }
      } else { cur += ch; }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { row.push(cur); cur = ''; }
      else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (ch === '\r') { /* skip */ }
      else { cur += ch; }
    }
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

async function importCsv(kind, text) {
  const schema = CSV_SCHEMAS[kind];
  if (!schema) throw new Error('Unknown CSV kind: ' + kind);
  const rows = parseCsv(text.replace(/^\uFEFF/, ''));
  if (!rows.length) return;
  const header = rows.shift();
  // Get column names available in table
  const tableCols = query(`PRAGMA table_info(${schema.table})`).map(r => r.name);
  let updated = 0, inserted = 0;
  for (const r of rows) {
    if (!r.length || r.every(v => v === '')) continue;
    const rec = {};
    for (let i = 0; i < header.length; i++) {
      const k = header[i].trim();
      if (tableCols.includes(k) && k !== 'id') rec[k] = r[i] === '' ? null : r[i];
    }
    // Match by keyColumns if present
    let id = null;
    if (schema.keyColumns) {
      const where = schema.keyColumns.map(c => `${c}=?`).join(' AND ');
      const params = schema.keyColumns.map(c => rec[c]);
      const existing = query(`SELECT id FROM ${schema.table} WHERE ${where}`, params)[0];
      if (existing) id = existing.id;
    }
    const cols = Object.keys(rec);
    const vals = cols.map(c => rec[c]);
    if (id) {
      const sets = cols.map(c => `${c}=?`).join(',');
      run(`UPDATE ${schema.table} SET ${sets} WHERE id=?`, [...vals, id]);
      updated++;
    } else {
      const ph = cols.map(() => '?').join(',');
      run(`INSERT INTO ${schema.table} (${cols.join(',')}) VALUES (${ph})`, vals);
      inserted++;
    }
  }
  await persist();
  toast(`CSV: 追加${inserted}件 / 更新${updated}件`, 'success');
}

// ============================================================================
// Case detail view (read-only dashboard for a single case)
// ============================================================================

let CURRENT_DETAIL_CASE = null;

function setupDetailView() {
  document.querySelectorAll('[data-detail-close]').forEach(el => {
    el.addEventListener('click', closeDetailView);
  });
  document.getElementById('btn-detail-edit').addEventListener('click', () => {
    const id = CURRENT_DETAIL_CASE;
    closeDetailView();
    if (id) openCaseEditor(id);
  });
  document.getElementById('btn-detail-print').addEventListener('click', () => {
    document.body.classList.add('printing-detail');
    window.print();
    setTimeout(() => document.body.classList.remove('printing-detail'), 300);
  });
}

function openCaseDetail(id) {
  CURRENT_DETAIL_CASE = id;
  const modal = document.getElementById('detail-modal');
  modal.classList.remove('hidden');
  renderDetailView(id);
}

function closeDetailView() {
  document.getElementById('detail-modal').classList.add('hidden');
  CURRENT_DETAIL_CASE = null;
}

function renderDetailView(caseId) {
  const c = getCase(caseId);
  if (!c) return;
  const seller = c.seller_id ? getParty(c.seller_id) : null;
  // Try to use Invoice buyer, fallback to Sales Confirmation buyer
  const invoiceDoc = getCaseDoc(caseId, 'invoice');
  const scDoc = getCaseDoc(caseId, 'sales_confirmation');
  const buyer = (invoiceDoc?.buyer_id ? getParty(invoiceDoc.buyer_id) : null)
             || (scDoc?.buyer_id ? getParty(scDoc.buyer_id) : null);
  const notify = c.notify_party_id ? getParty(c.notify_party_id) : null;

  // Header
  document.getElementById('detail-case-code').textContent = c.case_code || `#${caseId}`;
  const prog = c.progress_status || 'inquiry';
  const pay  = c.payment_status || 'unpaid';
  document.getElementById('detail-head-meta').innerHTML = `
    <span class="badge badge--${progressColor(prog)}">${escapeHtml(progressLabel(prog))}</span>
    <span class="badge badge--${paymentColor(pay)}">${escapeHtml(paymentLabel(pay))}</span>
    ${buyer ? `<span>Buyer: <strong>${escapeHtml(buyer.company_name)}</strong></span>` : ''}
    ${c.etd ? `<span>ETD: ${escapeHtml(c.etd)}</span>` : ''}
    ${c.eta ? `<span>ETA: ${escapeHtml(c.eta)}</span>` : ''}
  `;

  const payments = listPayments(caseId);
  const paid = payments.reduce((s, p) => s + (Number(p.amount_jpy) || 0), 0);
  const costs = listCosts(caseId);
  const costTotal = costs.reduce((s, x) => s + (Number(x.amount_jpy) || 0), 0);
  const cif = Number(c.amount_jpy) || 0;
  const remaining = Math.max(0, cif - paid);
  const profit = cif - costTotal;
  const payPct = cif ? Math.min(100, Math.round(paid / cif * 100)) : 0;
  const events = listCaseEvents(caseId);
  const photos = listPhotos(caseId);

  const body = document.getElementById('detail-body');
  body.innerHTML = `
    <div class="detail-col">
      <!-- Vehicle summary -->
      <div class="detail-card">
        <div class="detail-card__head">
          <h4>🚗 車両情報</h4>
        </div>
        <dl class="detail-kv">
          <dt>メーカー/モデル</dt><dd>${escapeHtml(`${c.maker || ''} ${c.model_name || ''}`.trim() || '—')}</dd>
          <dt>年式</dt><dd>${escapeHtml(c.year_month || '—')}</dd>
          <dt>Model Code</dt><dd>${escapeHtml(c.model_code || '—')}</dd>
          <dt>Chassis No.</dt><dd><strong>${escapeHtml(c.chassis_no || '—')}</strong></dd>
          <dt>Engine</dt><dd>${escapeHtml((c.engine_no || '') + ' / ' + (c.engine_capacity || ''))}</dd>
          <dt>Mileage</dt><dd>${escapeHtml(c.mileage || '—')}</dd>
          <dt>Color / Fuel</dt><dd>${escapeHtml((c.exterior_color || '—') + ' / ' + (c.fuel || '—'))}</dd>
          <dt>Grade</dt><dd>${escapeHtml(c.auction_grade || '—')}</dd>
          <dt>CIF</dt><dd><strong style="font-size:14px">${cif ? '¥' + cif.toLocaleString() : '—'}</strong></dd>
        </dl>
      </div>

      <!-- Shipment -->
      <div class="detail-card">
        <div class="detail-card__head">
          <h4>⚓ 船積情報</h4>
        </div>
        <dl class="detail-kv">
          <dt>Vessel</dt><dd>${escapeHtml((c.vessel_name || '—') + (c.voyage_no ? ' / ' + c.voyage_no : ''))}</dd>
          <dt>Shipping Co.</dt><dd>${escapeHtml(c.shipping_company || '—')}</dd>
          <dt>Booking No.</dt><dd>${escapeHtml(c.booking_no || '—')}</dd>
          <dt>ETD</dt><dd>${escapeHtml(c.etd || '—')}</dd>
          <dt>ETA</dt><dd>${escapeHtml(c.eta || '—')}</dd>
          <dt>Port of Loading</dt><dd>${escapeHtml(c.port_of_loading || '—')}</dd>
          <dt>Port of Discharge</dt><dd>${escapeHtml(c.port_of_discharge || '—')}</dd>
          <dt>Type of Service</dt><dd>${escapeHtml(c.type_of_service || '—')}</dd>
          <dt>Delivery Term</dt><dd>${escapeHtml(c.delivery_term || '—')}</dd>
          <dt>Notify Party</dt><dd>${escapeHtml(notify?.company_name || '—')}</dd>
        </dl>
      </div>

      <!-- Document status -->
      <div class="detail-card">
        <div class="detail-card__head">
          <h4>📄 書類発行状況</h4>
        </div>
        <div class="doc-status-grid" id="detail-doc-status"></div>
      </div>

      <!-- Registration history -->
      ${events.length ? `
      <div class="detail-card">
        <div class="detail-card__head">
          <h4>📋 登録履歴</h4>
        </div>
        <ul class="reg-timeline">
          ${events.map(e => `
            <li>
              <div class="reg-timeline__date">${escapeHtml(e.event_date || '')}</div>
              <div class="reg-timeline__type">${escapeHtml(e.event_type || '')}</div>
              ${e.owner_name ? `<div style="font-size:11px;color:#6b7280">所有者: ${escapeHtml(e.owner_name)}</div>` : ''}
            </li>`).join('')}
        </ul>
      </div>` : ''}
    </div>

    <div class="detail-col">
      <!-- Parties -->
      <div class="detail-card">
        <div class="detail-card__head">
          <h4>👥 取引相手</h4>
        </div>
        <div style="font-size:12px">
          <div style="margin-bottom:8px"><strong>Seller</strong><br>${escapeHtml(seller?.company_name || '—')}</div>
          <div style="margin-bottom:8px"><strong>Buyer</strong><br>${escapeHtml(buyer?.company_name || '—')}${buyer?.address ? `<br><span style="color:#6b7280">${escapeHtml(buyer.address).replace(/\n/g, '<br>')}</span>` : ''}</div>
          ${notify ? `<div><strong>Notify Party</strong><br>${escapeHtml(notify.company_name)}</div>` : ''}
        </div>
      </div>

      <!-- Payment progress -->
      <div class="detail-card">
        <div class="detail-card__head">
          <h4>💰 入金状況</h4>
          <span class="detail-card__head__action">${payments.length}件</span>
        </div>
        <dl class="detail-kv" style="margin-bottom:8px">
          <dt>請求額</dt><dd><strong>¥${cif.toLocaleString()}</strong></dd>
          <dt>入金済み</dt><dd style="color:#059669">¥${paid.toLocaleString()}</dd>
          <dt>残高</dt><dd style="color:${remaining > 0 ? '#dc2626' : '#6b7280'}"><strong>¥${remaining.toLocaleString()}</strong></dd>
          ${c.payment_due_date ? `<dt>期日</dt><dd>${escapeHtml(c.payment_due_date)}</dd>` : ''}
        </dl>
        <div class="pay-progress">
          <div class="pay-progress__fill" style="width:${payPct}%"></div>
          <div class="pay-progress__label">${payPct}%</div>
        </div>
        ${payments.length ? `
          <ul class="pay-timeline">
            ${payments.map(p => `
              <li>
                <span>${escapeHtml(p.payment_date || '—')}</span>
                <span>${escapeHtml(p.method || '')} ${escapeHtml(p.reference_no || '')}</span>
                <span style="text-align:right;font-weight:600">¥${Number(p.amount_jpy || 0).toLocaleString()}</span>
              </li>`).join('')}
          </ul>` : '<div style="color:#9ca3af;font-size:12px;text-align:center;padding:6px">入金記録なし</div>'}
      </div>

      <!-- Cost & profit -->
      <div class="detail-card">
        <div class="detail-card__head">
          <h4>💸 原価 / 粗利</h4>
          <span class="detail-card__head__action">${costs.length}件</span>
        </div>
        ${costs.length ? `
          <table class="cost-table">
            ${costs.map(x => `
              <tr>
                <td style="color:#6b7280">${escapeHtml(x.cost_date || '')}</td>
                <td>${escapeHtml(x.cost_type || '')}</td>
                <td>¥${Number(x.amount_jpy || 0).toLocaleString()}</td>
              </tr>`).join('')}
          </table>
        ` : '<div style="color:#9ca3af;font-size:12px;text-align:center;padding:6px">原価記録なし</div>'}
        <dl class="detail-kv" style="margin-top:8px;border-top:1px solid #e5e7eb;padding-top:8px">
          <dt>原価合計</dt><dd>¥${costTotal.toLocaleString()}</dd>
          <dt>粗利</dt><dd style="color:${profit >= 0 ? '#059669' : '#dc2626'}"><strong>¥${profit.toLocaleString()}</strong>${cif ? ` (${(profit / cif * 100).toFixed(1)}%)` : ''}</dd>
        </dl>
      </div>

      <!-- Notes -->
      ${c.status_note ? `
      <div class="detail-card">
        <div class="detail-card__head"><h4>📝 メモ</h4></div>
        <div style="font-size:12.5px;white-space:pre-wrap">${escapeHtml(c.status_note)}</div>
      </div>` : ''}

      <!-- Photos -->
      <div class="detail-card">
        <div class="detail-card__head">
          <h4>📸 写真 <span style="font-size:11px;color:#9ca3af;font-weight:400">${photos.length}枚</span></h4>
        </div>
        <div class="photo-album" id="detail-photos"></div>
      </div>
    </div>
  `;

  renderDocStatusGrid(caseId);
  renderPhotoAlbum(caseId, document.getElementById('detail-photos'), { editable: true });
}

function renderDocStatusGrid(caseId) {
  const host = document.getElementById('detail-doc-status');
  const c = getCase(caseId);
  const logs = listDocIssueLog(caseId);
  const typeLabel = (k) => DOC_TYPES.find(t => t.key === k)?.label || k;
  host.innerHTML = DOC_TYPES.map(t => {
    const doc = getCaseDoc(caseId, t.key);
    const issues = logs.filter(l => l.doc_type === t.key);
    const issued = issues.length > 0;
    const last = issues[0];
    return `
      <div class="doc-status-item ${issued ? 'doc-status-item--issued' : ''}" data-doc-type="${t.key}">
        <div>
          <div class="doc-status-item__name">${escapeHtml(typeLabel(t.key))}</div>
          <div style="font-size:10.5px;color:#6b7280">
            ${issued ? `v${last.version} ${new Date(last.issued_at).toLocaleDateString('ja-JP')}` : '未発行'}
            ${doc?.buyer_id ? ` · Buyer設定済` : (t.key !== 'export_certificate' && t.key !== 'preserved_record' ? ' · Buyer未設定' : '')}
          </div>
        </div>
        <button class="doc-status-item__action" data-issue-doc="${t.key}">発行</button>
      </div>`;
  }).join('');
  host.querySelectorAll('[data-issue-doc]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const docType = btn.dataset.issueDoc;
      // Run validation first; if passes, open preview
      const issues = validateBeforeIssue(caseId, docType);
      if (issues.filter(i => i.level === 'error').length) {
        showValidationModal(caseId, docType, issues);
      } else {
        closeDetailView();
        switchTab('preview');
        document.getElementById('preview-case').value = caseId;
        document.getElementById('preview-doc').value = docType;
        document.getElementById('btn-preview-render').click();
      }
    });
  });
}

// ============================================================================
// Photo album
// ============================================================================

function renderPhotoAlbum(caseId, host, { editable = true } = {}) {
  const photos = listPhotos(caseId);
  host.innerHTML = photos.map(p => `
    <div class="photo-tile" data-photo-id="${p.id}">
      <img src="${p.data_url}" alt="${escapeHtml(p.caption || '')}">
      ${p.caption ? `<div class="photo-tile__caption">${escapeHtml(p.caption)}</div>` : ''}
      ${editable ? `<button class="photo-tile__remove" data-photo-remove="${p.id}" title="削除">×</button>` : ''}
    </div>
  `).join('') + (editable ? `
    <div class="photo-dropzone" data-photo-drop>
      ドラッグ&ドロップ または<br>クリックで写真を追加
      <input type="file" accept="image/*" multiple hidden data-photo-file>
    </div>
  ` : '');

  // Click to open lightbox
  host.querySelectorAll('.photo-tile').forEach(tile => {
    tile.addEventListener('click', (e) => {
      if (e.target.closest('[data-photo-remove]')) return;
      const id = Number(tile.dataset.photoId);
      const p = photos.find(x => x.id === id);
      if (p) openPhotoLightbox(p);
    });
  });
  if (editable) {
    host.querySelectorAll('[data-photo-remove]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('この写真を削除しますか？')) return;
        await deletePhoto(Number(btn.dataset.photoRemove));
        renderPhotoAlbum(caseId, host, { editable });
        if (host.id === 'editor-photo-album') updateEditorTabBadges(caseId);
        toast('写真を削除しました', 'success');
      });
    });
    const dz = host.querySelector('[data-photo-drop]');
    const fileInp = host.querySelector('[data-photo-file]');
    dz.addEventListener('click', () => fileInp.click());
    fileInp.addEventListener('change', async (e) => {
      await handlePhotoFiles(caseId, e.target.files);
      e.target.value = '';
      renderPhotoAlbum(caseId, host, { editable });
      if (host.id === 'editor-photo-album') updateEditorTabBadges(caseId);
    });
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag-over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
    dz.addEventListener('drop', async (e) => {
      e.preventDefault();
      dz.classList.remove('drag-over');
      await handlePhotoFiles(caseId, e.dataTransfer.files);
      renderPhotoAlbum(caseId, host, { editable });
      if (host.id === 'editor-photo-album') updateEditorTabBadges(caseId);
    });
  }
}

async function handlePhotoFiles(caseId, files) {
  let added = 0;
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    if (file.size > 3 * 1024 * 1024) {
      toast(`${file.name} は3MBを超えています`, 'error');
      continue;
    }
    const dataUrl = await fileToDataUrl(file);
    // Resize to max 1600px on long side for storage efficiency
    const resized = await resizeImage(dataUrl, 1600);
    await savePhoto({
      case_id: caseId,
      filename: file.name,
      mime_type: file.type,
      data_url: resized,
      caption: '',
      sort_order: listPhotos(caseId).length,
    });
    added++;
  }
  if (added) toast(`${added}枚の写真を追加しました`, 'success');
}

function resizeImage(dataUrl, maxDim) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      if (scale === 1) { resolve(dataUrl); return; }
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.src = dataUrl;
  });
}

function openPhotoLightbox(photo) {
  const lb = document.createElement('div');
  lb.className = 'photo-lightbox';
  lb.innerHTML = `
    <img src="${photo.data_url}" alt="${escapeHtml(photo.caption || '')}">
    ${photo.caption ? `<div class="photo-lightbox__caption">${escapeHtml(photo.caption)}</div>` : ''}
  `;
  lb.addEventListener('click', () => lb.remove());
  document.body.appendChild(lb);
}

// ============================================================================
// Issue validation (pre-flight checklist)
// ============================================================================

const VALIDATION_RULES = {
  sales_confirmation: {
    required: [
      { field: 'case_code', label: 'Case Code' },
      { field: 'seller_id', label: 'Seller', via: 'select' },
      { field: 'amount_jpy', label: 'CIF金額' },
      { field: 'invoice_date', label: 'Invoice Date', level: 'warn' },
    ],
    perDoc: [
      { field: 'buyer_id', label: 'Sales Confirmation のBuyer' },
    ],
    seller: ['company_name', 'address'],
  },
  invoice: {
    required: [
      { field: 'case_code', label: 'Case Code' },
      { field: 'seller_id', label: 'Seller' },
      { field: 'amount_jpy', label: 'CIF金額' },
      { field: 'invoice_date', label: 'Invoice Date' },
      { field: 'payment_due_date', label: 'Payment Due Date', level: 'warn' },
      { field: 'vessel_name', label: 'Vessel Name', level: 'warn' },
      { field: 'etd', label: 'ETD', level: 'warn' },
      { field: 'eta', label: 'ETA', level: 'warn' },
    ],
    perDoc: [
      { field: 'buyer_id', label: 'Invoice のBuyer' },
    ],
    seller: ['bank_name', 'bank_account_no', 'bank_swift'],
  },
  shipping_instruction: {
    required: [
      { field: 'case_code', label: 'Case Code' },
      { field: 'seller_id', label: 'Seller' },
      { field: 'shipping_company', label: 'Shipping Company' },
      { field: 'vessel_name', label: 'Vessel Name' },
      { field: 'etd', label: 'ETD' },
      { field: 'port_of_loading', label: 'Port of Loading' },
      { field: 'port_of_discharge', label: 'Port of Discharge' },
      { field: 'chassis_no', label: 'Chassis No.' },
      { field: 'weight_kg', label: 'Weight (kg)', level: 'warn' },
      { field: 'measurement_m3', label: 'Measurement (M3)', level: 'warn' },
      { field: 'hs_code', label: 'HS Code', level: 'warn' },
      { field: 'notify_party_id', label: 'Notify Party', level: 'warn' },
    ],
  },
  export_certificate: {
    required: [
      { field: 'chassis_no', label: 'Chassis No.' },
      { field: 'registration_no', label: 'Registration No.' },
      { field: 'registration_date', label: 'Registration Date' },
      { field: 'first_reg_date', label: 'First Reg. Date' },
      { field: 'export_scheduled_date', label: 'Export Scheduled Date' },
      { field: 'engine_model', label: 'Engine Model', level: 'warn' },
      { field: 'model_code', label: 'Model Code', level: 'warn' },
    ],
  },
  preserved_record: {
    required: [
      { field: 'chassis_no', label: 'Chassis No.' },
      { field: 'registration_no', label: 'Registration No.' },
    ],
    extra: (caseId) => {
      const events = listCaseEvents(caseId);
      return events.length === 0
        ? [{ level: 'warn', field: 'registration_events', label: '登録履歴', hint: '登録履歴が未入力です（最低1件の登録イベントを推奨）' }]
        : [];
    },
  },
};

function validateBeforeIssue(caseId, docType) {
  const c = getCase(caseId);
  if (!c) return [];
  const rule = VALIDATION_RULES[docType];
  if (!rule) return [];

  const issues = [];
  const check = (field, label, level = 'error') => {
    const v = c[field];
    if (v == null || v === '' || v === 0) {
      issues.push({ level, field, label, hint: `${label} が未設定です` });
    }
  };

  for (const r of rule.required || []) {
    check(r.field, r.label, r.level || 'error');
  }

  // Per-doc (buyer/terms on the doc record)
  if (rule.perDoc) {
    const doc = getCaseDoc(caseId, docType);
    for (const r of rule.perDoc) {
      if (!doc || !doc[r.field]) {
        issues.push({ level: r.level || 'error', field: r.field, label: r.label, hint: `${r.label} が未設定です` });
      }
    }
  }

  // Seller sub-fields
  if (rule.seller) {
    const seller = c.seller_id ? getParty(c.seller_id) : null;
    for (const f of rule.seller) {
      if (!seller || !seller[f]) {
        issues.push({ level: 'warn', field: `seller.${f}`, label: `Seller.${f}`, hint: `Seller の ${f} が未登録です` });
      }
    }
  }

  if (typeof rule.extra === 'function') {
    issues.push(...rule.extra(caseId));
  }

  return issues;
}

let VALIDATION_PROCEED = null;

function setupValidation() {
  document.querySelectorAll('[data-validate-close]').forEach(el => {
    el.addEventListener('click', () => {
      document.getElementById('validate-modal').classList.add('hidden');
      VALIDATION_PROCEED = null;
    });
  });
  document.getElementById('btn-validate-proceed').addEventListener('click', () => {
    document.getElementById('validate-modal').classList.add('hidden');
    if (VALIDATION_PROCEED) VALIDATION_PROCEED();
    VALIDATION_PROCEED = null;
  });
}

function showValidationModal(caseId, docType, issues, onProceed) {
  const modal = document.getElementById('validate-modal');
  const typeLabel = DOC_TYPES.find(t => t.key === docType)?.label || docType;
  document.getElementById('validate-intro').textContent =
    `${typeLabel} の発行前チェックで${issues.filter(i=>i.level==='error').length}件のエラー・${issues.filter(i=>i.level==='warn').length}件の警告があります。`;
  document.getElementById('validate-issues').innerHTML = issues.map(i => `
    <div class="validate-issue validate-issue--${i.level}">
      <div class="validate-issue__icon">${i.level === 'error' ? '❌' : '⚠️'}</div>
      <div>
        <div class="validate-issue__field">${escapeHtml(i.label)}</div>
        <div class="validate-issue__hint">${escapeHtml(i.hint)}</div>
      </div>
    </div>
  `).join('');
  VALIDATION_PROCEED = onProceed || (() => {
    closeDetailView();
    switchTab('preview');
    document.getElementById('preview-case').value = caseId;
    document.getElementById('preview-doc').value = docType;
    document.getElementById('btn-preview-render').click();
  });
  modal.classList.remove('hidden');
}

// ============================================================================
// Tag suggestions (below tag input in case editor)
// ============================================================================

function renderTagSuggestions() {
  const host = document.getElementById('case-tags-suggestions');
  if (!host) return;
  const tags = listAllTags();
  if (!tags.length) {
    host.textContent = '';
    return;
  }
  host.innerHTML = '候補: ' + tags.map(t =>
    `<span class="tag-chip" data-add-tag="${escapeHtml(t)}" style="cursor:pointer;margin-right:3px">${escapeHtml(t)}</span>`
  ).join('');
  host.querySelectorAll('[data-add-tag]').forEach(chip => {
    chip.addEventListener('click', () => {
      const input = document.getElementById('case-tags-input');
      const cur = parseTags(input.value);
      const add = chip.dataset.addTag;
      if (!cur.includes(add)) {
        cur.push(add);
        input.value = cur.join(', ');
      }
    });
  });
}

// ============================================================================
// Command Palette (Cmd/Ctrl+K)
// ============================================================================

let CMDK_RESULTS = [];
let CMDK_ACTIVE_INDEX = 0;

function setupCommandPalette() {
  const modal = document.getElementById('cmdk-modal');
  document.querySelectorAll('[data-cmdk-close]').forEach(el => {
    el.addEventListener('click', closeCommandPalette);
  });
  document.getElementById('btn-open-cmdk').addEventListener('click', openCommandPalette);
  const input = document.getElementById('cmdk-input');
  input.addEventListener('input', () => rebuildCmdkResults(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      CMDK_ACTIVE_INDEX = Math.min(CMDK_RESULTS.length - 1, CMDK_ACTIVE_INDEX + 1);
      updateCmdkHighlight();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      CMDK_ACTIVE_INDEX = Math.max(0, CMDK_ACTIVE_INDEX - 1);
      updateCmdkHighlight();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const hit = CMDK_RESULTS[CMDK_ACTIVE_INDEX];
      if (hit) {
        closeCommandPalette();
        hit.run();
      }
    } else if (e.key === 'Escape') {
      closeCommandPalette();
    }
  });
}

function openCommandPalette() {
  const modal = document.getElementById('cmdk-modal');
  modal.classList.remove('hidden');
  const input = document.getElementById('cmdk-input');
  input.value = '';
  rebuildCmdkResults('');
  setTimeout(() => input.focus(), 50);
}

function closeCommandPalette() {
  document.getElementById('cmdk-modal').classList.add('hidden');
}

function rebuildCmdkResults(query) {
  const q = String(query || '').trim().toLowerCase();
  const results = [];

  // Actions (always present, filtered by query)
  const actions = [
    { icon: '➕', title: '新規案件', sub: 'Cmd+N', run: () => openCaseEditor(null) },
    { icon: '📋', title: '案件一覧',       run: () => switchTab('cases') },
    { icon: '📊', title: 'ダッシュボード', run: () => switchTab('dashboard') },
    { icon: '💰', title: '入金予定',       run: () => switchTab('receivables') },
    { icon: '👥', title: 'Seller / Buyer 管理', run: () => switchTab('parties') },
    { icon: '🚗', title: '車両モデル管理', run: () => switchTab('models') },
    { icon: '📄', title: '書類プレビュー', run: () => switchTab('preview') },
    { icon: '⚙️', title: '設定',           run: () => switchTab('settings') },
    { icon: '❓', title: 'ヘルプを開く',   sub: 'Cmd+/', run: () => openHelp() },
    { icon: '⭐', title: 'お気に入りのみ表示', run: () => {
      document.getElementById('filter-favorites').checked = true;
      switchTab('cases'); renderCases();
    } },
    { icon: '💾', title: 'DBエクスポート', run: () => document.getElementById('btn-export-db').click() },
  ];
  const matchingActions = actions.filter(a =>
    !q || a.title.toLowerCase().includes(q) || (a.sub || '').toLowerCase().includes(q)
  );
  if (matchingActions.length) {
    results.push({ group: '操作' });
    results.push(...matchingActions);
  }

  // Cases
  const cases = listCases(q);
  const caseHits = cases.slice(0, 15).map(c => ({
    icon: c.is_favorite ? '⭐' : '🚢',
    title: `${c.case_code || '#' + c.id}${c.maker ? ' — ' + c.maker : ''}${c.model_name ? ' ' + c.model_name : ''}`,
    sub: c.chassis_no ? `Chassis: ${c.chassis_no}` : '',
    right: progressLabel(c.progress_status || 'inquiry'),
    run: () => openCaseDetail(c.id),
  }));
  if (caseHits.length) {
    results.push({ group: `案件 (${cases.length}件${cases.length > 15 ? '中 上位15件' : ''})` });
    results.push(...caseHits);
  }

  // Parties
  if (q) {
    const partyHits = listParties('all').filter(p =>
      p.company_name.toLowerCase().includes(q) ||
      (p.address || '').toLowerCase().includes(q)
    ).slice(0, 8).map(p => ({
      icon: p.role === 'seller' ? '🏢' : p.role === 'buyer' ? '🛒' : '📨',
      title: p.company_name,
      sub: `${p.role} · ${p.address || ''}`.slice(0, 70),
      run: () => { switchTab('parties'); },
    }));
    if (partyHits.length) {
      results.push({ group: 'Seller / Buyer' });
      results.push(...partyHits);
    }

    // Tags
    const allTags = listAllTags();
    const tagHits = allTags.filter(t => t.toLowerCase().includes(q)).map(t => ({
      icon: '🏷',
      title: `タグ: ${t}`,
      sub: `このタグの案件のみ表示`,
      run: () => {
        document.getElementById('filter-tag').value = t;
        switchTab('cases');
        renderCases();
      },
    }));
    if (tagHits.length) {
      results.push({ group: 'タグ' });
      results.push(...tagHits);
    }
  }

  CMDK_RESULTS = results.filter(r => !r.group);
  CMDK_ACTIVE_INDEX = 0;

  const host = document.getElementById('cmdk-results');
  if (!results.length) {
    host.innerHTML = '<div class="cmdk-empty">結果がありません</div>';
    return;
  }
  let itemIdx = 0;
  host.innerHTML = results.map(r => {
    if (r.group) return `<div class="cmdk-group__head">${escapeHtml(r.group)}</div>`;
    const idx = itemIdx++;
    return `
      <div class="cmdk-item" data-cmdk-idx="${idx}">
        <div class="cmdk-item__icon">${r.icon || ''}</div>
        <div class="cmdk-item__body">
          <div class="cmdk-item__title">${escapeHtml(r.title || '')}</div>
          ${r.sub ? `<div class="cmdk-item__sub">${escapeHtml(r.sub)}</div>` : ''}
        </div>
        ${r.right ? `<div class="cmdk-item__right">${escapeHtml(r.right)}</div>` : ''}
      </div>
    `;
  }).join('');
  host.querySelectorAll('[data-cmdk-idx]').forEach(el => {
    el.addEventListener('mouseenter', () => {
      CMDK_ACTIVE_INDEX = Number(el.dataset.cmdkIdx);
      updateCmdkHighlight();
    });
    el.addEventListener('click', () => {
      const hit = CMDK_RESULTS[Number(el.dataset.cmdkIdx)];
      if (hit) {
        closeCommandPalette();
        hit.run();
      }
    });
  });
  updateCmdkHighlight();
}

function updateCmdkHighlight() {
  const host = document.getElementById('cmdk-results');
  host.querySelectorAll('[data-cmdk-idx]').forEach(el => {
    const active = Number(el.dataset.cmdkIdx) === CMDK_ACTIVE_INDEX;
    el.classList.toggle('cmdk-item--active', active);
    if (active) el.scrollIntoView({ block: 'nearest' });
  });
}

// ============================================================================
// Global keyboard shortcuts
// ============================================================================

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    const inputActive = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')
                     && document.activeElement !== document.getElementById('cmdk-input');

    // Cmd/Ctrl+K — open command palette (always available)
    if (mod && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openCommandPalette();
      return;
    }

    // Cmd/Ctrl+N — new case (skip inside inputs; let browser handle new window otherwise)
    if (mod && e.key.toLowerCase() === 'n' && !e.shiftKey && !e.altKey) {
      // Only trigger when not inside a native input to avoid conflicts
      if (!inputActive) {
        e.preventDefault();
        openCaseEditor(null);
        return;
      }
    }

    // Cmd/Ctrl+S — save current form (in editor)
    if (mod && e.key.toLowerCase() === 's') {
      const form = document.getElementById('form-case');
      const editorPane = document.getElementById('tab-editor');
      if (editorPane && editorPane.classList.contains('active') && form) {
        e.preventDefault();
        form.requestSubmit();
        return;
      }
    }

    // Cmd/Ctrl+/  — open help
    if (mod && e.key === '/') {
      e.preventDefault();
      openHelp();
      return;
    }

    // ? (shift+/) — open help when not inside input
    if (e.key === '?' && !mod && !inputActive) {
      e.preventDefault();
      openHelp();
      return;
    }

    // Escape — close top modal
    if (e.key === 'Escape') {
      const modals = [
        'cmdk-modal', 'help-modal', 'detail-modal', 'validate-modal',
        'totp-modal', 'password-modal', 'crypto-modal', 'cert-modal',
      ];
      for (const id of modals) {
        const m = document.getElementById(id);
        if (m && !m.classList.contains('hidden')) {
          m.classList.add('hidden');
          return;
        }
      }
    }
  });
}

// ============================================================================
// User menu (header dropdown)
// ============================================================================

function setupUserMenu() {
  const wrap = document.querySelector('.user-menu-wrap');
  const btn = document.getElementById('btn-user-menu');
  const menu = document.getElementById('user-menu');
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('hidden');
  });
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) menu.classList.add('hidden');
  });
  menu.querySelector('[data-user-action="logout"]').addEventListener('click', async () => {
    if (!confirm('ログアウトしますか？')) return;
    await authLogout();
    // Navigate to /login (hard redirect so the app boots fresh)
    window.location.href = '/login';
  });
  menu.querySelector('[data-user-action="change-password"]').addEventListener('click', () => {
    menu.classList.add('hidden');
    document.getElementById('password-modal').classList.remove('hidden');
  });
  menu.querySelector('[data-user-action="manage-2fa"]').addEventListener('click', () => {
    menu.classList.add('hidden');
    open2FAModal();
  });
}

// ============================================================================
// 2FA (TOTP) setup UI
// ============================================================================

let TOTP_PENDING_SECRET = null;

function setup2FA() {
  document.querySelectorAll('[data-totp-close]').forEach(el => {
    el.addEventListener('click', () => document.getElementById('totp-modal').classList.add('hidden'));
  });
  document.getElementById('form-totp-enable').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = document.getElementById('totp-setup-error');
    err.classList.add('hidden');
    const u = getCurrentUser();
    if (!u || !TOTP_PENDING_SECRET) return;
    const code = String(e.target.elements.code.value).trim();
    const ok = await verifyTotp(TOTP_PENDING_SECRET, code);
    if (!ok) {
      err.textContent = 'コードが正しくありません。時計のずれがあるかもしれません。';
      err.classList.remove('hidden');
      return;
    }
    await enableTotp(u.id, TOTP_PENDING_SECRET);
    TOTP_PENDING_SECRET = null;
    document.getElementById('totp-modal').classList.add('hidden');
    toast('2段階認証を有効化しました', 'success');
  });
  document.getElementById('btn-totp-disable').addEventListener('click', async () => {
    if (!confirm('2段階認証を無効化しますか？セキュリティが低下します。')) return;
    const u = getCurrentUser();
    if (!u) return;
    await disableTotp(u.id);
    document.getElementById('totp-modal').classList.add('hidden');
    toast('2段階認証を無効化しました', 'success');
  });
}

function open2FAModal() {
  const u = getCurrentUser();
  if (!u) return;
  const modal = document.getElementById('totp-modal');
  const status = document.getElementById('totp-status');
  const setupBlock = document.getElementById('totp-setup');
  const enableBtn = document.getElementById('btn-totp-enable');
  const disableBtn = document.getElementById('btn-totp-disable');

  if (u.totp_enabled) {
    status.innerHTML = '<strong style="color:#059669">✓ 2FAが有効です</strong><br><span style="color:#6b7280">認証アプリが必要です。紛失した場合は管理者に無効化を依頼してください。</span>';
    setupBlock.style.display = 'none';
    enableBtn.classList.add('hidden');
    disableBtn.classList.remove('hidden');
    TOTP_PENDING_SECRET = null;
  } else {
    const secret = generateTotpSecret();
    TOTP_PENDING_SECRET = secret;
    const url = otpauthUrl({ secret, issuer: 'Export Doc Manager', account: u.username });
    document.getElementById('totp-qr').src = qrImageUrl(url);
    document.getElementById('totp-secret-display').textContent = secret;
    status.innerHTML = '<strong style="color:#92400e">⚠️ 2FAは未設定</strong><br><span style="color:#6b7280">認証アプリでQRコードをスキャンし、表示された6桁コードで有効化してください。</span>';
    setupBlock.style.display = '';
    enableBtn.classList.remove('hidden');
    disableBtn.classList.add('hidden');
  }
  modal.classList.remove('hidden');
}

// ============================================================================
// Session monitor — checks idle/absolute timeouts every minute
// ============================================================================

function startSessionMonitor() {
  // Update activity on any user interaction
  ['click', 'keydown', 'pointerdown'].forEach(ev => {
    document.addEventListener(ev, () => { touchSession(); }, { passive: true });
  });
  // Periodic check for timeout
  setInterval(() => {
    if (!touchSession()) {
      alert('セッションがタイムアウトしました。再ログインしてください。');
      // Include current path as return target
      const current = window.location.pathname + window.location.search;
      window.location.href = '/login?return=' + encodeURIComponent(current);
    }
  }, 60 * 1000); // every minute
}

// ============================================================================
// Password change (self)
// ============================================================================

function setupPasswordChange() {
  const modal = document.getElementById('password-modal');
  document.querySelectorAll('[data-password-close]').forEach(el => {
    el.addEventListener('click', () => modal.classList.add('hidden'));
  });
  const form = document.getElementById('form-password');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = document.getElementById('password-error');
    err.classList.add('hidden');
    const d = new FormData(form);
    const cur = String(d.get('current'));
    const n1  = String(d.get('new1'));
    const n2  = String(d.get('new2'));
    const u = getCurrentUser();
    if (!u) { err.textContent = 'ログイン状態が失われました。再読み込みしてください。'; err.classList.remove('hidden'); return; }
    if (n1 !== n2) { err.textContent = '新しいパスワードが一致しません'; err.classList.remove('hidden'); return; }
    if (n1.length < 8) { err.textContent = '新しいパスワードは8文字以上'; err.classList.remove('hidden'); return; }
    const ok = await verifyPassword(cur, u.password_salt, u.password_hash);
    if (!ok) { err.textContent = '現在のパスワードが正しくありません'; err.classList.remove('hidden'); return; }
    await changePassword(u.id, n1);
    form.reset();
    modal.classList.add('hidden');
    toast('パスワードを変更しました', 'success');
  });
}

// ============================================================================
// User management (admin only)
// ============================================================================

function setupUserManagement() {
  if (!canManageUsers(getCurrentUser())) return;
  document.getElementById('btn-new-user').addEventListener('click', () => openUserEditor(null));
  const form = document.getElementById('form-user');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = new FormData(form);
    const id = d.get('id') ? Number(d.get('id')) : null;
    const username = String(d.get('username')).trim();
    const displayName = String(d.get('display_name') || '').trim();
    const role = String(d.get('role'));
    const isActive = Number(d.get('is_active'));
    const password = String(d.get('password') || '');

    // Uniqueness check
    const existing = getUserByUsername(username);
    if (existing && existing.id !== id) {
      toast('このユーザー名は既に使用されています', 'error');
      return;
    }

    if (id) {
      const patch = { username, display_name: displayName, role, is_active: isActive };
      if (password) {
        if (password.length < 8) { toast('パスワードは8文字以上', 'error'); return; }
        const { password_hash, password_salt } = await hashPassword(password);
        patch.password_hash = password_hash;
        patch.password_salt = password_salt;
      }
      await dbUpdateUser(id, patch);
      // If encryption is enabled and password was changed, re-wrap the user's
      // DEK envelope with the new password (admin rewraps on behalf of the user).
      if (password) {
        const updatedUser = dbGetUser(id);
        const dek = getDek();
        if (updatedUser && dek) {
          await syncBootstrapMetaForUser(updatedUser, password, dek);
        }
      } else {
        // Password unchanged — just sync metadata (username etc.)
        const updatedUser = dbGetUser(id);
        if (updatedUser) await syncBootstrapMetaForUser(updatedUser, null, null);
      }
      await appendAuditLog({
        actor_user_id: getCurrentUser().id,
        actor_username: getCurrentUser().username,
        action: 'user_update', target_type: 'user', target_id: id,
        summary: `ユーザー更新: ${username} (role=${role}, active=${isActive})${password ? ' + パスワード再設定' : ''}`,
      });
    } else {
      if (!password || password.length < 8) { toast('新規作成時はパスワード必須（8文字以上）', 'error'); return; }
      const { password_hash, password_salt } = await hashPassword(password);
      const newId = await dbCreateUser({
        username,
        display_name: displayName,
        password_hash, password_salt,
        role, is_active: isActive,
      });
      // Create DEK envelope for the new user so they can decrypt the DB
      const newUser = dbGetUser(newId);
      const dek = getDek();
      if (newUser && dek) {
        await syncBootstrapMetaForUser(newUser, password, dek);
      }
      await appendAuditLog({
        actor_user_id: getCurrentUser().id,
        actor_username: getCurrentUser().username,
        action: 'user_create', target_type: 'user', target_id: newId,
        summary: `ユーザー作成: ${username} (role=${role})`,
      });
    }
    closeUserEditor();
    renderUsersTable();
    toast('ユーザーを保存しました', 'success');
  });
  document.getElementById('btn-user-cancel').addEventListener('click', closeUserEditor);
  document.getElementById('btn-user-delete').addEventListener('click', async () => {
    const id = Number(form.elements.id.value);
    if (!id) return;
    const u = dbGetUser(id);
    if (!u) return;
    if (u.id === getCurrentUser().id) {
      toast('自分自身は削除できません', 'error');
      return;
    }
    if (!confirm(`ユーザー「${u.username}」を削除しますか？`)) return;
    await dbDeleteUser(id);
    await removeFromBootstrapMeta(u.username);
    await appendAuditLog({
      actor_user_id: getCurrentUser().id,
      actor_username: getCurrentUser().username,
      action: 'user_delete', target_type: 'user', target_id: id,
      summary: `ユーザー削除: ${u.username}`,
    });
    closeUserEditor();
    renderUsersTable();
    toast('削除しました', 'success');
  });
  renderUsersTable();
}

function openUserEditor(id) {
  const panel = document.getElementById('user-editor');
  const form = document.getElementById('form-user');
  panel.classList.remove('hidden');
  if (id) {
    const u = dbGetUser(id);
    if (!u) return;
    form.elements.id.value = u.id;
    form.elements.username.value = u.username;
    form.elements.display_name.value = u.display_name || '';
    form.elements.role.value = u.role;
    form.elements.is_active.value = String(u.is_active ?? 1);
    form.elements.password.value = '';
    document.getElementById('user-editor-title').textContent = `ユーザー編集: ${u.username}`;
    document.getElementById('btn-user-delete').classList.remove('hidden');
  } else {
    form.reset();
    form.elements.id.value = '';
    form.elements.is_active.value = '1';
    form.elements.role.value = 'editor';
    document.getElementById('user-editor-title').textContent = '新規ユーザー';
    document.getElementById('btn-user-delete').classList.add('hidden');
  }
}

function closeUserEditor() {
  document.getElementById('user-editor').classList.add('hidden');
}

function renderUsersTable() {
  const tbody = document.querySelector('#table-users tbody');
  if (!tbody) return;
  const users = listUsers();
  tbody.innerHTML = users.map(u => {
    const locked = u.lock_until && new Date(u.lock_until).getTime() > Date.now();
    const stateBadge = !u.is_active
      ? '<span class="badge badge--red">無効</span>'
      : locked ? '<span class="badge badge--amber">ロック中</span>'
      : '<span class="badge badge--green">有効</span>';
    return `
    <tr>
      <td><strong>${escapeHtml(u.username)}</strong> ${u.totp_enabled ? '<span class="badge badge--indigo" title="2FA有効">🔐</span>' : ''}</td>
      <td>${escapeHtml(u.display_name || '')}</td>
      <td><span class="badge badge--${u.role === 'admin' ? 'indigo' : u.role === 'editor' ? 'blue' : 'gray'}">${escapeHtml(roleLabel(u.role))}</span></td>
      <td>${stateBadge}</td>
      <td style="font-size:11px;color:#6b7280">${u.last_login_at ? new Date(u.last_login_at).toLocaleString('ja-JP') : '—'}</td>
      <td style="font-size:11px;color:#6b7280">${u.created_at ? new Date(u.created_at).toLocaleDateString('ja-JP') : ''}</td>
      <td>
        <button class="btn" data-edit-user="${u.id}">編集</button>
        ${locked ? `<button class="btn btn--primary" data-unlock-user="${u.id}">ロック解除</button>` : ''}
      </td>
    </tr>`;
  }).join('');
  tbody.querySelectorAll('[data-edit-user]').forEach(btn => {
    btn.addEventListener('click', () => openUserEditor(Number(btn.dataset.editUser)));
  });
  tbody.querySelectorAll('[data-unlock-user]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('このユーザーのロックを解除しますか？')) return;
      await unlockUser(Number(btn.dataset.unlockUser));
      renderUsersTable();
      toast('ロックを解除しました', 'success');
    });
  });
}

// ============================================================================
// Audit log viewer (admin only)
// ============================================================================

function setupAuditViewer() {
  if (!canViewAudit(getCurrentUser())) return;
  document.getElementById('btn-audit-refresh').addEventListener('click', renderAuditLog);
  document.getElementById('audit-filter-action').addEventListener('input', renderAuditLog);
  renderAuditLog();
}

function renderAuditLog() {
  const tbody = document.querySelector('#table-audit tbody');
  if (!tbody) return;
  const action = document.getElementById('audit-filter-action').value.trim();
  const rows = listAuditLog({ limit: 500, action: action || null });
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#9ca3af;padding:20px">ログがありません</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td style="font-size:11px;color:#6b7280">${new Date(r.created_at).toLocaleString('ja-JP')}</td>
      <td>${escapeHtml(r.actor_username || '—')}</td>
      <td><code style="font-size:11px">${escapeHtml(r.action || '')}</code></td>
      <td style="font-size:11px">${r.target_type ? `${escapeHtml(r.target_type)}#${r.target_id ?? ''}` : '—'}</td>
      <td style="font-size:12px">${escapeHtml(r.summary || '')}</td>
    </tr>
  `).join('');
}

// ============================================================================
// Crypto modal (password prompt for export/import encryption)
// ============================================================================

let CRYPTO_ON_OK = null;

function setupCryptoModal() {
  const modal = document.getElementById('crypto-modal');
  document.querySelectorAll('[data-crypto-close]').forEach(el => {
    el.addEventListener('click', () => { modal.classList.add('hidden'); CRYPTO_ON_OK = null; });
  });
  document.getElementById('btn-crypto-ok').addEventListener('click', () => {
    const form = document.getElementById('form-crypto');
    const d = new FormData(form);
    const p1 = String(d.get('pass1'));
    const p2 = String(d.get('pass2') || '');
    const err = document.getElementById('crypto-error');
    err.classList.add('hidden');
    const needConfirm = !document.getElementById('crypto-pass2-label').classList.contains('hidden');
    if (needConfirm && p1 !== p2) {
      err.textContent = 'パスワードが一致しません';
      err.classList.remove('hidden');
      return;
    }
    if (p1.length < 4) {
      err.textContent = 'パスワードが短すぎます';
      err.classList.remove('hidden');
      return;
    }
    modal.classList.add('hidden');
    form.reset();
    const cb = CRYPTO_ON_OK;
    CRYPTO_ON_OK = null;
    if (cb) cb(p1);
  });
}

function promptEncryptionPassword({ title, intro, confirm = false }) {
  return new Promise((resolve) => {
    document.getElementById('crypto-title').textContent = title;
    document.getElementById('crypto-intro').textContent = intro;
    const p2Label = document.getElementById('crypto-pass2-label');
    if (confirm) p2Label.classList.remove('hidden');
    else p2Label.classList.add('hidden');
    document.getElementById('form-crypto').reset();
    document.getElementById('crypto-error').classList.add('hidden');
    document.getElementById('crypto-modal').classList.remove('hidden');
    setTimeout(() => document.querySelector('#form-crypto [name="pass1"]').focus(), 50);
    CRYPTO_ON_OK = (pass) => resolve(pass);
  });
}

// AES-GCM encrypt/decrypt for DB export/import.
async function deriveCryptoKey(password, salt) {
  const enc = new TextEncoder();
  const km = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' },
    km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

async function encryptBytes(plainBytes, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const key  = await deriveCryptoKey(password, salt);
  const ct   = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plainBytes);
  // Format: magic(4) | version(1) | salt(16) | iv(12) | ciphertext
  const magic = new TextEncoder().encode('EDM1'); // Export Doc Manager v1
  const out = new Uint8Array(4 + 1 + 16 + 12 + ct.byteLength);
  out.set(magic, 0);
  out[4] = 1;
  out.set(salt, 5);
  out.set(iv, 21);
  out.set(new Uint8Array(ct), 33);
  return out;
}

async function decryptBytes(encBytes, password) {
  const magic = new TextDecoder().decode(encBytes.slice(0, 4));
  if (magic !== 'EDM1') throw new Error('暗号化フォーマットが不正です');
  const salt = encBytes.slice(5, 21);
  const iv   = encBytes.slice(21, 33);
  const ct   = encBytes.slice(33);
  const key  = await deriveCryptoKey(password, salt);
  const pt   = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new Uint8Array(pt);
}

// ============================================================================
// Help / manual modal
// ============================================================================

function setupHelp() {
  document.getElementById('btn-help').addEventListener('click', openHelp);
  document.querySelectorAll('[data-help-close]').forEach(el => {
    el.addEventListener('click', closeHelp);
  });
  // Escape key closes modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('help-modal').classList.contains('hidden')) {
      closeHelp();
    }
  });

  // Live search
  document.getElementById('help-search').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    document.querySelectorAll('#help-nav-list li[data-help-id]').forEach(li => {
      const text = li.dataset.searchText || '';
      const match = !q || text.includes(q);
      li.classList.toggle('hidden', !match);
    });
  });
}

function openHelp(sectionId = null) {
  const modal = document.getElementById('help-modal');
  modal.classList.remove('hidden');
  buildHelpNav();
  const firstSection = sectionId || HELP_SECTIONS.find(s => s.id)?.id;
  if (firstSection) showHelpSection(firstSection);
}

function closeHelp() {
  document.getElementById('help-modal').classList.add('hidden');
}

function buildHelpNav() {
  const nav = document.getElementById('help-nav-list');
  const items = [];
  for (const s of HELP_SECTIONS) {
    if (s.group) {
      items.push(`<li class="help-group">${escapeHtml(s.group)}</li>`);
    } else if (s.id) {
      const searchText = (s.title + ' ' + s.content).replace(/<[^>]+>/g, ' ').toLowerCase();
      items.push(
        `<li data-help-id="${escapeHtml(s.id)}" data-search-text="${escapeHtml(searchText)}">${escapeHtml(s.title)}</li>`
      );
    }
  }
  nav.innerHTML = items.join('');
  nav.querySelectorAll('[data-help-id]').forEach(li => {
    li.addEventListener('click', () => showHelpSection(li.dataset.helpId));
  });
}

function showHelpSection(id) {
  const s = HELP_SECTIONS.find(x => x.id === id);
  if (!s) return;
  document.querySelectorAll('#help-nav-list li').forEach(li => {
    li.classList.toggle('active', li.dataset.helpId === id);
  });
  const content = document.getElementById('help-content');
  content.innerHTML = s.content;
  content.scrollTop = 0;
}

// ============================================================================
// Settings page: auto-numbering, templates, reminders
// ============================================================================

function setupSettings() {
  // Sub-tab switching
  const subTabs = document.querySelectorAll('#settings-tabs .editor-tab');
  const subPanes = document.querySelectorAll('.settings-pane');
  subTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.settingsTab;
      subTabs.forEach(t => t.classList.toggle('editor-tab--active', t === tab));
      subPanes.forEach(p => p.classList.toggle('settings-pane--active', p.dataset.settingsPane === target));
    });
  });

  // --- Numbering ---
  const casePatInp = document.getElementById('setting-case-code-pattern');
  const casePrevInp = document.getElementById('setting-case-code-preview');
  const invPatInp = document.getElementById('setting-invoice-ref-pattern');
  const invPrevInp = document.getElementById('setting-invoice-ref-preview');
  const updatePreviews = () => {
    casePrevInp.value = casePatInp.value ? nextSequenceFromPattern(casePatInp.value, 'cases', 'case_code') : '（未設定 — 手動入力）';
    invPrevInp.value  = invPatInp.value  ? nextSequenceFromPattern(invPatInp.value,  'cases', 'invoice_ref_no') : '（未設定 — 手動入力）';
  };
  casePatInp.addEventListener('input', updatePreviews);
  invPatInp.addEventListener('input', updatePreviews);
  document.getElementById('btn-save-numbering').addEventListener('click', async () => {
    await setSetting('case_code_pattern',    casePatInp.value.trim());
    await setSetting('invoice_ref_pattern',  invPatInp.value.trim());
    toast('採番設定を保存しました', 'success');
  });

  // --- Template ---
  const logoFileInp = document.getElementById('setting-logo-file');
  logoFileInp.addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > 500 * 1024) {
      toast('ロゴは500KB以下にしてください', 'error'); e.target.value = ''; return;
    }
    const dataUrl = await fileToDataUrl(f);
    await setSetting('company_logo', dataUrl);
    refreshLogoPreview();
    toast('ロゴを保存しました', 'success');
    e.target.value = '';
  });
  document.getElementById('btn-logo-remove').addEventListener('click', async () => {
    if (!confirm('ロゴを削除しますか？')) return;
    await setSetting('company_logo', '');
    refreshLogoPreview();
    toast('ロゴを削除しました', 'success');
  });
  document.getElementById('btn-save-template').addEventListener('click', async () => {
    await setSetting('signer_name',       document.getElementById('setting-signer-name').value.trim());
    await setSetting('signer_title',      document.getElementById('setting-signer-title').value.trim());
    await setSetting('extra_note_invoice', document.getElementById('setting-extra-note-invoice').value);
    await setSetting('extra_note_si',      document.getElementById('setting-extra-note-si').value);
    toast('テンプレート設定を保存しました', 'success');
  });

  // --- Reminders ---
  document.getElementById('btn-request-permission').addEventListener('click', async () => {
    const p = await Notification.requestPermission();
    document.getElementById('setting-reminders-permission').value = p;
    toast(p === 'granted' ? '通知を許可しました' : '通知が許可されませんでした', p === 'granted' ? 'success' : 'error');
  });
  document.getElementById('btn-test-notification').addEventListener('click', () => {
    if (Notification.permission !== 'granted') {
      toast('先に通知許可をリクエストしてください', 'error');
      return;
    }
    new Notification('📦 Export Doc Manager — テスト通知', {
      body: '通知が正常に動作しています。',
    });
  });
  document.getElementById('btn-save-reminders').addEventListener('click', async () => {
    await setSetting('reminders_enabled',  document.getElementById('setting-reminders-enabled').value === 'true');
    await setSetting('reminders_days',     Number(document.getElementById('setting-reminders-days').value) || 3);
    await setSetting('reminders_interval', Number(document.getElementById('setting-reminders-interval').value) || 60);
    await setSetting('mail_from',          document.getElementById('setting-mail-from').value.trim());
    await setSetting('mail_subject',       document.getElementById('setting-mail-subject').value);
    await setSetting('mail_body',          document.getElementById('setting-mail-body').value);
    toast('リマインダー設定を保存しました', 'success');
    startReminderScheduler(); // restart with new interval
  });
}

function renderSettings() {
  // Numbering
  document.getElementById('setting-case-code-pattern').value = getSetting('case_code_pattern', '') || '';
  document.getElementById('setting-invoice-ref-pattern').value = getSetting('invoice_ref_pattern', '') || '';
  const casePat = getSetting('case_code_pattern', '');
  const invPat  = getSetting('invoice_ref_pattern', '');
  document.getElementById('setting-case-code-preview').value =
    casePat ? nextSequenceFromPattern(casePat, 'cases', 'case_code') : '（未設定 — 手動入力）';
  document.getElementById('setting-invoice-ref-preview').value =
    invPat ? nextSequenceFromPattern(invPat, 'cases', 'invoice_ref_no') : '（未設定 — 手動入力）';

  // Template
  refreshLogoPreview();
  document.getElementById('setting-signer-name').value  = getSetting('signer_name', 'MAKOTO Kubota') || '';
  document.getElementById('setting-signer-title').value = getSetting('signer_title', 'Managing Director') || '';
  document.getElementById('setting-extra-note-invoice').value = getSetting('extra_note_invoice', '') || '';
  document.getElementById('setting-extra-note-si').value      = getSetting('extra_note_si', '') || '';

  // Reminders
  document.getElementById('setting-reminders-enabled').value = String(getSetting('reminders_enabled', true));
  document.getElementById('setting-reminders-days').value    = getSetting('reminders_days', 3);
  document.getElementById('setting-reminders-interval').value = getSetting('reminders_interval', 60);
  document.getElementById('setting-reminders-permission').value =
    (typeof Notification !== 'undefined') ? Notification.permission : '非対応';
  document.getElementById('setting-mail-from').value    = getSetting('mail_from', '') || '';
  document.getElementById('setting-mail-subject').value = getSetting('mail_subject', 'Documents for {case_code}') || '';
  document.getElementById('setting-mail-body').value    = getSetting('mail_body',
    'Dear {buyer_name},\n\nPlease find attached the shipping documents for {case_code}.\n\nBest regards,\n{signer_name}') || '';
}

function refreshLogoPreview() {
  const img = document.getElementById('setting-logo-preview');
  const empty = document.getElementById('setting-logo-empty');
  const logo = getSetting('company_logo', '');
  if (logo) {
    img.src = logo;
    img.style.display = '';
    empty.style.display = 'none';
  } else {
    img.src = '';
    img.style.display = 'none';
    empty.style.display = '';
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

// ============================================================================
// Reminder scheduler (browser notifications for upcoming ETD / payment due)
// ============================================================================

let reminderTimer = null;
const NOTIFIED_TODAY = 'reminders_notified_today';

function startReminderScheduler() {
  if (reminderTimer) clearInterval(reminderTimer);
  const enabled = getSetting('reminders_enabled', true);
  if (!enabled) return;
  const intervalMin = Number(getSetting('reminders_interval', 60)) || 60;
  // Run once on boot, then periodically
  setTimeout(checkReminders, 5000);
  reminderTimer = setInterval(checkReminders, intervalMin * 60 * 1000);
}

function checkReminders() {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const enabled = getSetting('reminders_enabled', true);
  if (!enabled) return;
  const days = Number(getSetting('reminders_days', 3)) || 3;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const horizon = new Date(today); horizon.setDate(horizon.getDate() + days);

  const notified = new Set(JSON.parse(sessionStorage.getItem(NOTIFIED_TODAY) || '[]'));
  const todayKey = today.toISOString().slice(0, 10);

  const cases = listCases();
  for (const c of cases) {
    // ETD upcoming?
    if (c.etd && !['shipped','arrived','completed','cancelled'].includes(c.progress_status)) {
      const etd = new Date(c.etd);
      if (!Number.isNaN(+etd) && etd >= today && etd <= horizon) {
        const key = `etd:${c.id}:${todayKey}`;
        if (!notified.has(key)) {
          const daysLeft = Math.floor((etd - today) / 86400000);
          new Notification(`🚢 船積予定: ${c.case_code || '#' + c.id}`, {
            body: `${c.maker || ''} ${c.model_name || ''} — ETD ${c.etd} (あと${daysLeft}日)`,
            tag: key,
          });
          notified.add(key);
        }
      }
    }
    // Payment overdue?
    if (c.payment_due_date && c.payment_status !== 'paid' && c.payment_status !== 'cancelled') {
      const due = new Date(c.payment_due_date);
      const remaining = (Number(c.amount_jpy) || 0) - paymentsTotal(c.id);
      if (!Number.isNaN(+due) && remaining > 0 && due < horizon) {
        const key = `pay:${c.id}:${todayKey}`;
        if (!notified.has(key)) {
          const overdueDays = Math.floor((today - due) / 86400000);
          const label = overdueDays > 0 ? `${overdueDays}日超過` : `あと${Math.floor((due - today) / 86400000)}日`;
          new Notification(`💰 入金期日: ${c.case_code || '#' + c.id}`, {
            body: `残高 ¥${remaining.toLocaleString()} — 期日 ${c.payment_due_date} (${label})`,
            tag: key,
          });
          notified.add(key);
        }
      }
    }
  }
  sessionStorage.setItem(NOTIFIED_TODAY, JSON.stringify([...notified]));
}

// ============================================================================
// Case editor sub-tab navigation
// ============================================================================

function setupEditorTabs() {
  const tabs = document.querySelectorAll('#editor-tabs .editor-tab');
  const panes = document.querySelectorAll('.editor-pane');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => activateEditorTab(tab.dataset.editorTab));
  });

  // If the form fails native validation (e.g. required Case Code / Seller
  // that live in the 案件情報 pane) while the user is on another pane, jump
  // back to the pane containing the invalid field so they can see the error.
  const form = document.getElementById('form-case');
  if (form) {
    form.addEventListener('invalid', (e) => {
      const el = e.target;
      const pane = el.closest?.('.editor-pane');
      if (pane && !pane.classList.contains('editor-pane--active')) {
        activateEditorTab(pane.dataset.editorPane);
      }
    }, true); // capture so we catch before default reporting
  }
}

function activateEditorTab(name) {
  const tabs = document.querySelectorAll('#editor-tabs .editor-tab');
  const panes = document.querySelectorAll('.editor-pane');
  tabs.forEach(t => t.classList.toggle('editor-tab--active', t.dataset.editorTab === name));
  panes.forEach(p => p.classList.toggle('editor-pane--active', p.dataset.editorPane === name));
  const panel = document.querySelector('#form-case');
  if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetEditorTabs() {
  const tabs = document.querySelectorAll('#editor-tabs .editor-tab');
  const panes = document.querySelectorAll('.editor-pane');
  tabs.forEach((t, i) => t.classList.toggle('editor-tab--active', i === 0));
  panes.forEach((p, i) => p.classList.toggle('editor-pane--active', i === 0));
}

// Render small count badges on tabs to indicate how many rows each collection
// has. Call after loading a case.
function updateEditorTabBadges(caseId) {
  const setCount = (tabKey, count) => {
    const tab = document.querySelector(`.editor-tab[data-editor-tab="${tabKey}"]`);
    if (!tab) return;
    tab.querySelector('.editor-tab__count')?.remove();
    if (count > 0) {
      const span = document.createElement('span');
      span.className = 'editor-tab__count';
      span.textContent = count;
      tab.appendChild(span);
    }
  };
  if (caseId) {
    setCount('reg-events', listCaseEvents(caseId).length);
    setCount('payments',   listPayments(caseId).length);
    setCount('costs',      listCosts(caseId).length);
    setCount('photos',     listPhotos(caseId).length);
  } else {
    setCount('reg-events', 0);
    setCount('payments',   0);
    setCount('costs',      0);
    setCount('photos',     0);
  }
}

// ============================================================================
// Certificate import (PDF/image → QR+OCR → auto-fill)
// ============================================================================

let CERT_LAST_RESULT = null;

function setupCertImport() {
  document.getElementById('file-cert-import').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    e.target.value = '';
    openCertModal();
    try {
      const result = await importCertFile(f, updateCertProgress);
      CERT_LAST_RESULT = result;
      renderCertResults(result);
    } catch (err) {
      document.getElementById('cert-progress').innerHTML = `
        <div class="cert-progress__step" style="color:#dc2626">読み込みに失敗しました</div>
        <div class="cert-progress__message">${escapeHtml(err.message)}</div>
      `;
    }
  });
  document.getElementById('btn-cert-close').addEventListener('click', closeCertModal);
  document.getElementById('btn-cert-cancel').addEventListener('click', closeCertModal);
  document.querySelector('#cert-modal .modal__backdrop').addEventListener('click', closeCertModal);
  document.getElementById('btn-cert-apply').addEventListener('click', applyCertResults);
  document.getElementById('cert-check-all').addEventListener('change', (e) => {
    document.querySelectorAll('#cert-fields-body input[type="checkbox"]').forEach(cb => cb.checked = e.target.checked);
  });
}

function openCertModal() {
  const modal = document.getElementById('cert-modal');
  modal.classList.remove('hidden');
  document.getElementById('cert-results').classList.add('hidden');
  document.getElementById('btn-cert-apply').classList.add('hidden');
  document.getElementById('cert-progress').innerHTML = `
    <div class="cert-progress__step">準備中…</div>
    <div class="cert-progress__bar"><div class="cert-progress__fill" style="width:5%"></div></div>
    <div class="cert-progress__message">ファイルを解析しています</div>
  `;
}

function closeCertModal() {
  document.getElementById('cert-modal').classList.add('hidden');
  CERT_LAST_RESULT = null;
}

function updateCertProgress(status) {
  const host = document.getElementById('cert-progress');
  const pct = status.progress != null ? Math.round(status.progress * 100) : null;
  const stepLabels = {
    pdf: 'PDF読込',
    image: '画像読込',
    qr: 'QRコード検出',
    ocr: 'OCR処理中',
    parse: '項目抽出',
    done: '完了',
  };
  host.innerHTML = `
    <div class="cert-progress__step">${escapeHtml(stepLabels[status.step] || status.step)}</div>
    <div class="cert-progress__bar">
      <div class="cert-progress__fill" style="width:${pct != null ? pct : 30}%"></div>
    </div>
    <div class="cert-progress__message">${escapeHtml(status.message || '')}</div>
  `;
}

function renderCertResults(result) {
  document.getElementById('cert-progress').classList.add('hidden');
  const host = document.getElementById('cert-results');
  host.classList.remove('hidden');
  document.getElementById('btn-cert-apply').classList.remove('hidden');

  const qrHost = document.getElementById('cert-qr-info');
  if (result.qrPayloads?.length) {
    qrHost.classList.remove('hidden');
    qrHost.innerHTML = `<strong>✓ QRコード検出:</strong> ${result.qrPayloads.map(q => `<code>${escapeHtml(q)}</code>`).join('、')}`;
  } else {
    qrHost.classList.add('hidden');
  }

  const tbody = document.getElementById('cert-fields-body');
  const fields = result.fields;
  const keys = Object.keys(fields);
  if (!keys.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#9ca3af;padding:20px">抽出できた項目がありません。</td></tr>';
  } else {
    tbody.innerHTML = keys.map(k => `
      <tr>
        <td><input type="checkbox" data-cert-key="${escapeHtml(k)}" checked></td>
        <td>${escapeHtml(CERT_FIELD_LABELS[k] || k)}</td>
        <td><input type="text" data-cert-val="${escapeHtml(k)}" value="${escapeHtml(fields[k].value)}"></td>
        <td class="cert-raw-text" title="${escapeHtml(fields[k].raw || '')}">${escapeHtml(fields[k].raw || '')}</td>
      </tr>
    `).join('');
  }

  document.getElementById('cert-raw-text').textContent = result.rawText || '';
}

async function applyCertResults() {
  if (!CERT_LAST_RESULT) return;
  const form = document.getElementById('form-case');
  const rows = document.querySelectorAll('#cert-fields-body tr');
  let applied = 0;
  for (const tr of rows) {
    const cb = tr.querySelector('input[type="checkbox"]');
    if (!cb?.checked) continue;
    const key = cb.dataset.certKey;
    const val = tr.querySelector('[data-cert-val]')?.value;
    if (val == null) continue;
    const el = form.elements[key];
    if (el) {
      el.value = val;
      applied++;
    }
  }
  closeCertModal();
  toast(`${applied}件の項目を反映しました。内容を確認して保存してください。`, 'success');
}

// ---- Toast ----------------------------------------------------------------
let toastTimer;
function toast(message, kind = '') {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = 'toast ' + kind;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2500);
}
