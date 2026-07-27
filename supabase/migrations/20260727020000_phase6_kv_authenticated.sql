-- Phase 6: kv_store — adaugă politici pentru rolul authenticated
-- După migrarea la Supabase Auth, utilizatorii autentificați trimit JWT
-- (rolul authenticated). Politicile existente sunt doar pentru anon,
-- deci sync-ul de date eșua complet după login. Acest script remediază.

-- ─── Restrict anon la numai lockout keys ───────────────────────────────────

drop policy if exists "kv anon select limited" on public.kv_store;
drop policy if exists "kv anon insert safe"    on public.kv_store;
drop policy if exists "kv anon update safe"    on public.kv_store;

-- anon: poate citi/scrie NUMAI cheile de lockout (_lk_*) — necesare înainte de autentificare
create policy "kv anon select lockout" on public.kv_store
  for select to anon
  using (key like '_lk_%');

create policy "kv anon insert lockout" on public.kv_store
  for insert to anon
  with check (key like '_lk_%');

create policy "kv anon update lockout" on public.kv_store
  for update to anon
  using  (key like '_lk_%')
  with check (key like '_lk_%');

-- ─── Politici complete pentru utilizatori autentificați ────────────────────

create policy "kv authenticated select" on public.kv_store
  for select to authenticated
  using (true);

create policy "kv authenticated insert" on public.kv_store
  for insert to authenticated
  with check (true);

create policy "kv authenticated update" on public.kv_store
  for update to authenticated
  using (true)
  with check (true);

create policy "kv authenticated delete" on public.kv_store
  for delete to authenticated
  using (true);
