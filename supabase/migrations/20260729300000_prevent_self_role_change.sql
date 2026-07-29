-- Fix C1: trigger împiedică orice utilizator non-admin să-și schimbe propriul `role` sau `active`.
-- Fără acest trigger, orice agent putea face PATCH pe propriul rând din profiles
-- și își schimba role='keyuser' — compromitere completă cu un singur request.

create or replace function public.prevent_self_role_change()
returns trigger language plpgsql security definer as $$
begin
  if (new.role is distinct from old.role or new.active is distinct from old.active)
     and not exists (
       select 1 from public.profiles
       where id = auth.uid() and role = 'keyuser'
     ) then
    raise exception 'Unauthorized: cannot change role or active status';
  end if;
  return new;
end;
$$;

create trigger trg_prevent_self_role_change
  before update on public.profiles
  for each row execute function public.prevent_self_role_change();
