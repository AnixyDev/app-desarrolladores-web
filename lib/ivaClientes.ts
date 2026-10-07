// Facturas sin IVA español a clientes extranjeros.
//
// El tipo fiscal del cliente decide si la factura lleva IVA. Cuando no lo
// lleva, la base de datos guarda el motivo (invoices.motivo_sin_iva, lo deduce
// un disparador) y el PDF imprime la mención que exige el reglamento de
// facturación (RD 1619/2012, art. 6.1.j y 6.1.m).
//
// Los textos de las menciones deben revisarse con una gestoría.

import type { MotivoSinIva, TipoFiscalCliente } from '@/types';

export const TIPOS_FISCALES: { valor: TipoFiscalCliente; etiqueta: string; ayuda: string }[] = [
  { valor: 'nacional', etiqueta: 'España', ayuda: 'Factura con IVA español.' },
  {
    valor: 'empresa_ue',
    etiqueta: 'Empresa de otro país de la UE',
    ayuda: 'Sin IVA español (inversión del sujeto pasivo). Necesita su NIF-IVA y se declara en el modelo 349.',
  },
  {
    valor: 'fuera_ue',
    etiqueta: 'Cliente de fuera de la UE',
    ayuda: 'Sin IVA español: operación no sujeta por reglas de localización.',
  },
];

export const MENCIONES_SIN_IVA: Record<MotivoSinIva, string> = {
  inversion_sujeto_pasivo_ue:
    'Inversión del sujeto pasivo. Operación no sujeta al IVA español (art. 69.Uno.1º Ley 37/1992); el IVA lo liquida el destinatario.',
  no_sujeta_fuera_ue:
    'Operación no sujeta al IVA español por reglas de localización (art. 69.Uno.1º Ley 37/1992).',
  // Particular de fuera de la UE: la regla es la del art. 69.Dos (servicios
  // de consultoría, ingeniería, informáticos y electrónicos), no la de empresas.
  no_sujeta_fuera_ue_particular:
    'Operación no sujeta al IVA español por reglas de localización (art. 69.Dos Ley 37/1992).',
};

export const esClienteExtranjero = (tipo?: TipoFiscalCliente | null): boolean =>
  tipo === 'empresa_ue' || tipo === 'fuera_ue';

/** El mismo motivo que pone la base de datos (invoices_validar_motivo_sin_iva) para una factura sin IVA. */
export const motivoSinIvaDeCliente = (
  cliente?: { tipo_fiscal?: TipoFiscalCliente | null; es_particular?: boolean | null } | null,
): MotivoSinIva | null => {
  if (cliente?.tipo_fiscal === 'empresa_ue') return 'inversion_sujeto_pasivo_ue';
  if (cliente?.tipo_fiscal === 'fuera_ue') return cliente.es_particular ? 'no_sujeta_fuera_ue_particular' : 'no_sujeta_fuera_ue';
  return null;
};

/** Mención legal a imprimir en la factura, o null si lleva IVA o no hay motivo. */
export const mencionSinIva = (motivo?: MotivoSinIva | null): string | null =>
  motivo ? MENCIONES_SIN_IVA[motivo] ?? null : null;

/** Quita espacios y guiones y pasa a mayúsculas: "de 123-456" -> "DE123456". */
export const normalizarNifIva = (valor?: string | null): string | null => {
  const limpio = (valor ?? '').replace(/[\s.-]/g, '').toUpperCase();
  return limpio === '' ? null : limpio;
};

/** Mismo patrón que la restricción clients_nif_iva_formato de la base de datos. */
export const nifIvaValido = (valor: string): boolean => /^[A-Z]{2}[A-Z0-9+*]{2,13}$/.test(valor);
