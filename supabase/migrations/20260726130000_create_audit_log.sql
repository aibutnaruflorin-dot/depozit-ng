-- Tabel de audit imutabil: INSERT-only via RLS
create table if not exists public.audit_log (
  id         bigserial primary key,
  user_id    integer,
  action     text        not null,
  details    text,
  created_at timestamptz not null default now()
);

alter table public.audit_log enable row level security;

-- Permitem INSERT pentru anon și authenticated (aplicația scrie fără auth Supabase)
create policy "audit_allow_insert_anon" on public.audit_log
  for insert to anon with check (true);

create policy "audit_allow_insert_auth" on public.audit_log
  for insert to authenticated with check (true);

-- SELECT, UPDATE, DELETE sunt blocate pentru anon/authenticated (service_role bypass RLS implicit)

grant usage on schema public to anon, authenticated, service_role;
grant insert on public.audit_log to anon, authenticated;
grant select, insert, update, delete on public.audit_log to service_role;
grant usage on sequence public.audit_log_id_seq to anon, authenticated, service_role;
