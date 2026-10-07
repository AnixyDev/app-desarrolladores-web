-- ============================================================================
-- Claves cifradas fuera del alcance del navegador (07/10/2026)
-- ============================================================================
-- user_secrets guarda, cifradas con APP_ENCRYPTION_KEY, las claves de cada
-- usuario: Gemini, Resend, banco (GoCardless, Enable Banking) y la contraseña
-- del certificado digital. Hasta hoy cada usuario podía leer SU fila con su
-- sesión (solo el texto cifrado, inútil sin la clave del servidor). La web no
-- la lee nunca: todo pasa por las Edge Functions con la clave de servicio
-- (manage-secrets, ai-gemini desde hoy, bank-*, remitente propio, Verifactu).
-- Así que se quita cualquier acceso desde la API pública: ni leer, ni escribir.
--
-- user_api_keys: misma situación (sin uso desde la web ni las funciones).
--
-- Además: search_path fijo en las funciones auxiliares de Verifactu
-- (aviso «function_search_path_mutable» del asesor de seguridad).
-- ============================================================================

revoke all on table public.user_secrets from anon, authenticated;
revoke all on table public.user_api_keys from anon, authenticated;

alter function public.verifactu_comprobar_factura(public.invoices) set search_path to 'public', 'extensions', 'pg_temp';
alter function public.verifactu_encadenamiento(public.fiscal_records) set search_path to 'public', 'extensions', 'pg_temp';
alter function public.verifactu_fecha(date) set search_path to 'public', 'extensions', 'pg_temp';
alter function public.verifactu_fecha_hora_huso(timestamptz) set search_path to 'public', 'extensions', 'pg_temp';
alter function public.verifactu_importe(bigint) set search_path to 'public', 'extensions', 'pg_temp';
alter function public.verifactu_nombre_emisor(text, text, text) set search_path to 'public', 'extensions', 'pg_temp';
alter function public.verifactu_normalizar_nif(text) set search_path to 'public', 'extensions', 'pg_temp';
alter function public.verifactu_sistema_informatico(uuid) set search_path to 'public', 'extensions', 'pg_temp';
alter function public.verifactu_ultimo_registro(uuid) set search_path to 'public', 'extensions', 'pg_temp';
