import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.17.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("Missing GEMINI_API_KEY");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: {
            Authorization: req.headers.get("Authorization")!,
          },
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { action, payload } = await req.json();

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
    });

    const generate = async (prompt: string) => {
      const result = await model.generateContent(prompt);
      return result.response.text();
    };

    /* ======================
       ROUTER DE ACCIONES
    ====================== */

    let text = "";

    switch (action) {

      // ------------------------------------------------
      // Chat genérico (AIAssistantPage)
      // ------------------------------------------------
      case "getAIResponse": {
        const { prompt } = payload;

        text = await generate(prompt);
        break;
      }

      // ------------------------------------------------
      // Partes de tiempo
      // ------------------------------------------------
      case "generateTimeEntryDescription": {
        const { projectName, projectDesc, keywords } = payload;

        text = await generate(
          `Redacta una descripción profesional de una sola frase para un parte de trabajo.

Proyecto: ${projectName}
Contexto: ${projectDesc}
Tareas realizadas: ${keywords}`
        );

        break;
      }

      // ------------------------------------------------
      // Presupuestos / documentos
      // ------------------------------------------------
      case "generateItemsForDocument": {
        const { prompt, hourlyRate } = payload;

        text = await generate(
          `Genera un concepto de factura profesional y claro.

Contexto:
${prompt}

Tarifa base: ${hourlyRate / 100} €/hora`
        );

        return new Response(
          JSON.stringify([
            {
              description: text,
              quantity: 1,
              price_cents: hourlyRate,
            },
          ]),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      }

      // ------------------------------------------------
      // Previsión financiera
      // ------------------------------------------------
      case "generateFinancialForecast": {
        const { data } = payload;

        text = await generate(
          `Analiza los siguientes datos financieros y genera:

- Un resumen claro
- Riesgos principales
- Sugerencias prácticas

Datos:
${JSON.stringify(data)}`
        );

        return new Response(
          JSON.stringify({
            summary: text,
            potentialRisks: [],
            suggestions: [],
          }),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      }

      // ------------------------------------------------
      // Informe de rentabilidad
      // ------------------------------------------------
      case "analyzeProfitability": {
        const { data } = payload;

        text = await generate(
          `Analiza la rentabilidad del siguiente conjunto de datos y genera un informe claro para un freelance:

${JSON.stringify(data)}`
        );

        return new Response(
          JSON.stringify({
            summary: text,
          }),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      }

      // ------------------------------------------------
      // Candidatos
      // ------------------------------------------------
      case "summarizeApplicant": {
        const { jobDesc, applicantProfile, proposal } = payload;

        text = await generate(
          `Evalúa este candidato y genera:

- Un resumen
- Fortalezas
- Riesgos

Oferta:
${jobDesc}

Perfil:
${applicantProfile}

Propuesta:
${proposal}`
        );

        return new Response(
          JSON.stringify({
            summary: text,
          }),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: "Unknown action" }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
    }

    return new Response(
      JSON.stringify({ text }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );

  } catch (e) {
    return new Response(
      JSON.stringify({
        error: String((e as any)?.message || e),
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
