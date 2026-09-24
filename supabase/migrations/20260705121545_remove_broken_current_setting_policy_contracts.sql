-- Política heredada que usa current_setting('app.current_user_id'), variable que
-- nunca se define con el cliente estándar de Supabase → lanza error en cada INSERT.
-- Ya existe "Allow authenticated users to insert their own contracts" con auth.uid(), que es la correcta.
drop policy if exists "insert_own" on public.contracts;;
