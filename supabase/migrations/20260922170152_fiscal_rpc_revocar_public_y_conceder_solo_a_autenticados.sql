-- El revoke anterior a "anon" no surtio efecto porque el permiso venia
-- concedido a PUBLIC (que incluye a anon). Hay que revocar de PUBLIC y luego
-- conceder explicitamente a quien si debe poder llamarlas.
revoke execute on function public.generate_fiscal_record(uuid)       from public, anon;
revoke execute on function public.generate_fiscal_cancellation(uuid) from public, anon;
revoke execute on function public.verify_fiscal_chain(uuid)          from public, anon;

grant execute on function public.generate_fiscal_record(uuid)       to authenticated, service_role;
grant execute on function public.generate_fiscal_cancellation(uuid) to authenticated, service_role;
grant execute on function public.verify_fiscal_chain(uuid)          to authenticated, service_role;;
