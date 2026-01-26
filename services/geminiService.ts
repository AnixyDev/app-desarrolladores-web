import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "@/lib/loggerService";

/**
 * SDK oficial de Gemini (npm)
 * La API key DEBE venir de Vite / Vercel
 */
const genAI = new GoogleGenerativeAI(
  import.meta.env.VITE_GEMINI_API_KEY
);

const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash",
});

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

const SYSTEM_INSTRUCTION =
  "Eres un estratega experto. Responde siempre en texto plano o Markdown. Nunca devuelvas JSON salvo que se solicite explícitamente.";

async function generateText(prompt: string): Promise<string> {
  const result = await model.generateContent(prompt);
  return String(result.response.text() || "");
}

/* ===========================
   FUNCIONES PRINCIPALES
=========================== */

export const getAIResponse = async (
  prompt: string
): Promise<{ text: string }> => {
  try {
    const text = await generateText(
      `${SYSTEM_INSTRUCTION}\n\n${prompt}`
    );
    return { text };
  } catch (err: any) {
    logger.error("Gemini Content Generation Failed", {
      error: err?.message,
    });
    throw new Error("Fallo en la comunicación con Gemini.");
  }
};

export const analyzeProfitability = async (data: any) => {
  try {
    const text = await generateText(
      `Analiza la rentabilidad del siguiente dataset financiero y responde en texto estructurado:\n${JSON.stringify(
        data
      )}`
    );
    return { summary: text };
  } catch (err) {
    logger.error("Profitability Analysis AI Error", { error: err });
    return { summary: "Error al procesar el análisis de IA" };
  }
};

export const generateItemsForDocument = async (
  prompt: string,
  hourlyRate: number
) => {
  try {
    const text = await generateText(
      `Genera una lista de conceptos de factura en texto claro.
Contexto: ${prompt}
Tarifa base: ${hourlyRate / 100} €/h`
    );
    return [{ description: text, quantity: 1, price_cents: hourlyRate }];
  } catch (err) {
    logger.error("Invoice Item Generation AI Error", { error: err });
    return [];
  }
};

export const generateTimeEntryDescription = async (
  projectName: string,
  projectDesc: string,
  keywords: string
): Promise<string> => {
  return generateText(
    `Redacta una descripción profesional de 1 frase.
Proyecto: ${projectName}
Contexto: ${projectDesc}
Acción: ${keywords}`
  );
};

export const generateProposalText = async (
  title: string,
  context: string,
  profileSummary: string
): Promise<string> => {
  return generateText(
    `Redacta una propuesta comercial persuasiva.
Título: ${title}
Requerimientos: ${context}
Perfil: ${profileSummary}`
  );
};

export const refineProposalText = async (
  originalText: string,
  tone: "formal" | "conciso" | "entusiasta"
): Promise<string> => {
  return generateText(
    `Reescribe el siguiente texto con un tono ${tone}:\n${originalText}`
  );
};

export const rankArticlesByRelevance = async (
  query: string,
  articles: any[]
): Promise<string[]> => {
  try {
    const text = await generateText(
      `Consulta: ${query}
Lista de artículos: ${JSON.stringify(articles.slice(0, 10))}
Devuelve los títulos más relevantes en texto.`
    );
    return [text];
  } catch (err) {
    logger.error("KB Search AI Error", { error: err });
    return [];
  }
};

export const generateFinancialForecast = async (data: any[]) => {
  try {
    const text = await generateText(
      `Basado en este historial financiero, proyecta los próximos 3 meses:
${JSON.stringify(data)}`
    );
    return { summary: text };
  } catch (err) {
    logger.error("Financial Forecast AI Error", { error: err });
    return { summary: "Error en previsión estratégica" };
  }
};

export const summarizeApplicant = async (
  jobDesc: string,
  applicantProfile: string,
  proposal: string
) => {
  try {
    const text = await generateText(
      `Evalúa este candidato:
Oferta: ${jobDesc}
Perfil: ${applicantProfile}
Propuesta: ${proposal}`
    );
    return { summary: text };
  } catch (err) {
    logger.error("Applicant Summary AI Error", { error: err });
    return { summary: "Error en evaluación de candidato" };
  }
};
