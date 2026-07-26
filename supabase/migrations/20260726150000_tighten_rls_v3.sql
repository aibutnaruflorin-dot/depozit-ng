-- Audit v3 security fixes
-- AV3-01: blocheaza INSERT/UPDATE pe app_permissions (privilege escalation via kv_store)
-- AV3-03: restrictioneaza INSERT in audit_log la actiuni valide + limita lungime

-- ─── kv_store: extinde lista de chei protejate ────────────────────────────────

drop policy if exists "kv anon insert" on public.kv_store;
drop policy if exists "kv anon update" on public.kv_store;

create policy "kv anon insert" on public.kv_store
  for insert to anon
  with check (key not in ('app_users', 'app_permissions'));

create policy "kv anon update" on public.kv_store
  for update to anon
  using  (key not in ('app_users', 'app_permissions'))
  with check (key not in ('app_users', 'app_permissions'));

-- ─── audit_log: restrictioneaza la actiuni cunoscute + lungime campuri ────────

drop policy if exists "audit_allow_insert_anon" on public.audit_log;
drop policy if exists "audit_allow_insert_auth" on public.audit_log;

create policy "audit_allow_insert_anon" on public.audit_log
  for insert to anon
  with check (
    action in (
      'LOGIN', 'LOGOUT', 'PASS_CHANGE',
      'USER_CREATE', 'USER_EDIT', 'USER_DELETE',
      'ADMIN_SET_PASS', 'PERIOD_RESET'
    ) AND
    length(coalesce(details, '')) < 500
  );

create policy "audit_allow_insert_auth" on public.audit_log
  for insert to authenticated
  with check (
    action in (
      'LOGIN', 'LOGOUT', 'PASS_CHANGE',
      'USER_CREATE', 'USER_EDIT', 'USER_DELETE',
      'ADMIN_SET_PASS', 'PERIOD_RESET'
    ) AND
    length(coalesce(details, '')) < 500
  );
