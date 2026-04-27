import { supabase } from '@/lib/supabaseClient';
import { InvoiceItem, KnowledgeArticle } from '@/types';

/* =========================
   Costes de créditos IA
========================= */
export const AI_CREDIT_COSTS = {
  chatMessage: 1,
  analyzeProfitability: 15,
  generateInvoiceItems: 8,
  generateProposal: 5,
  refineProposal: 2,
  enhanceTimeEntry: 2,
  searchKnowledgeBase: 3,
  generateDocument: 10,
  generateQuiz: 5,
  generateForecast: 15,
  summarizeApplicant: 10,
} as const;

/* =========================
   Tipos de dominio
========================= */

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
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
    console.error('Error invoking ai-gemini:', error);
    throw new Error(error.message || 'Error en la función de IA. Inténtalo de nuevo.');
  }

  return data;
}

/* =========================
   Chat genérico
========================= */

export const getAIResponse = async (
  prompt: string,
  history: ChatMessage[] = []
): Promise<{ text: string }> => {
  const res = await callAI('getAIResponse', { prompt, history });
  return { text: res.text as string };
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
  data: ProfitabilityData[]
): Promise<{ summary: string; insights: string[] }> => {
  const res = await callAI('analyzeProfitability', { data: data as unknown as Record<string, unknown>[] });
  return res as unknown as { summary: string; insights: string[] };
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
  });
  return res.text as string;
};

export const refineProposalText = async (
  originalText: string,
  tone: 'formal' | 'conciso' | 'entusiasta'
): Promise<string> => {
  const res = await callAI('getAIResponse', {
    prompt: `Reescribe el siguiente texto con un tono ${tone}.\n\nTexto original:\n${originalText}`,
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
  });
  return [res.text as string];
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
