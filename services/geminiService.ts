import { supabase } from '@/lib/supabaseClient';
import { InvoiceItem, KnowledgeArticle } from '@/types';

/* =========================
   Costes de créditos IA
========================= */
// Los costes viven en supabase/functions/_shared/creditos-ia.ts, el mismo
// archivo que importa ai-gemini. El servidor es quien cobra de verdad; esto es
// solo para poder avisar antes de llamar y no gastar un viaje de ida y vuelta.
export { AI_CREDIT_COSTS } from '../supabase/functions/_shared/creditos-ia';
export type { FuncionIA } from '../supabase/functions/_shared/creditos-ia';
import type { FuncionIA } from '../supabase/functions/_shared/creditos-ia';

/* =========================
   Tipos de dominio
========================= */

export interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

export interface ForecastDataPoint {
  month: string;
  ingresos: number;
  gastos: number;
  flujoNeto: number;
}

export interface ProfitabilityData {
  clientName: string;
  revenue: number;
  expenses: number;
  profit: number;
}

/* =========================
   Helper interno
========================= */

async function callAI(action: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke('ai-gemini', {
    body: { action, payload },
  });

  if (error) {
    // FunctionsHttpError expone la Response cruda en `.context` — sin
    // esto, error.message es un genérico "Edge Function returned a
    // non-2xx status code" que oculta el motivo real (cuota de Gemini
    // agotada, modelo retirado, GEMINI_API_KEY inválida, etc.), que la
    // función ya devuelve en el cuerpo { error: "..." }.
    let detail = error.message;
    try {
      const body = await (error as any).context?.json?.();
      if (body?.error) detail = body.error;
    } catch {
      // noop: nos quedamos con error.message si el body no es JSON legible
    }
    console.error('Error invoking ai-gemini:', detail);
    throw new Error(detail || 'Error en la función de IA. Inténtalo de nuevo.');
  }

  return data;
}

/* =========================
   Chat genérico
========================= */

/**
 * Chat genérico. `feature` dice al servidor QUÉ función se está usando, para
 * que cobre lo que corresponde: la misma acción atiende al chat (1 crédito),
 * a generar un documento (10) o un cuestionario (5). El servidor busca el
 * precio en su propio catálogo; aquí solo se declara cuál es.
 */
export const getAIResponse = async (
  prompt: string,
  history: ChatMessage[] = [],
  feature: FuncionIA = 'chatMessage'
): Promise<string> => {
  const res = await callAI('getAIResponse', { prompt, history, feature });
  return (res.text as string) ?? '';
};

/* =========================
   Asistente con memoria
========================= */

export interface ConversacionIA { id: string; titulo: string; updated_at: string }
export interface MensajeIA { id?: string; rol: 'user' | 'model'; texto: string; created_at?: string }

/**
 * Un mensaje al asistente. El servidor lee el historial guardado de la
 * conversación, añade un resumen del negocio y guarda la pregunta y la
 * respuesta. Sin conversacion_id empieza una nueva.
 */
export const enviarAlAsistente = async (
  mensaje: string,
  conversacionId: string | null
): Promise<{ conversacion_id: string; titulo: string; respuesta: string }> => {
  const res = await callAI('asistente', { mensaje, conversacion_id: conversacionId });
  return res as unknown as { conversacion_id: string; titulo: string; respuesta: string };
};

export const cargarConversaciones = async (): Promise<ConversacionIA[]> => {
  const { data, error } = await supabase
    .from('ai_conversaciones').select('id, titulo, updated_at').order('updated_at', { ascending: false }).limit(100);
  if (error) throw new Error('No se pudieron cargar tus conversaciones.');
  return (data ?? []) as ConversacionIA[];
};

export const cargarMensajes = async (conversacionId: string): Promise<MensajeIA[]> => {
  const { data, error } = await supabase
    .from('ai_mensajes').select('id, rol, texto, created_at').eq('conversacion_id', conversacionId).order('created_at', { ascending: true });
  if (error) throw new Error('No se pudo abrir la conversación.');
  return (data ?? []) as MensajeIA[];
};

export const borrarConversacion = async (conversacionId: string): Promise<void> => {
  const { error } = await supabase.from('ai_conversaciones').delete().eq('id', conversacionId);
  if (error) throw new Error('No se pudo borrar la conversación.');
};

export const renombrarConversacion = async (conversacionId: string, titulo: string): Promise<void> => {
  const { error } = await supabase.from('ai_conversaciones').update({ titulo: titulo.trim().slice(0, 120) || 'Conversación' }).eq('id', conversacionId);
  if (error) throw new Error('No se pudo renombrar la conversación.');
};

/** Resumen de un chat de proyecto (decisiones y tareas pendientes). */
export const resumirChatDeProyecto = async (conversacion: string): Promise<string> => {
  const res = await callAI('resumirChat', { conversacion });
  return (res.text as string) ?? '';
};

/* =========================
   Partes de tiempo
========================= */

export const generateTimeEntryDescription = async (
  projectName: string,
  projectDesc: string,
  keywords: string
): Promise<string> => {
  const res = await callAI('generateTimeEntryDescription', { projectName, projectDesc, keywords });
  return res.text as string;
};

/* =========================
   Presupuestos / documentos
========================= */

export const generateItemsForDocument = async (
  prompt: string,
  hourlyRate: number
): Promise<InvoiceItem[]> => {
  const res = await callAI('generateItemsForDocument', { prompt, hourlyRate });
  return res as unknown as InvoiceItem[];
};

/* =========================
   Previsión financiera
========================= */

export const generateFinancialForecast = async (
  data: ForecastDataPoint[]
): Promise<{ summary: string; potentialRisks: string[]; suggestions: string[] }> => {
  const res = await callAI('generateFinancialForecast', { data: data as unknown as Record<string, unknown>[] });
  return res as unknown as { summary: string; potentialRisks: string[]; suggestions: string[] };
};

/* =========================
   Informe de rentabilidad
========================= */

export const analyzeProfitability = async (
  data: Record<string, unknown>[] | Record<string, unknown>
): Promise<{ summary: string; topPerformers: string[]; areasForImprovement: string[] }> => {
  const res = await callAI('analyzeProfitability', { data: data as unknown as Record<string, unknown>[] });
  return res as unknown as { summary: string; topPerformers: string[]; areasForImprovement: string[] };
};

/* =========================
   Propuestas
========================= */

export const generateProposalText = async (
  title: string,
  context: string,
  profileSummary: string
): Promise<string> => {
  // La acción propia, con su prompt completo en el servidor (antes se usaba
  // el chat genérico con un prompt de dos líneas).
  const res = await callAI('generateProposalText', { title, context, profileSummary });
  return res.text as string;
};

export const refineProposalText = async (
  originalText: string,
  tone: 'formal' | 'conciso' | 'entusiasta'
): Promise<string> => {
  const res = await callAI('refinarPropuesta', { texto: originalText, tono: tone });
  return res.text as string;
};

/* =========================
   Knowledge base
========================= */

/** Ids de los artículos, de más a menos relevante (antes devolvía un texto y no ordenaba nada). */
export const rankArticlesByRelevance = async (
  query: string,
  articles: Pick<KnowledgeArticle, 'id' | 'title' | 'tags'>[]
): Promise<string[]> => {
  const res = await callAI('ordenarArticulos', {
    consulta: query,
    articulos: articles.slice(0, 60).map(a => ({ id: a.id, title: a.title, tags: a.tags ?? [] })),
  });
  return (res.ids as string[]) ?? [];
};

/** Documento de la base de conocimiento, en Markdown. */
export const generarDocumento = async (tema: string): Promise<string> => {
  const res = await callAI('generarDocumento', { tema });
  return (res.text as string) ?? '';
};

/** Cuestionario tipo test sobre un artículo. */
export const generarQuiz = async (titulo: string, contenido: string): Promise<string> => {
  const res = await callAI('generarQuiz', { titulo, contenido });
  return (res.text as string) ?? '';
};

/* =========================
   OCR de gastos
========================= */

export interface ExtractedExpenseData {
  vendor_name: string;
  description: string;
  date: string; // YYYY-MM-DD
  amount_cents: number;
  tax_percent: number;
  category: string;
  confidence: number; // 0-1
}

/**
 * Envía la foto de un ticket/factura de proveedor a Gemini y devuelve los
 * datos ya estructurados y saneados (importe, IVA, fecha, categoría...).
 * El resultado SIEMPRE se debe mostrar al usuario para revisión antes de
 * guardarlo como gasto — la IA puede equivocarse, sobre todo con fotos
 * borrosas o tickets térmicos desgastados.
 */
export const extractExpenseFromImage = async (
  imageBase64: string,
  mimeType: string
): Promise<ExtractedExpenseData> => {
  const res = await callAI('extractExpenseFromImage', { imageBase64, mimeType });
  return res.extracted as unknown as ExtractedExpenseData;
};

/* =========================
   Candidatos
========================= */

export const summarizeApplicant = async (
  jobDesc: string,
  applicantProfile: string,
  proposal: string
): Promise<{ summary: string }> => {
  const res = await callAI('summarizeApplicant', { jobDesc, applicantProfile, proposal });
  return res as unknown as { summary: string };
};