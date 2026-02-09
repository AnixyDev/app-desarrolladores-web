import { supabase } from "@/lib/supabaseClient";

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

async function callAI(action: string, payload: any) {
  const { data, error } = await supabase.functions.invoke("ai-gemini", {
    body: { action, payload },
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

/* =========================
   API pública (frontend)
========================= */

export const getAIResponse = async (prompt: string) => {
  return callAI("getAIResponse", { prompt });
};

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

export const generateItemsForDocument = async (
  prompt: string,
  hourlyRate: number
) => {
  return callAI("generateItemsForDocument", {
    prompt,
    hourlyRate,
  });
};

export const generateFinancialForecast = async (data: any[]) => {
  return callAI("generateFinancialForecast", { data });
};

export const analyzeProfitability = async (data: any) => {
  return callAI("analyzeProfitability", { data });
};

export const generateProposalText = async (
  title: string,
  context: string,
  profileSummary: string
): Promise<string> => {
  const res = await callAI("generateProposalText", {
    title,
    context,
    profileSummary,
  });

  return res.text;
};

export const summarizeApplicant = async (
  jobDesc: string,
  applicantProfile: string,
  proposal: string
) => {
  return callAI("summarizeApplicant", {
    jobDesc,
    applicantProfile,
    proposal,
  });
};

/*
  👉 Esta es la que te falta y rompe el build
  pages/KnowledgeBase.tsx
*/
export const rankArticlesByRelevance = async (
  query: string,
  articles: any[]
): Promise<string[]> => {

  const res = await callAI("getAIResponse", {
    prompt: `
Consulta:
${query}

Artículos:
${JSON.stringify(articles)}

Devuelve los títulos más relevantes ordenados.
`,
  });

  return [res.text];
};
