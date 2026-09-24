-- Lo que `supabase db dump` NO se lleva.
--
-- `db dump` vuelca solo el esquema `public`. Todo lo de aquí vive fuera de él
-- y es tuyo, no de Supabase: sin este archivo, una base de datos reconstruida
-- desde `esquema-actual.sql` arrancaría con las 51 tablas y las 126 políticas
-- en su sitio... y aun así estaría rota.
--
-- Se aplica DESPUÉS de esquema-actual.sql, que es quien crea las funciones a
-- las que esto hace referencia (handle_new_user).
--
-- Generado el 24/09/2026 leyendo la base de datos de producción.
-- Si cambias alguna de estas cosas por el panel, actualiza este archivo.


-- ─────────────────────────────────────────────────────────────────────────
-- 1. El disparador que crea el perfil al registrarse un usuario
-- ─────────────────────────────────────────────────────────────────────────
--
-- Vive en `auth.users`, que es esquema `auth`. Es LA pieza que faltaba: sin
-- ella nadie que se registre tendría fila en `profiles`, y la aplicación
-- entera —plan, créditos, NIF, todo— se apoya en esa fila. La función
-- handle_new_user() sí viaja en esquema-actual.sql; el disparador que la
-- llama, no.

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ─────────────────────────────────────────────────────────────────────────
-- 2. Los tres cubos de almacenamiento
-- ─────────────────────────────────────────────────────────────────────────
--
-- Son filas de `storage.buckets`, es decir datos, no estructura: por eso un
-- volcado de esquema no los trae. Sin ellos, subir un logo, un archivo al
-- portal del cliente o el certificado fiscal falla.
--
-- OJO con `public`: brand-logos es público a propósito (los logos se
-- incrustan en facturas y en el portal). Los otros dos NO lo son y no deben
-- serlo nunca — fiscal-certificates guarda tu certificado de firma.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('brand-logos', 'brand-logos', true, null, null),
  ('fiscal-certificates', 'fiscal-certificates', false, null, null),
  ('portal-files', 'portal-files', false, 10485760, array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/pdf',
    'application/zip',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;


-- ─────────────────────────────────────────────────────────────────────────
-- 3. Las políticas de almacenamiento
-- ─────────────────────────────────────────────────────────────────────────
--
-- Siete políticas sobre `storage.objects`. Cada usuario solo alcanza la
-- carpeta que lleva su propio identificador.
--
-- `fiscal-certificates` NO aparece aquí, y es deliberado: no tiene ninguna
-- política, así que con RLS activo nadie llega a él desde el navegador. Solo
-- la clave de servicio, desde las Edge Functions. No le añadas políticas.

-- brand-logos: lectura pública, escritura solo en la carpeta propia
DROP POLICY IF EXISTS brand_logos_public_read ON storage.objects;
CREATE POLICY brand_logos_public_read ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'brand-logos');

DROP POLICY IF EXISTS brand_logos_owner_insert ON storage.objects;
CREATE POLICY brand_logos_owner_insert ON storage.objects
  FOR INSERT TO public
  WITH CHECK (bucket_id = 'brand-logos' AND (select auth.uid())::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS brand_logos_owner_update ON storage.objects;
CREATE POLICY brand_logos_owner_update ON storage.objects
  FOR UPDATE TO public
  USING (bucket_id = 'brand-logos' AND (select auth.uid())::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS brand_logos_owner_delete ON storage.objects;
CREATE POLICY brand_logos_owner_delete ON storage.objects
  FOR DELETE TO public
  USING (bucket_id = 'brand-logos' AND (select auth.uid())::text = (storage.foldername(name))[1]);

-- portal-files: privado, cada usuario solo su carpeta
DROP POLICY IF EXISTS portal_files_select_own_folder ON storage.objects;
CREATE POLICY portal_files_select_own_folder ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'portal-files' AND (storage.foldername(name))[1] = (auth.uid())::text);

DROP POLICY IF EXISTS portal_files_insert_own_folder ON storage.objects;
CREATE POLICY portal_files_insert_own_folder ON storage.objects
  FOR INSERT TO public
  WITH CHECK (bucket_id = 'portal-files' AND (storage.foldername(name))[1] = (auth.uid())::text);

DROP POLICY IF EXISTS portal_files_delete_own_folder ON storage.objects;
CREATE POLICY portal_files_delete_own_folder ON storage.objects
  FOR DELETE TO public
  USING (bucket_id = 'portal-files' AND (storage.foldername(name))[1] = (auth.uid())::text);


-- ─────────────────────────────────────────────────────────────────────────
-- 4. Las dos tareas programadas
-- ─────────────────────────────────────────────────────────────────────────
--
-- Viven en el esquema `cron`. La clave de servicio NO está escrita aquí: se
-- lee del vault, del secreto llamado `cron_service_role_key`. Si reconstruyes
-- el proyecto desde cero, ese secreto hay que crearlo ANTES, o las dos tareas
-- se ejecutarán y fallarán en silencio todos los días:
--
--   select vault.create_secret('<clave service_role>', 'cron_service_role_key');
--
-- La primera emite las facturas recurrentes que vencen cada día. La segunda
-- manda el aviso semanal de rentabilidad.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.unschedule('process-recurring-invoices-daily')
where exists (select 1 from cron.job where jobname = 'process-recurring-invoices-daily');

select cron.schedule(
  'process-recurring-invoices-daily',
  '0 5 * * *',
  $$
  select
    net.http_post(
      url := 'https://umqsjycqypxvhbhmidma.supabase.co/functions/v1/process-recurring-invoices',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'cron_service_role_key'
        )
      )
    ) as request_id;
  $$
);

select cron.unschedule('weekly-profitability-alert-monday')
where exists (select 1 from cron.job where jobname = 'weekly-profitability-alert-monday');

select cron.schedule(
  'weekly-profitability-alert-monday',
  '0 7 * * 1',
  $$
  select
    net.http_post(
      url := 'https://umqsjycqypxvhbhmidma.supabase.co/functions/v1/weekly-profitability-alert',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'cron_service_role_key'
        )
      )
    ) as request_id;
  $$
);
