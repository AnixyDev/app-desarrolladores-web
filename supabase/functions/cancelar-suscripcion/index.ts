// Cancelar la suscripción eligiendo cuándo: al final del periodo pagado o en
// el momento. También consulta el estado y reanuda una cancelación programada.
//
// POST { accion: 'estado' | 'al_final' | 'ahora' | 'reanudar' }
//
// El usuario sale SIEMPRE de la sesión (JWT verificado por Supabase y
// getUser); el cliente de Stripe, de su perfil. El navegador no elige qué
// suscripción se toca. La lógica está en _shared/cancelacion.ts (con pruebas).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@13.10.0?target=deno";
import {
  ACCIONES,
  type AccionCancelacion,
  type SuscripcionStripe,
  estadoSuscripcion,
  operacionesPara,
} from "../_shared/cancelacion.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  try {
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    if (!STRIPE_SECRET_KEY) throw new Error("Missing STRIPE_SECRET_KEY");
    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "Inicia sesión para continuar." }, 401);

    const body = await req.json().catch(() => ({}));
    const accion = body?.accion as AccionCancelacion;
    if (!ACCIONES.includes(accion)) return json({ error: "Acción no válida." }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: profile, error: errPerfil } = await admin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();
    if (errPerfil) throw errPerfil;

    const cargar = async (): Promise<SuscripcionStripe[]> => {
      if (!profile?.stripe_customer_id) return [];
      const r = await stripe.subscriptions.list({ customer: profile.stripe_customer_id, status: "all", limit: 20 });
      return r.data as unknown as SuscripcionStripe[];
    };

    let subs = await cargar();
    if (accion === "estado") return json(estadoSuscripcion(subs));

    const operaciones = operacionesPara(accion, subs);
    if (operaciones.length === 0) {
      const estado = estadoSuscripcion(subs);
      if (!estado.tieneSuscripcion) return json({ error: "No tienes ninguna suscripción activa." }, 404);
      return json(estado); // ya estaba como se pide
    }

    for (const op of operaciones) {
      if (op.tipo === "actualizar") {
        await stripe.subscriptions.update(op.id, { cancel_at_period_end: op.cancel_at_period_end });
      } else {
        // Sin prorrateo ni devolución de la parte no usada (Términos, apartado 5).
        await stripe.subscriptions.cancel(op.id, { prorate: false, invoice_now: false });
      }
    }

    if (accion === "ahora") {
      // El webhook (customer.subscription.deleted) hace lo mismo; se adelanta
      // aquí para que la app lo muestre sin esperar. No se borra ningún dato.
      const { error } = await admin
        .from("profiles")
        .update({ plan: "Free", subscription_status: "canceled" })
        .eq("id", user.id);
      if (error) console.error("cancelar-suscripcion: perfil sin actualizar (lo hará el webhook):", error.message);
    }

    console.log(`cancelar-suscripcion: ${accion} (${operaciones.length} suscripción/es)`);
    subs = await cargar();
    return json(estadoSuscripcion(subs));
  } catch (error) {
    console.error("cancelar-suscripcion:", error instanceof Error ? error.message : error);
    return json({ error: "No se pudo completar la operación. Inténtalo de nuevo o escribe a soporte@devfreelancer.app." }, 500);
  }
});
