-- Seguridad (corrige revision Codex en el PR de convertir_lead_en_cliente):
-- en este proyecto las funciones nuevas del esquema public se conceden a anon y
-- authenticated por privilegios por defecto, asi que revocar solo de PUBLIC no
-- basta. convertir_lead_en_cliente es SECURITY DEFINER y confia en p_user_id, por
-- eso SOLO el servidor (service_role) debe poder invocarla: la app de captacion la
-- llama desde el servidor con el ownerId ya verificado (sesion + plan). Un usuario
-- authenticated no debe poder llamarla directamente desde el navegador.

revoke all on function public.convertir_lead_en_cliente(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.convertir_lead_en_cliente(uuid, uuid, uuid) to service_role;
