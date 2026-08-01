-- Audit v6: M-B — elimină INSERT/UPDATE anon pe _lk_% (lockout kv_store desființat complet)
-- Înlocuiește politica "kv anon insert" cu una care exclude cheile _lk_%

-- 1. Elimină politicile existente care permiteau INSERT/UPDATE anon pe _lk_%
drop policy if exists "kv anon insert" on public.kv_store;
drop policy if exists "kv anon update lockout" on public.kv_store;

-- 2. Recreează politica anon INSERT fără excepție pentru _lk_%
--    Anon poate insera DOAR chei non-operaționale și non-lockout
create policy "kv anon insert" on public.kv_store
  for insert to anon
  with check (
    key <> 'app_users'
    and key not like '_lk_%'
  );

-- 3. Curăță politicile authenticated care permiteau INSERT/UPDATE pe _lk_%
--    (lockout era scris și de utilizatorii autentificați)
drop policy if exists "kv authenticated insert" on public.kv_store;
drop policy if exists "kv authenticated update lockout" on public.kv_store;

-- 4. Recreează politica authenticated INSERT fără _lk_%
--    Autentificați pot insera doar cheile legitime de aplicație
create policy "kv authenticated insert" on public.kv_store
  for insert to authenticated
  with check (
    key in (
      'app_orders','app_catalogs','app_transports','app_vehicles',
      'app_units','app_stock_log','app_whatsapp_contacts','app_drivers',
      'app_users','app_permissions','app_permissions_snapshot'
    )
  );
