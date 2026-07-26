grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on public.kv_store to anon;
grant select, insert, update, delete on public.kv_store to authenticated;
grant select, insert, update, delete on public.kv_store to service_role;
