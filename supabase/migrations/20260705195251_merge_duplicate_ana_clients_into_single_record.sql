-- Cliente superviviente
-- 32ae96a9-c550-4333-8151-2741b28bebae (ficha de la propia dueña de la cuenta)

-- Reasignar todo lo vinculado a los 3 duplicados hacia el superviviente
update public.projects set client_id = '32ae96a9-c550-4333-8151-2741b28bebae'
  where client_id in ('25849fe3-2680-4c12-a117-9e81145f1621','0b309a4b-5832-4f87-8018-591db6a41a52','d62d7415-b2d0-47ea-b42a-21d1dececaac');

update public.invoices set client_id = '32ae96a9-c550-4333-8151-2741b28bebae'
  where client_id in ('25849fe3-2680-4c12-a117-9e81145f1621','0b309a4b-5832-4f87-8018-591db6a41a52','d62d7415-b2d0-47ea-b42a-21d1dececaac');

update public.budgets set client_id = '32ae96a9-c550-4333-8151-2741b28bebae'
  where client_id in ('25849fe3-2680-4c12-a117-9e81145f1621','0b309a4b-5832-4f87-8018-591db6a41a52','d62d7415-b2d0-47ea-b42a-21d1dececaac');

update public.contracts set client_id = '32ae96a9-c550-4333-8151-2741b28bebae'
  where client_id in ('25849fe3-2680-4c12-a117-9e81145f1621','0b309a4b-5832-4f87-8018-591db6a41a52','d62d7415-b2d0-47ea-b42a-21d1dececaac');

update public.proposals set client_id = '32ae96a9-c550-4333-8151-2741b28bebae'
  where client_id in ('25849fe3-2680-4c12-a117-9e81145f1621','0b309a4b-5832-4f87-8018-591db6a41a52','d62d7415-b2d0-47ea-b42a-21d1dececaac');

-- Ahora sí, eliminar los 3 clientes duplicados (ya sin nada referenciándolos)
delete from public.clients
  where id in ('25849fe3-2680-4c12-a117-9e81145f1621','0b309a4b-5832-4f87-8018-591db6a41a52','d62d7415-b2d0-47ea-b42a-21d1dececaac');
;
