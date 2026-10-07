// Verifactu (07/10/2026, a petición de la gestoría): la causa de una factura
// rectificativa decide su tipo en el registro de Hacienda. Igual que
// verifactu_tipo_rectificativa() en la base de datos (migración
// verifactu_gestoria): si cambia una, cambiar la otra (src/test/verifactu-causa.test.ts).
//
//   descuento, cancelación o error en el IVA → R1 (art. 80 LIVA / error fundado en derecho)
//   cualquier otra causa                     → R4 (residual: «válida siempre»)
//   rectificativa de una simplificada        → R5

export type CausaRectificacion = 'descuento' | 'cancelacion' | 'error_iva' | 'otro';

export const CAUSAS_RECTIFICACION: { valor: CausaRectificacion; texto: string; ayuda: string }[] = [
  { valor: 'descuento', texto: 'Descuento o rebaja después de facturar', ayuda: 'Por ejemplo, un descuento por pronto pago o por volumen.' },
  { valor: 'cancelacion', texto: 'Trabajo cancelado o devuelto, total o parcialmente', ayuda: 'El cliente anula el encargo o una parte.' },
  { valor: 'error_iva', texto: 'Me equivoqué con el IVA', ayuda: 'Tipo de IVA equivocado, o puse IVA cuando no tocaba (o al revés).' },
  { valor: 'otro', texto: 'Otro motivo', ayuda: 'Error de precio, horas o datos, o un acuerdo posterior con el cliente.' },
];

/** Tipo de factura en Verifactu de la rectificativa (R1, R4 o R5). */
export function tipoRectificativa(causa: CausaRectificacion | null | undefined, tipoOriginal: string | null | undefined): 'R1' | 'R4' | 'R5' {
  if (tipoOriginal === 'F2' || tipoOriginal === 'R5') return 'R5';
  if (causa === 'descuento' || causa === 'cancelacion' || causa === 'error_iva') return 'R1';
  return 'R4';
}
