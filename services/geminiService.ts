import { GoogleGenAI, Type } from "@google/genai";
import { logger } from "../lib/loggerService";

// En producción Vercel, la key se inyecta automáticamente vía process.env
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

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

const SYSTEM_INSTRUCTION = "Eres un estratega experto. Responde siempre en texto plano o Markdown. NUNCA devuelvas objetos JSON a menos que se especifique.";

export const getAIResponse = async (
    prompt: string, 
    history: { role: string, parts: any }[] = []
): Promise<{ text: string }> => {
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: [...history, { role: 'user', parts: [{ text: String(prompt) }] }],
            config: {
                systemInstruction: SYSTEM_INSTRUCTION,
                temperature: 0.7,
                maxOutputTokens: 2000,
                thinkingConfig: { thinkingBudget: 1000 }
            }
        });

        const outputText = response.text || "Sin respuesta del servidor.";
        return { text: String(outputText) };
    } catch (err: any) {
        logger.error("Gemini Content Generation Failed", { 
          error: err?.message, 
          prompt: prompt.substring(0, 50) 
        });
        throw new Error(String(err?.message || "Fallo en la comunicación con Gemini."));
    }
};

export const analyzeProfitability = async (data: any): Promise<any> => {
    try {
      const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: `Analiza la rentabilidad del siguiente dataset financiero y devuelve un análisis estratégico: ${JSON.stringify(data)}`,
          config: { 
              responseMimeType: "application/json",
              responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                      summary: { type: Type.STRING },
                      topPerformers: { type: Type.ARRAY, items: { type: Type.STRING } },
                      areasForImprovement: { type: Type.ARRAY, items: { type: Type.STRING } }
                  },
                  required: ["summary", "topPerformers", "areasForImprovement"]
              }
          }
      });

      const parsed = JSON.parse(response.text || '{}');
      return {
          summary: String(parsed.summary || "Análisis no disponible"),
          topPerformers: Array.isArray(parsed.topPerformers) ? parsed.topPerformers.map(String) : [],
          areasForImprovement: Array.isArray(parsed.areasForImprovement) ? parsed.areasForImprovement.map(String) : []
      };
    } catch (err) {
      logger.error("Profitability Analysis AI Error", { error: err });
      return { summary: "Error al procesar el análisis de IA", topPerformers: [], areasForImprovement: [] };
    }
};

export const generateItemsForDocument = async (prompt: string, hourlyRate: number): Promise<any[]> => {
    try {
      const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: `Genera una lista de conceptos de factura para: ${prompt}. Tarifa base: ${hourlyRate/100}€/h.`,
          config: { 
              responseMimeType: "application/json",
              responseSchema: {
                  type: Type.ARRAY,
                  items: {
                      type: Type.OBJECT,
                      properties: {
                          description: { type: Type.STRING },
                          quantity: { type: Type.NUMBER },
                          price_cents: { type: Type.NUMBER }
                      },
                      required: ["description", "quantity", "price_cents"]
                  }
              }
          }
      });

      const items = JSON.parse(response.text || '[]');
      return Array.isArray(items) ? items.map(item => ({
          description: String(item.description || 'Concepto'),
          quantity: Number(item.quantity || 1),
          price_cents: Math.round(Number(item.price_cents || 0))
      })) : [];
    } catch (err) {
      logger.error("Invoice Item Generation AI Error", { error: err });
      return [];
    }
};

export const generateTimeEntryDescription = async (projectName: string, projectDesc: string, keywords: string): Promise<string> => {
    const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Redacta una descripción profesional de 1 frase para un registro de tiempo. Proyecto: ${projectName}. Contexto: ${projectDesc}. Acción: ${keywords}.`,
    });
    return String(response.text || "Trabajo realizado.");
};

export const generateProposalText = async (title: string, context: string, profileSummary: string): Promise<string> => {
    const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Redacta una propuesta comercial persuasiva. Título: ${title}. Requerimientos: ${context}. Mi Perfil: ${profileSummary}.`,
    });
    return String(response.text || "Borrador de propuesta.");
};

export const refineProposalText = async (originalText: string, tone: 'formal' | 'conciso' | 'entusiasta'): Promise<string> => {
    const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Reescribe este texto con un tono ${tone}: ${originalText}`,
    });
    return String(response.text || originalText);
};

export const rankArticlesByRelevance = async (query: string, articles: any[]): Promise<string[]> => {
    try {
      const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: `Consulta: ${query}. Identifica los IDs de los artículos más relevantes de esta lista: ${JSON.stringify(articles.slice(0, 20))}`,
          config: { 
              responseMimeType: "application/json",
              responseSchema: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
              }
          }
      });
      const ids = JSON.parse(response.text || '[]');
      return Array.isArray(ids) ? ids.map(String) : [];
    } catch (err) {
      logger.error("KB Search AI Error", { error: err });
      return [];
    }
};

export const generateFinancialForecast = async (data: any[]): Promise<any> => {
    try {
      const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: `Basado en este historial, proyecta los próximos 3 meses de flujo de caja: ${JSON.stringify(data)}`,
          config: { 
              responseMimeType: "application/json",
              responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                      summary: { type: Type.STRING },
                      potentialRisks: { type: Type.ARRAY, items: { type: Type.STRING } },
                      suggestions: { type: Type.ARRAY, items: { type: Type.STRING } }
                  },
                  required: ["summary", "potentialRisks", "suggestions"]
              }
          }
      });
      const parsed = JSON.parse(response.text || '{}');
      return {
          summary: String(parsed.summary || "No disponible"),
          potentialRisks: Array.isArray(parsed.potentialRisks) ? parsed.potentialRisks.map(String) : [],
          suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.map(String) : []
      };
    } catch (err) {
      logger.error("Financial Forecast AI Error", { error: err });
      return { summary: "Error en previsión estratégica", potentialRisks: [], suggestions: [] };
    }
};

export const summarizeApplicant = async (jobDesc: string, applicantProfile: string, proposal: string): Promise<any> => {
    try {
      const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: `Evalúa este candidato para la oferta. Oferta: ${jobDesc}. Perfil: ${applicantProfile}. Propuesta: ${proposal}.`,
          config: { 
              responseMimeType: "application/json",
              responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                      summary: { type: Type.STRING },
                      pros: { type: Type.ARRAY, items: { type: Type.STRING } },
                      cons: { type: Type.ARRAY, items: { type: Type.STRING } }
                  },
                  required: ["summary", "pros", "cons"]
              }
          }
      });
      const parsed = JSON.parse(response.text || '{}');
      return {
          summary: String(parsed.summary || "Evaluación no disponible"),
          pros: Array.isArray(parsed.pros) ? parsed.pros.map(String) : [],
          cons: Array.isArray(parsed.cons) ? parsed.cons.map(String) : []
      };
    } catch (err) {
      logger.error("Applicant Summary AI Error", { error: err });
      return { summary: "Error en evaluación de candidato", pros: [], cons: [] };
    }
};