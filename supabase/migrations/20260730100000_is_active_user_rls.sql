-- Fix V1: conturi dezactivate (active=false) păstrau acces complet la kv_store și audit_log
-- prin rolul `authenticated` — RLS nu verifica `profiles.active`.
-- Funcția is_active_user() adaugă această verificare ca apărare independentă de aplicație.

create or replace function public.is_active_user() returns boolean
language sql stable security definer as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active = true);
$$;

-- ─── kv_store: actualizează politicile să ceară profil activ ─────────────────

drop policy if exists "kv authenticated select" on public.kv_store;
drop policy if exists "kv authenticated insert" on public.kv_store;
drop policy if exists "kv authenticated update" on public.kv_store;

create policy "kv authenticated select" on public.kv_store
  for select to authenticated
  using (
    public.is_active_user()
    and key not in ('app_users', 'app_permissions')
  );

create policy "kv authenticated insert" on public.kv_store
  for insert to authenticated
  with check (
    public.is_active_user()
    and (
      key in (
        'app_orders', 'app_catalogs', 'app_transports', 'app_vehicles',
        'app_units', 'app_stock_log', 'app_whatsapp_contacts', 'app_drivers'
      )
      or key like 'app_catalog_%'
      or key like 'app_products_%'
      or key like '_lk_%'
    )
  );

create policy "kv authenticated update" on public.kv_store
  for update to authenticated
  using (
    public.is_active_user()
    and key not in ('app_users', 'app_permissions')
  )
  with check (
    public.is_active_user()
    and (
      key in (
        'app_orders', 'app_catalogs', 'app_transports', 'app_vehicles',
        'app_units', 'app_stock_log', 'app_whatsapp_contacts', 'app_drivers'
      )
      or key like 'app_catalog_%'
      or key like 'app_products_%'
      or key like '_lk_%'
    )
  );

-- ─── audit_log: cont dezactivat nu poate loga ────────────────────────────────

drop policy if exists "audit_allow_insert_auth" on public.audit_log;

create policy "audit_allow_insert_auth" on public.audit_log
  for insert to authenticated
  with check (
    public.is_active_user()
    and user_id = auth.uid()::text
    and action in (
      'LOGIN', 'LOGOUT', 'PASS_CHANGE',
      'USER_CREATE', 'USER_EDIT', 'USER_DELETE',
      'ADMIN_SET_PASS', 'PERIOD_RESET'
    )
    and length(coalesce(details, '')) <= 500
  );
