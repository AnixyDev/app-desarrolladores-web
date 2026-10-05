// Importes de cada factura que emite una recurrente. Sin imports de Deno para
// que vitest lo pueda probar (src/test/importes-recurrentes.test.ts).
//
// Mismo cálculo que la app al crear una factura a mano (totalesDeFactura en
// hooks/store/financeSlice.ts): total = base + IVA − IRPF, redondeado.
// Para un cliente de otro país (UE o fuera de la UE) la factura va sin IVA
// ni IRPF, igual que en la pantalla de nueva factura; la base de datos pone
// después el motivo sin IVA según el cliente.

export interface LineaRecurrente {
  price_cents: number | string;
  quantity: number | string;
}

export interface ImportesRecurrente {
  subtotal: number;
  taxPercent: number;
  irpfPercent: number;
  total: number;
}

const CLIENTES_EXTRANJEROS = new Set(['empresa_ue', 'fuera_ue']);

const porcentaje = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : 0;
};

/** null si las líneas no dan un importe válido. */
export function importesDeRecurrente(
  items: LineaRecurrente[],
  taxPercent: unknown,
  irpfPercent: unknown,
  tipoFiscalCliente?: string | null,
): ImportesRecurrente | null {
  const subtotal = Math.round(
    items.reduce((sum, item) => sum + Number(item.price_cents) * Number(item.quantity), 0),
  );
  if (!Number.isFinite(subtotal)) return null;

  const extranjero = CLIENTES_EXTRANJEROS.has(tipoFiscalCliente ?? '');
  const iva = extranjero ? 0 : porcentaje(taxPercent);
  const irpf = extranjero ? 0 : porcentaje(irpfPercent);
  const total = Math.round(subtotal + subtotal * (iva / 100) - subtotal * (irpf / 100));
  return { subtotal, taxPercent: iva, irpfPercent: irpf, total };
}
