-- consume_credits_atomic aceptaba cantidades negativas.
--
-- La funcion es SECURITY DEFINER y la puede llamar cualquier usuario con
-- sesion (la usa ai-gemini con el cliente del usuario). Restaba sin mirar el
-- signo: "gastar" -100000 creditos sumaba 100000, y como se ejecuta como
-- postgres, el disparador que protege las columnas de pago del perfil no la
-- frenaba. Comprobado el 27/09 en un ensayo deshecho: 93 -> 100093.
--
-- Arreglo: solo se aceptan cantidades enteras positivas. Todos los costes del
-- catalogo (_shared/creditos-ia.ts) son de 1 o mas, asi que el uso normal no
-- cambia. Mismos permisos y misma firma que antes.

create or replace function public.consume_credits_atomic(user_id uuid, amount_to_consume integer)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cuenta uuid;
begin
  if user_id is distinct from auth.uid() then
    raise exception 'No autorizado: user_id no coincide con el usuario autenticado';
  end if;

  if amount_to_consume is null or amount_to_consume <= 0 then
    raise exception 'Cantidad de creditos no valida: %', amount_to_consume
      using errcode = '22023';
  end if;

  v_cuenta := public.cuenta_de_creditos_ia(user_id);

  update public.profiles p
     set ai_credits = p.ai_credits - amount_to_consume
   where p.id = v_cuenta
     and p.ai_credits >= amount_to_consume;

  return found;
end;
$$;

-- La version antigua de un solo parametro ya no la puede llamar nadie desde
-- fuera (sin EXECUTE para anon ni authenticated), pero tenia el mismo fallo.
-- Se le pone la misma guarda por si algun dia se vuelve a exponer.
create or replace function public.consume_credits_atomic(p_amount integer)
returns table (id uuid, ai_credits integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Cantidad de creditos no valida: %', p_amount
      using errcode = '22023';
  end if;

  return query
  update public.profiles p
  set ai_credits = p.ai_credits - p_amount
  where p.id = auth.uid()
    and p.ai_credits >= p_amount
  returning p.id, p.ai_credits;

  if not found then
    raise exception 'Créditos insuficientes' using errcode = 'P0001';
  end if;
end;
$$;
