-- Phase 6b: Permite keyuser să actualizeze orice profil
-- profiles_update_own (din migrarea anterioară) permite doar actualizarea propriului profil.
-- Admin-ul (keyuser) trebuie să poată actualiza orice profil (nume, rol, activ).
-- Verificarea se face prin subquery în profiles — dacă apelantul are role='keyuser', are acces complet.

create policy "profiles_update_admin" on public.profiles
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'keyuser'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'keyuser'
    )
  );
