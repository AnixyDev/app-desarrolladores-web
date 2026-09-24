REVOKE EXECUTE ON FUNCTION public.check_and_increment_rate_limit(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_increment_rate_limit(uuid, text, integer, integer) TO service_role;;
