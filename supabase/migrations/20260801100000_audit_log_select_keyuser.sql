-- U-4: permite keyuser activ să citească toate logurile din audit_log
-- Necesar pentru pagina Securitate — până acum se afișau doar loguri locale (localStorage)

create policy "audit_allow_select_keyuser" on public.audit_log
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role = 'keyuser'
        and active = true
    )
  );
