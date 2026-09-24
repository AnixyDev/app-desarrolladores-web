-- Cuentas de prueba a limpiar (todas menos admin@gmail.com, 9a3de704-ca0d-4333-a3a9-1e760bd863ac)
-- d73e6778, b2825236, 87e26180, d570b9d8, f8700a44, e85f45d5, 52755147, 19457591, c08ed9cb, 6d4ab741, 1745c336

with test_users as (
  select unnest(array[
    'd73e6778-a01b-4ad0-872c-413e61547e2b',
    'b2825236-42fc-4bf3-a0ef-6498edfb4211',
    '87e26180-060f-454a-9be4-084677cb3411',
    'd570b9d8-6cec-4903-9517-fbb632ff349d',
    'f8700a44-72af-4125-912b-09b7b4e7439b',
    'e85f45d5-fd45-4027-9cf9-f2767ba78561',
    '52755147-25a6-409d-a71a-28b8ffc7e440',
    '19457591-5829-48bf-84e4-e89436679609',
    'c08ed9cb-6e96-47d3-b055-74182870fff1',
    '6d4ab741-cb17-4754-b6a4-f329e1f609b2',
    '1745c336-60fa-4acd-a9d0-b33246c562bc'
  ]::uuid[]) as id
)
-- Hijos de projects primero
delete from public.tasks where user_id in (select id from test_users);
with test_users as (
  select unnest(array[
    'd73e6778-a01b-4ad0-872c-413e61547e2b','b2825236-42fc-4bf3-a0ef-6498edfb4211',
    '87e26180-060f-454a-9be4-084677cb3411','d570b9d8-6cec-4903-9517-fbb632ff349d',
    'f8700a44-72af-4125-912b-09b7b4e7439b','e85f45d5-fd45-4027-9cf9-f2767ba78561',
    '52755147-25a6-409d-a71a-28b8ffc7e440','19457591-5829-48bf-84e4-e89436679609',
    'c08ed9cb-6e96-47d3-b055-74182870fff1','6d4ab741-cb17-4754-b6a4-f329e1f609b2',
    '1745c336-60fa-4acd-a9d0-b33246c562bc'
  ]::uuid[]) as id
)
delete from public.time_entries where user_id in (select id from test_users);
with test_users as (
  select unnest(array[
    'd73e6778-a01b-4ad0-872c-413e61547e2b','b2825236-42fc-4bf3-a0ef-6498edfb4211',
    '87e26180-060f-454a-9be4-084677cb3411','d570b9d8-6cec-4903-9517-fbb632ff349d',
    'f8700a44-72af-4125-912b-09b7b4e7439b','e85f45d5-fd45-4027-9cf9-f2767ba78561',
    '52755147-25a6-409d-a71a-28b8ffc7e440','19457591-5829-48bf-84e4-e89436679609',
    'c08ed9cb-6e96-47d3-b055-74182870fff1','6d4ab741-cb17-4754-b6a4-f329e1f609b2',
    '1745c336-60fa-4acd-a9d0-b33246c562bc'
  ]::uuid[]) as id
)
delete from public.expenses where user_id in (select id from test_users);
;
