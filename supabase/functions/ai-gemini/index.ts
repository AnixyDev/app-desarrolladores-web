import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/* Llama a la API REST de Gemini directamente (sin SDK) */
async function callGemini(apiKey: string, prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${err}`);
  }

  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty Gemini response");
  return text;
}

serve(async (req) => {
  /* ── Preflight CORS ── */
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("Missing GEMINI_API_KEY environment variable");
    }

    /* ── Autenticación Supabase ── */
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization") ?? "" },
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, payload } = await req.json();

    /* ══════════════════════════════════════
       ROUTER DE ACCIONES
    ══════════════════════════════════════ */

    switch (action) {

      /* ── Chat genérico ── */
      case "getAIResponse": {
        const { prompt } = payload;
        const text = await callGemini(GEMINI_API_KEY, prompt);
        return new Response(JSON.stringify({ text }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      /* ── Partes de tiempo ── */
      case "generateTimeEntryDescription": {
        const { projectName, projectDesc, keywords } = payload;
        const text = await callGemini(
          GEMINI_API_KEY,
          `Redacta una descripción profesional de una sola frase para un parte de trabajo.\n\nProyecto: ${projectName}\nContexto: ${projectDesc}\nTareas realizadas: ${keywords}`
        );
        return new Response(JSON.stringify({ text }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      /* ── Presupuestos / documentos ── */
      case "generateItemsForDocument": {
        const { prompt, hourlyRate } = payload;
        const text = await callGemini(
          GEMINI_API_KEY,
          `Genera un concepto de factura profesional y claro.\n\nContexto:\n${prompt}\n\nTarifa base: ${hourlyRate / 100} €/hora`
        );
        return new Response(
          JSON.stringify([
            { description: text, quantity: 1, price_cents: hourlyRate },
          ]),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      /* ── Previsión financiera ── */
      case "generateFinancialForecast": {
        const { data } = payload;
        const text = await callGemini(
          GEMINI_API_KEY,
          `Analiza los siguientes datos financieros y genera:\n- Un resumen claro\n- Riesgos principales\n- Sugerencias prácticas\n\nDatos:\n${JSON.stringify(data)}`
        );
        return new Response(
          JSON.stringify({ summary: text, potentialRisks: [], suggestions: [] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      /* ── Rentabilidad ── */
      case "analyzeProfitability": {
        const { data } = payload;
        const text = await callGemini(
          GEMINI_API_KEY,
          `Analiza la rentabilidad del siguiente conjunto de datos y genera un informe claro para un freelance:\n\n${JSON.stringify(data)}`
        );
        return new Response(JSON.stringify({ summary: text }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      /* ── Propuestas comerciales ── */
      case "generateProposalText": {
        const { title, context, profileSummary } = payload;
        const text = await callGemini(
          GEMINI_API_KEY,
          `Redacta una propuesta comercial profesional y persuasiva.\n\nTítulo:\n${title}\n\nRequisitos del cliente:\n${context}\n\nPerfil del profesional:\n${profileSummary}`
        );
        return new Response(JSON.stringify({ text }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      /* ── Candidatos ── */
      case "summarizeApplicant": {
        const { jobDesc, applicantProfile, proposal } = payload;
        const text = await callGemini(
          GEMINI_API_KEY,
          `Evalúa este candidato y genera:\n- Un resumen\n- Fortalezas\n- Riesgos\n\nOferta:\n${jobDesc}\n\nPerfil:\n${applicantProfile}\n\nPropuesta:\n${proposal}`
        );
        return new Response(JSON.stringify({ summary: text }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ error: "Unknown action" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String((e as Error)?.message ?? e) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
