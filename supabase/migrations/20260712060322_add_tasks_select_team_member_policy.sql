-- La tabla tasks solo tenía "tasks_owner_all" (ALL, auth.uid() = user_id).
-- A diferencia de projects, time_entries y knowledge_articles, nunca se le
-- añadió una política de lectura para miembros de equipo activos. Esto
-- impedía que un invitado viera las tareas del proyecto al que pertenece
-- en /my-timesheet, aunque el resto del esquema (is_active_team_member)
-- ya estaba preparado para soportarlo.
create policy "tasks_select_team_member"
on public.tasks
for select
to authenticated
using (is_active_team_member(user_id));;
