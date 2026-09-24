-- Añadir user_id a ambas tablas (nullable para no romper filas históricas)
alter table public.portal_comments add column if not exists user_id uuid references auth.users(id);
alter table public.portal_files add column if not exists user_id uuid references auth.users(id);

-- portal_comments: limpiar permisiva y crear políticas reales
drop policy if exists "Enable insert for authenticated users only" on public.portal_comments;

create policy "insert_own" on public.portal_comments
for insert with check (auth.uid() = user_id);

create policy "select_visible" on public.portal_comments
for select using (
  auth.uid() = user_id
  or exists (select 1 from public.projects p where p.id = portal_comments.entityid and p.user_id = auth.uid())
  or exists (select 1 from public.invoices i where i.id = portal_comments.entityid and i.user_id = auth.uid())
  or exists (select 1 from public.budgets b where b.id = portal_comments.entityid and b.user_id = auth.uid())
  or exists (select 1 from public.contracts c where c.id = portal_comments.entityid and c.user_id = auth.uid())
  or exists (select 1 from public.proposals pr where pr.id = portal_comments.entityid and pr.user_id = auth.uid())
);

create policy "delete_own" on public.portal_comments
for delete using (auth.uid() = user_id);

-- portal_files: mismo patrón
drop policy if exists "Enable insert for authenticated users only" on public.portal_files;

create policy "insert_own" on public.portal_files
for insert with check (auth.uid() = user_id);

create policy "select_visible" on public.portal_files
for select using (
  auth.uid() = user_id
  or exists (select 1 from public.projects p where p.id = portal_files.entityid and p.user_id = auth.uid())
  or exists (select 1 from public.invoices i where i.id = portal_files.entityid and i.user_id = auth.uid())
  or exists (select 1 from public.budgets b where b.id = portal_files.entityid and b.user_id = auth.uid())
  or exists (select 1 from public.contracts c where c.id = portal_files.entityid and c.user_id = auth.uid())
  or exists (select 1 from public.proposals pr where pr.id = portal_files.entityid and pr.user_id = auth.uid())
);

create policy "delete_own" on public.portal_files
for delete using (auth.uid() = user_id);
;
