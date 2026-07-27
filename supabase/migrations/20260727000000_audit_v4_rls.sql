-- Audit v4 security fixes
-- C2: politica SELECT restrictiva pe kv_store (blocheaza chei cu date sensibile)
-- H3: whitelist INSERT/UPDATE pe kv_store (previne data poisoning si injectie de chei arbitrare)
-- B7: recreare politici audit_log + grant explicit pe secventa (fix INSERT respins)

-- ─── kv_store: SELECT restrictiva (C2) ───────────────────────────────────────
-- app_users si app_permissions nu trebuie citite niciodata de anon
-- (sunt excluse si din sync, dar politica adauga aparare in profunzime)
drop policy if exists "kv anon select" on public.kv_store;

create policy "kv anon select limited" on public.kv_store
  for select to anon
  using (
    key not in (
      'app_users', 'app_permissions',
      'app_whatsapp_contacts', 'app_drivers'
    )
  );

-- ─── kv_store: whitelist INSERT/UPDATE (H3) ──────────────────────────────────
-- Inlocuieste lista neagra cu lista alba explicita — previne injectia de chei arbitrare
drop policy if exists "kv anon insert" on public.kv_store;
drop policy if exists "kv anon update" on public.kv_store;

create policy "kv anon insert safe" on public.kv_store
  for insert to anon
  with check (
    key in (
      'app_orders', 'app_catalogs', 'app_transports', 'app_vehicles',
      'app_units', 'app_stock_log', 'app_whatsapp_contacts', 'app_drivers'
    )
    or key like 'app_catalog_%'
    or key like 'app_products_%'
    or key like '_lk_%'
  );

create policy "kv anon update safe" on public.kv_store
  for update to anon
  using  (key not in ('app_users', 'app_permissions'))
  with check (
    key in (
      'app_orders', 'app_catalogs', 'app_transports', 'app_vehicles',
      'app_units', 'app_stock_log', 'app_whatsapp_contacts', 'app_drivers'
    )
    or key like 'app_catalog_%'
    or key like 'app_products_%'
    or key like '_lk_%'
  );

-- ─── audit_log: recreare politici + grant complet (B7) ───────────────────────
-- Cauza probabila a erorilor 42501: grant insuficient pe secventa sau politici incomplete
drop policy if exists "audit_allow_insert_anon" on public.audit_log;
drop policy if exists "audit_allow_insert_auth" on public.audit_log;

create policy "audit_allow_insert_anon" on public.audit_log
  for insert to anon
  with check (
    action in (
      'LOGIN', 'LOGOUT', 'PASS_CHANGE',
      'USER_CREATE', 'USER_EDIT', 'USER_DELETE',
      'ADMIN_SET_PASS', 'PERIOD_RESET'
    )
    and length(coalesce(details, '')) <= 500
  );

create policy "audit_allow_insert_auth" on public.audit_log
  for insert to authenticated
  with check (
    action in (
      'LOGIN', 'LOGOUT', 'PASS_CHANGE',
      'USER_CREATE', 'USER_EDIT', 'USER_DELETE',
      'ADMIN_SET_PASS', 'PERIOD_RESET'
    )
    and length(coalesce(details, '')) <= 500
  );

-- Grant explicit USAGE + SELECT pe secventa (SELECT permite currval, necesar pentru unele drivere)
grant usage, select on sequence public.audit_log_id_seq to anon, authenticated;
