REVOKE EXECUTE ON FUNCTION public.increment_email_open(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_email_click(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_email_open(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_email_click(uuid) TO service_role;;
