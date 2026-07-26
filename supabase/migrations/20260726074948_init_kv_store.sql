create table if not exists public.kv_store (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.kv_store enable row level security;

create policy "Allow all" on public.kv_store
  for all using (true) with check (true);
