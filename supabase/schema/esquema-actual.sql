


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
BEGIN
  RETURN QUERY
  UPDATE public.profiles p
  SET ai_credits = p.ai_credits - p_amount
  WHERE p.id = auth.uid()
    AND p.ai_credits >= p_amount
  RETURNING p.id, p.ai_credits;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Créditos insuficientes' USING ERRCODE = 'P0001';
  END IF;
END;
$$;


ALTER FUNCTION "public"."consume_credits_atomic"("p_amount" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."consume_credits_atomic"("user_id" "uuid", "amount_to_consume" integer) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No autorizado: user_id no coincide con el usuario autenticado';
  END IF;

  UPDATE public.profiles p
  SET ai_credits = p.ai_credits - amount_to_consume
  WHERE p.id = user_id
    AND p.ai_credits >= amount_to_consume;

  RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."consume_credits_atomic"("user_id" "uuid", "amount_to_consume" integer) OWNER TO "postgres";


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
begin
  v_email := lower(auth.jwt() ->> 'email');
  if v_email is null then
    return;
  end if;

  select id, name, user_id into v_client from public.clients where portal_user_id = auth.uid();
  if found then
    client_id := v_client.id;
    client_name := v_client.name;
    select p.business_name, p.full_name, p.portal_logo_url, p.pdf_color
      into owner_business_name, owner_full_name, owner_logo_url, owner_brand_color
      from public.profiles p where p.id = v_client.user_id;
    return next;
    return;
  end if;

  select id, name, user_id into v_client from public.clients
    where lower(email) = v_email and portal_user_id is null
    limit 1;

  if found then
    update public.clients set portal_user_id = auth.uid() where id = v_client.id;
    client_id := v_client.id;
    client_name := v_client.name;
    select p.business_name, p.full_name, p.portal_logo_url, p.pdf_color
      into owner_business_name, owner_full_name, owner_logo_url, owner_brand_color
      from public.profiles p where p.id = v_client.user_id;
    return next;
  end if;

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
    "address" "text"
);


ALTER TABLE "public"."clients" OWNER TO "postgres";


COMMENT ON COLUMN "public"."clients"."tax_id" IS 'NIF/CIF del cliente';



COMMENT ON COLUMN "public"."clients"."address" IS 'Dirección postal del cliente';



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
    CONSTRAINT "profiles_veri_factu_modality_check" CHECK (("veri_factu_modality" = ANY (ARRAY['verifactu'::"text", 'no_verifactu'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."invoice_reply_to_email" IS 'Email de "responder a" para documentos enviados (facturas/propuestas/presupuestos). Si es NULL, se usa profiles.email.';



COMMENT ON COLUMN "public"."profiles"."profitability_alerts_enabled" IS 'Alertas semanales por email cuando un proyecto activo cae por debajo de la tarifa objetivo (hourly_rate_cents). Función Pro/Teams. Item 6 del roadmap de monetización.';



COMMENT ON COLUMN "public"."profiles"."signature_credits" IS 'Créditos de firma electrónica eIDAS comprados aparte de la suscripción (mismo patrón que ai_credits). Ítem 5 del roadmap de monetización.';



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
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
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
    "enablebanking_configured_at" timestamp with time zone
);


ALTER TABLE "public"."user_secrets" OWNER TO "postgres";


COMMENT ON COLUMN "public"."user_secrets"."gocardless_secret_id_encrypted" IS 'OBSOLETO: GoCardless cerró altas nuevas en julio 2025. Usar enablebanking_* en su lugar.';



CREATE OR REPLACE VIEW "public"."view_public_jobs" WITH ("security_invoker"='on') AS
 SELECT "id",
    "titulo",
    "descripcioncorta",
    "presupuesto",
    "fechapublicacion",
    "user_id"
   FROM "public"."jobs";


ALTER VIEW "public"."view_public_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."webhook_configs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "url" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."webhook_configs" OWNER TO "postgres";


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



ALTER TABLE ONLY "public"."integrations"
    ADD CONSTRAINT "integrations_pkey" PRIMARY KEY ("id");



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



ALTER TABLE ONLY "public"."webhook_configs"
    ADD CONSTRAINT "webhook_configs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."webhook_configs"
    ADD CONSTRAINT "webhook_configs_user_id_key" UNIQUE ("user_id");



CREATE INDEX "bank_transactions_matched_invoice_idx" ON "public"."bank_transactions" USING "btree" ("matched_invoice_id");



CREATE INDEX "bank_transactions_user_status_idx" ON "public"."bank_transactions" USING "btree" ("user_id", "match_status");



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



CREATE INDEX "proposal_templates_user_id_idx" ON "public"."proposal_templates" USING "btree" ("user_id");



CREATE INDEX "shadow_income_user_id_idx" ON "public"."shadow_income" USING "btree" ("user_id");



CREATE INDEX "team_users_invited_by_idx" ON "public"."team_users" USING "btree" ("invited_by");



CREATE OR REPLACE TRIGGER "trg_businesses_updated_at" BEFORE UPDATE ON "public"."businesses" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_invoice_fiscal_lock" BEFORE DELETE OR UPDATE ON "public"."invoices" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_invoice_fiscal_lock"();



CREATE OR REPLACE TRIGGER "trg_search_jobs_updated_at" BEFORE UPDATE ON "public"."search_jobs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_sync_invoice_paid_status" AFTER INSERT OR DELETE OR UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."sync_invoice_paid_status"();



CREATE OR REPLACE TRIGGER "trg_user_api_keys_updated_at" BEFORE UPDATE ON "public"."user_api_keys" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_webhook_configs_updated_at" BEFORE UPDATE ON "public"."webhook_configs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



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



ALTER TABLE ONLY "public"."webhook_configs"
    ADD CONSTRAINT "webhook_configs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



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



CREATE POLICY "Users can insert their own payments" ON "public"."platform_payments" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can insert their own proposals" ON "public"."proposals" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can manage own webhook config" ON "public"."webhook_configs" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



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


ALTER TABLE "public"."projects" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "projects_delete_own" ON "public"."projects" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "projects_insert_own" ON "public"."projects" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "projects_select" ON "public"."projects" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR ("client_id" IN ( SELECT "clients"."id"
   FROM "public"."clients"
  WHERE ("clients"."portal_user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "projects_select_team_member" ON "public"."projects" FOR SELECT USING ("public"."is_active_team_member"("user_id"));



CREATE POLICY "projects_update_own" ON "public"."projects" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



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



ALTER TABLE "public"."webhook_configs" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."contracts";









GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";











































































































































































REVOKE ALL ON FUNCTION "public"."check_and_increment_rate_limit"("p_user_id" "uuid", "p_action" "text", "p_max_calls" integer, "p_window_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_and_increment_rate_limit"("p_user_id" "uuid", "p_action" "text", "p_max_calls" integer, "p_window_seconds" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."consume_ai_credits"("p_user_id" "uuid", "p_cost" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_ai_credits"("p_user_id" "uuid", "p_cost" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."consume_ai_credits_rpc"("p_amount" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_ai_credits_rpc"("p_amount" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."consume_credits_atomic"("p_amount" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_credits_atomic"("p_amount" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."consume_credits_atomic"("user_id" "uuid", "amount_to_consume" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_credits_atomic"("user_id" "uuid", "amount_to_consume" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."consume_credits_atomic"("user_id" "uuid", "amount_to_consume" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."enforce_invoice_fiscal_lock"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_invoice_fiscal_lock"() TO "service_role";



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



REVOKE ALL ON FUNCTION "public"."increment_credits"("user_id" "uuid", "amount" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."increment_credits"("user_id" "uuid", "amount" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."increment_email_click"("p_business_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."increment_email_click"("p_business_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."increment_email_open"("p_business_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."increment_email_open"("p_business_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_active_team_member"("p_owner_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_active_team_member"("p_owner_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_active_team_member"("p_owner_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."link_portal_client"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."link_portal_client"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."link_portal_client"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."link_team_membership"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."link_team_membership"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."link_team_membership"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sumar_creditos"("p_user_id" "uuid", "p_ai" integer, "p_firma" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sumar_creditos"("p_user_id" "uuid", "p_ai" integer, "p_firma" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_invoice_paid_status"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_invoice_paid_status"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."verify_fiscal_chain"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."verify_fiscal_chain"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_fiscal_chain"("p_user_id" "uuid") TO "service_role";
























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



GRANT ALL ON TABLE "public"."webhook_configs" TO "anon";
GRANT ALL ON TABLE "public"."webhook_configs" TO "authenticated";
GRANT ALL ON TABLE "public"."webhook_configs" TO "service_role";









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



































