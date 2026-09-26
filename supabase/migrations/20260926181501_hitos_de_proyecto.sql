-- Hitos de proyecto (plan Pro).
--
-- La página de precios vende "Proyectos e Hitos ilimitados" en Pro. Los hitos
-- no existían en ninguna parte: ni tabla, ni pantalla. Acordado con Ana el
-- 26/09: solo seguimiento — nombre, fecha y estado —, visibles en el
-- proyecto y en el portal del cliente. Sin importes ni facturación.
--
-- Quién puede qué (mismo criterio que los proyectos):
--   Dueño del proyecto            todo
--   Equipo: Manager y Admin       crear, editar y borrar
--   Equipo: Developer             ver
--   Cliente en el portal          ver los hitos de sus proyectos

create table if not exists public.project_milestones (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  project_id  uuid not null references public.projects(id) on delete cascade,
  title       text not null check (length(btrim(title)) between 1 and 200),
  due_date    date,
  status      text not null default 'pendiente'
              check (status in ('pendiente', 'en_curso', 'entregado')),
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists project_milestones_proyecto_idx
  on public.project_milestones (project_id, position, due_date);

comment on table public.project_milestones is
  'Hitos de seguimiento de un proyecto (nombre, fecha, estado). Visibles para el equipo y para el cliente en el portal.';

-- El dueño del hito es SIEMPRE el dueño del proyecto, lo mande quien lo mande:
-- así un Manager del equipo crea hitos en la cuenta del dueño, y nadie puede
-- colgar un hito de un proyecto ajeno a nombre de otra cuenta.
create or replace function public.hitos_fijar_dueno()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  select p.user_id into new.user_id from public.projects p where p.id = new.project_id;
  if new.user_id is null then
    raise exception 'Proyecto no encontrado' using errcode = '23503';
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

revoke all on function public.hitos_fijar_dueno() from public, anon, authenticated;

drop trigger if exists project_milestones_fijar_dueno on public.project_milestones;
create trigger project_milestones_fijar_dueno
  before insert or update of project_id, user_id, title, due_date, status, position
  on public.project_milestones
  for each row execute function public.hitos_fijar_dueno();

alter table public.project_milestones enable row level security;

drop policy if exists hitos_dueno_todo on public.project_milestones;
create policy hitos_dueno_todo on public.project_milestones
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists hitos_equipo_ver on public.project_milestones;
create policy hitos_equipo_ver on public.project_milestones
  for select to authenticated
  using (public.is_active_team_member(user_id));

drop policy if exists hitos_equipo_gestores_insertar on public.project_milestones;
create policy hitos_equipo_gestores_insertar on public.project_milestones
  for insert to authenticated
  with check (public.rol_en_equipo(user_id) in ('Manager', 'Admin'));

drop policy if exists hitos_equipo_gestores_editar on public.project_milestones;
create policy hitos_equipo_gestores_editar on public.project_milestones
  for update to authenticated
  using (public.rol_en_equipo(user_id) in ('Manager', 'Admin'))
  with check (public.rol_en_equipo(user_id) in ('Manager', 'Admin'));

drop policy if exists hitos_equipo_gestores_borrar on public.project_milestones;
create policy hitos_equipo_gestores_borrar on public.project_milestones
  for delete to authenticated
  using (public.rol_en_equipo(user_id) in ('Manager', 'Admin'));

drop policy if exists hitos_cliente_portal_ver on public.project_milestones;
create policy hitos_cliente_portal_ver on public.project_milestones
  for select to authenticated
  using (project_id in (
    select p.id
      from public.projects p
      join public.clients c on c.id = p.client_id
     where c.portal_user_id = (select auth.uid())
  ));

grant select, insert, update, delete on public.project_milestones to authenticated;
revoke all on public.project_milestones from anon;
