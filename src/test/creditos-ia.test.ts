import { describe, it, expect } from 'vitest'
import { AI_CREDIT_COSTS, costeDe } from '../../supabase/functions/_shared/creditos-ia'

// ai-gemini autenticaba al usuario y ejecutaba la accion SIN mirar ni descontar
// creditos: todo el control vivia en el navegador. Llamando a la funcion
// directamente se tenia IA ilimitada y gratis.

describe('costeDe — acciones conocidas', () => {
  it.each([
    ['getAIResponse', 1],
    ['generateTimeEntryDescription', 2],
    ['generateItemsForDocument', 8],
    ['generateFinancialForecast', 15],
    ['analyzeProfitability', 15],
    ['generateProposalText', 5],
    ['summarizeApplicant', 10],
    ['extractExpenseFromImage', 6],
  ])('"%s" cuesta %i', (accion, esperado) => {
    expect(costeDe(accion)).toBe(esperado)
  })
})

describe('costeDe — acciones desconocidas', () => {
  it.each(['', 'gratis', 'GETAIRESPONSE', 'constructor', 'toString', '__proto__', 'hasOwnProperty'])(
    'rechaza "%s" con null',
    (accion) => {
      expect(costeDe(accion)).toBeNull()
    }
  )

  it('rechaza valores que no son texto', () => {
    expect(costeDe(null)).toBeNull()
    expect(costeDe(undefined)).toBeNull()
    expect(costeDe(42)).toBeNull()
    expect(costeDe({})).toBeNull()
  })
})

describe('costeDe — el cliente declara la funcion, no el precio', () => {
  it.each([
    ['chatMessage', 1],
    ['refineProposal', 2],
    ['searchKnowledgeBase', 3],
    ['generateProposal', 5],
    ['generateQuiz', 5],
    ['generateDocument', 10],
  ])('el chat generico con feature "%s" cuesta %i', (feature, esperado) => {
    expect(costeDe('getAIResponse', feature)).toBe(esperado)
  })

  it('una feature inventada no abarata: cae al coste por defecto', () => {
    expect(costeDe('getAIResponse', 'gratis')).toBe(1)
    expect(costeDe('getAIResponse', 'constructor')).toBe(1)
    expect(costeDe('getAIResponse', 0)).toBe(1)
    expect(costeDe('getAIResponse', null)).toBe(1)
  })

  it('NO se puede declarar una funcion barata para una accion cara', () => {
    // El intento: pedir un analisis de rentabilidad (15) diciendo que es chat (1).
    expect(costeDe('analyzeProfitability', 'chatMessage')).toBe(15)
    expect(costeDe('extractExpenseFromImage', 'chatMessage')).toBe(6)
    expect(costeDe('generateFinancialForecast', 'refineProposal')).toBe(15)
    expect(costeDe('summarizeApplicant', 'chatMessage')).toBe(10)
  })

  it('feature solo aplica a la accion generica', () => {
    // generateDocument (10) no puede encarecer ni abaratar otra accion.
    expect(costeDe('generateItemsForDocument', 'generateDocument')).toBe(8)
  })
})

describe('tabla de costes', () => {
  it('ningun coste es cero o negativo', () => {
    for (const [nombre, coste] of Object.entries(AI_CREDIT_COSTS)) {
      expect(coste, nombre).toBeGreaterThan(0)
    }
  })

  it('ninguna accion conocida sale gratis', () => {
    const acciones = [
      'getAIResponse', 'generateTimeEntryDescription', 'generateItemsForDocument',
      'generateFinancialForecast', 'analyzeProfitability', 'generateProposalText',
      'summarizeApplicant', 'extractExpenseFromImage',
    ]
    for (const a of acciones) {
      expect(costeDe(a), a).toBeGreaterThanOrEqual(1)
    }
  })
})
