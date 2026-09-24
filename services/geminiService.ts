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
): Promise<{ summary: string; insights: string[]; topPerformers?: any[]; areasForImprovement?: any[] }> => {
  const res = await callAI('analyzeProfitability', { data: data as unknown as Record<string, unknown>[] });
  return res as unknown as { summary: string; insights: string[]; topPerformers?: any[]; areasForImprovement?: any[] };
};

/* =========================
   Propuestas
========================= */

export const generateProposalText = async (
  title: string,
  context: string,
  profileSummary: string
): Promise<string> => {
  const res = await callAI('getAIResponse', {
    prompt: `Redacta una propuesta comercial profesional.\n\nTítulo:\n${title}\n\nRequerimientos:\n${context}\n\nPerfil profesional:\n${profileSummary}`,
    feature: 'generateProposal',
  });
  return res.text as string;
};

export const refineProposalText = async (
  originalText: string,
  tone: 'formal' | 'conciso' | 'entusiasta'
): Promise<string> => {
  const res = await callAI('getAIResponse', {
    prompt: `Reescribe el siguiente texto con un tono ${tone}.\n\nTexto original:\n${originalText}`,
    feature: 'refineProposal',
  });
  return res.text as string;
};

/* =========================
   Knowledge base
========================= */

export const rankArticlesByRelevance = async (
  query: string,
  articles: Pick<KnowledgeArticle, 'id' | 'title' | 'tags'>[]
): Promise<string[]> => {
  const res = await callAI('getAIResponse', {
    prompt: `Consulta:\n${query}\n\nArtículos:\n${JSON.stringify(articles.slice(0, 10))}\n\nDevuelve los títulos más relevantes en texto.`,
    feature: 'searchKnowledgeBase',
  });
  return [res.text as string];
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