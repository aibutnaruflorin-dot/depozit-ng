-- Fix V9: mass-assignment pe propriul profil — un non-keyuser putea schimba
-- `username`, `must_change_password`, `created_at` prin PATCH direct pe profiles.
-- Extinde funcția trigger existentă să blocheze și aceste câmpuri.

create or replace function public.prevent_self_role_change()
returns trigger language plpgsql security definer as $$
begin
  if not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'keyuser'
  ) then
    if (
      new.role              is distinct from old.role
      or new.active         is distinct from old.active
      or new.username       is distinct from old.username
      or new.must_change_password is distinct from old.must_change_password
      or new.created_at     is distinct from old.created_at
    ) then
      raise exception 'Unauthorized: field change not permitted';
    end if;
  end if;
  return new;
end;
$$;

-- Triggerul existent (trg_prevent_self_role_change) apelează aceeași funcție
-- prin create or replace — nu e nevoie să recreăm triggerul.
