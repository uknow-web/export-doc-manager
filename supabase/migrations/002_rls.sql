-- ============================================================================
-- Row Level Security ポリシー
-- ----------------------------------------------------------------------------
-- ロール設計:
--   admin     — 全操作（ユーザー管理・設定・監査ログ含む）
--   editor    — 業務データの読み書き
--   viewer    — 業務データの読み取りのみ
--   buyer     — 自分(party)に紐づく案件の読み取りのみ（ポータル）
--   ap_holder — 自分(party)がAP保有者の案件の読み取りのみ（ポータル）
--
-- セキュリティの要点:
--   * すべてのヘルパー関数は security definer + search_path固定
--     → ポリシー内のサブクエリが再帰的にRLSに掛かるのを回避
--   * 外部ユーザー(buyer/ap_holder)は profiles.party_id 経由でデータ範囲が決まる
--   * 書き込みは admin / editor のみ（ポータルユーザーは閲覧専用）
--
-- 実行方法: 001_schema.sql の後に SQL Editor で実行
-- ============================================================================

-- ---------------------------------------------------------------------------
-- ヘルパー関数
-- ---------------------------------------------------------------------------
create or replace function public.current_app_role()
returns text
language sql stable security definer set search_path = public
as $$
  select role from public.profiles
  where id = auth.uid() and is_active
$$;

create or replace function public.current_party_id()
returns bigint
language sql stable security definer set search_path = public
as $$
  select party_id from public.profiles
  where id = auth.uid() and is_active
$$;

create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.current_app_role() in ('admin', 'editor', 'viewer'), false)
$$;

create or replace function public.can_edit()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.current_app_role() in ('admin', 'editor'), false)
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.current_app_role() = 'admin', false)
$$;

-- ポータルユーザー(buyer/ap_holder)が指定の案件にアクセスできるか。
-- 判定範囲: 案件の primary_buyer / ap_holder、書類ごとの buyer / ap_holder、
--           AP Holder変更履歴に登場した party
create or replace function public.party_can_access_case(p_case_id bigint)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    public.current_party_id() is not null
    and (
      exists (
        select 1 from public.cases c
        where c.id = p_case_id
          and (c.primary_buyer_id = public.current_party_id()
            or c.ap_holder_id    = public.current_party_id())
      )
      or exists (
        select 1 from public.case_documents d
        where d.case_id = p_case_id
          and (d.buyer_id     = public.current_party_id()
            or d.ap_holder_id = public.current_party_id())
      )
      or exists (
        select 1 from public.ap_holder_history h
        where h.case_id = p_case_id
          and (h.old_ap_holder_id = public.current_party_id()
            or h.new_ap_holder_id = public.current_party_id())
      )
    )
$$;

-- ---------------------------------------------------------------------------
-- RLS 有効化
-- ---------------------------------------------------------------------------
alter table public.profiles             enable row level security;
alter table public.parties              enable row level security;
alter table public.vehicle_models       enable row level security;
alter table public.cases                enable row level security;
alter table public.case_documents       enable row level security;
alter table public.registration_events  enable row level security;
alter table public.payments             enable row level security;
alter table public.costs                enable row level security;
alter table public.photos               enable row level security;
alter table public.doc_issue_log        enable row level security;
alter table public.audit_log            enable row level security;
alter table public.ap_holder_history    enable row level security;
alter table public.case_dereg_checklist enable row level security;
alter table public.settings             enable row level security;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert
  with check (public.is_admin());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles for delete
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- parties
--   スタッフ: 全件読み書き(編集はeditor+)
--   ポータル: 自分のparty行のみ読める（ポータルのヘッダー表示用）
-- ---------------------------------------------------------------------------
drop policy if exists parties_select on public.parties;
create policy parties_select on public.parties for select
  using (public.is_staff() or id = public.current_party_id());

drop policy if exists parties_write on public.parties;
create policy parties_write on public.parties for all
  using (public.can_edit())
  with check (public.can_edit());

-- ---------------------------------------------------------------------------
-- vehicle_models — スタッフ専用
-- ---------------------------------------------------------------------------
drop policy if exists vehicle_models_select on public.vehicle_models;
create policy vehicle_models_select on public.vehicle_models for select
  using (public.is_staff());

drop policy if exists vehicle_models_write on public.vehicle_models;
create policy vehicle_models_write on public.vehicle_models for all
  using (public.can_edit())
  with check (public.can_edit());

-- ---------------------------------------------------------------------------
-- cases
--   スタッフ: 全件
--   buyer / ap_holder: party_can_access_case で自分に紐づく案件のみ
-- ---------------------------------------------------------------------------
drop policy if exists cases_select on public.cases;
create policy cases_select on public.cases for select
  using (public.is_staff() or public.party_can_access_case(id));

drop policy if exists cases_write on public.cases;
create policy cases_write on public.cases for all
  using (public.can_edit())
  with check (public.can_edit());

-- ---------------------------------------------------------------------------
-- 案件の子テーブル共通パターン:
--   select = スタッフ or 案件アクセス権のあるポータルユーザー
--   write  = editor+
-- ---------------------------------------------------------------------------

-- case_documents
drop policy if exists case_documents_select on public.case_documents;
create policy case_documents_select on public.case_documents for select
  using (public.is_staff() or public.party_can_access_case(case_id));

drop policy if exists case_documents_write on public.case_documents;
create policy case_documents_write on public.case_documents for all
  using (public.can_edit())
  with check (public.can_edit());

-- registration_events
drop policy if exists registration_events_select on public.registration_events;
create policy registration_events_select on public.registration_events for select
  using (public.is_staff() or public.party_can_access_case(case_id));

drop policy if exists registration_events_write on public.registration_events;
create policy registration_events_write on public.registration_events for all
  using (public.can_edit())
  with check (public.can_edit());

-- payments — ポータルユーザーも自分の案件の入金状況は見られる
--（Buyerポータルの支払いプログレスバー表示に必要）
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments for select
  using (public.is_staff() or public.party_can_access_case(case_id));

drop policy if exists payments_write on public.payments;
create policy payments_write on public.payments for all
  using (public.can_edit())
  with check (public.can_edit());

-- costs — 社内原価情報。ポータルユーザーには一切見せない
drop policy if exists costs_select on public.costs;
create policy costs_select on public.costs for select
  using (public.is_staff());

drop policy if exists costs_write on public.costs;
create policy costs_write on public.costs for all
  using (public.can_edit())
  with check (public.can_edit());

-- photos
drop policy if exists photos_select on public.photos;
create policy photos_select on public.photos for select
  using (public.is_staff() or public.party_can_access_case(case_id));

drop policy if exists photos_write on public.photos;
create policy photos_write on public.photos for all
  using (public.can_edit())
  with check (public.can_edit());

-- doc_issue_log — ポータルからの書類閲覧記録(portal_view)を許可するため
--   insert はアクセス権のあるポータルユーザーにも開放
drop policy if exists doc_issue_log_select on public.doc_issue_log;
create policy doc_issue_log_select on public.doc_issue_log for select
  using (public.is_staff());

drop policy if exists doc_issue_log_insert on public.doc_issue_log;
create policy doc_issue_log_insert on public.doc_issue_log for insert
  with check (public.can_edit() or public.party_can_access_case(case_id));

drop policy if exists doc_issue_log_update on public.doc_issue_log;
create policy doc_issue_log_update on public.doc_issue_log for update
  using (public.can_edit())
  with check (public.can_edit());

drop policy if exists doc_issue_log_delete on public.doc_issue_log;
create policy doc_issue_log_delete on public.doc_issue_log for delete
  using (public.can_edit());

-- ap_holder_history
drop policy if exists ap_holder_history_select on public.ap_holder_history;
create policy ap_holder_history_select on public.ap_holder_history for select
  using (public.is_staff() or public.party_can_access_case(case_id));

drop policy if exists ap_holder_history_write on public.ap_holder_history;
create policy ap_holder_history_write on public.ap_holder_history for all
  using (public.can_edit())
  with check (public.can_edit());

-- case_dereg_checklist — 社内業務。スタッフ専用
drop policy if exists dereg_select on public.case_dereg_checklist;
create policy dereg_select on public.case_dereg_checklist for select
  using (public.is_staff());

drop policy if exists dereg_write on public.case_dereg_checklist;
create policy dereg_write on public.case_dereg_checklist for all
  using (public.can_edit())
  with check (public.can_edit());

-- ---------------------------------------------------------------------------
-- audit_log
--   select: admin のみ
--   insert: 認証済みユーザー全員（自分の操作の記録）
--   update/delete: 不可（改竄防止 — admin であっても削除不可）
-- ---------------------------------------------------------------------------
drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log for select
  using (public.is_admin());

drop policy if exists audit_insert on public.audit_log;
create policy audit_insert on public.audit_log for insert
  with check (auth.uid() is not null);

-- ---------------------------------------------------------------------------
-- settings
--   スタッフ: 全件読める / admin のみ書ける
--   ポータル: ポータル表示に必要なキーのみ読める
-- ---------------------------------------------------------------------------
drop policy if exists settings_select on public.settings;
create policy settings_select on public.settings for select
  using (
    public.is_staff()
    or key in ('contact_email', 'portal_footer_text', 'company_logo')
  );

drop policy if exists settings_write on public.settings;
create policy settings_write on public.settings for all
  using (public.is_admin())
  with check (public.is_admin());
