-- Fix H1: prevent_self_role_change bloca service_role (auth.uid() = NULL în context service_role)
-- Fix L1: adaugă set search_path = '' la toate funcțiile security definer

create or replace function public.prevent_self_role_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- service_role / backend de încredere: auth.uid() e NULL → permite întotdeauna
  if auth.uid() is null then return new; end if;

  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'keyuser') then
    if new.role              is distinct from old.role
       or new.active         is distinct from old.active
       or new.username       is distinct from old.username
       or new.must_change_password is distinct from old.must_change_password
       or new.created_at     is distinct from old.created_at then
      raise exception 'Unauthorized: field change not permitted';
    end if;
  end if;
  return new;
end; $$;

-- Fix H2: prevent_kv_data_wipe era ocolibil cu non-array sau array cu gunoi
-- Fix L1: adaugă set search_path = ''

create or replace function public.prevent_kv_data_wipe()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  old_len int;
  new_len int;
begin
  if new.key in (
       'app_orders', 'app_catalogs', 'app_transports', 'app_vehicles',
       'app_units', 'app_stock_log', 'app_whatsapp_contacts', 'app_drivers'
     )
     and not exists (select 1 from public.profiles where id = auth.uid() and role = 'keyuser')
  then
    -- 1. valoarea trebuie să rămână array (blochează null, {}, "string", etc.)
    if jsonb_typeof(new.value) is distinct from 'array' then
      raise exception 'Unauthorized: operational key must stay an array';
    end if;
    -- 2. fără scăderi bruște de peste 50% dintr-o dată (anti-shrink/wipe)
    if TG_OP = 'UPDATE' and jsonb_typeof(old.value) = 'array' then
      old_len := jsonb_array_length(old.value);
      new_len := jsonb_array_length(new.value);
      if old_len > 0 and new_len < old_len * 0.5 then
        raise exception 'Unauthorized: suspicious bulk deletion (% -> %)', old_len, new_len;
      end if;
    end if;
  end if;
  return new;
end; $$;

-- Fix L1: is_active_user cu set search_path = ''

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active = true);
$$;
