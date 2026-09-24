ALTER FUNCTION public.increment_email_open(uuid) SET search_path = '';
ALTER FUNCTION public.increment_email_click(uuid) SET search_path = '';
ALTER FUNCTION public.check_and_increment_rate_limit(uuid, text, integer, integer) SET search_path = '';;
