import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { proyectosDeTrabajo } from '../../lib/datosPropios'

const yo = 'yo'
const p = (id: string, user_id: string, client_id: string) => ({ id, user_id, client_id }) as any

describe('proyectos en las pantallas de trabajo', () => {
  it('quita los que solo se ven por ser cliente del portal de otro', () => {
    const lista = [
      p('propio', yo, 'mi-cliente'),
      p('del-equipo', 'duena-equipo', 'cliente-de-la-duena'),
      p('como-cliente', 'otro-freelancer', 'ficha-donde-soy-cliente'),
    ]
    expect(proyectosDeTrabajo(lista, yo, new Set(['ficha-donde-soy-cliente'])).map(x => x.id))
      .toEqual(['propio', 'del-equipo'])
  })
})

describe('el store carga solo lo que emite esta cuenta', () => {
  const finanzas = readFileSync('hooks/store/financeSlice.ts', 'utf8')
  const clientes = readFileSync('hooks/store/clientSlice.ts', 'utf8')

  it('facturas, presupuestos, propuestas, contratos, recibos, recurrentes y gastos filtran por user_id', () => {
    for (const tabla of ['invoices', 'budgets', 'proposals', 'contracts', 'receipts', 'recurring_invoices', 'recurring_expenses', 'expenses', 'fiscal_records']) {
      const lecturas = finanzas.match(new RegExp(`from\\('${tabla}'\\)\\.select\\([^)]*\\)[^;\\n]*`, 'g')) ?? []
      expect(lecturas.length, tabla).toBeGreaterThan(0)
      for (const l of lecturas) expect(l, tabla).toContain(".eq('user_id', uid)")
    }
  })

  it('clientes filtra por user_id', () => {
    expect(clientes).toMatch(/\.from\('clients'\)\s*\.select\('\*'\)\s*\.eq\('user_id', uid\)/)
  })
})
