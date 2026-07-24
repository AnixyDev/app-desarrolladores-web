import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // FIX: esta función no comprobaba autenticación en absoluto — cualquiera
    // con la anon key (pública, embebida en el frontend) podía llamarla sin
    // límite y consumir la cuota de Gemini de la cuenta gratis. NOTA: nada
    // en el frontend llama ya a esta función (el flujo real pasa por
    // ai-gemini → action "generateFinancialForecast"); esto es solo una red
    // de seguridad. Se recomienda borrar esta función desde el dashboard de
    // Supabase (Edge Functions) ya que está huérfana.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data } = await req.json();

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

    const prompt = `
Eres un analista financiero senior.
Devuelve SIEMPRE el resultado en JSON con este formato:

{
  "summary": string,
  "potentialRisks": string[],
  "suggestions": string[]
}

Datos:
${JSON.stringify(data)}
`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }]
            }
          ]
        })
      }
    );

    const json = await res.json();

    const text =
      json?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error("Empty Gemini response");
    }

    const parsed = JSON.parse(text);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 400, headers: corsHeaders }
    );
  }
});