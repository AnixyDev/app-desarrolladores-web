import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { costeDe } from "../_shared/creditos-ia.ts";
import {
  resumenDelNegocio,
  instruccionesDelAsistente,
  tituloDeConversacion,
  sanearConceptos,
  sanearAnalisis,
  sanearOrden,
  type DatosDelNegocio,
} from "../_shared/asistente-ia.ts";

// Topes de tamaño (ver el comentario junto a req.json()). 60.000 caracteres son
// unas 15.000 palabras: sobra para cualquier uso de la app (propuestas, base de
// conocimiento, datos de previsión). La foto de un ticket va aparte.
const MAX_ENTRADA_TEXTO = 60_000;
const MAX_ENTRADA_IMAGEN = 8 * 1024 * 1024;
const MAX_TOKENS_DE_SALIDA = 4096;

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

// FIX (26 jul 2026): Google retiró "gemini-2.5-flash" y "gemini-2.5-flash-lite"
// el 9 de julio de 2026, antes de su fecha de baja anunciada (16 oct 2026) —
// dejaron de responder con 404 sin aviso previo. Se actualiza a los modelos
// vigentes. Se usa el alias "gemini-flash-latest" como primario porque Google
// lo re-apunta automáticamente al modelo Flash más reciente, para que un
// futuro retiro similar no vuelva a tumbar la IA sin que nadie lo note.
const PRIMARY_MODEL = "gemini-flash-latest";
const FALLBACK_MODEL = "gemini-3.1-flash-lite";

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
    "Escribe tu pregunta",
    "Indica el tema del documento",
    "No se han podido generar conceptos",
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

function isAuthError(rawMessage: string): boolean {
  const msg = rawMessage.toLowerCase();
  return (
    msg.includes("api key not valid") ||
    msg.includes("api_key_invalid") ||
    msg.includes("permission_denied") ||
    msg.includes("error 401") ||
    msg.includes("error 403")
  );
}

async function callGeminiWithModel(apiKey: string, model: string, fullPrompt: string): Promise<string> {
  // CAMBIO (27/09): la clave va en la cabecera, no en la URL. En la URL
  // acababa en los registros si fallaba la conexión.
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: fullPrompt }] }],
      generationConfig: { maxOutputTokens: MAX_TOKENS_DE_SALIDA },
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

/* Petición completa a Gemini: papel del sistema, varios turnos y, si hace
   falta, respuesta en JSON con esquema. La usan el asistente con memoria y
   las funciones que devuelven datos estructurados. */
interface PeticionGemini {
  system?: string;
  contents: { role: "user" | "model"; parts: { text: string }[] }[];
  json?: boolean;
  schema?: Record<string, unknown>;
  temperature?: number;
}

async function pedirAGemini(apiKey: string, model: string, p: PeticionGemini): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const generationConfig: Record<string, unknown> = { maxOutputTokens: MAX_TOKENS_DE_SALIDA };
  if (p.temperature !== undefined) generationConfig.temperature = p.temperature;
  if (p.json) {
    generationConfig.responseMimeType = "application/json";
    if (p.schema) generationConfig.responseSchema = p.schema;
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      ...(p.system ? { systemInstruction: { parts: [{ text: p.system }] } } : {}),
      contents: p.contents,
      generationConfig,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error ${res.status} (modelo ${model}): ${err}`);
  }
  const json = await res.json();
  const text = (json?.candidates?.[0]?.content?.parts ?? []).map((x: { text?: string }) => x.text ?? "").join("");
  if (!text) throw new Error(`Empty Gemini response (modelo ${model})`);
  return text;
}

/* Misma política de respaldo que callGemini: modelo principal, clave
   compartida si falla la propia por autenticación, y modelo de respaldo. */
async function pedirConRespaldo(ownApiKey: string, sharedApiKey: string, p: PeticionGemini): Promise<string> {
  const usingOwnKey = ownApiKey !== sharedApiKey;
  try {
    return await pedirAGemini(ownApiKey, PRIMARY_MODEL, p);
  } catch (e) {
    const msg = (e as Error).message;
    console.error(`[ai-gemini] Fallo el modelo principal (${PRIMARY_MODEL}):`, msg);
    if (usingOwnKey && isAuthError(msg)) {
      try {
        return await pedirAGemini(sharedApiKey, PRIMARY_MODEL, p);
      } catch {
        return await pedirAGemini(sharedApiKey, FALLBACK_MODEL, p);
      }
    }
    return await pedirAGemini(ownApiKey, FALLBACK_MODEL, p);
  }
}

const unTurno = (texto: string): PeticionGemini["contents"] => [{ role: "user", parts: [{ text: texto }] }];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MENSAJE_ASISTENTE = 6000;
const TURNOS_DE_MEMORIA = 20;

/* Resumen del negocio para el asistente, leído con la sesión del usuario (RLS):
   solo ve lo que el usuario puede ver. Nada de emails, teléfonos, NIF ni
   direcciones. */
// deno-lint-ignore no-explicit-any
async function contextoDelNegocio(supabase: any, userId: string): Promise<string> {
  const hoy = new Date().toISOString().slice(0, 10);
  const [perfil, facturas, clientes, proyectos, gastos, presupuestos, propuestas, contratos] = await Promise.all([
    supabase.from("profiles").select("full_name, business_name, plan, hourly_rate_cents").eq("id", userId).maybeSingle(),
    supabase.from("invoices").select("invoice_number, client_id, total_cents, paid, issue_date, due_date").order("issue_date", { ascending: false }).limit(500),
    supabase.from("clients").select("id, name").limit(300),
    supabase.from("projects").select("name, client_id, status, due_date, budget_cents").limit(200),
    supabase.from("expenses").select("amount_cents, date").gte("date", `${hoy.slice(0, 4)}-01-01`).limit(2000),
    supabase.from("budgets").select("status").eq("status", "pending"),
    supabase.from("proposals").select("status").in("status", ["draft", "sent"]),
    supabase.from("contracts").select("status").neq("status", "signed"),
  ]);
  const nombreCliente = new Map<string, string>((clientes.data ?? []).map((c: { id: string; name: string }) => [c.id, c.name]));
  const datos: DatosDelNegocio = {
    hoy,
    nombre: perfil.data?.full_name ?? "",
    negocio: perfil.data?.business_name ?? null,
    plan: perfil.data?.plan ?? null,
    tarifaHoraCents: perfil.data?.hourly_rate_cents ?? null,
    facturas: (facturas.data ?? []).map((f: Record<string, unknown>) => ({
      numero: String(f.invoice_number ?? ""),
      cliente: nombreCliente.get(String(f.client_id)) ?? "Cliente",
      totalCents: Number(f.total_cents) || 0,
      pagada: !!f.paid,
      emision: String(f.issue_date ?? ""),
      vencimiento: String(f.due_date ?? ""),
    })),
    gastosCents: (gastos.data ?? []).map((g: Record<string, unknown>) => ({ importe: Number(g.amount_cents) || 0, fecha: String(g.date ?? "") })),
    proyectos: (proyectos.data ?? []).map((p: Record<string, unknown>) => ({
      nombre: String(p.name ?? ""),
      cliente: nombreCliente.get(String(p.client_id)) ?? "Cliente",
      estado: String(p.status ?? ""),
      entrega: (p.due_date as string) ?? null,
      presupuestoCents: Number(p.budget_cents) || 0,
    })),
    clientes: (clientes.data ?? []).map((c: { name: string }) => c.name),
    presupuestosPendientes: presupuestos.data?.length ?? 0,
    propuestasAbiertas: propuestas.data?.length ?? 0,
    contratosSinFirmar: contratos.data?.length ?? 0,
  };
  return resumenDelNegocio(datos);
}

async function callGemini(
  ownApiKey: string,
  sharedApiKey: string,
  prompt: string,
  extraRules?: string
): Promise<string> {
  const rules = extraRules ? `${PLAIN_TEXT_RULES}\n\n${extraRules}` : PLAIN_TEXT_RULES;
  const fullPrompt = `${prompt}\n\n${rules}`;
  const usingOwnKey = ownApiKey !== sharedApiKey;

  let text: string;
  try {
    text = await callGeminiWithModel(ownApiKey, PRIMARY_MODEL, fullPrompt);
  } catch (primaryError) {
    const primaryMsg = (primaryError as Error).message;
    console.error(`[ai-gemini] Fallo el modelo principal (${PRIMARY_MODEL}):`, primaryMsg);

    if (usingOwnKey && isAuthError(primaryMsg)) {
      console.error("[ai-gemini] La API key propia del usuario ha fallado por autenticación, usando la key compartida como respaldo.");
      try {
        text = await callGeminiWithModel(sharedApiKey, PRIMARY_MODEL, fullPrompt);
      } catch (sharedPrimaryError) {
        console.error(`[ai-gemini] Fallo el modelo principal con la key compartida (${PRIMARY_MODEL}):`, (sharedPrimaryError as Error).message);
        text = await callGeminiWithModel(sharedApiKey, FALLBACK_MODEL, fullPrompt);
      }
    } else {
      text = await callGeminiWithModel(ownApiKey, FALLBACK_MODEL, fullPrompt);
    }
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
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
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
        maxOutputTokens: MAX_TOKENS_DE_SALIDA,
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
  ownApiKey: string,
  sharedApiKey: string,
  mimeType: string,
  imageBase64: string
): Promise<Record<string, unknown>> {
  const usingOwnKey = ownApiKey !== sharedApiKey;
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
    text = await callGeminiWithImage(ownApiKey, PRIMARY_MODEL, prompt, mimeType, imageBase64);
  } catch (primaryError) {
    const primaryMsg = (primaryError as Error).message;
    console.error(`[ai-gemini] OCR: falló el modelo principal (${PRIMARY_MODEL}):`, primaryMsg);

    if (usingOwnKey && isAuthError(primaryMsg)) {
      console.error("[ai-gemini] OCR: la API key propia del usuario ha fallado por autenticación, usando la key compartida como respaldo.");
      try {
        text = await callGeminiWithImage(sharedApiKey, PRIMARY_MODEL, prompt, mimeType, imageBase64);
      } catch (sharedPrimaryError) {
        console.error(`[ai-gemini] OCR: falló el modelo principal con la key compartida (${PRIMARY_MODEL}):`, (sharedPrimaryError as Error).message);
        text = await callGeminiWithImage(sharedApiKey, FALLBACK_MODEL, prompt, mimeType, imageBase64);
      }
    } else {
      text = await callGeminiWithImage(ownApiKey, FALLBACK_MODEL, prompt, mimeType, imageBase64);
    }
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

    // CAMBIO (27/09): cada acción cuesta un número fijo de créditos, pero el
    // texto de entrada y la respuesta no tenían tope: por 1 crédito se podía
    // mandar un prompt enorme y pedir una respuesta enorme, y lo pagaba la
    // clave compartida. Ahora hay techo para las dos cosas. Se comprueba
    // ANTES de cobrar: si se pasa, no se cobra nada.
    const tamanoEntrada = JSON.stringify(payload ?? {}).length;
    const limiteEntrada = action === "extractExpenseFromImage" ? MAX_ENTRADA_IMAGEN : MAX_ENTRADA_TEXTO;
    if (tamanoEntrada > limiteEntrada) {
      return new Response(
        JSON.stringify({ error: "El texto es demasiado largo para el asistente. Resúmelo o divídelo en partes." }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ------------------------------------------------------------------
    // COBRO DE CREDITOS — en el servidor, ANTES de gastar la cuota de Gemini.
    //
    // Esta funcion autenticaba al usuario y ejecutaba la accion sin mirar ni
    // descontar creditos. Todo el control vivia en el navegador: cada pantalla
    // comprobaba profile.ai_credits antes de llamar y descontaba despues. Un
    // usuario que llamara aqui directamente tenia IA ilimitada y gratis.
    //
    // El coste sale del catalogo del servidor (_shared/creditos-ia.ts); del
    // cliente solo se acepta QUE funcion dice estar usando, nunca cuanto vale.
    // ------------------------------------------------------------------
    const coste = costeDe(action, payload?.feature);
    if (coste === null) {
      return new Response(JSON.stringify({ error: "Unknown action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Se cobra con el cliente del USUARIO, no con la clave de servicio:
    // consume_credits_atomic exige que user_id coincida con auth.uid(), y con
    // la clave de servicio auth.uid() es NULL y la llamada se rechazaria.
    const { data: cobrado, error: errorCobro } = await supabase.rpc(
      "consume_credits_atomic",
      { user_id: user.id, amount_to_consume: coste }
    );

    if (errorCobro) {
      console.error("[ai-gemini] error cobrando creditos:", errorCobro.message);
      return new Response(
        JSON.stringify({ error: "No se pudieron comprobar tus créditos. Inténtalo de nuevo." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!cobrado) {
      return new Response(
        JSON.stringify({
          error: `No tienes créditos suficientes: esta acción cuesta ${coste}.`,
          credits_required: coste,
        }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Si algo falla DESPUÉS de cobrar, se devuelven los créditos: antes se
    // perdían cada vez que Gemini no respondía.
    const devolver = async () => {
      try {
        const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        const { error } = await admin.rpc("devolver_creditos_ia", { p_user: user.id, p_cantidad: coste });
        if (error) console.error("[ai-gemini] no se pudieron devolver los créditos:", error.message);
      } catch (e) {
        console.error("[ai-gemini] no se pudieron devolver los créditos:", (e as Error).message);
      }
    };

    try {
    switch (action) {
      case "asistente": {
        const mensaje = String(payload?.mensaje ?? "").trim().slice(0, MAX_MENSAJE_ASISTENTE);
        if (!mensaje) throw new Error("Escribe tu pregunta.");
        let conversacionId = typeof payload?.conversacion_id === "string" && UUID.test(payload.conversacion_id) ? payload.conversacion_id : null;
        let titulo: string | null = null;

        let historial: { rol: string; texto: string }[] = [];
        if (conversacionId) {
          const { data: conv } = await supabase.from("ai_conversaciones").select("id, titulo").eq("id", conversacionId).maybeSingle();
          if (!conv) conversacionId = null;
          else {
            titulo = conv.titulo;
            const { data: previos } = await supabase
              .from("ai_mensajes").select("rol, texto").eq("conversacion_id", conversacionId)
              .order("created_at", { ascending: false }).limit(TURNOS_DE_MEMORIA);
            historial = (previos ?? []).reverse();
          }
        }

        const contexto = await contextoDelNegocio(supabase, user.id);
        const contents: PeticionGemini["contents"] = [
          ...historial.map((m) => ({ role: (m.rol === "model" ? "model" : "user") as "user" | "model", parts: [{ text: m.texto }] })),
          { role: "user", parts: [{ text: mensaje }] },
        ];
        // Gemini exige que el primer turno sea del usuario.
        while (contents.length && contents[0].role !== "user") contents.shift();

        const respuesta = (await pedirConRespaldo(effectiveApiKey, GEMINI_API_KEY, {
          system: instruccionesDelAsistente(contexto),
          contents,
          temperature: 0.6,
        })).trim();

        if (!conversacionId) {
          titulo = tituloDeConversacion(mensaje);
          const { data: nueva, error: errNueva } = await supabase
            .from("ai_conversaciones").insert({ user_id: user.id, titulo }).select("id").single();
          if (errNueva) throw new Error(`No se pudo guardar la conversación: ${errNueva.message}`);
          conversacionId = nueva.id;
        }
        const { error: errMensajes } = await supabase.from("ai_mensajes").insert([
          { conversacion_id: conversacionId, user_id: user.id, rol: "user", texto: mensaje },
          { conversacion_id: conversacionId, user_id: user.id, rol: "model", texto: respuesta.slice(0, 40000) },
        ]);
        if (errMensajes) console.error("[ai-gemini] no se pudieron guardar los mensajes:", errMensajes.message);
        await supabase.from("ai_conversaciones").update({ updated_at: new Date().toISOString() }).eq("id", conversacionId);

        return new Response(JSON.stringify({ conversacion_id: conversacionId, titulo, respuesta }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "resumirChat": {
        const conversacion = String(payload?.conversacion ?? "").slice(0, MAX_ENTRADA_TEXTO);
        const text = await callGemini(
          effectiveApiKey,
          GEMINI_API_KEY,
          `Resume esta conversación entre un freelance y su cliente sobre un proyecto. Devuelve: un resumen de 2-3 frases, las decisiones tomadas y las tareas pendientes (quién tiene que hacer qué), cada una en su línea empezando por "- ". Si no hay decisiones o tareas, dilo.\n\nConversación:\n${conversacion}`
        );
        return new Response(JSON.stringify({ text }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      case "ordenarArticulos": {
        const consulta = String(payload?.consulta ?? "").slice(0, 500);
        const articulos = (Array.isArray(payload?.articulos) ? payload.articulos : []).slice(0, 60)
          .map((a: Record<string, unknown>) => ({ id: String(a.id), titulo: String(a.title ?? a.titulo ?? "").slice(0, 200), etiquetas: Array.isArray(a.tags) ? a.tags.slice(0, 10) : [] }));
        const texto = await pedirConRespaldo(effectiveApiKey, GEMINI_API_KEY, {
          contents: unTurno(`Ordena estos artículos de una base de conocimiento de más a menos relevante para la búsqueda "${consulta}". Incluye solo los que tengan relación con la búsqueda.\n\nArtículos:\n${JSON.stringify(articulos)}`),
          json: true,
          schema: { type: "OBJECT", properties: { ids: { type: "ARRAY", items: { type: "STRING" } } }, required: ["ids"] },
          temperature: 0,
        });
        const ids = sanearOrden(texto, articulos.map((a: { id: string }) => a.id));
        return new Response(JSON.stringify({ ids }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      case "generarDocumento": {
        const tema = String(payload?.tema ?? "").trim().slice(0, 500);
        if (!tema) throw new Error("Indica el tema del documento.");
        const text = (await pedirConRespaldo(effectiveApiKey, GEMINI_API_KEY, {
          system: "Eres un redactor técnico para freelancers del sector digital en España. Escribes documentos internos claros y prácticos, en español de España.",
          contents: unTurno(`Redacta un documento de base de conocimiento sobre: "${tema}".\n\nFormato Markdown: un título con "# ", secciones con "## ", listas con "-" y pasos numerados cuando haya un procedimiento. Incluye ejemplos concretos. Sin introducción ni despedida. Máximo unas 900 palabras.`),
          temperature: 0.5,
        })).trim();
        return new Response(JSON.stringify({ text }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      case "generarQuiz": {
        const titulo = String(payload?.titulo ?? "Sin título").slice(0, 200);
        const contenido = String(payload?.contenido ?? "").slice(0, MAX_ENTRADA_TEXTO - 1000);
        const text = await callGemini(
          effectiveApiKey,
          GEMINI_API_KEY,
          `Crea un cuestionario de 5 preguntas tipo test (opciones a, b, c) para comprobar que se ha entendido este artículo. Numera las preguntas. Al final, en una sección "Respuestas:", da la letra correcta de cada una con una frase que explique por qué.\n\nTítulo: ${titulo}\n\n${contenido}`
        );
        return new Response(JSON.stringify({ text }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      case "refinarPropuesta": {
        const tonos: Record<string, string> = {
          formal: "más formal y corporativo, sin perder cercanía",
          conciso: "más breve y directo: quita relleno y deja lo esencial",
          entusiasta: "más entusiasta y persuasivo, transmitiendo ganas de trabajar en el proyecto",
        };
        const tono = tonos[String(payload?.tono)] ?? tonos.formal;
        const original = String(payload?.texto ?? "").slice(0, MAX_ENTRADA_TEXTO - 1000);
        const text = await callGemini(
          effectiveApiKey,
          GEMINI_API_KEY,
          `Reescribe esta propuesta comercial con un tono ${tono}. Mantén todos los datos concretos (precios, plazos, entregables) y la estructura en párrafos. Devuelve solo el texto final.\n\nPropuesta:\n${original}`
        );
        return new Response(JSON.stringify({ text }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      case "getAIResponse": {
        const { prompt } = payload;
        const text = await callGemini(effectiveApiKey, GEMINI_API_KEY, prompt);
        return new Response(JSON.stringify({ text }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "generateTimeEntryDescription": {
        const { projectName, projectDesc, keywords } = payload;
        const text = await callGemini(
          effectiveApiKey,
          GEMINI_API_KEY,
          `Redacta la descripcion de un parte de trabajo para un freelance.\n\nProyecto: ${projectName}\nContexto del proyecto: ${projectDesc}\nTareas realizadas hoy: ${keywords}\n\nDevuelve UNA sola frase profesional y concreta que describa el trabajo realizado, lista para aparecer tal cual en una factura o parte de horas. No añadas introducciones ni explicaciones, solo la frase.`
        );
        return new Response(JSON.stringify({ text }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "generateItemsForDocument": {
        const { prompt } = payload;
        const tarifa = Math.max(0, Number(payload?.hourlyRate) || 0);
        const texto = await pedirConRespaldo(effectiveApiKey, GEMINI_API_KEY, {
          contents: unTurno(`Eres un desarrollador freelance en España preparando una factura o presupuesto. A partir de la descripción del trabajo, desglósalo en entre 1 y 8 conceptos claros y profesionales, como aparecerían en una factura.\n\nDescripción del trabajo:\n${String(prompt ?? "").slice(0, 8000)}\n\nTarifa por hora del profesional: ${tarifa ? (tarifa / 100).toFixed(2) + " euros" : "no indicada"}.\n\nPara cada concepto: si se cobra por horas, indica "hours" (horas estimadas, realista); si es un precio cerrado, indica "price_cents" (en céntimos de euro) y "quantity". Descripciones concretas, sin precios dentro del texto.`),
          json: true,
          schema: {
            type: "OBJECT",
            properties: {
              conceptos: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    description: { type: "STRING" },
                    hours: { type: "NUMBER" },
                    quantity: { type: "NUMBER" },
                    price_cents: { type: "INTEGER" },
                  },
                  required: ["description"],
                },
              },
            },
            required: ["conceptos"],
          },
          temperature: 0.3,
        });
        return new Response(JSON.stringify(sanearConceptos(texto, tarifa)), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "generateFinancialForecast": {
        const normalizedData = normalizeCentsFields(payload.data);
        const text = await callGemini(
          effectiveApiKey,
          GEMINI_API_KEY,
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
        // Antes devolvía solo el texto, y la pantalla dejaba vacías las
        // secciones "Lo que funciona" y "Qué mejorar".
        const texto = await pedirConRespaldo(effectiveApiKey, GEMINI_API_KEY, {
          system: "Eres un asesor de negocio para freelancers en España. Directo, concreto, sin frases motivacionales.",
          contents: unTurno(`Analiza la rentabilidad de estos datos (importes ya en euros) y devuelve:\n- summary: resumen de 3-5 frases con las cifras clave (formato 1.234,56 €).\n- topPerformers: 2-4 puntos sobre qué clientes o proyectos funcionan mejor y por qué.\n- areasForImprovement: 2-4 recomendaciones concretas y accionables (subir precios, cobrar vencidos, dejar un cliente, etc.).\n\nDatos:\n${JSON.stringify(normalizedData)}`),
          json: true,
          schema: {
            type: "OBJECT",
            properties: {
              summary: { type: "STRING" },
              topPerformers: { type: "ARRAY", items: { type: "STRING" } },
              areasForImprovement: { type: "ARRAY", items: { type: "STRING" } },
            },
            required: ["summary", "topPerformers", "areasForImprovement"],
          },
          temperature: 0.3,
        });
        return new Response(JSON.stringify(sanearAnalisis(texto)), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "generateProposalText": {
        const { title, context, profileSummary } = payload;
        const text = await callGemini(
          effectiveApiKey,
          GEMINI_API_KEY,
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
          GEMINI_API_KEY,
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

        const extracted = await extractExpenseWithGemini(effectiveApiKey, GEMINI_API_KEY, String(mimeType), imageBase64);
        return new Response(JSON.stringify({ extracted }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        await devolver();
        return new Response(JSON.stringify({ error: "Unknown action" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
    } catch (fallo) {
      await devolver();
      const bruto = String((fallo as Error)?.message ?? fallo);
      console.error("[ai-gemini] Error (créditos devueltos):", bruto);
      return new Response(
        JSON.stringify({ error: `${translateGeminiError(bruto)} No se te ha cobrado.` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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