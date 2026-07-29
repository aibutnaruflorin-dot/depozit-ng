-- Ziua 2: audit_log.user_id integer → text
-- Supabase Auth folosește UUID (string) ca identificator de utilizator.
-- Toate înregistrările viitoare vor stoca UUID-ul în locul valorii numerice 0.
-- Înregistrările existente (user_id=0) sunt convertite la textul "0".

alter table public.audit_log
  alter column user_id type text using user_id::text;
