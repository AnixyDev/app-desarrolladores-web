-- Bucket privado (no público): el acceso se controla por políticas, no por URL abierta
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'portal-files',
  'portal-files',
  false,
  10485760, -- 10 MB por archivo
  array['image/png','image/jpeg','image/webp','application/pdf','application/zip',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain']
)
on conflict (id) do nothing;

-- Política: un usuario autenticado solo puede subir/leer/borrar archivos dentro de
-- una carpeta con su propio user_id como primer segmento de la ruta (ej. "userid/proyecto/archivo.pdf")
create policy "portal_files_insert_own_folder"
on storage.objects for insert
with check (
  bucket_id = 'portal-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "portal_files_select_own_folder"
on storage.objects for select
using (
  bucket_id = 'portal-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "portal_files_delete_own_folder"
on storage.objects for delete
using (
  bucket_id = 'portal-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);
;
