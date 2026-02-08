import { supabase } from "@/lib/supabaseClient";

/**
 * Coste de créditos de cada operación IA
 * (lo usas en la UI)
 */
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

/* ============================================================
   PREVISIÓN FINANCIERA (ForecastingPage)
   -> llama a la Edge Function: ai-forecast
============================================================ */

export interface FinancialAnalysis {
  summary: string;
  potentialRisks: string[];
  suggestions: string[];
}

export const generateFinancialForecast = async (
  data: any[]
): Promise<FinancialAnalysis> => {

  const { data: result, error } = await supabase.functions.invoke(
    "ai-forecast",
    {
      body: { data },
    }
  );

  if (error) {
    console.error("AI forecast function error", error);
    throw error;
  }

  return result as FinancialAnalysis;
};
