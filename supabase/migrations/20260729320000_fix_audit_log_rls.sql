-- Fix M1: audit_log putea fi scris de oricine (anon sau authenticated) cu orice user_id.
-- Un atacator putea insera evenimente false atribuite altor utilizatori sau inunda tabelul.
--
-- Fix: elimină INSERT pentru anon (login/logout se execută cu JWT valid → authenticated),
-- și validează că user_id corespunde auth.uid() — nu poți forja evenimente pentru altcineva.

drop policy if exists "audit_allow_insert_anon" on public.audit_log;
revoke insert on public.audit_log from anon;

drop policy if exists "audit_allow_insert_auth" on public.audit_log;

create policy "audit_allow_insert_auth" on public.audit_log
  for insert to authenticated
  with check (
    user_id = auth.uid()::text
    and action in (
      'LOGIN', 'LOGOUT', 'PASS_CHANGE',
      'USER_CREATE', 'USER_EDIT', 'USER_DELETE',
      'ADMIN_SET_PASS', 'PERIOD_RESET'
    )
    and length(coalesce(details, '')) <= 500
  );
