-- Faltaba por completo la política UPDATE en job_applications. Sin ella,
-- ni siquiera viewApplication() (marcar como "vista") podía escribir nada
-- -- y cualquier futura acción de aceptar/rechazar candidatos fallaría
-- siempre en silencio, aunque el frontend estuviera bien escrito.
-- Solo el dueño de la oferta (jobs.user_id) puede cambiar el status de
-- una postulación a esa oferta.
create policy "job_applications_owner_update_status"
on public.job_applications
for update
to authenticated
using (
  exists (
    select 1 from public.jobs
    where jobs.id = job_applications.job_id
      and jobs.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.jobs
    where jobs.id = job_applications.job_id
      and jobs.user_id = auth.uid()
  )
);;
