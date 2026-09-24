-- Limpieza: 2 filas de prueba vacías (presupuesto/duracionsemanas/cliente/
-- email_contacto todo NULL), del propio user_id de Ana, creadas en una
-- sesión de testing (16 nov 2025). Causaban el crash de JobMarketDashboard.
delete from public.jobs
where presupuesto is null
  and duracionsemanas is null
  and cliente is null
  and email_contacto is null;

-- Refuerzo de esquema: el formulario (JobPostForm.tsx) ya normaliza estos
-- campos con "|| 0" antes de enviarlos, pero la columna permitía NULL a
-- nivel de BD, dejando la puerta abierta a que cualquier inserción directa
-- (SQL, testing, futura API) vuelva a tumbar la UI. Se fija un default y
-- NOT NULL para que la garantía viva en la base de datos, no solo en el frontend.
alter table public.jobs
  alter column presupuesto set default 0,
  alter column duracionsemanas set default 0;

update public.jobs set presupuesto = 0 where presupuesto is null;
update public.jobs set duracionsemanas = 0 where duracionsemanas is null;

alter table public.jobs
  alter column presupuesto set not null,
  alter column duracionsemanas set not null;;
