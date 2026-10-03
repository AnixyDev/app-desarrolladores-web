// Contador público del Plan Fundadores: cuántas plazas quedan y si la oferta
// sigue abierta. Lo leen /pricing (sin sesión) y /billing.
//
// El número sale siempre de Stripe (ver _shared/fundadores.ts). Para no llamar
// a Stripe en cada visita, el resultado se guarda 60 segundos en memoria de la
// función. Es solo para mostrarlo: checkout-fundadores vuelve a contar en el
// momento, sin usar esta copia, antes de dejar pagar a nadie.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@13.10.0?target=deno";
import { estadoFundadores } from "../_shared/fundadores.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const VIDA_CACHE_MS = 60_000;
let cache: { hasta: number; cuerpo: Record<string, unknown> } | null = null;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=60",
    },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (cache && cache.hasta > Date.now()) {
    return json(cache.cuerpo);
  }

  try {
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    if (!STRIPE_SECRET_KEY) throw new Error("Missing STRIPE_SECRET_KEY");
    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });

    const estado = await estadoFundadores(stripe);
    // Solo lo que necesita la web: nada de ids de pagos ni de clientes.
    const cuerpo = {
      total: estado.total,
      restantes: estado.restantes,
      disponible: estado.disponible,
      cierre: estado.cierre,
    };
    cache = { hasta: Date.now() + VIDA_CACHE_MS, cuerpo };
    return json(cuerpo);
  } catch (error) {
    console.error("[plazas-fundadores] no se pudo consultar Stripe:", error);
    // Sin dato real no se enseña ningún número: la web oculta la oferta.
    return json({ disponible: false, error: "No se pudo consultar las plazas." }, 503);
  }
});
