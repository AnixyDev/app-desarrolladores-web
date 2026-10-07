// Verifactu (07/10/2026): las mismas comprobaciones que hace la base de datos
// al registrar una factura (registrar_factura_fiscal), hechas ANTES de crearla.
// Así el usuario ve el problema en el formulario en vez de encontrarse una
// factura creada pero sin registro fiscal.
//
// Si cambian las reglas en la migración verifactu_registro_oficial, cambiarlas
// también aquí (src/test/verifactu-comprobar.test.ts).
import type { Client, Profile } from '@/types';

export const TIPOS_IVA_VALIDOS = [2, 4, 5, 7.5, 10, 21];
export const LIMITE_SIMPLIFICADA_CENTS = 40000; // 400 € con IVA
const INICIO_VERIFACTU = '2024-10-28';

export const normalizarNif = (v?: string | null): string | null => {
  const limpio = (v ?? '').replace(/[\s.-]/g, '').toUpperCase();
  if (!limpio) return null;
  return /^ES[0-9A-Z]{9}$/.test(limpio) ? limpio.slice(2) : limpio;
};

const hoyEnMadrid = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export interface FacturaAComprobar {
  issue_date: string;             // AAAA-MM-DD
  subtotal_cents: number;
  tax_percent: number;
  /** Es una rectificativa (no se aplica el límite de la simplificada). */
  rectificativa?: boolean;
}

/** Devuelve el primer problema que impediría registrar la factura, o null si está bien. */
export function problemaRegistroFiscal(
  factura: FacturaAComprobar,
  cliente: Pick<Client, 'name' | 'company' | 'tax_id' | 'tipo_fiscal' | 'nif_iva' | 'pais'> | undefined,
  perfil: Pick<Profile, 'tax_id' | 'business_name' | 'full_name'> | null | undefined,
  hoy: string = hoyEnMadrid(),
): string | null {
  const nif = normalizarNif(perfil?.tax_id);
  if (!nif) return 'Falta tu NIF. Rellénalo en Ajustes → Perfil antes de emitir facturas.';
  if (!/^[0-9A-Z]{9}$/.test(nif)) return `Tu NIF («${perfil?.tax_id}») no es válido: debe tener 9 caracteres. Corrígelo en Ajustes → Perfil.`;
  if (!(perfil?.business_name?.trim() || perfil?.full_name?.trim())) return 'Falta tu nombre o razón social en Ajustes → Perfil.';

  if (factura.issue_date > hoy) return 'La fecha de la factura no puede ser posterior a hoy.';
  if (factura.issue_date < INICIO_VERIFACTU) return 'La fecha de la factura no puede ser anterior al 28/10/2024.';

  if (!cliente) return 'Elige un cliente.';
  const nombre = (cliente.company?.trim() || cliente.name).trim();
  const tipo = cliente.tipo_fiscal ?? 'nacional';

  const iva = Number(factura.tax_percent) || 0;
  if (iva > 0 && !TIPOS_IVA_VALIDOS.includes(iva)) return `El IVA del ${iva} % no es un tipo válido para Hacienda (4, 10 o 21 %).`;
  if (iva === 0 && tipo === 'nacional') {
    return `«${nombre}» es un cliente de España: su factura lleva IVA. Solo se factura sin IVA a empresas de la UE o a clientes de fuera de la UE.`;
  }

  // ¿Está identificado el cliente? (si no, solo cabe la simplificada hasta 400 €)
  let identificado = false;
  if (tipo === 'empresa_ue') {
    if (!cliente.nif_iva) return `«${nombre}» es una empresa de la UE y necesita su NIF-IVA (edita su ficha).`;
    identificado = true;
  } else {
    const doc = normalizarNif(cliente.tax_id);
    const pais = cliente.pais ?? (tipo === 'nacional' ? 'ES' : null);
    if (doc) {
      if (!pais) return `Indica el país de «${nombre}» en su ficha.`;
      if (pais === 'ES' && !/^[0-9A-Z]{9}$/.test(doc)) return `El NIF de «${nombre}» no es válido: debe tener 9 caracteres.`;
      identificado = true;
    }
  }

  const cuota = Math.round(factura.subtotal_cents * iva / 100);
  if (!identificado && !factura.rectificativa && factura.subtotal_cents + cuota > LIMITE_SIMPLIFICADA_CENTS) {
    return `Para una factura de más de 400 € Hacienda exige identificar al cliente: añade el NIF de «${nombre}» (o su documento y país, si es extranjero) en su ficha.`;
  }
  // Rectificativa sin cliente identificado: la base de datos decide (R5 si la
  // original era simplificada; si no, pide identificarlo).
  return null;
}
