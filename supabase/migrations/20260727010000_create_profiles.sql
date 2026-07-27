-- Faza 1 Supabase Auth: tabel profiles
-- Stochează metadata utilizatori (rol, nume, activ) — legat de auth.users via FK
-- Parolele NU mai sunt stocate nicăieri în client sau kv_store

create table public.profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  username            text not null unique,
  name                text not null,
  role                text not null default 'agent',
  active              boolean not null default true,
  must_change_password boolean not null default false,
  created_at          timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Toți utilizatorii autentificați pot citi toate profilurile
-- (necesar pentru lista de useri din admin și pentru a încărca propria sesiune)
create policy "profiles_select" on public.profiles
  for select to authenticated using (true);

-- Utilizatorii pot actualiza DOAR propriul profil
-- (ex: must_change_password = false după schimbarea parolei)
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using  (id = auth.uid())
  with check (id = auth.uid());

-- Grant explicit pentru roluri
-- service_role bypass-ează RLS automat (Edge Function are acces complet)
grant select, insert, update, delete on public.profiles to service_role;
grant select on public.profiles to authenticated;
grant update on public.profiles to authenticated;
