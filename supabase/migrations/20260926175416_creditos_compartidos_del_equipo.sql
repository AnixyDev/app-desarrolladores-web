-- Créditos de IA compartidos en el plan Teams.
--
-- La página de precios vende "200 Créditos IA compartidos" en Teams. Hasta
-- ahora los 200 iban al perfil del dueño y cada miembro del equipo gastaba
-- los suyos (los 10 de una cuenta Free): no se compartía nada.
--
-- Regla: quien es miembro ACTIVO del equipo de una cuenta Teams con la
-- suscripción viva gasta del saldo del dueño. Todos los demás, del suyo. Si
-- alguien pertenece a varios equipos Teams, cuenta el más antiguo.
--
-- Qué NO cambia: el cobro se sigue haciendo en el servidor (ai-gemini llama a
-- consume_credits_atomic) y sigue exigiendo que user_id sea quien llama. Solo
-- cambia DE QUÉ saldo se descuenta.

-- ¿De qué cuenta sale el gasto de IA de este usuario?
create or replace function public.cuenta_de_creditos_ia(p_usuario uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select tm.user_id
       from public.team_members tm
       join public.profiles dueno on dueno.id = tm.user_id
      where tm.accepted_user_id = p_usuario
        and tm.status = 'Activo'
        and tm.user_id <> p_usuario
        and dueno.plan = 'Teams'
        and coalesce(dueno.subscription_status, '') in ('active', 'trialing')
      order by tm.created_at
      limit 1),
    p_usuario
  );
$$;

-- Solo la usan otras funciones del servidor.
revoke all on function public.cuenta_de_creditos_ia(uuid) from public, anon, authenticated;

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

  v_cuenta := public.cuenta_de_creditos_ia(user_id);

  update public.profiles p
     set ai_credits = p.ai_credits - amount_to_consume
   where p.id = v_cuenta
     and p.ai_credits >= amount_to_consume;

  return found;
end;
$$;

-- El saldo que ve el usuario en pantalla: el suyo, o el del equipo.
-- SECURITY DEFINER porque un miembro no puede leer el perfil del dueño (RLS);
-- devuelve solo el número, nada más de ese perfil.
create or replace function public.saldo_creditos_ia()
returns table (saldo integer, compartido boolean)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_yo uuid := auth.uid();
  v_cuenta uuid;
begin
  if v_yo is null then
    return;
  end if;
  v_cuenta := public.cuenta_de_creditos_ia(v_yo);
  return query
    select coalesce(p.ai_credits, 0), v_cuenta <> v_yo
      from public.profiles p
     where p.id = v_cuenta;
end;
$$;

revoke all on function public.saldo_creditos_ia() from public, anon;
grant execute on function public.saldo_creditos_ia() to authenticated;
