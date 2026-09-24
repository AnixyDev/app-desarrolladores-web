-- Mismo patrón que ya usamos en time_entries/job_applications. tasks solo
-- tenía SELECT para miembros de equipo (arreglado en una sesión anterior),
-- pero ni INSERT ni UPDATE — así que un miembro de equipo:
-- (a) no podía marcar una tarea del proyecto compartido como completada
--     desde MyTeamTimesheet.tsx (el checkbox fallaría en silencio por RLS), y
-- (b) si creaba una tarea nueva desde /projects/:id, se guardaba bajo su
--     propia cuenta (única forma en que el INSERT pasaba la RLS existente),
--     invisible para el dueño real del proyecto — mismo bug que ya
--     arreglamos en addTimeEntry.
create policy "tasks_update_team_member"
on public.tasks
for update
to authenticated
using (is_active_team_member(user_id))
with check (is_active_team_member(user_id));

create policy "tasks_insert_team_member"
on public.tasks
for insert
to authenticated
with check (is_active_team_member(user_id));;
