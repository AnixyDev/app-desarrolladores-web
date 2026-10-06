// Descarga de todas las facturas en un ZIP (30/09/2026). La ofrece la página
// de baja antes de confirmar, para que el usuario se quede con su copia.
// Mismos PDFs que Facturas → Descargar (con su QR tributario) y un CSV
// resumen para abrir en una hoja de cálculo.
import type { Invoice, Client, Profile, FiscalRecord } from '@/types';
import { generateInvoicePdfBase64 } from '@/services/pdfService';
import { crearZip, type ArchivoZip } from '@/lib/zip';

const base64ABytes = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
const nombreSeguro = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9-]+/g, '_').slice(0, 60) || 'factura';
const celda = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const euros = (c: number) => ((Number(c) || 0) / 100).toFixed(2).replace('.', ',');

export function csvDeFacturas(facturas: Invoice[], cliente: (id: string) => Client | undefined): string {
  const cabecera = ['Número', 'Fecha', 'Vencimiento', 'Cliente', 'NIF cliente', 'Base', 'IVA %', 'IRPF %', 'Total', 'Pagada'];
  const filas = facturas.map(f => {
    const c = cliente(f.client_id);
    return [f.invoice_number, f.issue_date, f.due_date, c?.name ?? '', c?.tax_id ?? '', euros(f.subtotal_cents), f.tax_percent, f.irpf_percent ?? 0, euros(f.total_cents), f.paid ? 'Sí' : 'No'];
  });
  // BOM para que Excel lea bien los acentos; separador «;» como usa Excel en español.
  return '﻿' + [cabecera, ...filas].map(f => f.map(celda).join(';')).join('\r\n');
}

export interface DatosZipFacturas {
  facturas: Invoice[];
  cliente: (id: string) => Client | undefined;
  perfil: Profile;
  registrosFiscales: FiscalRecord[];
  alAvanzar?: (hechas: number, total: number) => void;
}

export async function zipDeFacturas(p: DatosZipFacturas): Promise<{ blob: Blob; sinCliente: string[] }> {
  const { archivos, sinCliente } = await archivosDeFacturas(p);
  return { blob: new Blob([crearZip(archivos).buffer as ArrayBuffer], { type: 'application/zip' }), sinCliente };
}

/** PDFs (carpeta facturas/) y facturas.csv, listos para meter en un ZIP. */
export async function archivosDeFacturas(p: DatosZipFacturas): Promise<{ archivos: ArchivoZip[]; sinCliente: string[] }> {
  const archivos: ArchivoZip[] = [];
  const sinCliente: string[] = [];
  const usados = new Set<string>();
  for (let i = 0; i < p.facturas.length; i++) {
    const f = p.facturas[i];
    const c = p.cliente(f.client_id);
    p.alAvanzar?.(i, p.facturas.length);
    if (!c) { sinCliente.push(f.invoice_number); continue; }
    const registro = p.registrosFiscales.find(r => r.invoice_id === f.id && r.record_type === 'alta');
    const b64 = await generateInvoicePdfBase64(f, c, p.perfil, registro ? { modalidad: registro.modalidad, hash: registro.hash } : null, {
      rectificaA: p.facturas.find(o => o.id === f.rectifies_invoice_id)?.invoice_number,
    });
    let nombre = `facturas/${nombreSeguro(f.invoice_number)}.pdf`;
    for (let n = 2; usados.has(nombre); n++) nombre = `facturas/${nombreSeguro(f.invoice_number)}-${n}.pdf`;
    usados.add(nombre);
    archivos.push({ nombre, datos: base64ABytes(b64) });
  }
  archivos.push({ nombre: 'facturas.csv', datos: new TextEncoder().encode(csvDeFacturas(p.facturas, p.cliente)) });
  p.alAvanzar?.(p.facturas.length, p.facturas.length);
  return { archivos, sinCliente };
}
