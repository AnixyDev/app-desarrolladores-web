-- Puente Lead Hunter PRO -> DevFreelancer: convertir un lead (businesses) en cliente (clients).
-- La app de captacion (captacion-clientes-web) llama desde el servidor con SERVICE_ROLE
-- (sin auth.uid()) y maneja equipos (dueno + miembros), por eso la funcion recibe el
-- usuario dueno del lead de forma explicita (p_user_id) y comprueba la propiedad.
-- Atomica y sin duplicar. Ya aplicada en produccion por MCP el 2026-11-27.

alter table public.businesses
  add column if not exists converted_client_id uuid references public.clients(id) on delete set null;

comment on column public.businesses.converted_client_id is
  'Cliente de DevFreelancer creado a partir de este lead. NULL = aun no convertido. Evita duplicar al convertir dos veces y da trazabilidad lead -> cliente.';

create or replace function public.convertir_lead_en_cliente(
  p_business_id uuid,
  p_user_id uuid,
  p_actor_id uuid default null
)
returns public.clients
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business public.businesses;
  v_client   public.clients;
  v_direccion text;
begin
  if p_user_id is null then
    raise exception 'Falta el usuario dueno del lead' using errcode = '22023';
  end if;

  -- El lead debe pertenecer al usuario indicado; FOR UPDATE evita doble conversion simultanea.
  select * into v_business
  from public.businesses
  where id = p_business_id and user_id = p_user_id
  for update;

  if not found then
    raise exception 'Lead no encontrado o no pertenece al usuario' using errcode = 'P0002';
  end if;

  -- Ya convertido y el cliente sigue existiendo: devolver ese, no crear otro.
  if v_business.converted_client_id is not null then
    select * into v_client from public.clients where id = v_business.converted_client_id;
    if found then
      return v_client;
    end if;
  end if;

  -- Direccion a partir de los campos del lead (calle, CP + ciudad, provincia), sin huecos vacios.
  v_direccion := nullif(trim(both ' ,' from concat_ws(', ',
      nullif(trim(coalesce(v_business.address, '')), ''),
      nullif(trim(concat_ws(' ',
        nullif(trim(coalesce(v_business.postal_code, '')), ''),
        nullif(trim(coalesce(v_business.city, '')), ''))), ''),
      nullif(trim(coalesce(v_business.province, '')), '')
    )), '');

  insert into public.clients (user_id, name, email, phone, address)
  values (
    p_user_id,
    v_business.name,
    nullif(trim(coalesce(v_business.email, '')), ''),
    nullif(trim(coalesce(v_business.phone, '')), ''),
    v_direccion
  )
  returning * into v_client;

  update public.businesses
     set converted_client_id = v_client.id,
         status = 'CERRADO',
         updated_at = now()
   where id = p_business_id;

  insert into public.interactions (business_id, type, message, actor_id)
  values (p_business_id, 'status_change', 'Convertido en cliente de DevFreelancer', coalesce(p_actor_id, p_user_id));

  return v_client;
end;
$$;

-- Solo el servidor (service_role) puede ejecutarla; el navegador nunca la llama directamente.
revoke all on function public.convertir_lead_en_cliente(uuid, uuid, uuid) from public;
grant execute on function public.convertir_lead_en_cliente(uuid, uuid, uuid) to service_role;
