-- Roles del equipo con permisos de verdad (plan Teams).
--
-- La página de precios vende "Roles y permisos avanzados". Los roles
-- (Developer, Manager, Admin) se guardaban en team_members.role, pero ninguna
-- política los miraba: el acceso dependía solo de estar "Activo", y los tres
-- roles podían exactamente lo mismo.
--
-- Reparto acordado con Ana el 26/09:
--                            Developer  Manager  Admin
--   Ver proyectos                ✓         ✓       ✓    (ya existía)
--   Tareas: ver/crear/editar     ✓         ✓       ✓    (ya existía)
--   Registrar horas              ✓         ✓       ✓    (ya existía)
--   Ver SUS horas                ✓         ✓       ✓    (ya existía: time_entries_select_logged_by_team_member)
--   Ver las horas del equipo     —         ✓       ✓    NUEVO
--   Editar proyectos             —         ✓       ✓    NUEVO
--   Borrar tareas                —         —       ✓    NUEVO
--   Clientes, facturas, finanzas —         —       —    (solo el dueño)
--
-- Crear proyectos sigue siendo solo del dueño: un proyecto necesita un
-- cliente, y los clientes no los ve nadie más que él.

create or replace function public.rol_en_equipo(p_dueno uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select tm.role
    from public.team_members tm
   where tm.user_id = p_dueno
     and tm.accepted_user_id = auth.uid()
     and tm.status = 'Activo'
   order by tm.created_at
   limit 1;
$$;

revoke all on function public.rol_en_equipo(uuid) from public, anon;
grant execute on function public.rol_en_equipo(uuid) to authenticated;

-- Horas: cada miembro ya veía las suyas; Manager y Admin, las de todo el equipo.
drop policy if exists time_entries_select_team_gestores on public.time_entries;
create policy time_entries_select_team_gestores on public.time_entries
  for select to authenticated
  using (public.rol_en_equipo(user_id) in ('Manager', 'Admin'));

-- Proyectos: Manager y Admin pueden editarlos. Que no puedan "llevarse" el
-- proyecto a su cuenta lo garantiza el disparador del final, no esta política
-- (las políticas permisivas se combinan con OR).
drop policy if exists projects_update_team_gestores on public.projects;
create policy projects_update_team_gestores on public.projects
  for update to authenticated
  using (public.rol_en_equipo(user_id) in ('Manager', 'Admin'))
  with check (public.rol_en_equipo(user_id) in ('Manager', 'Admin'));

-- Tareas: solo Admin (y el dueño, con su política de siempre) puede borrar.
drop policy if exists tasks_delete_team_admin on public.tasks;
create policy tasks_delete_team_admin on public.tasks
  for delete to authenticated
  using (public.rol_en_equipo(user_id) = 'Admin');

-- Nadie cambia de dueño un proyecto, una tarea o un registro de horas desde
-- el navegador.
--
-- Encontrado al ensayar esta migración: las políticas permisivas de UPDATE se
-- combinan con OR. La de Manager deja tocar el proyecto del dueño, y la del
-- propio dueño (auth.uid() = user_id) da por buena la fila resultante si el
-- Manager pone SU id en user_id: el proyecto cambiaba de cuenta. Con las
-- tareas pasaba YA antes de esta migración: tasks_update_team_member deja
-- editar y tasks_owner_all aceptaba la fila con el user_id del miembro.
-- Ninguna pantalla cambia el dueño de nada, así que se prohíbe sin más.
create or replace function public.impedir_cambio_de_dueno()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user in ('anon', 'authenticated')
     and new.user_id is distinct from old.user_id then
    raise exception 'No se puede cambiar el dueño de este registro.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.impedir_cambio_de_dueno() from public, anon, authenticated;

drop trigger if exists projects_impedir_cambio_de_dueno on public.projects;
create trigger projects_impedir_cambio_de_dueno before update of user_id on public.projects
  for each row execute function public.impedir_cambio_de_dueno();
drop trigger if exists tasks_impedir_cambio_de_dueno on public.tasks;
create trigger tasks_impedir_cambio_de_dueno before update of user_id on public.tasks
  for each row execute function public.impedir_cambio_de_dueno();
drop trigger if exists time_entries_impedir_cambio_de_dueno on public.time_entries;
create trigger time_entries_impedir_cambio_de_dueno before update of user_id on public.time_entries
  for each row execute function public.impedir_cambio_de_dueno();
