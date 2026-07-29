-- Fix C2: politicile "using (true)" pentru authenticated acordau SELECT/INSERT/UPDATE/DELETE
-- fără nicio restricție — orice cont autentificat putea citi PII, suprascrie sau șterge
-- toate datele operaționale ale tuturor utilizatorilor.
--
-- Fix H1 (parțial): elimină UPDATE pentru anon pe cheile de lockout — un atacator nu mai poate
-- reseta contorul de brute-force la 0 via REST API cu cheia anon.

-- ─── Înlocuiește politicile authenticated cu whitelist explicit ───────────────

drop policy if exists "kv authenticated select" on public.kv_store;
drop policy if exists "kv authenticated insert" on public.kv_store;
drop policy if exists "kv authenticated update" on public.kv_store;
drop policy if exists "kv authenticated delete" on public.kv_store;

-- SELECT: tot ce e operațional, minus cheile sensibile
create policy "kv authenticated select" on public.kv_store
  for select to authenticated
  using (key not in ('app_users', 'app_permissions'));

-- INSERT: numai cheile din SYNC_KEYS + cataloage + lockout
create policy "kv authenticated insert" on public.kv_store
  for insert to authenticated
  with check (
    key in (
      'app_orders', 'app_catalogs', 'app_transports', 'app_vehicles',
      'app_units', 'app_stock_log', 'app_whatsapp_contacts', 'app_drivers'
    )
    or key like 'app_catalog_%'
    or key like 'app_products_%'
    or key like '_lk_%'
  );

-- UPDATE: același whitelist
create policy "kv authenticated update" on public.kv_store
  for update to authenticated
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

-- DELETE: nu se acordă pentru authenticated — sync-ul folosește upsert, nu delete
-- service_role bypass-ează RLS automat (testele E2E cu SB_SVC_KEY pot apela DELETE)

-- ─── H1: elimină UPDATE pentru anon pe cheile de lockout ─────────────────────
-- anon putea PATCH _lk_<hash> cu { attempts:0, lockedUntil:0 } → resetare brute-force
-- anon INSERT rămâne (necesar pentru prima scriere a contorului pre-autentificare)
drop policy if exists "kv anon update lockout" on public.kv_store;
