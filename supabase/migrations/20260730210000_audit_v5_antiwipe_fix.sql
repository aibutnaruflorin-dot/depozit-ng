-- Fix M1 (audit v5): prevent_kv_data_wipe bloca doar shrink >50% dintr-o dată.
-- Bypass posibil prin înjumătățiri iterative (1000→500→250→...→1 în ~10 pași).
-- Fix: non-keyuser nu poate micșora array-ul deloc (nicio ștergere, oricât de mică).

create or replace function public.prevent_kv_data_wipe()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.key in (
       'app_orders', 'app_catalogs', 'app_transports', 'app_vehicles',
       'app_units', 'app_stock_log', 'app_whatsapp_contacts', 'app_drivers'
     )
     and not exists (select 1 from public.profiles where id = auth.uid() and role = 'keyuser')
  then
    -- valoarea trebuie să rămână array (blochează null, {}, string, etc.)
    if jsonb_typeof(new.value) is distinct from 'array' then
      raise exception 'Unauthorized: operational key must stay an array';
    end if;
    -- non-keyuser nu poate micșora array-ul cu nicio valoare (fix iterative halving bypass)
    if TG_OP = 'UPDATE' and jsonb_typeof(old.value) = 'array'
       and jsonb_array_length(new.value) < jsonb_array_length(old.value) then
      raise exception 'Unauthorized: non-admin cannot remove records (% -> %)',
                      jsonb_array_length(old.value), jsonb_array_length(new.value);
    end if;
  end if;
  return new;
end; $$;
