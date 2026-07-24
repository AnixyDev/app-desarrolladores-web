import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Instruccion de formato compartida por todos los prompts: evita que Gemini
// devuelva Markdown (**, ##, ---, listas con guiones), ya que el frontend
// muestra el texto tal cual, sin renderizarlo.
const PLAIN_TEXT_RULES = `
Reglas de formato de la respuesta (muy importante, siguelas siempre):
- Responde en texto plano, sin Markdown de ningun tipo.
- No uses asteriscos (**), almohadillas (#, ##, ###), guiones bajos, ni guiones (---) como separadores o para listas.
- No pongas titulos con simbolos delante. Si necesitas un titulo de seccion, escribelo en una linea propia seguido de dos puntos.
- Para listas, usa un salto de linea por elemento con un guion simple seguido de un espacio (- ) como unico marcador permitido, sin negritas.
- Usa parrafos cortos separados por una linea en blanco para que sea facil de leer.
- Escribe en espanol, tono profesional y directo, sin relleno innecesario.
`.trim();

// Instruccion adicional para prompts que reciben datos financieros: la app
// guarda TODO el dinero en centimos (ej. total_cents, amount_cents,
// income_cents). Sin esto, Gemini trata los centimos como si ya fueran
// euros y el informe sale con cifras 100x mayores de lo real.
const CURRENCY_RULES = `
Reglas para cifras monetarias (muy importante):
- Cualquier campo numerico en los datos cuyo nombre contenga "cents", "cent", "_cents" o similar esta expresado en CENTIMOS de euro, no en euros.
- Antes de escribir cualquier cifra de dinero en tu respuesta, divide ese valor entre 100 para obtener euros.
- Si un campo no tiene "cents" en el nombre (ej. un campo que ya se llama "amount_eur" o similar), asume que ya esta en euros y no lo dividas.
- Formatea siempre el dinero al estilo espanol: punto como separador de miles, coma para los decimales, y el simbolo € al final. Ejemplo correcto: 2.740,00 €. Ejemplo incorrecto: 274000 o 2740.00.
`.trim();

// FIX: se centraliza el nombre del modelo en una sola constante, con un
// modelo de reserva (fallback) si el principal falla por estar retirado o
// no disponible — así un cambio de política de Google no vuelve a tumbar
// toda la IA de la app sin previo aviso mientras se actualiza el código.
const PRIMARY_MODEL = "gemini-2.5-flash";
const FALLBACK_MODEL = "gemini-2.5-flash-lite";

/* Llama a la API REST de Gemini directamente (sin SDK) */
async function callGeminiWithModel(apiKey: string, model: string, fullPrompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: fullPrompt }] }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error ${res.status} (modelo ${model}): ${err}`);
  }

  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`Empty Gemini response (modelo ${model})`);
  return text;
}

async function callGemini(apiKey: string, prompt: string, extraRules?: string): Promise<string> {
  const rules = extraRules ? `${PLAIN_TEXT_RULES}\n\n${extraRules}` : PLAIN_TEXT_RULES;
  const fullPrompt = `${prompt}\n\n${rules}`;

  let text: string;
  try {
    text = await callGeminiWithModel(apiKey, PRIMARY_MODEL, fullPrompt);
  } catch (primaryError) {
    // FIX: antes, si el modelo principal fallaba (retirado, sobrecargado,
    // límite de cuota), no había ningún intento de recuperación — el error
    // se registraba en el log del servidor sin detalle útil y el usuario
    // veía un 500 genérico. Ahora se registra el motivo exacto y se
    // reintenta una vez con un modelo de reserva antes de rendirse.
    console.error(`[ai-gemini] Falló el modelo principal (${PRIMARY_MODEL}):`, (primaryError as Error).message);
    text = await callGeminiWithModel(apiKey, FALLBACK_MODEL, fullPrompt);
  }

  // Red de seguridad: por si el modelo aun asi cuela algo de Markdown,
  // limpiamos los simbolos mas comunes antes de devolver el texto.
  return text
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/^-{3,}\s*$/gm, "")
    .replace(/^\s*[*+]\s+/gm, "- ")
    .trim();
}

// Convierte recursivamente cualquier campo *cents* de un objeto/array a euros,
// como red de seguridad adicional independiente del prompt: asi el numero
// que ve Gemini YA viene en euros, no depende de que la IA haga bien la division.
function normalizeCentsFields(value: any): any {
  if (Array.isArray(value)) return value.map(normalizeCentsFields);
  if (value && typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [key, val] of Object.entries(value)) {
      if (/cents?$/i.test(key) && typeof val === "number") {
        const newKey = key.replace(/_?cents?$/i, "_eur");
        out[newKey] = Math.round(val) / 100;
      } else {
        out[key] = normalizeCentsFields(val);
      }
    }
    return out;
  }
  return value;
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

    /* ── Autenticacion Supabase ── */
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

    switch (action) {
      case "getAIResponse": {
        const { prompt } = payload;
        const text = await callGemini(GEMINI_API_KEY, prompt);
        return new Response(JSON.stringify({ text }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "generateTimeEntryDescription": {
        const { projectName, projectDesc, keywords } = payload;
        const text = await callGemini(
          GEMINI_API_KEY,
          `Redacta la descripcion de un parte de trabajo para un freelance.

Proyecto: ${projectName}
Contexto del proyecto: ${projectDesc}
Tareas realizadas hoy: ${keywords}

Devuelve UNA sola frase profesional y concreta que describa el trabajo realizado, lista para aparecer tal cual en una factura o parte de horas. No añadas introducciones ni explicaciones, solo la frase.`
        );
        return new Response(JSON.stringify({ text }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "generateItemsForDocument": {
        const { prompt, hourlyRate } = payload;
        const text = await callGemini(
          GEMINI_API_KEY,
          `Genera un unico concepto de factura, claro y profesional, para un desarrollador freelance.

Contexto del trabajo realizado:
${prompt}

Tarifa base: ${hourlyRate / 100} euros/hora

Devuelve solo la descripcion del concepto (una o dos frases), sin precio, sin cantidad, sin introducciones.`
        );
        return new Response(
          JSON.stringify([
            { description: text, quantity: 1, price_cents: hourlyRate },
          ]),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "generateFinancialForecast": {
        const normalizedData = normalizeCentsFields(payload.data);
        const text = await callGemini(
          GEMINI_API_KEY,
          `Eres un asesor financiero para freelancers. Analiza estos datos financieros (los importes ya estan en euros) y escribe un informe breve con tres partes claramente separadas por una linea en blanco:

1. Un resumen de la situacion actual (2-3 frases).
2. Los principales riesgos a vigilar (cada uno en su propia linea, empezando por "- ").
3. Sugerencias practicas y accionables (cada una en su propia linea, empezando por "- ").

Datos financieros (importes en euros):
${JSON.stringify(normalizedData)}`,
          CURRENCY_RULES
        );
        return new Response(
          JSON.stringify({ summary: text, potentialRisks: [], suggestions: [] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "analyzeProfitability": {
        const normalizedData = normalizeCentsFields(payload.data);
        const text = await callGemini(
          GEMINI_API_KEY,
          `Eres un asesor de negocio para freelancers. Analiza la rentabilidad de estos proyectos (los importes ya estan en euros) y escribe un informe breve y directo (maximo 250 palabras) que cubra:

1. Que proyectos son mas rentables y por que.
2. Que proyectos estan generando perdidas o tienen datos incompletos.
3. Dos o tres recomendaciones concretas y accionables.

Datos de los proyectos (importes en euros):
${JSON.stringify(normalizedData)}

Escribelo en parrafos cortos y claros, nada de relleno ni frases motivacionales genericas.`,
          CURRENCY_RULES
        );
        return new Response(JSON.stringify({ summary: text }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "generateProposalText": {
        const { title, context, profileSummary } = payload;
        const text = await callGemini(
          GEMINI_API_KEY,
          `Redacta una propuesta comercial profesional y persuasiva para un cliente potencial.

Titulo del proyecto: ${title}

Requisitos del cliente:
${context}

Perfil del profesional que la envia:
${profileSummary}

Estructura la propuesta en 3-4 parrafos cortos: una introduccion que conecte con la necesidad del cliente, como se resolveria el proyecto, por que este profesional es la opcion adecuada, y un cierre con siguiente paso claro. Tono cercano y profesional, sin sonar generico ni a plantilla.`
        );
        return new Response(JSON.stringify({ text }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "summarizeApplicant": {
        const { jobDesc, applicantProfile, proposal } = payload;
        const text = await callGemini(
          GEMINI_API_KEY,
          `Eres un asistente de contratacion. Evalua a este candidato para la oferta de empleo y escribe un analisis breve con tres partes separadas por una linea en blanco:

1. Resumen del candidato (2-3 frases).
2. Puntos fuertes respecto a la oferta (cada uno en su propia linea, empezando por "- ").
3. Posibles riesgos o puntos a aclarar (cada uno en su propia linea, empezando por "- ").

Oferta de empleo:
${jobDesc}

Perfil del candidato:
${applicantProfile}

Propuesta enviada:
${proposal}`
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
    // FIX: antes no se registraba nada server-side — solo se devolvía el
    // error en el body de la respuesta 500, así que diagnosticar un fallo
    // real (cuota de Gemini agotada, modelo retirado, payload mal formado)
    // dependía enteramente de lo que el usuario copiara de la consola del
    // navegador. Ahora queda también en los logs de la función.
    console.error("[ai-gemini] Error:", (e as Error)?.message ?? e);
    return new Response(
      JSON.stringify({ error: String((e as Error)?.message ?? e) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});