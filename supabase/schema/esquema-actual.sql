


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."budget_status" AS ENUM (
    'pending',
    'accepted',
    'rejected'
);


ALTER TYPE "public"."budget_status" OWNER TO "postgres";


CREATE TYPE "public"."contract_status" AS ENUM (
    'draft',
    'sent',
    'signed'
);


ALTER TYPE "public"."contract_status" OWNER TO "postgres";


CREATE TYPE "public"."document_status" AS ENUM (
    'draft',
    'sent',
    'pending',
    'signed',
    'rejected'
);


ALTER TYPE "public"."document_status" OWNER TO "postgres";


CREATE TYPE "public"."job_application_status" AS ENUM (
    'sent',
    'viewed',
    'shortlisted',
    'rejected',
    'accepted'
);


ALTER TYPE "public"."job_application_status" OWNER TO "postgres";


CREATE TYPE "public"."project_status" AS ENUM (
    'planning',
    'active',
    'paused',
    'completed',
    'in-progress',
    'on-hold'
);


ALTER TYPE "public"."project_status" OWNER TO "postgres";


CREATE TYPE "public"."proposal_status" AS ENUM (
    'draft',
    'sent',
    'accepted',
    'rejected'
);


ALTER TYPE "public"."proposal_status" OWNER TO "postgres";


CREATE TYPE "public"."recurring_frequency" AS ENUM (
    'daily',
    'weekly',
    'monthly',
    'quarterly',
    'yearly'
);


ALTER TYPE "public"."recurring_frequency" OWNER TO "postgres";


CREATE TYPE "public"."task_status" AS ENUM (
    'todo',
    'in_progress',
    'completed',
    'done',
    'blocked'
);


ALTER TYPE "public"."task_status" OWNER TO "postgres";


CREATE TYPE "public"."team_user_status" AS ENUM (
    'Pending Invitation',
    'Active',
    'Disabled'
);


ALTER TYPE "public"."team_user_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_and_increment_rate_limit"("p_user_id" "uuid", "p_action" "text", "p_max_calls" integer, "p_window_seconds" integer) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_window_start timestamptz;
  v_count integer;
BEGIN
  -- CAMBIO: el margen de limpieza era '1 hour', fijo para TODAS las
  -- acciones sin distinguir su ventana real. Eso borraba el bucket de
  -- 'ai_daily' (ventana de 86400s = 24h) pasada la primera hora del
  -- día, reiniciándolo a count=1 en la siguiente llamada -- el límite
  -- diario por plan (Free 15 / Pro 100 / Teams 400) nunca llegaba a
  -- aplicarse de verdad. Se sube a '2 days', margen seguro por encima
  -- de la ventana más larga usada hoy (24h), para que el bucket diario
  -- sobreviva su día completo antes de limpiarse.
  DELETE FROM public.rate_limit_buckets WHERE window_start < now() - interval '2 days';

  v_window_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  INSERT INTO public.rate_limit_buckets (user_id, action, window_start, count)
  VALUES (p_user_id, p_action, v_window_start, 1)
  ON CONFLICT (user_id, action, window_start)
  DO UPDATE SET count = rate_limit_buckets.count + 1
  RETURNING count INTO v_count;

  RETURN v_count <= p_max_calls;
END;
$$;


ALTER FUNCTION "public"."check_and_increment_rate_limit"("p_user_id" "uuid", "p_action" "text", "p_max_calls" integer, "p_window_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clients_desenlazar_portal_si_cambia_email"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_email_de_la_cuenta text;
begin
  if new.portal_user_id is null then
    return new;
  end if;

  select lower(u.email) into v_email_de_la_cuenta
    from auth.users u
   where u.id = new.portal_user_id;

  -- Cuenta inexistente o correo que ya no coincide: el enlace no es cierto
  -- y once políticas RLS se fían de él, así que no se queda.
  if v_email_de_la_cuenta is null
     or v_email_de_la_cuenta is distinct from lower(new.email)
  then
    new.portal_user_id := null;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."clients_desenlazar_portal_si_cambia_email"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."consume_ai_credits"("p_user_id" "uuid", "p_cost" integer) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  update profiles
  set ai_credits = ai_credits - p_cost
  where id = p_user_id
    and subscription_status = 'active'
    and ai_credits >= p_cost;

  if found then
    return true;
  else
    return false;
  end if;
end;
$$;


ALTER FUNCTION "public"."consume_ai_credits"("p_user_id" "uuid", "p_cost" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."consume_ai_credits_rpc"("p_amount" integer) RETURNS TABLE("id" "uuid", "full_name" "text", "ai_credits" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    current_credits integer;
    updated_profile public.profiles;
BEGIN
    SELECT p.ai_credits INTO current_credits FROM public.profiles p WHERE p.id = auth.uid();

    IF current_credits IS NULL OR current_credits < p_amount THEN
        RAISE EXCEPTION 'No tienes créditos suficientes para esta operación.';
    END IF;

    UPDATE public.profiles
    SET ai_credits = ai_credits - p_amount
    WHERE id = auth.uid()
    RETURNING * INTO updated_profile;

    RETURN QUERY SELECT updated_profile.id, updated_profile.full_name, updated_profile.ai_credits;
END;
$$;


ALTER FUNCTION "public"."consume_ai_credits_rpc"("p_amount" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."consume_credits_atomic"("p_amount" integer) RETURNS TABLE("id" "uuid", "ai_credits" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Cantidad de creditos no valida: %', p_amount
      using errcode = '22023';
  end if;

  return query
  update public.profiles p
  set ai_credits = p.ai_credits - p_amount
  where p.id = auth.uid()
    and p.ai_credits >= p_amount
  returning p.id, p.ai_credits;

  if not found then
    raise exception 'Créditos insuficientes' using errcode = 'P0001';
  end if;
end;
$$;


ALTER FUNCTION "public"."consume_credits_atomic"("p_amount" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."consume_credits_atomic"("user_id" "uuid", "amount_to_consume" integer) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_cuenta uuid;
begin
  if user_id is distinct from auth.uid() then
    raise exception 'No autorizado: user_id no coincide con el usuario autenticado';
  end if;

  if amount_to_consume is null or amount_to_consume <= 0 then
    raise exception 'Cantidad de creditos no valida: %', amount_to_consume
      using errcode = '22023';
  end if;

  v_cuenta := public.cuenta_de_creditos_ia(user_id);

  update public.profiles p
     set ai_credits = p.ai_credits - amount_to_consume
   where p.id = v_cuenta
     and p.ai_credits >= amount_to_consume;

  return found;
end;
$$;


ALTER FUNCTION "public"."consume_credits_atomic"("user_id" "uuid", "amount_to_consume" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."creditos_mensuales_ajustar_ancla"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_de_pago boolean := new.plan in ('Pro', 'Teams')
                       and coalesce(new.subscription_status, '') in ('active', 'trialing');
begin
  if not v_de_pago then
    new.creditos_mensuales_proxima := null;
  elsif new.creditos_mensuales_proxima is null then
    new.creditos_mensuales_proxima := now() + interval '1 month';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."creditos_mensuales_ajustar_ancla"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."creditos_mensuales_del_plan"("p_plan" "text") RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select case p_plan when 'Pro' then 50 when 'Teams' then 200 else 0 end;
$$;


ALTER FUNCTION "public"."creditos_mensuales_del_plan"("p_plan" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cuenta_de_creditos_ia"("p_usuario" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select coalesce(
    (select tm.user_id
       from public.team_members tm
       join public.profiles dueno on dueno.id = tm.user_id
      where tm.accepted_user_id = p_usuario
        and tm.status = 'Activo'
        and tm.user_id <> p_usuario
        and dueno.plan = 'Teams'
        and coalesce(dueno.subscription_status, '') in ('active', 'trialing')
      order by tm.created_at
      limit 1),
    p_usuario
  );
$$;


ALTER FUNCTION "public"."cuenta_de_creditos_ia"("p_usuario" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_invoice_fiscal_lock"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_has_cancellation boolean;
begin
  if TG_OP = 'DELETE' then
    if OLD.fiscal_locked then
      select exists(
        select 1 from public.fiscal_records
        where invoice_id = OLD.id and record_type = 'anulacion'
      ) into v_has_cancellation;

      if not v_has_cancellation then
        raise exception 'No se puede eliminar una factura con registro fiscal Veri*Factu sin anularla antes.';
      end if;
    end if;
    return OLD;
  end if;

  if OLD.fiscal_locked then
    if NEW.items is distinct from OLD.items
      or NEW.subtotal_cents is distinct from OLD.subtotal_cents
      or NEW.tax_percent is distinct from OLD.tax_percent
      or NEW.total_cents is distinct from OLD.total_cents
      or NEW.irpf_percent is distinct from OLD.irpf_percent
      or NEW.issue_date is distinct from OLD.issue_date
      or NEW.client_id is distinct from OLD.client_id
      or NEW.invoice_number is distinct from OLD.invoice_number
    then
      raise exception 'No se puede modificar una factura con registro fiscal Veri*Factu generado. Usa una factura rectificativa.';
    end if;
  end if;

  return NEW;
end;
$$;


ALTER FUNCTION "public"."enforce_invoice_fiscal_lock"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enviar_webhooks"("p_dueno" "uuid", "p_evento" "text", "p_texto" "text", "p_datos" "jsonb") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_int  record;
  v_req  bigint;
  v_n    integer := 0;
begin
  -- Solo cuentas Teams con la suscripción viva: es lo que se vende.
  if not exists (
    select 1 from public.profiles
     where id = p_dueno
       and plan = 'Teams'
       and coalesce(subscription_status, '') in ('active', 'trialing')
  ) then
    return 0;
  end if;

  for v_int in
    select id, url
      from public.integrations
     where user_id = p_dueno
       and is_active
       and event = p_evento
  loop
    if not public.url_de_webhook_valida(v_int.url) then
      continue;
    end if;

    v_req := net.http_post(
      url := v_int.url,
      body := jsonb_build_object(
        'text',        p_texto,
        'event',       p_evento,
        'occurred_at', now(),
        'data',        coalesce(p_datos, '{}'::jsonb),
        'source',      'devfreelancer.app'
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'User-Agent',   'DevFreelancer-Webhooks/1.0'
      ),
      timeout_milliseconds := 5000
    );

    insert into public.webhooks_enviados (integration_id, user_id, event, request_id)
    values (v_int.id, p_dueno, p_evento, v_req);

    update public.integrations set last_sent_at = now() where id = v_int.id;
    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$$;


ALTER FUNCTION "public"."enviar_webhooks"("p_dueno" "uuid", "p_evento" "text", "p_texto" "text", "p_datos" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enviar_webhooks_sin_fallar"("p_dueno" "uuid", "p_evento" "text", "p_texto" "text", "p_datos" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  perform public.enviar_webhooks(p_dueno, p_evento, p_texto, p_datos);
exception when others then
  raise warning 'webhooks: no se pudo enviar % de %: %', p_evento, p_dueno, sqlerrm;
end;
$$;


ALTER FUNCTION "public"."enviar_webhooks_sin_fallar"("p_dueno" "uuid", "p_evento" "text", "p_texto" "text", "p_datos" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."exigir_nif_emisor"("p_user_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_nif text;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and p_user_id is distinct from auth.uid() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  select nullif(btrim(tax_id), '') into v_nif
  from public.profiles where id = p_user_id;

  if v_nif is null then
    raise exception 'Falta el NIF del emisor. Rellenalo en Configuracion > Perfil antes de emitir facturas con cumplimiento fiscal: es obligatorio en el registro y forma parte de la huella, asi que no se puede anadir despues.'
      using errcode = 'P0001';
  end if;

  return v_nif;
end;
$$;


ALTER FUNCTION "public"."exigir_nif_emisor"("p_user_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."fiscal_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "record_type" "text" NOT NULL,
    "nif_emisor" "text" NOT NULL,
    "nombre_emisor" "text" NOT NULL,
    "numero_factura" "text" NOT NULL,
    "fecha_expedicion" "date" NOT NULL,
    "tipo_factura" "text" DEFAULT 'F1'::"text" NOT NULL,
    "importe_total_cents" integer NOT NULL,
    "hash_anterior" "text",
    "hash" "text" NOT NULL,
    "hash_input" "text" NOT NULL,
    "modalidad" "text" NOT NULL,
    "estado_envio" "text" DEFAULT 'no_aplica'::"text" NOT NULL,
    "csv_respuesta_aeat" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "fiscal_records_estado_envio_check" CHECK (("estado_envio" = ANY (ARRAY['no_aplica'::"text", 'pendiente'::"text", 'enviado'::"text", 'aceptado'::"text", 'aceptado_con_errores'::"text", 'rechazado'::"text"]))),
    CONSTRAINT "fiscal_records_modalidad_check" CHECK (("modalidad" = ANY (ARRAY['verifactu'::"text", 'no_verifactu'::"text"]))),
    CONSTRAINT "fiscal_records_record_type_check" CHECK (("record_type" = ANY (ARRAY['alta'::"text", 'anulacion'::"text"])))
);


ALTER TABLE "public"."fiscal_records" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_fiscal_cancellation"("p_invoice_id" "uuid") RETURNS "public"."fiscal_records"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_invoice public.invoices%rowtype;
  v_profile public.profiles%rowtype;
  v_nif text;
  v_last_hash text;
  v_hash_input text;
  v_hash text;
  v_record public.fiscal_records;
  v_modalidad text;
begin
  select * into v_invoice from public.invoices where id = p_invoice_id and user_id = auth.uid();
  if not found then
    raise exception 'Factura no encontrada o no pertenece al usuario actual.';
  end if;

  if not v_invoice.fiscal_locked then
    raise exception 'Esta factura no tiene registro fiscal — no hace falta anularla, se puede borrar normalmente.';
  end if;

  select * into v_profile from public.profiles where id = auth.uid();

  -- CAMBIO: NIF obligatorio, igual que en el alta.
  v_nif := public.exigir_nif_emisor(auth.uid());

  select hash into v_last_hash
  from public.fiscal_records
  where user_id = auth.uid()
  order by created_at desc
  limit 1;

  v_modalidad := coalesce(v_profile.veri_factu_modality, 'no_verifactu');

  v_hash_input :=
    v_nif || '|' ||
    v_invoice.invoice_number || '|' ||
    to_char(v_invoice.issue_date, 'DD-MM-YYYY') || '|' ||
    'anulacion' || '|' ||
    coalesce(v_last_hash, '');

  v_hash := encode(digest(v_hash_input, 'sha256'), 'hex');

  insert into public.fiscal_records (
    user_id, invoice_id, record_type, nif_emisor, nombre_emisor,
    numero_factura, fecha_expedicion, tipo_factura, importe_total_cents,
    hash_anterior, hash, hash_input, modalidad, estado_envio
  ) values (
    auth.uid(), p_invoice_id, 'anulacion', v_nif,
    coalesce(v_profile.business_name, v_profile.full_name, ''),
    v_invoice.invoice_number, v_invoice.issue_date, 'F1', v_invoice.total_cents,
    v_last_hash, v_hash, v_hash_input, v_modalidad,
    case when v_modalidad = 'verifactu' then 'pendiente' else 'no_aplica' end
  )
  returning * into v_record;

  return v_record;
end;
$$;


ALTER FUNCTION "public"."generate_fiscal_cancellation"("p_invoice_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_fiscal_record"("p_invoice_id" "uuid") RETURNS "public"."fiscal_records"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_invoice public.invoices%rowtype;
  v_profile public.profiles%rowtype;
  v_nif text;
  v_last_hash text;
  v_hash_input text;
  v_hash text;
  v_record public.fiscal_records;
  v_modalidad text;
begin
  select * into v_invoice from public.invoices where id = p_invoice_id and user_id = auth.uid();
  if not found then
    raise exception 'Factura no encontrada o no pertenece al usuario actual.';
  end if;

  select * into v_profile from public.profiles where id = auth.uid();

  -- CAMBIO: NIF obligatorio. Aborta antes de sellar nada.
  v_nif := public.exigir_nif_emisor(auth.uid());

  select hash into v_last_hash
  from public.fiscal_records
  where user_id = auth.uid()
  order by created_at desc
  limit 1;

  v_modalidad := coalesce(v_profile.veri_factu_modality, 'no_verifactu');

  v_hash_input :=
    v_nif || '|' ||
    v_invoice.invoice_number || '|' ||
    to_char(v_invoice.issue_date, 'DD-MM-YYYY') || '|' ||
    'F1' || '|' ||
    to_char(v_invoice.total_cents / 100.0, 'FM999999990.00') || '|' ||
    coalesce(v_last_hash, '');

  v_hash := encode(digest(v_hash_input, 'sha256'), 'hex');

  insert into public.fiscal_records (
    user_id, invoice_id, record_type, nif_emisor, nombre_emisor,
    numero_factura, fecha_expedicion, tipo_factura, importe_total_cents,
    hash_anterior, hash, hash_input, modalidad, estado_envio
  ) values (
    auth.uid(), p_invoice_id, 'alta', v_nif,
    coalesce(v_profile.business_name, v_profile.full_name, ''),
    v_invoice.invoice_number, v_invoice.issue_date, 'F1', v_invoice.total_cents,
    v_last_hash, v_hash, v_hash_input, v_modalidad,
    case when v_modalidad = 'verifactu' then 'pendiente' else 'no_aplica' end
  )
  returning * into v_record;

  update public.invoices set fiscal_locked = true where id = p_invoice_id;

  return v_record;
end;
$$;


ALTER FUNCTION "public"."generate_fiscal_record"("p_invoice_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_invoice_number"("p_user_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
declare
  v_year text := to_char(now(), 'YYYY');
  v_next int;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and p_user_id is distinct from auth.uid() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  select coalesce(max(
    case when invoice_number ~ ('^INV-' || v_year || '-[0-9]+$')
      then substring(invoice_number from '[0-9]+$')::int
      else 0
    end
  ), 0) + 1
  into v_next
  from public.invoices
  where user_id = p_user_id;

  return 'INV-' || v_year || '-' || lpad(v_next::text, 4, '0');
end;
$_$;


ALTER FUNCTION "public"."generate_invoice_number"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_receipt_number"("p_user_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
declare
  v_year text := to_char(now(), 'YYYY');
  v_next int;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and p_user_id is distinct from auth.uid() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  select coalesce(max(
    case when receipt_number ~ ('^REC-' || v_year || '-[0-9]+$')
      then substring(receipt_number from '[0-9]+$')::int
      else 0
    end
  ), 0) + 1
  into v_next
  from public.receipts
  where user_id = p_user_id;

  return 'REC-' || v_year || '-' || lpad(v_next::text, 4, '0');
end;
$_$;


ALTER FUNCTION "public"."generate_receipt_number"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    avatar_url,
    affiliate_code
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''),
    lower(substring(md5(NEW.id::text), 1, 8))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."hitos_fijar_dueno"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  select p.user_id into new.user_id from public.projects p where p.id = new.project_id;
  if new.user_id is null then
    raise exception 'Proyecto no encontrado' using errcode = '23503';
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."hitos_fijar_dueno"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."impedir_cambio_de_dueno"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if current_user in ('anon', 'authenticated')
     and new.user_id is distinct from old.user_id then
    raise exception 'No se puede cambiar el dueño de este registro.' using errcode = '42501';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."impedir_cambio_de_dueno"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_credits"("user_id" "uuid", "amount" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  UPDATE public.profiles
  SET ai_credits = ai_credits + amount
  WHERE id = user_id;
END;
$$;


ALTER FUNCTION "public"."increment_credits"("user_id" "uuid", "amount" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_email_click"("p_business_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  UPDATE public.businesses
  SET email_clicks_count = email_clicks_count + 1,
      email_last_clicked_at = now()
  WHERE id = p_business_id;
$$;


ALTER FUNCTION "public"."increment_email_click"("p_business_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_email_open"("p_business_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  UPDATE public.businesses
  SET email_opens_count = email_opens_count + 1,
      email_last_opened_at = now()
  WHERE id = p_business_id;
$$;


ALTER FUNCTION "public"."increment_email_open"("p_business_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."jobs_proteger_destacado"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.isfeatured := false;
    return new;
  end if;

  if new.isfeatured is distinct from old.isfeatured then
    raise exception 'El destacado de una oferta solo se activa pagándolo.'
      using errcode = '42501';
  end if;

  if new.user_id is distinct from old.user_id then
    raise exception 'No se puede cambiar el dueño de una oferta.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."jobs_proteger_destacado"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_active_team_member"("p_owner_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.user_id = p_owner_id
      AND tm.accepted_user_id = auth.uid()
      AND tm.status = 'Activo'
  );
$$;


ALTER FUNCTION "public"."is_active_team_member"("p_owner_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."link_portal_client"() RETURNS TABLE("client_id" "uuid", "client_name" "text", "owner_business_name" "text", "owner_full_name" "text", "owner_logo_url" "text", "owner_brand_color" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_email text;
  v_client record;
  v_enlazado boolean := false;
begin
  v_email := lower(auth.jwt() ->> 'email');
  if v_email is null then
    return;
  end if;

  -- ¿Hay ya una ficha enlazada a esta cuenta? Solo vale si su correo sigue
  -- siendo el de esta cuenta: si el freelancer lo cambió, el enlace caducó.
  select id, name, user_id, lower(email) as email into v_client
    from public.clients
    where portal_user_id = auth.uid()
    limit 1;

  if found then
    if v_client.email is not distinct from v_email then
      v_enlazado := true;
    else
      update public.clients set portal_user_id = null where id = v_client.id;
    end if;
  end if;

  -- Si no, se enlaza una ficha libre que tenga este correo.
  if not v_enlazado then
    select id, name, user_id, lower(email) as email into v_client
      from public.clients
      where lower(email) = v_email and portal_user_id is null
      limit 1;

    if found then
      update public.clients set portal_user_id = auth.uid() where id = v_client.id;
      v_enlazado := true;
    end if;
  end if;

  if not v_enlazado then
    return;
  end if;

  client_id := v_client.id;
  client_name := v_client.name;
  select p.business_name, p.full_name, p.portal_logo_url, p.pdf_color
    into owner_business_name, owner_full_name, owner_logo_url, owner_brand_color
    from public.profiles p
    where p.id = v_client.user_id;
  return next;
  return;
end;
$$;


ALTER FUNCTION "public"."link_portal_client"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."link_team_membership"() RETURNS TABLE("membership_id" "uuid", "role" "text", "status" "text", "owner_user_id" "uuid", "owner_business_name" "text", "owner_full_name" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_email text;
  v_member record;
begin
  v_email := lower(auth.jwt() ->> 'email');
  if v_email is null then
    return;
  end if;

  select tm.id, tm.role, tm.status, tm.user_id into v_member
    from public.team_members tm
    where tm.accepted_user_id = auth.uid()
    limit 1;

  if found then
    membership_id := v_member.id;
    role := v_member.role;
    status := v_member.status;
    owner_user_id := v_member.user_id;
    select p.business_name, p.full_name into owner_business_name, owner_full_name
      from public.profiles p where p.id = v_member.user_id;
    return next;
    return;
  end if;

  select tm.id, tm.role, tm.status, tm.user_id into v_member
    from public.team_members tm
    where lower(tm.email) = v_email and tm.accepted_user_id is null
    order by tm.created_at desc
    limit 1;

  if found then
    update public.team_members
      set accepted_user_id = auth.uid(), status = 'Activo'
      where id = v_member.id;

    membership_id := v_member.id;
    role := v_member.role;
    status := 'Activo';
    owner_user_id := v_member.user_id;
    select p.business_name, p.full_name into owner_business_name, owner_full_name
      from public.profiles p where p.id = v_member.user_id;
    return next;
  end if;

  return;
end;
$$;


ALTER FUNCTION "public"."link_team_membership"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."probar_webhook"("p_integration" "uuid") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_int record;
  v_req bigint;
  v_recientes int;
begin
  select id, user_id, url, event into v_int
    from public.integrations
   where id = p_integration and user_id = auth.uid();
  if not found then
    raise exception 'Integración no encontrada' using errcode = '42501';
  end if;
  if not public.url_de_webhook_valida(v_int.url) then
    raise exception 'La dirección debe ser https:// y de un dominio público.' using errcode = '22023';
  end if;

  -- Tope: 10 pruebas por hora y cuenta. Es una petición saliente desde
  -- nuestro servidor; sin tope, el botón sirve para bombardear una URL.
  select count(*) into v_recientes
    from public.webhooks_enviados
   where user_id = auth.uid() and es_prueba and created_at > now() - interval '1 hour';
  if v_recientes >= 10 then
    raise exception 'Demasiadas pruebas. Espera un rato.' using errcode = '54000';
  end if;

  v_req := net.http_post(
    url := v_int.url,
    body := jsonb_build_object(
      'text', '🔔 Prueba de DevFreelancer: la integración funciona.',
      'event', v_int.event, 'occurred_at', now(), 'test', true,
      'data', '{}'::jsonb, 'source', 'devfreelancer.app'
    ),
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'User-Agent', 'DevFreelancer-Webhooks/1.0'),
    timeout_milliseconds := 5000
  );

  insert into public.webhooks_enviados (integration_id, user_id, event, request_id, es_prueba)
  values (v_int.id, v_int.user_id, v_int.event, v_req, true);

  return v_req;
end;
$$;


ALTER FUNCTION "public"."probar_webhook"("p_integration" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."project_messages_sellar_autor"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_owner_id uuid;
  v_client_id uuid;
  v_nombre text;
begin
  select p.user_id, p.client_id into v_owner_id, v_client_id
  from public.projects p where p.id = new.project_id;

  if v_owner_id is null then
    raise exception 'El proyecto no existe' using errcode = '23503';
  end if;

  new.author_id := auth.uid();
  new.created_at := now();

  if v_owner_id = auth.uid() then
    select coalesce(nullif(btrim(pr.business_name), ''), nullif(btrim(pr.full_name), ''), 'Freelancer')
      into v_nombre from public.profiles pr where pr.id = auth.uid();
    new.author_name := coalesce(v_nombre, 'Freelancer');
    new.author_role := 'freelancer';
    return new;
  end if;

  if public.is_active_team_member(v_owner_id) then
    select coalesce(nullif(btrim(tm.name), ''), 'Miembro del equipo')
      into v_nombre from public.team_members tm
      where tm.user_id = v_owner_id and tm.accepted_user_id = auth.uid() and tm.status = 'Activo'
      limit 1;
    new.author_name := coalesce(v_nombre, 'Miembro del equipo');
    new.author_role := 'equipo';
    return new;
  end if;

  if v_client_id is not null then
    select coalesce(nullif(btrim(c.name), ''), 'Cliente')
      into v_nombre from public.clients c
      where c.id = v_client_id and c.portal_user_id = auth.uid();
    if v_nombre is not null then
      new.author_name := v_nombre;
      new.author_role := 'cliente';
      return new;
    end if;
  end if;

  -- RLS deberia haber cortado antes de llegar aqui.
  raise exception 'No puedes escribir en este proyecto' using errcode = '42501';
end;
$$;


ALTER FUNCTION "public"."project_messages_sellar_autor"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."proteger_columnas_de_pago_del_perfil"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Una fila creada desde el navegador nace como cualquier alta nueva.
    new.plan := 'Free';
    new.ai_credits := 10;
    new.signature_credits := 0;
    new.subscription_status := null;
    new.stripe_subscription_id := null;
    new.stripe_customer_id := null;
    new.stripe_account_id := null;
    new.stripe_onboarding_complete := false;
    new.role := 'Developer';
    new.affiliate_code := null;
    new.creditos_mensuales_proxima := null;
    return new;
  end if;

  if new.plan                        is distinct from old.plan
  or new.ai_credits                  is distinct from old.ai_credits
  or new.signature_credits           is distinct from old.signature_credits
  or new.subscription_status         is distinct from old.subscription_status
  or new.stripe_subscription_id      is distinct from old.stripe_subscription_id
  or new.stripe_customer_id          is distinct from old.stripe_customer_id
  or new.stripe_account_id           is distinct from old.stripe_account_id
  or new.stripe_onboarding_complete  is distinct from old.stripe_onboarding_complete
  or new.role                        is distinct from old.role
  or new.affiliate_code              is distinct from old.affiliate_code
  or new.email                       is distinct from old.email
  or new.creditos_mensuales_proxima  is distinct from old.creditos_mensuales_proxima
  then
    raise exception 'El plan, los créditos, la suscripción, Stripe, el rol, el código de afiliado y el correo solo los cambia el servidor.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."proteger_columnas_de_pago_del_perfil"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recargar_creditos_mensuales"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_recargadas integer;
begin
  with vencidas as (
    select id
      from public.profiles
     where plan in ('Pro', 'Teams')
       and coalesce(subscription_status, '') in ('active', 'trialing')
       and creditos_mensuales_proxima is not null
       and creditos_mensuales_proxima <= now()
     for update
  )
  update public.profiles p
     set ai_credits = coalesce(p.ai_credits, 0) + public.creditos_mensuales_del_plan(p.plan),
         creditos_mensuales_proxima = p.creditos_mensuales_proxima + interval '1 month'
    from vencidas v
   where p.id = v.id;

  get diagnostics v_recargadas = row_count;
  return v_recargadas;
end;
$$;


ALTER FUNCTION "public"."recargar_creditos_mensuales"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resultado_prueba_webhook"("p_request_id" bigint) RETURNS TABLE("status_code" integer, "error" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
begin
  if not exists (select 1 from public.webhooks_enviados
                  where request_id = p_request_id and user_id = auth.uid()) then
    return;
  end if;
  return query
    select r.status_code, r.error_msg
      from net._http_response r
     where r.id = p_request_id;
end;
$$;


ALTER FUNCTION "public"."resultado_prueba_webhook"("p_request_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rol_en_equipo"("p_dueno" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select tm.role
    from public.team_members tm
   where tm.user_id = p_dueno
     and tm.accepted_user_id = auth.uid()
     and tm.status = 'Activo'
   order by tm.created_at
   limit 1;
$$;


ALTER FUNCTION "public"."rol_en_equipo"("p_dueno" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."saldo_creditos_ia"() RETURNS TABLE("saldo" integer, "compartido" boolean)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_yo uuid := auth.uid();
  v_cuenta uuid;
begin
  if v_yo is null then
    return;
  end if;
  v_cuenta := public.cuenta_de_creditos_ia(v_yo);
  return query
    select coalesce(p.ai_credits, 0), v_cuenta <> v_yo
      from public.profiles p
     where p.id = v_cuenta;
end;
$$;


ALTER FUNCTION "public"."saldo_creditos_ia"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sumar_creditos"("p_user_id" "uuid", "p_ai" integer DEFAULT 0, "p_firma" integer DEFAULT 0) RETURNS TABLE("ai_credits" integer, "signature_credits" integer)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  update public.profiles p
  set ai_credits        = p.ai_credits + p_ai,
      signature_credits = p.signature_credits + p_firma
  where p.id = p_user_id
  returning p.ai_credits, p.signature_credits;
$$;


ALTER FUNCTION "public"."sumar_creditos"("p_user_id" "uuid", "p_ai" integer, "p_firma" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_invoice_paid_status"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_invoice_id uuid;
  v_total_cents integer;
  v_paid_cents integer;
  v_last_payment_date date;
begin
  v_invoice_id := coalesce(new.invoice_id, old.invoice_id);

  select total_cents into v_total_cents from public.invoices where id = v_invoice_id;

  select coalesce(sum(amount_cents), 0), max(paid_at)
    into v_paid_cents, v_last_payment_date
    from public.payments where invoice_id = v_invoice_id;

  update public.invoices
    set paid = (v_paid_cents >= v_total_cents and v_total_cents > 0),
        payment_date = case when v_paid_cents >= v_total_cents then v_last_payment_date else null end
    where id = v_invoice_id;

  return coalesce(new, old);
end;
$$;


ALTER FUNCTION "public"."sync_invoice_paid_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."url_de_webhook_valida"("p_url" "text") RETURNS boolean
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
declare
  v_host text;
begin
  if p_url is null or length(p_url) > 2048 or p_url !~* '^https://' then
    return false;
  end if;
  -- Nada de usuario:contraseña@ en la URL (sirve para disfrazar el destino).
  v_host := lower(substring(p_url from '^https://([^/?#]+)'));
  if v_host is null or v_host like '%@%' then
    return false;
  end if;
  v_host := regexp_replace(v_host, ':\d+$', '');           -- sin puerto
  if v_host like '[%'                                        -- IPv6 literal
     or v_host ~ '^[0-9.]+$'                                 -- IPv4 literal
     or v_host !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
     or v_host = 'localhost'
     or v_host ~ '\.(localhost|local|internal|intranet|lan|home|corp|localdomain)$'
  then
    return false;
  end if;
  return true;
end;
$_$;


ALTER FUNCTION "public"."url_de_webhook_valida"("p_url" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_fiscal_chain"("p_user_id" "uuid") RETURNS TABLE("record_id" "uuid", "numero_factura" "text", "created_at" timestamp with time zone, "is_valid" boolean, "expected_hash" "text", "stored_hash" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
begin
  if auth.uid() is null then
    raise exception 'No autorizado: hace falta sesion.' using errcode = '42501';
  end if;

  if p_user_id is distinct from auth.uid() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  return query
  select
    fr.id,
    fr.numero_factura,
    fr.created_at,
    (encode(digest(fr.hash_input, 'sha256'), 'hex') = fr.hash) as is_valid,
    encode(digest(fr.hash_input, 'sha256'), 'hex') as expected_hash,
    fr.hash as stored_hash
  from public.fiscal_records fr
  where fr.user_id = p_user_id
  order by fr.created_at asc;
end;
$$;


ALTER FUNCTION "public"."verify_fiscal_chain"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."webhook_documento_nuevo"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_cliente text;
  v_tipo    text;
  v_titulo  text;
  v_importe bigint;
  v_fila    jsonb := to_jsonb(new);
begin
  select coalesce(company, name) into v_cliente
    from public.clients where id = (v_fila->>'client_id')::uuid;

  case tg_table_name
    when 'invoices' then
      v_tipo := 'Factura';
      v_titulo := v_fila->>'invoice_number';
      v_importe := (v_fila->>'total_cents')::bigint;
    when 'budgets' then
      v_tipo := 'Presupuesto';
      v_titulo := v_fila->>'description';
      v_importe := (v_fila->>'amount_cents')::bigint;
    when 'proposals' then
      v_tipo := 'Propuesta';
      v_titulo := v_fila->>'title';
      v_importe := (v_fila->>'amount_cents')::bigint;
    when 'contracts' then
      v_tipo := 'Contrato';
      v_titulo := null;
      v_importe := null;
  end case;

  perform public.enviar_webhooks_sin_fallar(
    (v_fila->>'user_id')::uuid,
    'NEW_DOCUMENT',
    format('📄 %s nuevo%s%s%s', v_tipo,
           coalesce(': ' || v_titulo, ''),
           coalesce(' para ' || v_cliente, ''),
           coalesce(' — ' || replace(to_char(v_importe / 100.0, 'FM999999990.00'), '.', ',') || ' €', '')),
    jsonb_build_object('document_type', tg_table_name, 'document_id', v_fila->>'id',
                       'title', v_titulo, 'client_name', v_cliente, 'amount_cents', v_importe)
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."webhook_documento_nuevo"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."webhook_horas_registradas"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_proyecto text;
  v_horas    numeric := round(coalesce(new.duration_seconds, 0) / 3600.0, 2);
begin
  select name into v_proyecto from public.projects where id = new.project_id;
  perform public.enviar_webhooks_sin_fallar(
    new.user_id,
    'TIMESHEET_SUBMITTED',
    format('⏱️ %s h registradas%s%s', replace(v_horas::text, '.', ','),
           coalesce(' en ' || v_proyecto, ''),
           coalesce(': ' || nullif(new.description, ''), '')),
    jsonb_build_object('time_entry_id', new.id, 'project_id', new.project_id,
                       'project_name', v_proyecto, 'hours', v_horas,
                       'description', new.description, 'logged_by', new.logged_by)
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."webhook_horas_registradas"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."webhook_tarea_completada"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_proyecto text;
begin
  if new.status::text in ('completed', 'done')
     and (tg_op = 'INSERT' or old.status::text not in ('completed', 'done')) then
    select name into v_proyecto from public.projects where id = new.project_id;
    perform public.enviar_webhooks_sin_fallar(
      new.user_id,
      'TASK_COMPLETED',
      format('✅ Tarea completada: %s%s', new.description,
             coalesce(' — ' || v_proyecto, '')),
      jsonb_build_object('task_id', new.id, 'description', new.description,
                         'project_id', new.project_id, 'project_name', v_proyecto)
    );
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."webhook_tarea_completada"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_usage" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "business_id" "uuid",
    "provider" "text" NOT NULL,
    "model" "text" NOT NULL,
    "operation" "text" NOT NULL,
    "input_tokens" integer DEFAULT 0,
    "output_tokens" integer DEFAULT 0,
    "success" boolean NOT NULL,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ai_usage" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bank_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "connection_id" "uuid" NOT NULL,
    "gocardless_account_id" "text" NOT NULL,
    "iban" "text",
    "account_name" "text",
    "currency" "text" DEFAULT 'EUR'::"text",
    "last_synced_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."bank_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bank_connections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "gocardless_requisition_id" "text" NOT NULL,
    "institution_id" "text" NOT NULL,
    "institution_name" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone,
    "enablebanking_session_id" "text",
    "aspsp_country" "text",
    CONSTRAINT "bank_connections_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'linked'::"text", 'expired'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."bank_connections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bank_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "bank_account_id" "uuid" NOT NULL,
    "gocardless_transaction_id" "text" NOT NULL,
    "amount_cents" integer NOT NULL,
    "currency" "text" DEFAULT 'EUR'::"text",
    "booking_date" "date" NOT NULL,
    "counterparty_name" "text",
    "description" "text",
    "raw_data" "jsonb",
    "matched_invoice_id" "uuid",
    "match_status" "text" DEFAULT 'unmatched'::"text" NOT NULL,
    "match_confidence" numeric(3,2),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "enablebanking_transaction_id" "text",
    CONSTRAINT "bank_transactions_match_status_check" CHECK (("match_status" = ANY (ARRAY['unmatched'::"text", 'suggested'::"text", 'confirmed'::"text", 'ignored'::"text"])))
);


ALTER TABLE "public"."bank_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."budgets" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "description" "text" NOT NULL,
    "items" "jsonb",
    "amount_cents" integer,
    "status" "public"."budget_status" DEFAULT 'pending'::"public"."budget_status",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."budgets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."business_profile" (
    "user_id" "uuid" NOT NULL,
    "business_name" "text",
    "contact_email" "text",
    "contact_phone" "text",
    "proposal_signature" "text",
    "logo_url" "text",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."business_profile" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."businesses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "category" "text",
    "address" "text",
    "phone" "text",
    "email" "text",
    "website" "text",
    "postal_code" "text",
    "city" "text",
    "province" "text",
    "lat" double precision,
    "lng" double precision,
    "google_place_id" "text",
    "google_rating" numeric(2,1),
    "google_reviews" integer DEFAULT 0,
    "google_photo" "text",
    "google_photo_url" "text",
    "social_media" "text",
    "status" "text" DEFAULT 'NUEVO'::"text" NOT NULL,
    "contacted" boolean DEFAULT false NOT NULL,
    "last_contacted_at" timestamp with time zone,
    "notes" "text",
    "search_id" "uuid",
    "economic_potential" numeric DEFAULT 0,
    "lead_score" integer DEFAULT 0,
    "sales_pitch" "text",
    "ai_analysis" "text",
    "email_draft" "text",
    "mockup_html" "text",
    "color_hex" "text",
    "secondary_hex" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "email_opens_count" integer DEFAULT 0,
    "email_clicks_count" integer DEFAULT 0,
    "email_last_opened_at" timestamp with time zone,
    "email_last_clicked_at" timestamp with time zone,
    "email_bounced" boolean DEFAULT false,
    "last_email_kind" "text",
    "proposal_sent_at" timestamp with time zone,
    "followup_sent_at" timestamp with time zone,
    CONSTRAINT "businesses_last_email_kind_check" CHECK ((("last_email_kind" = ANY (ARRAY['PROPUESTA'::"text", 'RECORDATORIO'::"text"])) OR ("last_email_kind" IS NULL))),
    CONSTRAINT "businesses_status_check" CHECK (("status" = ANY (ARRAY['NUEVO'::"text", 'CONTACTADO'::"text", 'INTERESADO'::"text", 'NEGOCIACION'::"text", 'CERRADO'::"text", 'DESCARTADO'::"text"])))
);


ALTER TABLE "public"."businesses" OWNER TO "postgres";


COMMENT ON COLUMN "public"."businesses"."last_email_kind" IS 'Tipo del ultimo texto generado en email_draft: PROPUESTA (generateProposalEmail) o RECORDATORIO (generateFollowUpEmail, aunque este no persiste el texto en email_draft, se usa como senal de intencion al enviar desde el modal).';



COMMENT ON COLUMN "public"."businesses"."proposal_sent_at" IS 'Fecha/hora del ultimo envio real de PROPUESTA_ENVIADA (via sendEmailWithMockup o bulkSendGeneratedEmails). NULL si nunca se envio.';



COMMENT ON COLUMN "public"."businesses"."followup_sent_at" IS 'Fecha/hora del ultimo envio real de RECORDATORIO_ENVIADO (via sendEmailWithMockup). NULL si nunca se envio.';



CREATE TABLE IF NOT EXISTS "public"."clients" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "name" "text" NOT NULL,
    "company" "text",
    "email" "text",
    "phone" "text",
    "payment_method_on_file" boolean DEFAULT false,
    "stripe_customer_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "portal_user_id" "uuid",
    "tax_id" "text",
    "address" "text",
    "portal_invitado_en" timestamp with time zone
);


ALTER TABLE "public"."clients" OWNER TO "postgres";


COMMENT ON COLUMN "public"."clients"."tax_id" IS 'NIF/CIF del cliente';



COMMENT ON COLUMN "public"."clients"."address" IS 'Dirección postal del cliente';



COMMENT ON COLUMN "public"."clients"."portal_invitado_en" IS 'Cuando se envio la ultima invitacion al Portal de Cliente. La escribe solo la Edge Function invite-portal-client con la clave de servicio; sirve ademas de contador para el tope diario y para la espera entre reenvios.';



CREATE TABLE IF NOT EXISTS "public"."contract_templates" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "content_template" "text",
    "is_public" boolean DEFAULT false NOT NULL,
    "price_cents" integer DEFAULT 0 NOT NULL,
    "description" "text",
    "category" "text",
    "downloads_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."contract_templates" OWNER TO "postgres";


COMMENT ON COLUMN "public"."contract_templates"."is_public" IS 'Ítem 8 roadmap: listada en el marketplace de plantillas entre freelancers.';



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "full_name" "text",
    "business_name" "text",
    "avatar_url" "text",
    "email" "text",
    "tax_id" "text",
    "plan" "text" DEFAULT 'Free'::"text",
    "ai_credits" integer DEFAULT 10,
    "hourly_rate_cents" integer DEFAULT 5000,
    "pdf_color" "text" DEFAULT '#F000B8'::"text",
    "isnewuser" boolean DEFAULT true,
    "bio" "text",
    "skills" "text"[],
    "portfolio_url" "text",
    "specialty" "text",
    "availability_hours" integer,
    "preferred_hourly_rate_cents" integer,
    "payment_reminders_enabled" boolean DEFAULT false,
    "reminder_template_upcoming" "text" DEFAULT 'Recordatorio: La factura [InvoiceNumber] de [Amount] vence el [DueDate].'::"text",
    "reminder_template_overdue" "text" DEFAULT 'AVISO: La factura [InvoiceNumber] de [Amount] ha vencido. Por favor, realiza el pago lo antes posible.'::"text",
    "email_notifications" "jsonb" DEFAULT '{"on_contract_signed": true, "on_invoice_overdue": true, "on_new_project_message": true, "on_proposal_status_change": true}'::"jsonb",
    "affiliate_code" "text",
    "stripe_account_id" "text",
    "stripe_onboarding_complete" boolean DEFAULT false,
    "stripe_customer_id" "text",
    "role" "text" DEFAULT 'Developer'::"text",
    "stripe_subscription_id" "text",
    "subscription_status" "text",
    "portal_logo_url" "text",
    "veri_factu_enabled" boolean DEFAULT false NOT NULL,
    "veri_factu_modality" "text" DEFAULT 'no_verifactu'::"text" NOT NULL,
    "fiscal_street" "text",
    "fiscal_postal_code" "text",
    "fiscal_city" "text",
    "fiscal_province" "text",
    "invoice_reply_to_email" "text",
    "profitability_alerts_enabled" boolean DEFAULT true NOT NULL,
    "signature_credits" integer DEFAULT 0 NOT NULL,
    "creditos_mensuales_proxima" timestamp with time zone,
    CONSTRAINT "profiles_veri_factu_modality_check" CHECK (("veri_factu_modality" = ANY (ARRAY['verifactu'::"text", 'no_verifactu'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."invoice_reply_to_email" IS 'Email de "responder a" para documentos enviados (facturas/propuestas/presupuestos). Si es NULL, se usa profiles.email.';



COMMENT ON COLUMN "public"."profiles"."profitability_alerts_enabled" IS 'Alertas semanales por email cuando un proyecto activo cae por debajo de la tarifa objetivo (hourly_rate_cents). Función Pro/Teams. Item 6 del roadmap de monetización.';



COMMENT ON COLUMN "public"."profiles"."signature_credits" IS 'Créditos de firma electrónica eIDAS comprados aparte de la suscripción (mismo patrón que ai_credits). Ítem 5 del roadmap de monetización.';



COMMENT ON COLUMN "public"."profiles"."creditos_mensuales_proxima" IS 'Cuándo toca la próxima recarga mensual de créditos de IA (Pro 50, Teams 200). NULL = sin plan de pago activo.';



CREATE OR REPLACE VIEW "public"."contract_templates_marketplace" AS
 SELECT "ct"."id",
    "ct"."user_id" AS "seller_id",
    "ct"."name",
    "ct"."description",
    "ct"."category",
    "ct"."price_cents",
    "ct"."downloads_count",
    "ct"."created_at",
    "p"."business_name",
    "p"."full_name"
   FROM ("public"."contract_templates" "ct"
     JOIN "public"."profiles" "p" ON (("p"."id" = "ct"."user_id")))
  WHERE ("ct"."is_public" = true);


ALTER VIEW "public"."contract_templates_marketplace" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contracts" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "status" "public"."contract_status" DEFAULT 'draft'::"public"."contract_status",
    "signed_by" "text",
    "signed_at" timestamp with time zone,
    "expires_at" "date",
    "signature" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."contracts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."digital_presence" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "has_website" boolean DEFAULT false,
    "website_url" "text",
    "only_social_media" boolean DEFAULT false,
    "verification_reason" "text",
    "facebook_url" "text",
    "linkedin_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."digital_presence" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."expenses" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "description" "text" NOT NULL,
    "amount_cents" integer NOT NULL,
    "tax_percent" numeric(5,2) DEFAULT 21.00,
    "date" "date" NOT NULL,
    "category" "text",
    "project_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."integrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "url" "text" NOT NULL,
    "event" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "last_test_success" boolean,
    "last_test_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_sent_at" timestamp with time zone
);


ALTER TABLE "public"."integrations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."interactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "type" "text",
    "message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "actor_id" "uuid",
    "resend_message_id" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."interactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invitaciones_enviadas" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "enviada_en" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."invitaciones_enviadas" OWNER TO "postgres";


COMMENT ON TABLE "public"."invitaciones_enviadas" IS 'Registro de invitaciones de equipo enviadas. Solo service_role. Sirve de tope diario (ver _shared/limites-equipo.ts); no se puede evadir borrando filas de team_members.';



ALTER TABLE "public"."invitaciones_enviadas" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."invitaciones_enviadas_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."invoice_templates" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "items" "jsonb",
    "tax_percent" numeric(5,2),
    "is_public" boolean DEFAULT false NOT NULL,
    "price_cents" integer DEFAULT 0 NOT NULL,
    "description" "text",
    "category" "text",
    "downloads_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."invoice_templates" OWNER TO "postgres";


COMMENT ON COLUMN "public"."invoice_templates"."is_public" IS 'Ítem 8 roadmap: listada en el marketplace de plantillas entre freelancers.';



CREATE OR REPLACE VIEW "public"."invoice_templates_marketplace" AS
 SELECT "it"."id",
    "it"."user_id" AS "seller_id",
    "it"."name",
    "it"."description",
    "it"."category",
    "it"."price_cents",
    "it"."downloads_count",
    "it"."created_at",
    "p"."business_name",
    "p"."full_name"
   FROM ("public"."invoice_templates" "it"
     JOIN "public"."profiles" "p" ON (("p"."id" = "it"."user_id")))
  WHERE ("it"."is_public" = true);


ALTER VIEW "public"."invoice_templates_marketplace" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoices" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "invoice_number" "text" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "project_id" "uuid",
    "issue_date" "date" NOT NULL,
    "due_date" "date" NOT NULL,
    "items" "jsonb" NOT NULL,
    "subtotal_cents" integer NOT NULL,
    "tax_percent" numeric(5,2) DEFAULT 21.00,
    "total_cents" integer NOT NULL,
    "paid" boolean DEFAULT false,
    "payment_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "irpf_percent" numeric(5,2),
    "notes" "text",
    "budget_id" "uuid",
    "contract_id" "uuid",
    "fiscal_locked" boolean DEFAULT false NOT NULL,
    "rectifies_invoice_id" "uuid",
    "is_rectified" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."job_applications" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "job_id" "uuid" NOT NULL,
    "applicant_id" "uuid" NOT NULL,
    "proposal_text" "text",
    "status" "public"."job_application_status" DEFAULT 'sent'::"public"."job_application_status",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."job_applications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."jobs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "titulo" "text" NOT NULL,
    "descripcioncorta" "text",
    "descripcionlarga" "text",
    "presupuesto" integer DEFAULT 0 NOT NULL,
    "duracionsemanas" integer DEFAULT 0 NOT NULL,
    "habilidades" "text"[],
    "cliente" "text",
    "fechapublicacion" "date",
    "isfeatured" boolean DEFAULT false,
    "compatibilidadia" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "email_contacto" "text",
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL
);


ALTER TABLE "public"."jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."knowledge_articles" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "content" "text",
    "tags" "text"[],
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."knowledge_articles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "amount_cents" integer NOT NULL,
    "paid_at" "date" DEFAULT CURRENT_DATE NOT NULL,
    "method" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "stripe_payment_intent_id" "text",
    CONSTRAINT "payments_amount_cents_check" CHECK (("amount_cents" > 0))
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


COMMENT ON COLUMN "public"."payments"."stripe_payment_intent_id" IS 'PaymentIntent de Stripe cuando el cobro vino de la pagina publica de pago. Nulo en los pagos registrados a mano o conciliados del banco.';



CREATE TABLE IF NOT EXISTS "public"."platform_payments" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "user_email" "text",
    "plan_name" "text",
    "amount_cents" integer,
    "stripe_session_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."platform_payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."portal_comments" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "entityid" "uuid" NOT NULL,
    "username" "text",
    "useravatar" "text",
    "text" "text",
    "timestamp" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid"
);


ALTER TABLE "public"."portal_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."portal_files" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "entityid" "uuid" NOT NULL,
    "filename" "text",
    "filetype" "text",
    "url" "text",
    "uploadedat" timestamp with time zone DEFAULT "now"(),
    "uploadedby" "text",
    "user_id" "uuid"
);


ALTER TABLE "public"."portal_files" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."processed_resend_events" (
    "event_id" "text" NOT NULL,
    "type" "text",
    "business_id" "uuid",
    "processed_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);


ALTER TABLE "public"."processed_resend_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."processed_resend_events" IS 'Solo accesible via service_role (webhook de Resend). RLS habilitado sin policies para authenticated/anon es intencional -- ver policy explicita de denegacion.';



CREATE TABLE IF NOT EXISTS "public"."processed_stripe_events" (
    "event_id" "text" NOT NULL,
    "type" "text",
    "processed_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);


ALTER TABLE "public"."processed_stripe_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_comments" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "user_id" "text" NOT NULL,
    "user_name" "text",
    "text" "text",
    "timestamp" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."project_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_files" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "filename" "text" NOT NULL,
    "filetype" "text",
    "url" "text",
    "uploadedat" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."project_files" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "author_name" "text" DEFAULT ''::"text" NOT NULL,
    "author_role" "text" DEFAULT ''::"text" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "project_messages_author_role_check" CHECK (("author_role" = ANY (ARRAY['freelancer'::"text", 'equipo'::"text", 'cliente'::"text", ''::"text"]))),
    CONSTRAINT "project_messages_body_check" CHECK ((("length"("btrim"("body")) >= 1) AND ("length"("btrim"("body")) <= 4000)))
);


ALTER TABLE "public"."project_messages" OWNER TO "postgres";


COMMENT ON TABLE "public"."project_messages" IS 'Chat por proyecto entre el freelancer, su equipo y el cliente del portal. author_name y author_role los sella un trigger: no se aceptan del cliente.';



CREATE TABLE IF NOT EXISTS "public"."project_milestones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "due_date" "date",
    "status" "text" DEFAULT 'pendiente'::"text" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "project_milestones_status_check" CHECK (("status" = ANY (ARRAY['pendiente'::"text", 'en_curso'::"text", 'entregado'::"text"]))),
    CONSTRAINT "project_milestones_title_check" CHECK ((("length"("btrim"("title")) >= 1) AND ("length"("btrim"("title")) <= 200)))
);


ALTER TABLE "public"."project_milestones" OWNER TO "postgres";


COMMENT ON TABLE "public"."project_milestones" IS 'Hitos de seguimiento de un proyecto (nombre, fecha, estado). Visibles para el equipo y para el cliente en el portal.';



CREATE TABLE IF NOT EXISTS "public"."projects" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "status" "public"."project_status" DEFAULT 'planning'::"public"."project_status",
    "start_date" "date",
    "due_date" "date",
    "budget_cents" integer DEFAULT 0,
    "category" "text",
    "priority" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."projects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."proposal_templates" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "title_template" "text",
    "content_template" "text",
    "is_public" boolean DEFAULT false NOT NULL,
    "price_cents" integer DEFAULT 0 NOT NULL,
    "description" "text",
    "category" "text",
    "downloads_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."proposal_templates" OWNER TO "postgres";


COMMENT ON COLUMN "public"."proposal_templates"."is_public" IS 'Ítem 8 roadmap: listada en el marketplace de plantillas entre freelancers.';



CREATE OR REPLACE VIEW "public"."proposal_templates_marketplace" AS
 SELECT "pt"."id",
    "pt"."user_id" AS "seller_id",
    "pt"."name",
    "pt"."description",
    "pt"."category",
    "pt"."price_cents",
    "pt"."downloads_count",
    "pt"."created_at",
    "p"."business_name",
    "p"."full_name"
   FROM ("public"."proposal_templates" "pt"
     JOIN "public"."profiles" "p" ON (("p"."id" = "pt"."user_id")))
  WHERE ("pt"."is_public" = true);


ALTER VIEW "public"."proposal_templates_marketplace" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."proposals" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "content" "text",
    "amount_cents" integer,
    "status" "public"."proposal_status" DEFAULT 'draft'::"public"."proposal_status",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "items" "jsonb" DEFAULT '[]'::"jsonb",
    "valid_until" timestamp with time zone
);


ALTER TABLE "public"."proposals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rate_limit_buckets" (
    "user_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "window_start" timestamp with time zone NOT NULL,
    "count" integer DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."rate_limit_buckets" OWNER TO "postgres";


COMMENT ON TABLE "public"."rate_limit_buckets" IS 'Solo accesible via service_role (backend). RLS habilitado sin policies para authenticated/anon es intencional -- ver policy explicita de denegacion.';



CREATE TABLE IF NOT EXISTS "public"."receipts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "client_id" "uuid",
    "project_id" "uuid",
    "receipt_number" "text" NOT NULL,
    "concept" "text" NOT NULL,
    "amount_cents" integer NOT NULL,
    "paid_at" "date" DEFAULT CURRENT_DATE NOT NULL,
    "method" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "receipts_amount_cents_check" CHECK (("amount_cents" > 0))
);


ALTER TABLE "public"."receipts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recurring_expenses" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "description" "text" NOT NULL,
    "amount_cents" integer NOT NULL,
    "category" "text",
    "frequency" "public"."recurring_frequency" NOT NULL,
    "start_date" "date" NOT NULL,
    "next_due_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "next_date" "date"
);


ALTER TABLE "public"."recurring_expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recurring_invoices" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "project_id" "uuid",
    "items" "jsonb" NOT NULL,
    "tax_percent" numeric(5,2) DEFAULT 21.00,
    "frequency" "public"."recurring_frequency" NOT NULL,
    "start_date" "date" NOT NULL,
    "next_due_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."recurring_invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."referrals" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "referrer_id" "uuid" NOT NULL,
    "referred_user_id" "uuid" NOT NULL,
    "referred_user_name" "text",
    "join_date" "date",
    "status" "text" DEFAULT 'pending'::"text",
    "commission_cents" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid",
    "stripe_session_id" "text"
);


ALTER TABLE "public"."referrals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."saved_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "job_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."saved_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."search_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "keyword" "text",
    "postal_code" "text",
    "radius" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."search_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."search_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "postal_code" "text" NOT NULL,
    "radius" integer NOT NULL,
    "keyword" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "message" "text",
    "progress" integer DEFAULT 0,
    "next_page_token" "text",
    "current_page" integer DEFAULT 1,
    "total_found" integer DEFAULT 0,
    "total_processed" integer DEFAULT 0,
    "lat" double precision,
    "lng" double precision,
    "error_message" "text",
    "pending_places" "jsonb" DEFAULT '[]'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "search_jobs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'running'::"text", 'completed'::"text", 'cancelled'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."search_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shadow_income" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "description" "text" NOT NULL,
    "amount_cents" integer NOT NULL,
    "date" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."shadow_income" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tasks" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "description" "text" NOT NULL,
    "status" "public"."task_status" DEFAULT 'todo'::"public"."task_status",
    "invoice_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" NOT NULL,
    "status" "text" DEFAULT 'Pendiente'::"text" NOT NULL,
    "invited_on" "date" DEFAULT CURRENT_DATE,
    "hourly_rate_cents" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "accepted_user_id" "uuid",
    CONSTRAINT "team_members_role_check" CHECK (("role" = ANY (ARRAY['Developer'::"text", 'Manager'::"text", 'Admin'::"text"]))),
    CONSTRAINT "team_members_status_check" CHECK (("status" = ANY (ARRAY['Activo'::"text", 'Pendiente'::"text", 'Inactivo'::"text"])))
);


ALTER TABLE "public"."team_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_users" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "invited_by" "uuid",
    "name" "text" NOT NULL,
    "email" "text",
    "role" "text",
    "status" "public"."team_user_status",
    "invitedon" timestamp with time zone,
    "hourly_rate_cents" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."team_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tech_analysis" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid",
    "website_status" "text",
    "cms" "text",
    "slow_site" boolean,
    "opportunity_score" integer,
    "analyzed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tech_analysis" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."template_purchases" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "buyer_id" "uuid" NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "template_type" "text" NOT NULL,
    "original_template_id" "uuid" NOT NULL,
    "copied_template_id" "uuid" NOT NULL,
    "price_cents" integer NOT NULL,
    "stripe_payment_intent_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "template_purchases_template_type_check" CHECK (("template_type" = ANY (ARRAY['proposal'::"text", 'contract'::"text", 'invoice'::"text"])))
);


ALTER TABLE "public"."template_purchases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."time_entries" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "description" "text",
    "start_time" timestamp with time zone NOT NULL,
    "end_time" timestamp with time zone,
    "duration_seconds" integer NOT NULL,
    "invoice_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "logged_by" "uuid"
);


ALTER TABLE "public"."time_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_api_keys" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "key_name" "text" NOT NULL,
    "encrypted_value" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_api_keys_key_name_check" CHECK (("key_name" = ANY (ARRAY['GEMINI_API_KEY'::"text", 'SERPAPI_KEY'::"text"])))
);


ALTER TABLE "public"."user_api_keys" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_secrets" (
    "user_id" "uuid" NOT NULL,
    "gemini_api_key_encrypted" "text",
    "gemini_api_key_updated_at" timestamp with time zone,
    "veri_factu_cert_storage_path" "text",
    "veri_factu_cert_password_encrypted" "text",
    "veri_factu_cert_subject" "text",
    "veri_factu_cert_expires_at" "date",
    "veri_factu_cert_uploaded_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "gocardless_secret_id_encrypted" "text",
    "gocardless_secret_key_encrypted" "text",
    "gocardless_configured_at" timestamp with time zone,
    "enablebanking_app_id" "text",
    "enablebanking_private_key_encrypted" "text",
    "enablebanking_configured_at" timestamp with time zone,
    "veri_factu_cert_alert_tramo" smallint,
    "veri_factu_cert_alert_para" "date"
);


ALTER TABLE "public"."user_secrets" OWNER TO "postgres";


COMMENT ON COLUMN "public"."user_secrets"."gocardless_secret_id_encrypted" IS 'OBSOLETO: GoCardless cerró altas nuevas en julio 2025. Usar enablebanking_* en su lugar.';



COMMENT ON COLUMN "public"."user_secrets"."veri_factu_cert_alert_tramo" IS 'Ultimo tramo de aviso enviado por caducidad del certificado: 60, 30, 7 o 0 (ya caducado). NULL = ninguno.';



COMMENT ON COLUMN "public"."user_secrets"."veri_factu_cert_alert_para" IS 'Fecha de caducidad a la que corresponde veri_factu_cert_alert_tramo. Si no coincide con veri_factu_cert_expires_at, el certificado es otro y el aviso se reinicia.';



CREATE OR REPLACE VIEW "public"."view_public_jobs" WITH ("security_invoker"='on') AS
 SELECT "id",
    "titulo",
    "descripcioncorta",
    "presupuesto",
    "fechapublicacion",
    "user_id"
   FROM "public"."jobs";


ALTER VIEW "public"."view_public_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."webhooks_enviados" (
    "id" bigint NOT NULL,
    "integration_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "event" "text" NOT NULL,
    "request_id" bigint,
    "es_prueba" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."webhooks_enviados" OWNER TO "postgres";


ALTER TABLE "public"."webhooks_enviados" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."webhooks_enviados_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE ONLY "public"."ai_usage"
    ADD CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bank_accounts"
    ADD CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bank_accounts"
    ADD CONSTRAINT "bank_accounts_user_cuenta_key" UNIQUE ("user_id", "gocardless_account_id");



ALTER TABLE ONLY "public"."bank_connections"
    ADD CONSTRAINT "bank_connections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bank_transactions"
    ADD CONSTRAINT "bank_transactions_bank_account_id_gocardless_transaction_id_key" UNIQUE ("bank_account_id", "gocardless_transaction_id");



ALTER TABLE ONLY "public"."bank_transactions"
    ADD CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."budgets"
    ADD CONSTRAINT "budgets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."business_profile"
    ADD CONSTRAINT "business_profile_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."businesses"
    ADD CONSTRAINT "businesses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_portal_user_id_key" UNIQUE ("portal_user_id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_stripe_customer_id_key" UNIQUE ("stripe_customer_id");



ALTER TABLE ONLY "public"."contract_templates"
    ADD CONSTRAINT "contract_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."digital_presence"
    ADD CONSTRAINT "digital_presence_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fiscal_records"
    ADD CONSTRAINT "fiscal_records_pkey" PRIMARY KEY ("id");



ALTER TABLE "public"."integrations"
    ADD CONSTRAINT "integrations_evento_conocido" CHECK (("event" = ANY (ARRAY['TASK_COMPLETED'::"text", 'NEW_DOCUMENT'::"text", 'TIMESHEET_SUBMITTED'::"text"]))) NOT VALID;



ALTER TABLE ONLY "public"."integrations"
    ADD CONSTRAINT "integrations_pkey" PRIMARY KEY ("id");



ALTER TABLE "public"."integrations"
    ADD CONSTRAINT "integrations_url_segura" CHECK ("public"."url_de_webhook_valida"("url")) NOT VALID;



ALTER TABLE ONLY "public"."interactions"
    ADD CONSTRAINT "interactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invitaciones_enviadas"
    ADD CONSTRAINT "invitaciones_enviadas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoice_templates"
    ADD CONSTRAINT "invoice_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_user_invoice_number_unique" UNIQUE ("user_id", "invoice_number");



ALTER TABLE ONLY "public"."job_applications"
    ADD CONSTRAINT "job_applications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."knowledge_articles"
    ADD CONSTRAINT "knowledge_articles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_payments"
    ADD CONSTRAINT "platform_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."portal_comments"
    ADD CONSTRAINT "portal_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."portal_files"
    ADD CONSTRAINT "portal_files_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."processed_resend_events"
    ADD CONSTRAINT "processed_resend_events_pkey" PRIMARY KEY ("event_id");



ALTER TABLE ONLY "public"."processed_stripe_events"
    ADD CONSTRAINT "processed_stripe_events_pkey" PRIMARY KEY ("event_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_affiliate_code_key" UNIQUE ("affiliate_code");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_stripe_account_id_key" UNIQUE ("stripe_account_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_stripe_customer_id_key" UNIQUE ("stripe_customer_id");



ALTER TABLE ONLY "public"."project_comments"
    ADD CONSTRAINT "project_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_files"
    ADD CONSTRAINT "project_files_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_messages"
    ADD CONSTRAINT "project_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_milestones"
    ADD CONSTRAINT "project_milestones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."proposal_templates"
    ADD CONSTRAINT "proposal_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."proposals"
    ADD CONSTRAINT "proposals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rate_limit_buckets"
    ADD CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("user_id", "action", "window_start");



ALTER TABLE ONLY "public"."receipts"
    ADD CONSTRAINT "receipts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recurring_expenses"
    ADD CONSTRAINT "recurring_expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recurring_invoices"
    ADD CONSTRAINT "recurring_invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."referrals"
    ADD CONSTRAINT "referrals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saved_jobs"
    ADD CONSTRAINT "saved_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saved_jobs"
    ADD CONSTRAINT "saved_jobs_user_id_job_id_key" UNIQUE ("user_id", "job_id");



ALTER TABLE ONLY "public"."search_history"
    ADD CONSTRAINT "search_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."search_jobs"
    ADD CONSTRAINT "search_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shadow_income"
    ADD CONSTRAINT "shadow_income_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_users"
    ADD CONSTRAINT "team_users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."team_users"
    ADD CONSTRAINT "team_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tech_analysis"
    ADD CONSTRAINT "tech_analysis_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."template_purchases"
    ADD CONSTRAINT "template_purchases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."time_entries"
    ADD CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_api_keys"
    ADD CONSTRAINT "user_api_keys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_api_keys"
    ADD CONSTRAINT "user_api_keys_user_id_key_name_key" UNIQUE ("user_id", "key_name");



ALTER TABLE ONLY "public"."user_secrets"
    ADD CONSTRAINT "user_secrets_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."webhooks_enviados"
    ADD CONSTRAINT "webhooks_enviados_pkey" PRIMARY KEY ("id");



CREATE INDEX "bank_transactions_matched_invoice_idx" ON "public"."bank_transactions" USING "btree" ("matched_invoice_id");



CREATE INDEX "bank_transactions_user_status_idx" ON "public"."bank_transactions" USING "btree" ("user_id", "match_status");



CREATE INDEX "clients_portal_invitado_en_idx" ON "public"."clients" USING "btree" ("user_id", "portal_invitado_en") WHERE ("portal_invitado_en" IS NOT NULL);



CREATE INDEX "contract_templates_user_id_idx" ON "public"."contract_templates" USING "btree" ("user_id");



CREATE INDEX "fiscal_records_invoice_idx" ON "public"."fiscal_records" USING "btree" ("invoice_id");



CREATE INDEX "fiscal_records_user_created_idx" ON "public"."fiscal_records" USING "btree" ("user_id", "created_at");



CREATE INDEX "idx_ai_usage_business_id" ON "public"."ai_usage" USING "btree" ("business_id");



CREATE INDEX "idx_ai_usage_created_at" ON "public"."ai_usage" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_ai_usage_user_id" ON "public"."ai_usage" USING "btree" ("user_id");



CREATE INDEX "idx_bank_accounts_connection_id" ON "public"."bank_accounts" USING "btree" ("connection_id");



CREATE INDEX "idx_budgets_client_id" ON "public"."budgets" USING "btree" ("client_id");



CREATE INDEX "idx_budgets_status" ON "public"."budgets" USING "btree" ("status");



CREATE INDEX "idx_budgets_user_id" ON "public"."budgets" USING "btree" ("user_id");



CREATE INDEX "idx_businesses_created_at" ON "public"."businesses" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_businesses_status" ON "public"."businesses" USING "btree" ("status");



CREATE INDEX "idx_businesses_user_id" ON "public"."businesses" USING "btree" ("user_id");



CREATE UNIQUE INDEX "idx_businesses_user_place" ON "public"."businesses" USING "btree" ("user_id", "google_place_id") WHERE ("google_place_id" IS NOT NULL);



CREATE INDEX "idx_clients_created_at" ON "public"."clients" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_clients_user_id" ON "public"."clients" USING "btree" ("user_id");



CREATE INDEX "idx_contracts_client_id" ON "public"."contracts" USING "btree" ("client_id");



CREATE INDEX "idx_contracts_project_id" ON "public"."contracts" USING "btree" ("project_id");



CREATE INDEX "idx_contracts_status" ON "public"."contracts" USING "btree" ("status");



CREATE INDEX "idx_contracts_user_id" ON "public"."contracts" USING "btree" ("user_id");



CREATE INDEX "idx_digital_presence_business_id" ON "public"."digital_presence" USING "btree" ("business_id");



CREATE INDEX "idx_expenses_date" ON "public"."expenses" USING "btree" ("date" DESC);



CREATE INDEX "idx_expenses_project_id" ON "public"."expenses" USING "btree" ("project_id");



CREATE INDEX "idx_expenses_user_id" ON "public"."expenses" USING "btree" ("user_id");



CREATE INDEX "idx_interactions_actor_id" ON "public"."interactions" USING "btree" ("actor_id");



CREATE INDEX "idx_interactions_business_id" ON "public"."interactions" USING "btree" ("business_id");



CREATE INDEX "idx_interactions_business_id_type" ON "public"."interactions" USING "btree" ("business_id", "type");



CREATE INDEX "idx_interactions_created_at" ON "public"."interactions" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_interactions_resend_message_id" ON "public"."interactions" USING "btree" ("resend_message_id") WHERE ("resend_message_id" IS NOT NULL);



CREATE INDEX "idx_invoices_budget_id" ON "public"."invoices" USING "btree" ("budget_id");



CREATE INDEX "idx_invoices_client_id" ON "public"."invoices" USING "btree" ("client_id");



CREATE INDEX "idx_invoices_contract_id" ON "public"."invoices" USING "btree" ("contract_id");



CREATE INDEX "idx_invoices_due_date" ON "public"."invoices" USING "btree" ("due_date");



CREATE INDEX "idx_invoices_paid" ON "public"."invoices" USING "btree" ("paid");



CREATE INDEX "idx_invoices_project_id" ON "public"."invoices" USING "btree" ("project_id");



CREATE INDEX "idx_invoices_rectifies_invoice_id" ON "public"."invoices" USING "btree" ("rectifies_invoice_id") WHERE ("rectifies_invoice_id" IS NOT NULL);



CREATE INDEX "idx_invoices_user_id" ON "public"."invoices" USING "btree" ("user_id");



CREATE INDEX "idx_job_applications_applicant_id" ON "public"."job_applications" USING "btree" ("applicant_id");



CREATE INDEX "idx_job_applications_job_id" ON "public"."job_applications" USING "btree" ("job_id");



CREATE INDEX "idx_job_applications_status" ON "public"."job_applications" USING "btree" ("status");



CREATE INDEX "idx_jobs_created_at" ON "public"."jobs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_jobs_isfeatured" ON "public"."jobs" USING "btree" ("isfeatured");



CREATE INDEX "idx_jobs_user_id" ON "public"."jobs" USING "btree" ("user_id");



CREATE INDEX "idx_knowledge_articles_user_id" ON "public"."knowledge_articles" USING "btree" ("user_id");



CREATE INDEX "idx_payments_invoice_id" ON "public"."payments" USING "btree" ("invoice_id");



CREATE INDEX "idx_payments_user_id" ON "public"."payments" USING "btree" ("user_id");



CREATE INDEX "idx_platform_payments_created_at" ON "public"."platform_payments" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_platform_payments_user_id" ON "public"."platform_payments" USING "btree" ("user_id");



CREATE INDEX "idx_portal_comments_user_id" ON "public"."portal_comments" USING "btree" ("user_id");



CREATE INDEX "idx_portal_files_user_id" ON "public"."portal_files" USING "btree" ("user_id");



CREATE INDEX "idx_processed_resend_events_business_id" ON "public"."processed_resend_events" USING "btree" ("business_id");



CREATE INDEX "idx_profiles_email" ON "public"."profiles" USING "btree" ("email");



CREATE INDEX "idx_profiles_plan" ON "public"."profiles" USING "btree" ("plan");



CREATE INDEX "idx_profiles_role" ON "public"."profiles" USING "btree" ("role");



CREATE INDEX "idx_projects_client_id" ON "public"."projects" USING "btree" ("client_id");



CREATE INDEX "idx_projects_status" ON "public"."projects" USING "btree" ("status");



CREATE INDEX "idx_projects_user_id" ON "public"."projects" USING "btree" ("user_id");



CREATE INDEX "idx_proposals_client_id" ON "public"."proposals" USING "btree" ("client_id");



CREATE INDEX "idx_proposals_status" ON "public"."proposals" USING "btree" ("status");



CREATE INDEX "idx_proposals_user_id" ON "public"."proposals" USING "btree" ("user_id");



CREATE INDEX "idx_receipts_client_id" ON "public"."receipts" USING "btree" ("client_id") WHERE ("client_id" IS NOT NULL);



CREATE INDEX "idx_receipts_project_id" ON "public"."receipts" USING "btree" ("project_id") WHERE ("project_id" IS NOT NULL);



CREATE INDEX "idx_recurring_expenses_next_due" ON "public"."recurring_expenses" USING "btree" ("next_due_date");



CREATE INDEX "idx_recurring_expenses_user_id" ON "public"."recurring_expenses" USING "btree" ("user_id");



CREATE INDEX "idx_recurring_invoices_client_id" ON "public"."recurring_invoices" USING "btree" ("client_id");



CREATE INDEX "idx_recurring_invoices_next_due" ON "public"."recurring_invoices" USING "btree" ("next_due_date");



CREATE INDEX "idx_recurring_invoices_project_id" ON "public"."recurring_invoices" USING "btree" ("project_id");



CREATE INDEX "idx_recurring_invoices_user_id" ON "public"."recurring_invoices" USING "btree" ("user_id");



CREATE INDEX "idx_referrals_referred_user_id" ON "public"."referrals" USING "btree" ("referred_user_id");



CREATE INDEX "idx_referrals_referrer_id" ON "public"."referrals" USING "btree" ("referrer_id");



CREATE INDEX "idx_referrals_user_id" ON "public"."referrals" USING "btree" ("user_id");



CREATE INDEX "idx_saved_jobs_job_id" ON "public"."saved_jobs" USING "btree" ("job_id");



CREATE INDEX "idx_saved_jobs_user_id" ON "public"."saved_jobs" USING "btree" ("user_id");



CREATE INDEX "idx_search_history_user_id" ON "public"."search_history" USING "btree" ("user_id");



CREATE INDEX "idx_search_jobs_status" ON "public"."search_jobs" USING "btree" ("status");



CREATE INDEX "idx_search_jobs_user_id" ON "public"."search_jobs" USING "btree" ("user_id");



CREATE INDEX "idx_tasks_invoice_id" ON "public"."tasks" USING "btree" ("invoice_id");



CREATE INDEX "idx_tasks_project_id" ON "public"."tasks" USING "btree" ("project_id");



CREATE INDEX "idx_tasks_status" ON "public"."tasks" USING "btree" ("status");



CREATE INDEX "idx_tasks_user_id" ON "public"."tasks" USING "btree" ("user_id");



CREATE INDEX "idx_team_members_accepted_user_id" ON "public"."team_members" USING "btree" ("accepted_user_id");



CREATE INDEX "idx_team_members_user_id" ON "public"."team_members" USING "btree" ("user_id");



CREATE INDEX "idx_tech_analysis_business_id" ON "public"."tech_analysis" USING "btree" ("business_id");



CREATE INDEX "idx_time_entries_invoice_id" ON "public"."time_entries" USING "btree" ("invoice_id");



CREATE INDEX "idx_time_entries_project_id" ON "public"."time_entries" USING "btree" ("project_id");



CREATE INDEX "idx_time_entries_start_time" ON "public"."time_entries" USING "btree" ("start_time" DESC);



CREATE INDEX "idx_time_entries_user_id" ON "public"."time_entries" USING "btree" ("user_id");



CREATE INDEX "idx_user_api_keys_user_id" ON "public"."user_api_keys" USING "btree" ("user_id");



CREATE INDEX "invitaciones_enviadas_user_fecha_idx" ON "public"."invitaciones_enviadas" USING "btree" ("user_id", "enviada_en" DESC);



CREATE INDEX "invoice_templates_user_id_idx" ON "public"."invoice_templates" USING "btree" ("user_id");



CREATE UNIQUE INDEX "payments_stripe_payment_intent_id_key" ON "public"."payments" USING "btree" ("stripe_payment_intent_id") WHERE ("stripe_payment_intent_id" IS NOT NULL);



CREATE INDEX "project_comments_project_id_idx" ON "public"."project_comments" USING "btree" ("project_id");



CREATE INDEX "project_files_project_id_idx" ON "public"."project_files" USING "btree" ("project_id");



CREATE INDEX "project_messages_proyecto_fecha_idx" ON "public"."project_messages" USING "btree" ("project_id", "created_at");



CREATE INDEX "project_milestones_proyecto_idx" ON "public"."project_milestones" USING "btree" ("project_id", "position", "due_date");



CREATE INDEX "proposal_templates_user_id_idx" ON "public"."proposal_templates" USING "btree" ("user_id");



CREATE INDEX "shadow_income_user_id_idx" ON "public"."shadow_income" USING "btree" ("user_id");



CREATE INDEX "team_users_invited_by_idx" ON "public"."team_users" USING "btree" ("invited_by");



CREATE INDEX "webhooks_enviados_integracion_idx" ON "public"."webhooks_enviados" USING "btree" ("integration_id", "created_at" DESC);



CREATE OR REPLACE TRIGGER "a_jobs_proteger_destacado" BEFORE INSERT OR UPDATE ON "public"."jobs" FOR EACH ROW EXECUTE FUNCTION "public"."jobs_proteger_destacado"();



CREATE OR REPLACE TRIGGER "a_profiles_proteger_columnas_de_pago" BEFORE INSERT OR UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."proteger_columnas_de_pago_del_perfil"();



CREATE OR REPLACE TRIGGER "budgets_webhook_documento" AFTER INSERT ON "public"."budgets" FOR EACH ROW EXECUTE FUNCTION "public"."webhook_documento_nuevo"();



CREATE OR REPLACE TRIGGER "clients_desenlazar_portal" BEFORE INSERT OR UPDATE ON "public"."clients" FOR EACH ROW EXECUTE FUNCTION "public"."clients_desenlazar_portal_si_cambia_email"();



CREATE OR REPLACE TRIGGER "contracts_webhook_documento" AFTER INSERT ON "public"."contracts" FOR EACH ROW EXECUTE FUNCTION "public"."webhook_documento_nuevo"();



CREATE OR REPLACE TRIGGER "invoices_webhook_documento" AFTER INSERT ON "public"."invoices" FOR EACH ROW EXECUTE FUNCTION "public"."webhook_documento_nuevo"();



CREATE OR REPLACE TRIGGER "profiles_creditos_mensuales_ancla" BEFORE INSERT OR UPDATE OF "plan", "subscription_status" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."creditos_mensuales_ajustar_ancla"();



CREATE OR REPLACE TRIGGER "project_messages_sellar_autor_trg" BEFORE INSERT ON "public"."project_messages" FOR EACH ROW EXECUTE FUNCTION "public"."project_messages_sellar_autor"();



CREATE OR REPLACE TRIGGER "project_milestones_fijar_dueno" BEFORE INSERT OR UPDATE OF "project_id", "user_id", "title", "due_date", "status", "position" ON "public"."project_milestones" FOR EACH ROW EXECUTE FUNCTION "public"."hitos_fijar_dueno"();



CREATE OR REPLACE TRIGGER "projects_impedir_cambio_de_dueno" BEFORE UPDATE OF "user_id" ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."impedir_cambio_de_dueno"();



CREATE OR REPLACE TRIGGER "proposals_webhook_documento" AFTER INSERT ON "public"."proposals" FOR EACH ROW EXECUTE FUNCTION "public"."webhook_documento_nuevo"();



CREATE OR REPLACE TRIGGER "tasks_impedir_cambio_de_dueno" BEFORE UPDATE OF "user_id" ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."impedir_cambio_de_dueno"();



CREATE OR REPLACE TRIGGER "tasks_webhook_completada" AFTER INSERT OR UPDATE OF "status" ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."webhook_tarea_completada"();



CREATE OR REPLACE TRIGGER "time_entries_impedir_cambio_de_dueno" BEFORE UPDATE OF "user_id" ON "public"."time_entries" FOR EACH ROW EXECUTE FUNCTION "public"."impedir_cambio_de_dueno"();



CREATE OR REPLACE TRIGGER "time_entries_webhook_horas" AFTER INSERT ON "public"."time_entries" FOR EACH ROW EXECUTE FUNCTION "public"."webhook_horas_registradas"();



CREATE OR REPLACE TRIGGER "trg_businesses_updated_at" BEFORE UPDATE ON "public"."businesses" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_invoice_fiscal_lock" BEFORE DELETE OR UPDATE ON "public"."invoices" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_invoice_fiscal_lock"();



CREATE OR REPLACE TRIGGER "trg_search_jobs_updated_at" BEFORE UPDATE ON "public"."search_jobs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_sync_invoice_paid_status" AFTER INSERT OR DELETE OR UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."sync_invoice_paid_status"();



CREATE OR REPLACE TRIGGER "trg_user_api_keys_updated_at" BEFORE UPDATE ON "public"."user_api_keys" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."ai_usage"
    ADD CONSTRAINT "ai_usage_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_usage"
    ADD CONSTRAINT "ai_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bank_accounts"
    ADD CONSTRAINT "bank_accounts_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "public"."bank_connections"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bank_accounts"
    ADD CONSTRAINT "bank_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bank_connections"
    ADD CONSTRAINT "bank_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bank_transactions"
    ADD CONSTRAINT "bank_transactions_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bank_transactions"
    ADD CONSTRAINT "bank_transactions_matched_invoice_id_fkey" FOREIGN KEY ("matched_invoice_id") REFERENCES "public"."invoices"("id");



ALTER TABLE ONLY "public"."bank_transactions"
    ADD CONSTRAINT "bank_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."budgets"
    ADD CONSTRAINT "budgets_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."business_profile"
    ADD CONSTRAINT "business_profile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."businesses"
    ADD CONSTRAINT "businesses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_portal_user_id_fkey" FOREIGN KEY ("portal_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contract_templates"
    ADD CONSTRAINT "contract_templates_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."digital_presence"
    ADD CONSTRAINT "digital_presence_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."fiscal_records"
    ADD CONSTRAINT "fiscal_records_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id");



ALTER TABLE ONLY "public"."fiscal_records"
    ADD CONSTRAINT "fiscal_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."integrations"
    ADD CONSTRAINT "integrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."interactions"
    ADD CONSTRAINT "interactions_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."interactions"
    ADD CONSTRAINT "interactions_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invitaciones_enviadas"
    ADD CONSTRAINT "invitaciones_enviadas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoice_templates"
    ADD CONSTRAINT "invoice_templates_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_rectifies_invoice_id_fkey" FOREIGN KEY ("rectifies_invoice_id") REFERENCES "public"."invoices"("id");



ALTER TABLE ONLY "public"."job_applications"
    ADD CONSTRAINT "job_applications_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_applications"
    ADD CONSTRAINT "job_applications_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."knowledge_articles"
    ADD CONSTRAINT "knowledge_articles_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."platform_payments"
    ADD CONSTRAINT "platform_payments_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."portal_comments"
    ADD CONSTRAINT "portal_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."portal_files"
    ADD CONSTRAINT "portal_files_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."processed_resend_events"
    ADD CONSTRAINT "processed_resend_events_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_comments"
    ADD CONSTRAINT "project_comments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_files"
    ADD CONSTRAINT "project_files_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_messages"
    ADD CONSTRAINT "project_messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_messages"
    ADD CONSTRAINT "project_messages_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_milestones"
    ADD CONSTRAINT "project_milestones_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_client_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."proposal_templates"
    ADD CONSTRAINT "proposal_templates_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."proposals"
    ADD CONSTRAINT "proposals_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."receipts"
    ADD CONSTRAINT "receipts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."receipts"
    ADD CONSTRAINT "receipts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."receipts"
    ADD CONSTRAINT "receipts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recurring_expenses"
    ADD CONSTRAINT "recurring_expenses_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recurring_invoices"
    ADD CONSTRAINT "recurring_invoices_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recurring_invoices"
    ADD CONSTRAINT "recurring_invoices_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."recurring_invoices"
    ADD CONSTRAINT "recurring_invoices_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."referrals"
    ADD CONSTRAINT "referrals_referred_user_id_fkey" FOREIGN KEY ("referred_user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."referrals"
    ADD CONSTRAINT "referrals_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."referrals"
    ADD CONSTRAINT "referrals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."saved_jobs"
    ADD CONSTRAINT "saved_jobs_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."saved_jobs"
    ADD CONSTRAINT "saved_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."search_history"
    ADD CONSTRAINT "search_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."search_jobs"
    ADD CONSTRAINT "search_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shadow_income"
    ADD CONSTRAINT "shadow_income_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_accepted_user_id_fkey" FOREIGN KEY ("accepted_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_users"
    ADD CONSTRAINT "team_users_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tech_analysis"
    ADD CONSTRAINT "tech_analysis_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."template_purchases"
    ADD CONSTRAINT "template_purchases_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."template_purchases"
    ADD CONSTRAINT "template_purchases_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."time_entries"
    ADD CONSTRAINT "time_entries_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."time_entries"
    ADD CONSTRAINT "time_entries_logged_by_fkey" FOREIGN KEY ("logged_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."time_entries"
    ADD CONSTRAINT "time_entries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_api_keys"
    ADD CONSTRAINT "user_api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_secrets"
    ADD CONSTRAINT "user_secrets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."webhooks_enviados"
    ADD CONSTRAINT "webhooks_enviados_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE CASCADE;



CREATE POLICY "Allow authenticated users to insert their own contracts" ON "public"."contracts" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Owner can delete own team members" ON "public"."team_members" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Owner can manage own team members" ON "public"."team_members" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Owner can update own team members" ON "public"."team_members" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Owner or member can view team membership" ON "public"."team_members" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR (( SELECT "auth"."uid"() AS "uid") = "accepted_user_id")));



CREATE POLICY "Sin acceso de cliente -- solo service_role" ON "public"."processed_resend_events" TO "authenticated", "anon" USING (false);



CREATE POLICY "Sin acceso de cliente -- solo service_role" ON "public"."rate_limit_buckets" TO "authenticated", "anon" USING (false);



CREATE POLICY "Users can delete own api keys" ON "public"."user_api_keys" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can delete own businesses" ON "public"."businesses" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can delete own time entries" ON "public"."time_entries" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can delete their own proposals" ON "public"."proposals" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can insert own api keys" ON "public"."user_api_keys" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can insert own businesses" ON "public"."businesses" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can insert own digital_presence" ON "public"."digital_presence" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "digital_presence"."business_id") AND ("b"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Users can insert own interactions" ON "public"."interactions" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "interactions"."business_id") AND ("b"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Users can insert own search_history" ON "public"."search_history" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can insert own tech_analysis" ON "public"."tech_analysis" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "tech_analysis"."business_id") AND ("b"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Users can insert own time entries" ON "public"."time_entries" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can insert their own proposals" ON "public"."proposals" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can manage their own articles" ON "public"."knowledge_articles" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update own api keys" ON "public"."user_api_keys" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update own businesses" ON "public"."businesses" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update own digital_presence" ON "public"."digital_presence" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "digital_presence"."business_id") AND ("b"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Users can update own time entries" ON "public"."time_entries" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view own ai_usage" ON "public"."ai_usage" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view own businesses" ON "public"."businesses" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view own digital_presence" ON "public"."digital_presence" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "digital_presence"."business_id") AND ("b"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Users can view own interactions" ON "public"."interactions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "interactions"."business_id") AND ("b"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Users can view own search_history" ON "public"."search_history" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view own search_jobs" ON "public"."search_jobs" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view own tech_analysis" ON "public"."tech_analysis" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "tech_analysis"."business_id") AND ("b"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Users can view own time entries" ON "public"."time_entries" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view their own referrals" ON "public"."referrals" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users manage own business profile" ON "public"."business_profile" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Ver empleos" ON "public"."jobs" FOR SELECT USING (true);



ALTER TABLE "public"."ai_usage" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bank_accounts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bank_accounts_owner_all" ON "public"."bank_accounts" TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."bank_connections" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bank_connections_owner_all" ON "public"."bank_connections" TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."bank_transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bank_transactions_owner_all" ON "public"."bank_transactions" TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."budgets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "budgets_delete_own" ON "public"."budgets" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "budgets_insert_own" ON "public"."budgets" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "budgets_select" ON "public"."budgets" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR ("client_id" IN ( SELECT "clients"."id"
   FROM "public"."clients"
  WHERE ("clients"."portal_user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "budgets_update_own" ON "public"."budgets" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "budgets_update_portal_client" ON "public"."budgets" FOR UPDATE TO "authenticated" USING (("client_id" IN ( SELECT "clients"."id"
   FROM "public"."clients"
  WHERE ("clients"."portal_user_id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (("client_id" IN ( SELECT "clients"."id"
   FROM "public"."clients"
  WHERE ("clients"."portal_user_id" = ( SELECT "auth"."uid"() AS "uid")))));



ALTER TABLE "public"."business_profile" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."businesses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clients_delete_own" ON "public"."clients" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "clients_insert_own" ON "public"."clients" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "clients_select" ON "public"."clients" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR ("portal_user_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "clients_update_own" ON "public"."clients" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."contract_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contracts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "contracts_select" ON "public"."contracts" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("client_id" IN ( SELECT "clients"."id"
   FROM "public"."clients"
  WHERE ("clients"."portal_user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "contracts_update" ON "public"."contracts" FOR UPDATE TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("client_id" IN ( SELECT "clients"."id"
   FROM "public"."clients"
  WHERE ("clients"."portal_user_id" = ( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("client_id" IN ( SELECT "clients"."id"
   FROM "public"."clients"
  WHERE ("clients"."portal_user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "delete_own" ON "public"."contract_templates" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "delete_own" ON "public"."contracts" FOR DELETE USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "delete_own" ON "public"."portal_comments" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "delete_own" ON "public"."portal_files" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "delete_own" ON "public"."project_files" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."projects" "p"
  WHERE (("p"."id" = "project_files"."project_id") AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "delete_own" ON "public"."proposal_templates" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "delete_own" ON "public"."team_users" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "invited_by"));



ALTER TABLE "public"."digital_presence" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."expenses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "expenses_owner_all" ON "public"."expenses" TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."fiscal_records" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fiscal_records_owner_insert" ON "public"."fiscal_records" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "fiscal_records_owner_select" ON "public"."fiscal_records" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "hitos_cliente_portal_ver" ON "public"."project_milestones" FOR SELECT TO "authenticated" USING (("project_id" IN ( SELECT "p"."id"
   FROM ("public"."projects" "p"
     JOIN "public"."clients" "c" ON (("c"."id" = "p"."client_id")))
  WHERE ("c"."portal_user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "hitos_dueno_todo" ON "public"."project_milestones" TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "hitos_equipo_gestores_borrar" ON "public"."project_milestones" FOR DELETE TO "authenticated" USING (("public"."rol_en_equipo"("user_id") = ANY (ARRAY['Manager'::"text", 'Admin'::"text"])));



CREATE POLICY "hitos_equipo_gestores_editar" ON "public"."project_milestones" FOR UPDATE TO "authenticated" USING (("public"."rol_en_equipo"("user_id") = ANY (ARRAY['Manager'::"text", 'Admin'::"text"]))) WITH CHECK (("public"."rol_en_equipo"("user_id") = ANY (ARRAY['Manager'::"text", 'Admin'::"text"])));



CREATE POLICY "hitos_equipo_gestores_insertar" ON "public"."project_milestones" FOR INSERT TO "authenticated" WITH CHECK (("public"."rol_en_equipo"("user_id") = ANY (ARRAY['Manager'::"text", 'Admin'::"text"])));



CREATE POLICY "hitos_equipo_ver" ON "public"."project_milestones" FOR SELECT TO "authenticated" USING ("public"."is_active_team_member"("user_id"));



CREATE POLICY "insert_own" ON "public"."contract_templates" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "insert_own" ON "public"."portal_comments" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "insert_own" ON "public"."portal_files" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "insert_own" ON "public"."project_files" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."projects" "p"
  WHERE (("p"."id" = "project_files"."project_id") AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "insert_own" ON "public"."proposal_templates" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "insert_own" ON "public"."team_users" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "invited_by"));



ALTER TABLE "public"."integrations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "integrations_owner_all" ON "public"."integrations" TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."interactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invitaciones_enviadas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invoice_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invoice_templates_delete_own" ON "public"."invoice_templates" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "invoice_templates_insert_own" ON "public"."invoice_templates" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "invoice_templates_select_own" ON "public"."invoice_templates" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "invoice_templates_update_own" ON "public"."invoice_templates" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invoices_delete_own" ON "public"."invoices" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "invoices_insert_own" ON "public"."invoices" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "invoices_select" ON "public"."invoices" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("client_id" IN ( SELECT "clients"."id"
   FROM "public"."clients"
  WHERE ("clients"."portal_user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "invoices_update_own" ON "public"."invoices" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."job_applications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "job_applications_owner_update_status" ON "public"."job_applications" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."jobs"
  WHERE (("jobs"."id" = "job_applications"."job_id") AND ("jobs"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."jobs"
  WHERE (("jobs"."id" = "job_applications"."job_id") AND ("jobs"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "job_applications_pro_can_apply" ON "public"."job_applications" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."subscription_status" = 'active'::"text")))) AND (EXISTS ( SELECT 1
   FROM "public"."jobs"
  WHERE (("jobs"."id" = "job_applications"."job_id") AND ("jobs"."user_id" <> ( SELECT "auth"."uid"() AS "uid"))))) AND (NOT (EXISTS ( SELECT 1
   FROM "public"."job_applications" "ja"
  WHERE (("ja"."job_id" = "job_applications"."job_id") AND ("ja"."applicant_id" = ( SELECT "auth"."uid"() AS "uid"))))))));



CREATE POLICY "job_applications_select" ON "public"."job_applications" FOR SELECT TO "authenticated" USING ((("applicant_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."jobs"
  WHERE (("jobs"."id" = "job_applications"."job_id") AND ("jobs"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "public"."jobs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "jobs_owner_delete" ON "public"."jobs" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "jobs_owner_insert" ON "public"."jobs" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "jobs_owner_update" ON "public"."jobs" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."knowledge_articles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "knowledge_articles_select_team_member" ON "public"."knowledge_articles" FOR SELECT USING ("public"."is_active_team_member"("user_id"));



CREATE POLICY "no_public_access_processed_stripe_events" ON "public"."processed_stripe_events" TO "authenticated", "anon" USING (false);



CREATE POLICY "own_all" ON "public"."project_comments" USING (((( SELECT "auth"."uid"() AS "uid"))::"text" = "user_id")) WITH CHECK (((( SELECT "auth"."uid"() AS "uid"))::"text" = "user_id"));



CREATE POLICY "own_all" ON "public"."shadow_income" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payments_delete_own" ON "public"."payments" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "payments_insert_own" ON "public"."payments" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "payments_select_own" ON "public"."payments" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "payments_update_own" ON "public"."payments" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."platform_payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "platform_payments_select" ON "public"."platform_payments" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("lower"("profiles"."role") = 'admin'::"text"))))));



ALTER TABLE "public"."portal_comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."portal_files" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."processed_resend_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."processed_stripe_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_delete_own" ON "public"."profiles" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "profiles_insert_own" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "profiles_select_own" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



ALTER TABLE "public"."project_comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_files" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "project_messages_delete_owner" ON "public"."project_messages" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."projects" "p"
  WHERE (("p"."id" = "project_messages"."project_id") AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "project_messages_insert" ON "public"."project_messages" FOR INSERT TO "authenticated" WITH CHECK ((("author_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."projects" "p"
  WHERE (("p"."id" = "project_messages"."project_id") AND (("p"."user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_active_team_member"("p"."user_id") OR ("p"."client_id" IN ( SELECT "c"."id"
           FROM "public"."clients" "c"
          WHERE ("c"."portal_user_id" = ( SELECT "auth"."uid"() AS "uid"))))))))));



CREATE POLICY "project_messages_select" ON "public"."project_messages" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."projects" "p"
  WHERE (("p"."id" = "project_messages"."project_id") AND (("p"."user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_active_team_member"("p"."user_id") OR ("p"."client_id" IN ( SELECT "c"."id"
           FROM "public"."clients" "c"
          WHERE ("c"."portal_user_id" = ( SELECT "auth"."uid"() AS "uid")))))))));



ALTER TABLE "public"."project_milestones" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."projects" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "projects_delete_own" ON "public"."projects" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "projects_insert_own" ON "public"."projects" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "projects_select" ON "public"."projects" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR ("client_id" IN ( SELECT "clients"."id"
   FROM "public"."clients"
  WHERE ("clients"."portal_user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "projects_select_team_member" ON "public"."projects" FOR SELECT USING ("public"."is_active_team_member"("user_id"));



CREATE POLICY "projects_update_own" ON "public"."projects" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "projects_update_team_gestores" ON "public"."projects" FOR UPDATE TO "authenticated" USING (("public"."rol_en_equipo"("user_id") = ANY (ARRAY['Manager'::"text", 'Admin'::"text"]))) WITH CHECK (("public"."rol_en_equipo"("user_id") = ANY (ARRAY['Manager'::"text", 'Admin'::"text"])));



ALTER TABLE "public"."proposal_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."proposals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "proposals_select" ON "public"."proposals" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("client_id" IN ( SELECT "clients"."id"
   FROM "public"."clients"
  WHERE ("clients"."portal_user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "proposals_update_owner_or_portal_client" ON "public"."proposals" FOR UPDATE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR ("client_id" IN ( SELECT "clients"."id"
   FROM "public"."clients"
  WHERE ("clients"."portal_user_id" = ( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR ("client_id" IN ( SELECT "clients"."id"
   FROM "public"."clients"
  WHERE ("clients"."portal_user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."rate_limit_buckets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."receipts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "receipts_owner_all" ON "public"."receipts" TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."recurring_expenses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "recurring_expenses_owner_all" ON "public"."recurring_expenses" TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."recurring_invoices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "recurring_invoices_owner_all" ON "public"."recurring_invoices" TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."referrals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."saved_jobs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "saved_jobs_delete_own" ON "public"."saved_jobs" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "saved_jobs_insert_own" ON "public"."saved_jobs" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "saved_jobs_select_own" ON "public"."saved_jobs" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."search_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."search_jobs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "select_own" ON "public"."contract_templates" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "select_own" ON "public"."project_files" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."projects" "p"
  WHERE (("p"."id" = "project_files"."project_id") AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "select_own" ON "public"."proposal_templates" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "select_own" ON "public"."team_users" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "invited_by"));



CREATE POLICY "select_own_purchases" ON "public"."template_purchases" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "buyer_id") OR (( SELECT "auth"."uid"() AS "uid") = "seller_id")));



CREATE POLICY "select_visible" ON "public"."portal_comments" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."projects" "p"
  WHERE (("p"."id" = "portal_comments"."entityid") AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."invoices" "i"
  WHERE (("i"."id" = "portal_comments"."entityid") AND ("i"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."budgets" "b"
  WHERE (("b"."id" = "portal_comments"."entityid") AND ("b"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."contracts" "c"
  WHERE (("c"."id" = "portal_comments"."entityid") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."proposals" "pr"
  WHERE (("pr"."id" = "portal_comments"."entityid") AND ("pr"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "select_visible" ON "public"."portal_files" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."projects" "p"
  WHERE (("p"."id" = "portal_files"."entityid") AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."invoices" "i"
  WHERE (("i"."id" = "portal_files"."entityid") AND ("i"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."budgets" "b"
  WHERE (("b"."id" = "portal_files"."entityid") AND ("b"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."contracts" "c"
  WHERE (("c"."id" = "portal_files"."entityid") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."proposals" "pr"
  WHERE (("pr"."id" = "portal_files"."entityid") AND ("pr"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "public"."shadow_income" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tasks_delete_team_admin" ON "public"."tasks" FOR DELETE TO "authenticated" USING (("public"."rol_en_equipo"("user_id") = 'Admin'::"text"));



CREATE POLICY "tasks_insert_team_member" ON "public"."tasks" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_team_member"("user_id"));



CREATE POLICY "tasks_owner_all" ON "public"."tasks" TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "tasks_select_team_member" ON "public"."tasks" FOR SELECT TO "authenticated" USING ("public"."is_active_team_member"("user_id"));



CREATE POLICY "tasks_update_team_member" ON "public"."tasks" FOR UPDATE TO "authenticated" USING ("public"."is_active_team_member"("user_id")) WITH CHECK ("public"."is_active_team_member"("user_id"));



ALTER TABLE "public"."team_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."team_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tech_analysis" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."template_purchases" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."time_entries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "time_entries_insert_team_member" ON "public"."time_entries" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "logged_by") AND "public"."is_active_team_member"("user_id")));



CREATE POLICY "time_entries_select_logged_by_team_member" ON "public"."time_entries" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "logged_by"));



CREATE POLICY "time_entries_select_team_gestores" ON "public"."time_entries" FOR SELECT TO "authenticated" USING (("public"."rol_en_equipo"("user_id") = ANY (ARRAY['Manager'::"text", 'Admin'::"text"])));



CREATE POLICY "update_own" ON "public"."contract_templates" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "update_own" ON "public"."project_files" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."projects" "p"
  WHERE (("p"."id" = "project_files"."project_id") AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."projects" "p"
  WHERE (("p"."id" = "project_files"."project_id") AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "update_own" ON "public"."proposal_templates" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "update_own" ON "public"."team_users" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "invited_by")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "invited_by"));



ALTER TABLE "public"."user_api_keys" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_secrets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_secrets_owner_select" ON "public"."user_secrets" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."webhooks_enviados" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "webhooks_enviados_select_own" ON "public"."webhooks_enviados" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."contracts";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."project_messages";









GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";











































































































































































REVOKE ALL ON FUNCTION "public"."check_and_increment_rate_limit"("p_user_id" "uuid", "p_action" "text", "p_max_calls" integer, "p_window_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_and_increment_rate_limit"("p_user_id" "uuid", "p_action" "text", "p_max_calls" integer, "p_window_seconds" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."clients_desenlazar_portal_si_cambia_email"() TO "anon";
GRANT ALL ON FUNCTION "public"."clients_desenlazar_portal_si_cambia_email"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."clients_desenlazar_portal_si_cambia_email"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."consume_ai_credits"("p_user_id" "uuid", "p_cost" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_ai_credits"("p_user_id" "uuid", "p_cost" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."consume_ai_credits_rpc"("p_amount" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_ai_credits_rpc"("p_amount" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."consume_credits_atomic"("p_amount" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_credits_atomic"("p_amount" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."consume_credits_atomic"("user_id" "uuid", "amount_to_consume" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_credits_atomic"("user_id" "uuid", "amount_to_consume" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."consume_credits_atomic"("user_id" "uuid", "amount_to_consume" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."creditos_mensuales_ajustar_ancla"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."creditos_mensuales_ajustar_ancla"() TO "service_role";



GRANT ALL ON FUNCTION "public"."creditos_mensuales_del_plan"("p_plan" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."creditos_mensuales_del_plan"("p_plan" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."creditos_mensuales_del_plan"("p_plan" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cuenta_de_creditos_ia"("p_usuario" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cuenta_de_creditos_ia"("p_usuario" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."enforce_invoice_fiscal_lock"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_invoice_fiscal_lock"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."enviar_webhooks"("p_dueno" "uuid", "p_evento" "text", "p_texto" "text", "p_datos" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enviar_webhooks"("p_dueno" "uuid", "p_evento" "text", "p_texto" "text", "p_datos" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."enviar_webhooks_sin_fallar"("p_dueno" "uuid", "p_evento" "text", "p_texto" "text", "p_datos" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enviar_webhooks_sin_fallar"("p_dueno" "uuid", "p_evento" "text", "p_texto" "text", "p_datos" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."exigir_nif_emisor"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."exigir_nif_emisor"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."fiscal_records" TO "anon";
GRANT ALL ON TABLE "public"."fiscal_records" TO "authenticated";
GRANT ALL ON TABLE "public"."fiscal_records" TO "service_role";



REVOKE ALL ON FUNCTION "public"."generate_fiscal_cancellation"("p_invoice_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."generate_fiscal_cancellation"("p_invoice_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_fiscal_cancellation"("p_invoice_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."generate_fiscal_record"("p_invoice_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."generate_fiscal_record"("p_invoice_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_fiscal_record"("p_invoice_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."generate_invoice_number"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."generate_invoice_number"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_invoice_number"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."generate_receipt_number"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."generate_receipt_number"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_receipt_number"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."hitos_fijar_dueno"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."hitos_fijar_dueno"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."impedir_cambio_de_dueno"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."impedir_cambio_de_dueno"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."increment_credits"("user_id" "uuid", "amount" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."increment_credits"("user_id" "uuid", "amount" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."increment_email_click"("p_business_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."increment_email_click"("p_business_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."increment_email_open"("p_business_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."increment_email_open"("p_business_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."jobs_proteger_destacado"() TO "anon";
GRANT ALL ON FUNCTION "public"."jobs_proteger_destacado"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."jobs_proteger_destacado"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_active_team_member"("p_owner_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_active_team_member"("p_owner_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_active_team_member"("p_owner_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."link_portal_client"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."link_portal_client"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."link_portal_client"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."link_team_membership"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."link_team_membership"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."link_team_membership"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."probar_webhook"("p_integration" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."probar_webhook"("p_integration" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."probar_webhook"("p_integration" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."project_messages_sellar_autor"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."proteger_columnas_de_pago_del_perfil"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."proteger_columnas_de_pago_del_perfil"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."recargar_creditos_mensuales"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."recargar_creditos_mensuales"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."resultado_prueba_webhook"("p_request_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resultado_prueba_webhook"("p_request_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."resultado_prueba_webhook"("p_request_id" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."rol_en_equipo"("p_dueno" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rol_en_equipo"("p_dueno" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rol_en_equipo"("p_dueno" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."saldo_creditos_ia"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."saldo_creditos_ia"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."saldo_creditos_ia"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sumar_creditos"("p_user_id" "uuid", "p_ai" integer, "p_firma" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sumar_creditos"("p_user_id" "uuid", "p_ai" integer, "p_firma" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_invoice_paid_status"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_invoice_paid_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."url_de_webhook_valida"("p_url" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."url_de_webhook_valida"("p_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."url_de_webhook_valida"("p_url" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."verify_fiscal_chain"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."verify_fiscal_chain"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_fiscal_chain"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."webhook_documento_nuevo"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."webhook_documento_nuevo"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."webhook_horas_registradas"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."webhook_horas_registradas"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."webhook_tarea_completada"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."webhook_tarea_completada"() TO "service_role";
























GRANT ALL ON TABLE "public"."ai_usage" TO "anon";
GRANT ALL ON TABLE "public"."ai_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_usage" TO "service_role";



GRANT ALL ON TABLE "public"."bank_accounts" TO "anon";
GRANT ALL ON TABLE "public"."bank_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."bank_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."bank_connections" TO "anon";
GRANT ALL ON TABLE "public"."bank_connections" TO "authenticated";
GRANT ALL ON TABLE "public"."bank_connections" TO "service_role";



GRANT ALL ON TABLE "public"."bank_transactions" TO "anon";
GRANT ALL ON TABLE "public"."bank_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."bank_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."budgets" TO "anon";
GRANT ALL ON TABLE "public"."budgets" TO "authenticated";
GRANT ALL ON TABLE "public"."budgets" TO "service_role";



GRANT ALL ON TABLE "public"."business_profile" TO "anon";
GRANT ALL ON TABLE "public"."business_profile" TO "authenticated";
GRANT ALL ON TABLE "public"."business_profile" TO "service_role";



GRANT ALL ON TABLE "public"."businesses" TO "anon";
GRANT ALL ON TABLE "public"."businesses" TO "authenticated";
GRANT ALL ON TABLE "public"."businesses" TO "service_role";



GRANT ALL ON TABLE "public"."clients" TO "anon";
GRANT ALL ON TABLE "public"."clients" TO "authenticated";
GRANT ALL ON TABLE "public"."clients" TO "service_role";



GRANT ALL ON TABLE "public"."contract_templates" TO "anon";
GRANT ALL ON TABLE "public"."contract_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."contract_templates" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."contract_templates_marketplace" TO "service_role";
GRANT SELECT ON TABLE "public"."contract_templates_marketplace" TO "authenticated";



GRANT ALL ON TABLE "public"."contracts" TO "anon";
GRANT ALL ON TABLE "public"."contracts" TO "authenticated";
GRANT ALL ON TABLE "public"."contracts" TO "service_role";



GRANT ALL ON TABLE "public"."digital_presence" TO "anon";
GRANT ALL ON TABLE "public"."digital_presence" TO "authenticated";
GRANT ALL ON TABLE "public"."digital_presence" TO "service_role";



GRANT ALL ON TABLE "public"."expenses" TO "anon";
GRANT ALL ON TABLE "public"."expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."expenses" TO "service_role";



GRANT ALL ON TABLE "public"."integrations" TO "anon";
GRANT ALL ON TABLE "public"."integrations" TO "authenticated";
GRANT ALL ON TABLE "public"."integrations" TO "service_role";



GRANT ALL ON TABLE "public"."interactions" TO "anon";
GRANT ALL ON TABLE "public"."interactions" TO "authenticated";
GRANT ALL ON TABLE "public"."interactions" TO "service_role";



GRANT ALL ON TABLE "public"."invitaciones_enviadas" TO "service_role";



GRANT ALL ON SEQUENCE "public"."invitaciones_enviadas_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."invitaciones_enviadas_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."invitaciones_enviadas_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."invoice_templates" TO "anon";
GRANT ALL ON TABLE "public"."invoice_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."invoice_templates" TO "service_role";



GRANT ALL ON TABLE "public"."invoice_templates_marketplace" TO "service_role";
GRANT SELECT ON TABLE "public"."invoice_templates_marketplace" TO "authenticated";



GRANT ALL ON TABLE "public"."invoices" TO "anon";
GRANT ALL ON TABLE "public"."invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."invoices" TO "service_role";



GRANT ALL ON TABLE "public"."job_applications" TO "anon";
GRANT ALL ON TABLE "public"."job_applications" TO "authenticated";
GRANT ALL ON TABLE "public"."job_applications" TO "service_role";



GRANT ALL ON TABLE "public"."jobs" TO "anon";
GRANT ALL ON TABLE "public"."jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."jobs" TO "service_role";



GRANT ALL ON TABLE "public"."knowledge_articles" TO "anon";
GRANT ALL ON TABLE "public"."knowledge_articles" TO "authenticated";
GRANT ALL ON TABLE "public"."knowledge_articles" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."platform_payments" TO "anon";
GRANT ALL ON TABLE "public"."platform_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_payments" TO "service_role";



GRANT ALL ON TABLE "public"."portal_comments" TO "anon";
GRANT ALL ON TABLE "public"."portal_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."portal_comments" TO "service_role";



GRANT ALL ON TABLE "public"."portal_files" TO "anon";
GRANT ALL ON TABLE "public"."portal_files" TO "authenticated";
GRANT ALL ON TABLE "public"."portal_files" TO "service_role";



GRANT ALL ON TABLE "public"."processed_resend_events" TO "anon";
GRANT ALL ON TABLE "public"."processed_resend_events" TO "authenticated";
GRANT ALL ON TABLE "public"."processed_resend_events" TO "service_role";



GRANT ALL ON TABLE "public"."processed_stripe_events" TO "anon";
GRANT ALL ON TABLE "public"."processed_stripe_events" TO "authenticated";
GRANT ALL ON TABLE "public"."processed_stripe_events" TO "service_role";



GRANT ALL ON TABLE "public"."project_comments" TO "anon";
GRANT ALL ON TABLE "public"."project_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."project_comments" TO "service_role";



GRANT ALL ON TABLE "public"."project_files" TO "anon";
GRANT ALL ON TABLE "public"."project_files" TO "authenticated";
GRANT ALL ON TABLE "public"."project_files" TO "service_role";



GRANT ALL ON TABLE "public"."project_messages" TO "anon";
GRANT ALL ON TABLE "public"."project_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."project_messages" TO "service_role";



GRANT ALL ON TABLE "public"."project_milestones" TO "authenticated";
GRANT ALL ON TABLE "public"."project_milestones" TO "service_role";



GRANT ALL ON TABLE "public"."projects" TO "anon";
GRANT ALL ON TABLE "public"."projects" TO "authenticated";
GRANT ALL ON TABLE "public"."projects" TO "service_role";



GRANT ALL ON TABLE "public"."proposal_templates" TO "anon";
GRANT ALL ON TABLE "public"."proposal_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."proposal_templates" TO "service_role";



GRANT ALL ON TABLE "public"."proposal_templates_marketplace" TO "service_role";
GRANT SELECT ON TABLE "public"."proposal_templates_marketplace" TO "authenticated";



GRANT ALL ON TABLE "public"."proposals" TO "anon";
GRANT ALL ON TABLE "public"."proposals" TO "authenticated";
GRANT ALL ON TABLE "public"."proposals" TO "service_role";



GRANT ALL ON TABLE "public"."rate_limit_buckets" TO "anon";
GRANT ALL ON TABLE "public"."rate_limit_buckets" TO "authenticated";
GRANT ALL ON TABLE "public"."rate_limit_buckets" TO "service_role";



GRANT ALL ON TABLE "public"."receipts" TO "anon";
GRANT ALL ON TABLE "public"."receipts" TO "authenticated";
GRANT ALL ON TABLE "public"."receipts" TO "service_role";



GRANT ALL ON TABLE "public"."recurring_expenses" TO "anon";
GRANT ALL ON TABLE "public"."recurring_expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."recurring_expenses" TO "service_role";



GRANT ALL ON TABLE "public"."recurring_invoices" TO "anon";
GRANT ALL ON TABLE "public"."recurring_invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."recurring_invoices" TO "service_role";



GRANT ALL ON TABLE "public"."referrals" TO "anon";
GRANT ALL ON TABLE "public"."referrals" TO "authenticated";
GRANT ALL ON TABLE "public"."referrals" TO "service_role";



GRANT ALL ON TABLE "public"."saved_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."saved_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."search_history" TO "anon";
GRANT ALL ON TABLE "public"."search_history" TO "authenticated";
GRANT ALL ON TABLE "public"."search_history" TO "service_role";



GRANT ALL ON TABLE "public"."search_jobs" TO "anon";
GRANT ALL ON TABLE "public"."search_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."search_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."shadow_income" TO "anon";
GRANT ALL ON TABLE "public"."shadow_income" TO "authenticated";
GRANT ALL ON TABLE "public"."shadow_income" TO "service_role";



GRANT ALL ON TABLE "public"."tasks" TO "anon";
GRANT ALL ON TABLE "public"."tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."tasks" TO "service_role";



GRANT ALL ON TABLE "public"."team_members" TO "anon";
GRANT ALL ON TABLE "public"."team_members" TO "authenticated";
GRANT ALL ON TABLE "public"."team_members" TO "service_role";



GRANT ALL ON TABLE "public"."team_users" TO "anon";
GRANT ALL ON TABLE "public"."team_users" TO "authenticated";
GRANT ALL ON TABLE "public"."team_users" TO "service_role";



GRANT ALL ON TABLE "public"."tech_analysis" TO "anon";
GRANT ALL ON TABLE "public"."tech_analysis" TO "authenticated";
GRANT ALL ON TABLE "public"."tech_analysis" TO "service_role";



GRANT ALL ON TABLE "public"."template_purchases" TO "anon";
GRANT ALL ON TABLE "public"."template_purchases" TO "authenticated";
GRANT ALL ON TABLE "public"."template_purchases" TO "service_role";



GRANT ALL ON TABLE "public"."time_entries" TO "anon";
GRANT ALL ON TABLE "public"."time_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."time_entries" TO "service_role";



GRANT ALL ON TABLE "public"."user_api_keys" TO "anon";
GRANT ALL ON TABLE "public"."user_api_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."user_api_keys" TO "service_role";



GRANT ALL ON TABLE "public"."user_secrets" TO "anon";
GRANT ALL ON TABLE "public"."user_secrets" TO "authenticated";
GRANT ALL ON TABLE "public"."user_secrets" TO "service_role";



GRANT ALL ON TABLE "public"."view_public_jobs" TO "anon";
GRANT ALL ON TABLE "public"."view_public_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."view_public_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."webhooks_enviados" TO "anon";
GRANT ALL ON TABLE "public"."webhooks_enviados" TO "authenticated";
GRANT ALL ON TABLE "public"."webhooks_enviados" TO "service_role";



GRANT ALL ON SEQUENCE "public"."webhooks_enviados_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."webhooks_enviados_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."webhooks_enviados_id_seq" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































