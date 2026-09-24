-- FIX: la política anterior permitía subir el certificado directo desde
-- el cliente sin pasar por el cifrado del Edge Function — dejaría el
-- fichero .p12 (contiene clave privada) en Storage tal cual, protegido
-- solo por RLS de Supabase, no por cifrado propio de la aplicación. Se
-- retira: el bucket queda accesible únicamente vía service role (el
-- Edge Function), nunca directo desde el navegador.
drop policy if exists "fiscal_certificates_owner_access" on storage.objects;;
