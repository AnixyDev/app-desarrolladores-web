-- "Canal de chat privado por proyecto" se anuncia en el plan Pro (9,95 EUR/mes)
-- en la pagina de precios y en Facturacion. Hasta hoy no existia: ProjectChat
-- guardaba los mensajes en useState, no habia ninguna tabla, y el portal del
-- cliente no tenia chat, asi que no habia nadie al otro lado. Los mensajes se
-- borraban al refrescar.

create table if not exists public.project_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  -- El nombre y el rol NO los manda el cliente: los rellena el trigger de
  -- abajo leyendo quien es de verdad. Si viajaran en el insert, un cliente
  -- del portal podria firmar un mensaje como si fuera el freelancer.
  author_name text not null default '',
  author_role text not null default '' check (author_role in ('freelancer', 'equipo', 'cliente', '')),
  body text not null check (length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists project_messages_proyecto_fecha_idx
  on public.project_messages (project_id, created_at);

alter table public.project_messages enable row level security;

-- ── Quien rellena el nombre y el rol ──────────────────────────────────────
create or replace function public.project_messages_sellar_autor()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_owner_id uuid;
  v_client_id uuid;
  v_nombre text;
begin
  select p.user_id, p.client_id into v_owner_id, v_client_id
  from public.projects p where p.id = new.project_id;

  if v_owner_id is null then
    raise exception 'El proyecto no existe' using errcode = '23503';
  end if;

  new.author_id := auth.uid();
  new.created_at := now();

  if v_owner_id = auth.uid() then
    select coalesce(nullif(btrim(pr.business_name), ''), nullif(btrim(pr.full_name), ''), 'Freelancer')
      into v_nombre from public.profiles pr where pr.id = auth.uid();
    new.author_name := coalesce(v_nombre, 'Freelancer');
    new.author_role := 'freelancer';
    return new;
  end if;

  if public.is_active_team_member(v_owner_id) then
    select coalesce(nullif(btrim(tm.name), ''), 'Miembro del equipo')
      into v_nombre from public.team_members tm
      where tm.user_id = v_owner_id and tm.accepted_user_id = auth.uid() and tm.status = 'Activo'
      limit 1;
    new.author_name := coalesce(v_nombre, 'Miembro del equipo');
    new.author_role := 'equipo';
    return new;
  end if;

  if v_client_id is not null then
    select coalesce(nullif(btrim(c.name), ''), 'Cliente')
      into v_nombre from public.clients c
      where c.id = v_client_id and c.portal_user_id = auth.uid();
    if v_nombre is not null then
      new.author_name := v_nombre;
      new.author_role := 'cliente';
      return new;
    end if;
  end if;

  -- RLS deberia haber cortado antes de llegar aqui.
  raise exception 'No puedes escribir en este proyecto' using errcode = '42501';
end;
$$;

revoke execute on function public.project_messages_sellar_autor() from anon, authenticated;

drop trigger if exists project_messages_sellar_autor_trg on public.project_messages;
create trigger project_messages_sellar_autor_trg
  before insert on public.project_messages
  for each row execute function public.project_messages_sellar_autor();

-- ── Politicas ─────────────────────────────────────────────────────────────
-- Las tres vias son las mismas que ya usa `projects`: dueno, miembro activo
-- del equipo, y cliente del portal enlazado por clients.portal_user_id.

drop policy if exists project_messages_select on public.project_messages;
create policy project_messages_select on public.project_messages
  for select to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_messages.project_id
        and (
          p.user_id = (select auth.uid())
          or public.is_active_team_member(p.user_id)
          or p.client_id in (
            select c.id from public.clients c where c.portal_user_id = (select auth.uid())
          )
        )
    )
  );

drop policy if exists project_messages_insert on public.project_messages;
create policy project_messages_insert on public.project_messages
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1 from public.projects p
      where p.id = project_messages.project_id
        and (
          p.user_id = (select auth.uid())
          or public.is_active_team_member(p.user_id)
          or p.client_id in (
            select c.id from public.clients c where c.portal_user_id = (select auth.uid())
          )
        )
    )
  );

-- Sin UPDATE a proposito: un mensaje enviado no se reescribe. Borrar solo el
-- dueno del proyecto, para poder retirar algo que no deberia estar ahi.
drop policy if exists project_messages_delete_owner on public.project_messages;
create policy project_messages_delete_owner on public.project_messages
  for delete to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_messages.project_id and p.user_id = (select auth.uid())
    )
  );

-- Para que las dos partes vean los mensajes al instante, sin recargar.
alter publication supabase_realtime add table public.project_messages;

comment on table public.project_messages is
  'Chat por proyecto entre el freelancer, su equipo y el cliente del portal. author_name y author_role los sella un trigger: no se aceptan del cliente.';
