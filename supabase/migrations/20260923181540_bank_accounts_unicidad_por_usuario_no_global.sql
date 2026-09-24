-- bank_accounts.gocardless_account_id era UNICO GLOBAL. bank-connect hace
-- upsert con onConflict sobre esa columna y ademas escribe user_id, asi que si
-- dos usuarios conectaban la misma cuenta bancaria (una cuenta de empresa
-- compartida, o una colision de identificadores de Enable Banking), el segundo
-- se llevaba la fila del primero, cambiando su propietario.
--
-- La unicidad correcta es por usuario: el mismo identificador de cuenta puede
-- existir para dos usuarios distintos, pero no dos veces para el mismo.
--
-- Comprobado antes de aplicar: 1 fila, 1 identificador distinto, 1 par
-- (user_id, gocardless_account_id) distinto. La migracion no puede fallar por
-- datos existentes.

alter table public.bank_accounts
  drop constraint if exists bank_accounts_gocardless_account_id_key;

alter table public.bank_accounts
  add constraint bank_accounts_user_cuenta_key
  unique (user_id, gocardless_account_id);;
