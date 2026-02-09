import { supabase } from "@/lib/supabaseClient";

/* =========================
   Costes de créditos
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
};

/* =========================
   Helper interno
========================= */

async function callAI(action: string, payload: any) {
  const { data, error } = await supabase.functions.invoke("ai-gemini", {
    body: { action, payload },
  });

  if (error) {
    throw new Error(error.message || "AI function error");
  }

  return data;
}

/* =========================
   Chat genérico (AIAssistant)
========================= */

export const getAIResponse = async (
  prompt: string
): Promise<{ text: string }> => {
  const res = await callAI("getAIResponse", { prompt });
  return { text: res.text };
};

/* =========================
   Partes de tiempo
========================= */

export const generateTimeEntryDescription = async (
  projectName: string,
  projectDesc: string,
  keywords: string
): Promise<string> => {
  const res = await callAI("generateTimeEntryDescription", {
    projectName,
    projectDesc,
    keywords,
  });

  return res.text;
};

/* =========================
   Presupuestos / documentos
========================= */

export const generateItemsForDocument = async (
  prompt: string,
  hourlyRate: number
) => {
  return callAI("generateItemsForDocument", {
    prompt,
    hourlyRate,
  });
};

/* =========================
   Previsión financiera
========================= */

export const generateFinancialForecast = async (data: any[]) => {
  return callAI("generateFinancialForecast", { data });
};

/* =========================
   Informe de rentabilidad
========================= */

export const analyzeProfitability = async (data: any) => {
  return callAI("analyzeProfitability", { data });
};

/* =========================
   Propuestas
========================= */

export const generateProposalText = async (
  title: string,
  context: string,
  profileSummary: string
): Promise<string> => {
  const res = await callAI("getAIResponse", {
    prompt: `
Redacta una propuesta comercial profesional.

Título:
${title}

Requerimientos:
${context}

Perfil profesional:
${profileSummary}
`,
  });

  return res.text;
};

export const refineProposalText = async (
  originalText: string,
  tone: "formal" | "conciso" | "entusiasta"
): Promise<string> => {
  const res = await callAI("getAIResponse", {
    prompt: `
Reescribe el siguiente texto con un tono ${tone}.

Texto original:
${originalText}
`,
  });

  return res.text;
};

/* =========================
   Knowledge base
========================= */

export const rankArticlesByRelevance = async (
  query: string,
  articles: any[]
): Promise<string[]> => {
  const res = await callAI("getAIResponse", {
    prompt: `
Consulta:
${query}

Artículos:
${JSON.stringify(articles.slice(0, 10))}

Devuelve los títulos más relevantes en texto.
`,
  });

  return [res.text];
};

/* =========================
   Candidatos
========================= */

export const summarizeApplicant = async (
  jobDesc: string,
  applicantProfile: string,
  proposal: string
): Promise<{ summary: string }> => {
  return callAI("summarizeApplicant", {
    jobDesc,
    applicantProfile,
    proposal,
  });
};
