-- Înlocuiește politica "Allow all" (prea permisivă) cu politici granulare.
-- service_role bypass-ează RLS automat → testele E2E cu SB_SVC_KEY nu sunt afectate.

drop policy if exists "Allow all" on public.kv_store;

-- anon: SELECT toate cheile (necesar pentru sync cross-device via loadAll)
create policy "kv anon select" on public.kv_store
  for select to anon using (true);

-- anon: INSERT orice cheie EXCEPTÂND app_users (parole nu se sincronizează remote)
create policy "kv anon insert" on public.kv_store
  for insert to anon with check (key <> 'app_users');

-- anon: UPDATE orice cheie EXCEPTÂND app_users
create policy "kv anon update" on public.kv_store
  for update to anon
  using  (key <> 'app_users')
  with check (key <> 'app_users');

-- DELETE nu este acordat pentru anon — previne ștergerea datelor operaționale
-- (service_role bypass-ează RLS, deci testele pot apela DELETE fără probleme)
