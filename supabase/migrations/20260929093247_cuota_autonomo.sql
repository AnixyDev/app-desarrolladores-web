-- Cuota de autónomo (29/09/2026, a petición de Ana).
--
-- Una casilla propia para la cuota mensual de la Seguridad Social (RETA):
--   * `cuotas_autonomo` guarda el HISTÓRICO de importes: cada fila dice «desde
--     este mes pago X». Así caben la tarifa plana, los cambios de tramo o una
--     baja (importe 0) sin perder lo anterior.
--   * Cada mes, cuando llega el cargo (último día hábil del mes, como carga la
--     Seguridad Social), se apunta un GASTO normal con categoría «Cuota de
--     autónomo», sin IVA. Al ser un gasto más, entra solo en informes,
--     rentabilidad, asistente y previsión.
--   * `cuota_autonomo_meses` recuerda qué meses ya se apuntaron: si borras el
--     gasto de un mes (bonificado, devuelto…), no vuelve a aparecer.

create table if not exists public.cuotas_autonomo (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  desde date not null check (desde = date_trunc('month', desde)::date and desde >= date '2015-01-01'),
  importe_cents integer not null check (importe_cents between 0 and 500000),
  nota text check (char_length(nota) <= 200),
  created_at timestamptz not null default now(),
  unique (user_id, desde)
);

create table if not exists public.cuota_autonomo_meses (
  user_id uuid not null references public.profiles(id) on delete cascade,
  mes date not null,
  expense_id uuid references public.expenses(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, mes)
);

alter table public.expenses add column if not exists cuota_autonomo_mes date;

alter table public.cuotas_autonomo enable row level security;
alter table public.cuota_autonomo_meses enable row level security;

create policy cuotas_autonomo_propias on public.cuotas_autonomo
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- El registro de meses solo se lee desde el navegador; lo escribe la función.
create policy cuota_autonomo_meses_leer on public.cuota_autonomo_meses
  for select to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.cuotas_autonomo to authenticated;
grant select on public.cuota_autonomo_meses to authenticated;

create index if not exists cuotas_autonomo_user_idx on public.cuotas_autonomo (user_id, desde);

-- Último día hábil (lunes a viernes) de un mes. No descuenta festivos.
create or replace function public.ultimo_dia_habil(p_mes date)
returns date
language sql
immutable
set search_path to 'public', 'pg_temp'
as $function$
  select d::date
  from generate_series(
    (date_trunc('month', p_mes) + interval '1 month - 1 day')::date,
    (date_trunc('month', p_mes) + interval '1 month - 7 days')::date,
    interval '-1 day'
  ) as d
  where extract(isodow from d) < 6
  limit 1;
$function$;

-- Apunta los meses de cuota ya cargados que falten. Devuelve cuántos apuntó.
create or replace function public._registrar_cuotas_autonomo(p_user uuid, p_hoy date)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_mes date;
  v_primero date;
  v_importe integer;
  v_gasto uuid;
  v_n integer := 0;
  v_vueltas integer := 0;
begin
  select min(desde) into v_primero from public.cuotas_autonomo where user_id = p_user;
  if v_primero is null then return 0; end if;

  v_mes := v_primero;
  while v_mes <= date_trunc('month', p_hoy)::date and v_vueltas < 240 loop
    v_vueltas := v_vueltas + 1;
    if public.ultimo_dia_habil(v_mes) <= p_hoy
       and not exists (select 1 from public.cuota_autonomo_meses where user_id = p_user and mes = v_mes) then
      select importe_cents into v_importe
        from public.cuotas_autonomo
       where user_id = p_user and desde <= v_mes
       order by desde desc limit 1;

      v_gasto := null;
      if coalesce(v_importe, 0) > 0 then
        insert into public.expenses (user_id, description, amount_cents, tax_percent, date, category, cuota_autonomo_mes)
        values (p_user, 'Cuota de autónomo (RETA) ' || to_char(v_mes, 'MM/YYYY'), v_importe, 0,
                public.ultimo_dia_habil(v_mes), 'Cuota de autónomo', v_mes)
        returning id into v_gasto;
        v_n := v_n + 1;
      end if;
      insert into public.cuota_autonomo_meses (user_id, mes, expense_id) values (p_user, v_mes, v_gasto)
      on conflict do nothing;
    end if;
    v_mes := (v_mes + interval '1 month')::date;
  end loop;
  return v_n;
end;
$function$;

-- La llama la pantalla de gastos: solo para quien la usa.
create or replace function public.registrar_mis_cuotas_autonomo()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if auth.uid() is null then raise exception 'Sin sesión' using errcode = '42501'; end if;
  return public._registrar_cuotas_autonomo(auth.uid(), current_date);
end;
$function$;

-- La lanza el cron cada día para todos (quien no abra la app también queda al día).
create or replace function public.registrar_cuotas_autonomo_todas()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user uuid;
  v_total integer := 0;
begin
  for v_user in select distinct user_id from public.cuotas_autonomo loop
    v_total := v_total + public._registrar_cuotas_autonomo(v_user, current_date);
  end loop;
  return v_total;
end;
$function$;

revoke all on function public._registrar_cuotas_autonomo(uuid, date) from public, anon, authenticated;
revoke all on function public.registrar_cuotas_autonomo_todas() from public, anon, authenticated;
revoke all on function public.registrar_mis_cuotas_autonomo() from public, anon;
grant execute on function public.registrar_mis_cuotas_autonomo() to authenticated;
grant execute on function public.ultimo_dia_habil(date) to authenticated;

select cron.schedule('registrar-cuotas-autonomo', '10 6 * * *', $$select public.registrar_cuotas_autonomo_todas();$$);
