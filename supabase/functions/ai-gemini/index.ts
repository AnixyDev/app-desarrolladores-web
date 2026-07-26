import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PLAIN_TEXT_RULES = `
Reglas de formato de la respuesta (muy importante, siguelas siempre):
- Responde en texto plano, sin Markdown de ningun tipo.
- No uses asteriscos (**), almohadillas (#, ##, ###), guiones bajos, ni guiones (---) como separadores o para listas.
- No pongas titulos con simbolos delante. Si necesitas un titulo de seccion, escribelo en una linea propia seguido de dos puntos.
- Para listas, usa un salto de linea por elemento con un guion simple seguido de un espacio (- ) como unico marcador permitido, sin negritas.
- Usa parrafos cortos separados por una linea en blanco para que sea facil de leer.
- Escribe en espanol, tono profesional y directo, sin relleno innecesario.
`.trim();

const CURRENCY_RULES = `
Reglas para cifras monetarias (muy importante):
- Cualquier campo numerico en los datos cuyo nombre contenga "cents", "cent", "_cents" o similar esta expresado en CENTIMOS de euro, no en euros.
- Antes de escribir cualquier cifra de dinero en tu respuesta, divide ese valor entre 100 para obtener euros.
- Si un campo no tiene "cents" en el nombre (ej. un campo que ya se llama "amount_eur" o similar), asume que ya esta en euros y no lo dividas.
- Formatea siempre el dinero al estilo espanol: punto como separador de miles, coma para los decimales, y el simbolo € al final. Ejemplo correcto: 2.740,00 €. Ejemplo incorrecto: 274000 o 2740.00.
`.trim();

const PRIMARY_MODEL = "gemini-2.5-flash";
const FALLBACK_MODEL = "gemini-2.5-flash-lite";

/* =========================================================================
   OCR de gastos (ticket/factura de proveedor -> gasto estructurado)
========================================================================= */

// Lista cerrada de categorías: así el campo "category" que llega al
// frontend siempre es uno de los valores que ya usa el resto de la app
// (evita que la IA invente categorías nuevas en cada ticket).
const EXPENSE_CATEGORIES = [
  "Software",
  "Hardware",
  "Suministros",
  "Transporte",
  "Dietas y restauración",
  "Formación",
  "Marketing y publicidad",
  "Alquiler y coworking",
  "Seguros",
  "Gestoría y legal",
  "Comisiones bancarias",
  "Otros",
];

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

// Límite conservador sobre el string base64 (no el binario). Gemini admite
// imágenes inline bastante más grandes, pero un ticket se lee perfectamente
// muy por debajo de esto — limitarlo evita fotos gigantes sin comprimir y
// protege el consumo de créditos/cuota de la API.
const MAX_IMAGE_BASE64_LENGTH = 8 * 1024 * 1024; // ~6 MB de imagen real

function translateGeminiError(rawMessage: string): string {
  // Mensajes de validación propios (ya en español, ya pensados para el
  // usuario final) — se devuelven tal cual, sin pasar por la traducción
  // genérica de errores de la API de Gemini de más abajo.
  const OWN_VALIDATION_MESSAGES = [
    "Falta la imagen del ticket",
    "Formato de imagen no soportado",
    "La imagen es demasiado grande",
    "No se ha podido leer los datos del ticket",
  ];
  if (OWN_VALIDATION_MESSAGES.some((prefix) => rawMessage.startsWith(prefix))) {
    return rawMessage;
  }

  const msg = rawMessage.toLowerCase();

  if (msg.includes("resource_exhausted") || msg.includes("quota") || msg.includes("prepayment credits") || msg.includes("429")) {
    return "El asistente de IA no está disponible ahora mismo (se ha alcanzado el límite de uso). Inténtalo de nuevo más tarde.";
  }
  if (msg.includes("api key not valid") || msg.includes("api_key_invalid") || msg.includes("permission_denied") || msg.includes("401") || msg.includes("403")) {
    return "El asistente de IA no está disponible ahora mismo. Nuestro equipo ya ha sido avisado.";
  }
  if (msg.includes("not found") || msg.includes("404") || msg.includes("empty gemini response")) {
    return "El asistente de IA no ha podido generar una respuesta esta vez. Inténtalo de nuevo en unos minutos.";
  }
  if (msg.includes("missing gemini_api_key")) {
    return "El asistente de IA no está configurado correctamente. Nuestro equipo ya ha sido avisado.";
  }
  if (msg.includes("unauthorized")) {
    return "Tu sesión ha caducado. Vuelve a iniciar sesión e inténtalo de nuevo.";
  }

  return "Ha ocurrido un error con el asistente de IA. Inténtalo de nuevo en unos minutos.";
}

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
    console.error(`[ai-gemini] Fallo el modelo principal (${PRIMARY_MODEL}):`, (primaryError as Error).message);
    text = await callGeminiWithModel(apiKey, FALLBACK_MODEL, fullPrompt);
  }

  return text
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/^-{3,}\s*$/gm, "")
    .replace(/^\s*[*+]\s+/gm, "- ")
    .trim();
}

/* Igual que callGeminiWithModel pero envía además una imagen inline (vision).
   Se usa una función separada porque aquí NO queremos añadir PLAIN_TEXT_RULES
   al prompt: la respuesta debe ser JSON puro, no texto plano para humanos. */
async function callGeminiWithImage(
  apiKey: string,
  model: string,
  prompt: string,
  mimeType: string,
  imageBase64: string
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: imageBase64 } },
          ],
        },
      ],
      generationConfig: {
        // Fuerza a Gemini a devolver JSON válido en vez de texto libre.
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error ${res.status} (modelo ${model}, vision): ${err}`);
  }

  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`Empty Gemini response (modelo ${model}, vision)`);
  return text;
}

/* Envía la foto de un ticket/factura a Gemini y devuelve un gasto ya
   estructurado y saneado, listo para precargar el formulario de "Añadir
   Gasto" del frontend (el usuario siempre revisa/edita antes de guardar). */
async function extractExpenseWithGemini(
  apiKey: string,
  mimeType: string,
  imageBase64: string
): Promise<Record<string, unknown>> {
  const prompt = `Eres un asistente experto en contabilidad para autonomos en España. Analiza la imagen adjunta de un ticket o factura de un proveedor y extrae sus datos.

Categorias permitidas (elige la que mejor encaje, EXACTAMENTE una de esta lista, escrita tal cual):
${EXPENSE_CATEGORIES.map((c) => `- ${c}`).join("\n")}

Devuelve UNICAMENTE un objeto JSON (sin texto adicional, sin explicaciones, sin Markdown, sin \`\`\`) con exactamente estos campos:
{
  "vendor_name": string (nombre del comercio o proveedor; "" si no se lee con claridad),
  "description": string (concepto breve del gasto, ej. "Suscripcion mensual" o "Material de oficina"),
  "date": string (fecha del ticket en formato YYYY-MM-DD; si no aparece, usa la fecha de hoy: ${new Date().toISOString().split("T")[0]}),
  "amount_cents": number (importe TOTAL del ticket, IVA incluido, en centimos de euro, numero entero; ej. 12,34 euros = 1234),
  "tax_percent": number (porcentaje de IVA aplicado: 21, 10, 4 o 0; si no se distingue con claridad usa 21),
  "category": string (una de las categorias permitidas de arriba, escrita EXACTAMENTE igual),
  "confidence": number (entre 0 y 1: tu grado de confianza en que la lectura es correcta)
}

Si la imagen no es un ticket o factura legible, devuelve igualmente el JSON con los campos que puedas rellenar y "confidence" en 0.`;

  let text: string;
  try {
    text = await callGeminiWithImage(apiKey, PRIMARY_MODEL, prompt, mimeType, imageBase64);
  } catch (primaryError) {
    console.error(`[ai-gemini] OCR: falló el modelo principal (${PRIMARY_MODEL}):`, (primaryError as Error).message);
    text = await callGeminiWithImage(apiKey, FALLBACK_MODEL, prompt, mimeType, imageBase64);
  }

  let parsed: Record<string, unknown>;
  try {
    // Red de seguridad por si el modelo aun asi envuelve el JSON en ```json ... ```
    const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    console.error("[ai-gemini] OCR: la respuesta de Gemini no es JSON valido:", text);
    throw new Error("No se ha podido leer los datos del ticket. Prueba con una foto más clara y con buena luz.");
  }

  // Saneado defensivo: nunca confiamos ciegamente en los tipos/valores que
  // devuelve el modelo antes de que lleguen al formulario del frontend.
  const today = new Date().toISOString().split("T")[0];
  const amountCents = Math.max(0, Math.round(Number(parsed.amount_cents) || 0));
  const taxPercentRaw = Number(parsed.tax_percent);
  const taxPercent = Number.isFinite(taxPercentRaw) ? Math.min(100, Math.max(0, taxPercentRaw)) : 21;
  const dateValue =
    typeof parsed.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : today;
  const category = EXPENSE_CATEGORIES.includes(String(parsed.category)) ? String(parsed.category) : "Otros";
  const confidenceRaw = Number(parsed.confidence);
  const confidence = Number.isFinite(confidenceRaw) ? Math.min(1, Math.max(0, confidenceRaw)) : 0.5;

  return {
    vendor_name: typeof parsed.vendor_name === "string" ? parsed.vendor_name.slice(0, 120) : "",
    description:
      typeof parsed.description === "string" && parsed.description.trim()
        ? parsed.description.slice(0, 200)
        : "Gasto escaneado con IA",
    date: dateValue,
    amount_cents: amountCents,
    tax_percent: taxPercent,
    category,
    confidence,
  };
}

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

async function decryptUserGeminiKey(encryptedBase64: string, encryptionKeyHex: string): Promise<string | null> {
  try {
    const keyBytes = new Uint8Array(encryptionKeyHex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
    const cryptoKey = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["decrypt"]);
    const combined = Uint8Array.from(atob(encryptedBase64), (c) => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const cipherBytes = combined.slice(12);
    const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, cryptoKey, cipherBytes);
    return new TextDecoder().decode(plainBuf);
  } catch (e) {
    console.error("[ai-gemini] No se pudo descifrar la API key propia del usuario:", (e as Error).message);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("Missing GEMINI_API_KEY environment variable");
    }

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

    let effectiveApiKey = GEMINI_API_KEY;
    const { data: userSecret } = await supabase
      .from("user_secrets")
      .select("gemini_api_key_encrypted")
      .eq("user_id", user.id)
      .maybeSingle();

    if (userSecret?.gemini_api_key_encrypted) {
      const encryptionKeyHex = Deno.env.get("APP_ENCRYPTION_KEY");
      if (encryptionKeyHex) {
        const ownKey = await decryptUserGeminiKey(userSecret.gemini_api_key_encrypted, encryptionKeyHex);
        if (ownKey) effectiveApiKey = ownKey;
      }
    }

    const { action, payload } = await req.json();

    switch (action) {
      case "getAIResponse": {
        const { prompt } = payload;
        const text = await callGemini(effectiveApiKey, prompt);
        return new Response(JSON.stringify({ text }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "generateTimeEntryDescription": {
        const { projectName, projectDesc, keywords } = payload;
        const text = await callGemini(
          effectiveApiKey,
          `Redacta la descripcion de un parte de trabajo para un freelance.\n\nProyecto: ${projectName}\nContexto del proyecto: ${projectDesc}\nTareas realizadas hoy: ${keywords}\n\nDevuelve UNA sola frase profesional y concreta que describa el trabajo realizado, lista para aparecer tal cual en una factura o parte de horas. No añadas introducciones ni explicaciones, solo la frase.`
        );
        return new Response(JSON.stringify({ text }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "generateItemsForDocument": {
        const { prompt, hourlyRate } = payload;
        const text = await callGemini(
          effectiveApiKey,
          `Genera un unico concepto de factura, claro y profesional, para un desarrollador freelance.\n\nContexto del trabajo realizado:\n${prompt}\n\nTarifa base: ${hourlyRate / 100} euros/hora\n\nDevuelve solo la descripcion del concepto (una o dos frases), sin precio, sin cantidad, sin introducciones.`
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
          effectiveApiKey,
          `Eres un asesor financiero para freelancers. Analiza estos datos financieros (los importes ya estan en euros) y escribe un informe breve con tres partes claramente separadas por una linea en blanco:\n\n1. Un resumen de la situacion actual (2-3 frases).\n2. Los principales riesgos a vigilar (cada uno en su propia linea, empezando por "- ").\n3. Sugerencias practicas y accionables (cada una en su propia linea, empezando por "- ").\n\nDatos financieros (importes en euros):\n${JSON.stringify(normalizedData)}`,
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
          effectiveApiKey,
          `Eres un asesor de negocio para freelancers. Analiza la rentabilidad de estos proyectos (los importes ya estan en euros) y escribe un informe breve y directo (maximo 250 palabras) que cubra:\n\n1. Que proyectos son mas rentables y por que.\n2. Que proyectos estan generando perdidas o tienen datos incompletos.\n3. Dos o tres recomendaciones concretas y accionables.\n\nDatos de los proyectos (importes en euros):\n${JSON.stringify(normalizedData)}\n\nEscribelo en parrafos cortos y claros, nada de relleno ni frases motivacionales genericas.`,
          CURRENCY_RULES
        );
        return new Response(JSON.stringify({ summary: text }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "generateProposalText": {
        const { title, context, profileSummary } = payload;
        const text = await callGemini(
          effectiveApiKey,
          `Redacta una propuesta comercial profesional y persuasiva para un cliente potencial.\n\nTitulo del proyecto: ${title}\n\nRequisitos del cliente:\n${context}\n\nPerfil del profesional que la envia:\n${profileSummary}\n\nEstructura la propuesta en 3-4 parrafos cortos: una introduccion que conecte con la necesidad del cliente, como se resolveria el proyecto, por que este profesional es la opcion adecuada, y un cierre con siguiente paso claro. Tono cercano y profesional, sin sonar generico ni a plantilla.`
        );
        return new Response(JSON.stringify({ text }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "summarizeApplicant": {
        const { jobDesc, applicantProfile, proposal } = payload;
        const text = await callGemini(
          effectiveApiKey,
          `Eres un asistente de contratacion. Evalua a este candidato para la oferta de empleo y escribe un analisis breve con tres partes separadas por una linea en blanco:\n\n1. Resumen del candidato (2-3 frases).\n2. Puntos fuertes respecto a la oferta (cada uno en su propia linea, empezando por "- ").\n3. Posibles riesgos o puntos a aclarar (cada uno en su propia linea, empezando por "- ").\n\nOferta de empleo:\n${jobDesc}\n\nPerfil del candidato:\n${applicantProfile}\n\nPropuesta enviada:\n${proposal}`
        );
        return new Response(JSON.stringify({ summary: text }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "extractExpenseFromImage": {
        const { imageBase64, mimeType } = payload;

        if (!imageBase64 || typeof imageBase64 !== "string") {
          throw new Error("Falta la imagen del ticket");
        }
        if (!mimeType || !ALLOWED_IMAGE_MIME_TYPES.has(String(mimeType))) {
          throw new Error("Formato de imagen no soportado. Usa JPG, PNG, WEBP o HEIC.");
        }
        if (imageBase64.length > MAX_IMAGE_BASE64_LENGTH) {
          throw new Error("La imagen es demasiado grande. Prueba con una foto de menor resolución.");
        }

        const extracted = await extractExpenseWithGemini(effectiveApiKey, String(mimeType), imageBase64);
        return new Response(JSON.stringify({ extracted }), {
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
    const rawMessage = String((e as Error)?.message ?? e);
    console.error("[ai-gemini] Error:", rawMessage);

    return new Response(
      JSON.stringify({ error: translateGeminiError(rawMessage) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});