-- Fix V3: orice cont authenticated putea suprascrie cu [] cheile operaționale din kv_store
-- (upsert cu array gol = ștergere efectivă a tuturor datelor), fără să fie nevoie de DELETE.
-- Triggerul blochează scrierea unui array gol pe cheile operaționale pentru non-keyuser.

create or replace function public.prevent_kv_data_wipe()
returns trigger language plpgsql security definer as $$
begin
  if new.key in (
       'app_orders', 'app_catalogs', 'app_transports', 'app_vehicles',
       'app_units', 'app_stock_log', 'app_whatsapp_contacts', 'app_drivers'
     )
     and jsonb_typeof(new.value::jsonb) = 'array'
     and jsonb_array_length(new.value::jsonb) = 0
     and not exists (
       select 1 from public.profiles where id = auth.uid() and role = 'keyuser'
     ) then
    raise exception 'Unauthorized: cannot wipe operational data';
  end if;
  return new;
end;
$$;

create trigger trg_prevent_kv_data_wipe
  before insert or update on public.kv_store
  for each row execute function public.prevent_kv_data_wipe();
