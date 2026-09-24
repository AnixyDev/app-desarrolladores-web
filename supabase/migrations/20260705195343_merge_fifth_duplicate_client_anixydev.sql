-- Reasignar el proyecto del 5º duplicado ("Anixy dev") al cliente superviviente
update public.projects set client_id = '32ae96a9-c550-4333-8151-2741b28bebae'
  where client_id = '974003df-efd1-425e-8aef-b8f57e3a687b';

-- Por si acaso hubiera algo más vinculado que no detecté en la primera pasada
update public.invoices set client_id = '32ae96a9-c550-4333-8151-2741b28bebae'
  where client_id = '974003df-efd1-425e-8aef-b8f57e3a687b';
update public.budgets set client_id = '32ae96a9-c550-4333-8151-2741b28bebae'
  where client_id = '974003df-efd1-425e-8aef-b8f57e3a687b';
update public.contracts set client_id = '32ae96a9-c550-4333-8151-2741b28bebae'
  where client_id = '974003df-efd1-425e-8aef-b8f57e3a687b';
update public.proposals set client_id = '32ae96a9-c550-4333-8151-2741b28bebae'
  where client_id = '974003df-efd1-425e-8aef-b8f57e3a687b';

-- Eliminar el duplicado ya vacío
delete from public.clients where id = '974003df-efd1-425e-8aef-b8f57e3a687b';
;
