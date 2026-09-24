-- 1. contract_templates: owner = user_id
drop policy if exists "Enable insert for authenticated users only" on public.contract_templates;
create policy "select_own" on public.contract_templates for select using (auth.uid() = user_id);
create policy "insert_own" on public.contract_templates for insert with check (auth.uid() = user_id);
create policy "update_own" on public.contract_templates for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete_own" on public.contract_templates for delete using (auth.uid() = user_id);

-- 2. proposal_templates: owner = user_id
drop policy if exists "Enable insert for authenticated users only" on public.proposal_templates;
create policy "select_own" on public.proposal_templates for select using (auth.uid() = user_id);
create policy "insert_own" on public.proposal_templates for insert with check (auth.uid() = user_id);
create policy "update_own" on public.proposal_templates for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete_own" on public.proposal_templates for delete using (auth.uid() = user_id);

-- 3. team_users: owner = invited_by
drop policy if exists "Enable insert for authenticated users only" on public.team_users;
create policy "select_own" on public.team_users for select using (auth.uid() = invited_by);
create policy "insert_own" on public.team_users for insert with check (auth.uid() = invited_by);
create policy "update_own" on public.team_users for update using (auth.uid() = invited_by) with check (auth.uid() = invited_by);
create policy "delete_own" on public.team_users for delete using (auth.uid() = invited_by);

-- 4. project_files: owner via projects.user_id (no user_id column here)
drop policy if exists "Enable insert for authenticated users only" on public.project_files;
create policy "select_own" on public.project_files for select using (exists (select 1 from public.projects p where p.id = project_files.project_id and p.user_id = auth.uid()));
create policy "insert_own" on public.project_files for insert with check (exists (select 1 from public.projects p where p.id = project_files.project_id and p.user_id = auth.uid()));
create policy "update_own" on public.project_files for update using (exists (select 1 from public.projects p where p.id = project_files.project_id and p.user_id = auth.uid())) with check (exists (select 1 from public.projects p where p.id = project_files.project_id and p.user_id = auth.uid()));
create policy "delete_own" on public.project_files for delete using (exists (select 1 from public.projects p where p.id = project_files.project_id and p.user_id = auth.uid()));

-- 5. knowledge_articles: drop permisiva + policies muertas (current_setting nunca se define), dejar la ALL correcta intacta
drop policy if exists "Enable insert for authenticated users only" on public.knowledge_articles;
drop policy if exists "delete_own" on public.knowledge_articles;
drop policy if exists "insert_own" on public.knowledge_articles;
drop policy if exists "select_own" on public.knowledge_articles;
drop policy if exists "update_own" on public.knowledge_articles;

-- 6. shadow_income: drop permisiva + policies muertas, crear una ALL correcta
drop policy if exists "Enable insert for authenticated users only" on public.shadow_income;
drop policy if exists "delete_own" on public.shadow_income;
drop policy if exists "insert_own" on public.shadow_income;
drop policy if exists "select_own" on public.shadow_income;
drop policy if exists "update_own" on public.shadow_income;
create policy "own_all" on public.shadow_income for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 7. project_comments: user_id es TEXT (no uuid), comparar con cast
drop policy if exists "Enable insert for authenticated users only" on public.project_comments;
drop policy if exists "delete_own" on public.project_comments;
drop policy if exists "insert_own" on public.project_comments;
drop policy if exists "select_own" on public.project_comments;
drop policy if exists "update_own" on public.project_comments;
create policy "own_all" on public.project_comments for all using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);

-- 8. referrals: quitar la permisiva; ya existe "Users can view their own referrals" (ALL, auth.uid()=user_id) que se mantiene intacta.
-- Los inserts reales los hace el Edge Function stripe-webhook con la service_role key, que ignora RLS.
drop policy if exists "Enable insert for authenticated users only" on public.referrals;
;
