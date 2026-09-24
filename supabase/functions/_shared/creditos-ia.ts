// Coste en creditos de cada funcion de IA — UNICA fuente de verdad.
//
// Vivia solo en services/geminiService.ts, es decir, en el navegador, y ademas
// el descuento se hacia tambien desde el navegador (authSlice.consumeCredits).
// ai-gemini autenticaba al usuario y ejecutaba la accion SIN mirar ni descontar
// creditos: llamando a la funcion directamente, saltandose la app, cualquier
// usuario registrado tenia IA ilimitada y gratis — la misma que se vende en
// paquetes de 100, 500 y 1000 — y consumia la cuota de Gemini de la cuenta.
//
// Este archivo no importa nada de Deno ni de la red: lo cargan la Edge
// Function, el frontend y vitest.

/** Coste en creditos de cada funcion, por su nombre de cara al usuario. */
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
  extractExpenseFromImage: 6,
} as const;

export type FuncionIA = keyof typeof AI_CREDIT_COSTS;

/**
 * Coste por defecto de cada ACCION de ai-gemini.
 *
 * No es uno a uno: la accion "getAIResponse" atiende a seis funciones
 * distintas (chat, generar documento, quiz, buscar en la base de conocimiento,
 * propuesta y refinar propuesta) con costes de 1 a 10 creditos. Por eso el
 * cliente manda ademas `payload.feature`, y el servidor busca AQUI cuanto vale
 * — nunca acepta un numero del cliente.
 *
 * LIMITACION CONOCIDA: en la familia del chat generico el servidor no puede
 * distinguir por si solo que funcion se esta usando, asi que un cliente
 * manipulado podria declarar "chatMessage" (1) para una operacion de 10. Eso
 * es un cobro de menos, no un acceso gratis: sigue habiendo cobro, sigue
 * limitado por el saldo, y no se puede bajar de 1. Cerrarlo del todo exige
 * partir la accion generica en el backend, que es un cambio mayor.
 */
const COSTE_POR_ACCION: Record<string, FuncionIA> = {
  getAIResponse: 'chatMessage',
  generateTimeEntryDescription: 'enhanceTimeEntry',
  generateItemsForDocument: 'generateInvoiceItems',
  generateFinancialForecast: 'generateForecast',
  analyzeProfitability: 'analyzeProfitability',
  generateProposalText: 'generateProposal',
  summarizeApplicant: 'summarizeApplicant',
  extractExpenseFromImage: 'extractExpenseFromImage',
};

/** Funciones que puede declarar el cliente para la accion generica. */
const FUNCIONES_DEL_CHAT: FuncionIA[] = [
  'chatMessage',
  'generateDocument',
  'generateQuiz',
  'searchKnowledgeBase',
  'generateProposal',
  'refineProposal',
];

const PROPIA = Object.prototype.hasOwnProperty;

function esFuncionConocida(clave: unknown): clave is FuncionIA {
  return typeof clave === 'string' && PROPIA.call(AI_CREDIT_COSTS, clave);
}

/**
 * Cuantos creditos cuesta una peticion. Devuelve null si la accion no existe.
 *
 * `feature` solo se tiene en cuenta para la accion generica, y solo si es una
 * de las suyas: asi un cliente no puede declarar "chatMessage" (1 credito)
 * para un analisis de rentabilidad (15).
 */
export function costeDe(accion: unknown, feature?: unknown): number | null {
  if (typeof accion !== 'string' || !PROPIA.call(COSTE_POR_ACCION, accion)) {
    return null;
  }

  const porDefecto = COSTE_POR_ACCION[accion];

  if (accion === 'getAIResponse' && esFuncionConocida(feature)) {
    if (FUNCIONES_DEL_CHAT.includes(feature)) {
      return AI_CREDIT_COSTS[feature];
    }
  }

  return AI_CREDIT_COSTS[porDefecto];
}
