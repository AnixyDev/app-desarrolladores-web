-- Asistente de IA con memoria (28/09/2026).
--
-- 1) Conversaciones guardadas: hasta hoy el chat vivía solo en la pantalla y
--    el servidor ni siquiera recibía el historial, así que cada mensaje era
--    una pregunta suelta. Ahora cada conversación y sus mensajes se guardan
--    en la cuenta, y la función ai-gemini lee el historial desde aquí.
-- 2) Devolución de créditos: ai-gemini cobra ANTES de llamar a Gemini (para
--    no regalar cuota), pero si Gemini fallaba el crédito se perdía. Ahora la
--    función los devuelve con devolver_creditos_ia(), que solo puede llamar
--    el servidor.

create table if not exists public.ai_conversaciones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  titulo text not null default 'Nueva conversación' check (char_length(titulo) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_mensajes (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references public.ai_conversaciones(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  rol text not null check (rol in ('user', 'model')),
  texto text not null check (char_length(texto) <= 40000),
  created_at timestamptz not null default now()
);

create index if not exists ai_conversaciones_user_idx on public.ai_conversaciones (user_id, updated_at desc);
create index if not exists ai_mensajes_conversacion_idx on public.ai_mensajes (conversacion_id, created_at);
create index if not exists ai_mensajes_user_idx on public.ai_mensajes (user_id);

alter table public.ai_conversaciones enable row level security;
alter table public.ai_mensajes enable row level security;

-- Cada cual, lo suyo. Los mensajes solo se pueden añadir a conversaciones propias.
create policy ai_conversaciones_propias on public.ai_conversaciones
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy ai_mensajes_propios_leer on public.ai_mensajes
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy ai_mensajes_propios_crear on public.ai_mensajes
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.ai_conversaciones c where c.id = conversacion_id and c.user_id = (select auth.uid()))
  );

create policy ai_mensajes_propios_borrar on public.ai_mensajes
  for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.ai_conversaciones to authenticated;
grant select, insert, delete on public.ai_mensajes to authenticated;

-- Devuelve créditos a la cuenta que los pagó (la propia o la del equipo).
-- Solo el servidor: el navegador no puede sumarse créditos.
create or replace function public.devolver_creditos_ia(p_user uuid, p_cantidad integer)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if p_cantidad is null or p_cantidad <= 0 or p_cantidad > 50 then
    raise exception 'Cantidad no válida: %', p_cantidad using errcode = '22023';
  end if;
  update public.profiles
     set ai_credits = ai_credits + p_cantidad
   where id = public.cuenta_de_creditos_ia(p_user);
end;
$function$;

revoke all on function public.devolver_creditos_ia(uuid, integer) from public, anon, authenticated;
grant execute on function public.devolver_creditos_ia(uuid, integer) to service_role;
