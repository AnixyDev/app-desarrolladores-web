// Exportar todos tus datos en un ZIP (06/10/2026, página de Garantías).
//
// «Tus datos son tuyos»: en cualquier momento, sin darte de baja, puedes
// llevarte todo lo que has metido en DevFreelancer:
//   - facturas/*.pdf y facturas.csv (los mismos que en la baja de cuenta),
//   - un CSV por tabla (clientes, proyectos, horas, gastos…),
//   - datos.json con todo junto, para importarlo en otra herramienta,
//   - LEEME.txt explicando qué es cada archivo.
// Solo entra lo que es de la cuenta (user_id propio): un miembro de un equipo
// no se lleva los datos del titular.
import { crearZip, type ArchivoZip } from '@/lib/zip';
import { archivosDeFacturas, type DatosZipFacturas } from '@/lib/descargaFacturas';

type Fila = Record<string, unknown>;

/** Tablas que se exportan: nombre del archivo → filas. */
export type TablasExportables = Record<string, readonly object[] | undefined>;

const celda = (v: unknown): string => {
  if (v === null || v === undefined) return '""';
  const texto = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return `"${texto.replace(/"/g, '""')}"`;
};

/** CSV con todas las columnas que aparezcan en alguna fila. BOM y «;» para Excel en español. */
export function csvGenerico(filas: Fila[]): string {
  const columnas: string[] = [];
  for (const f of filas) for (const k of Object.keys(f)) if (!columnas.includes(k)) columnas.push(k);
  if (columnas.length === 0) return '﻿';
  return '﻿' + [columnas.map(celda).join(';'), ...filas.map((f) => columnas.map((c) => celda(f[c])).join(';'))].join('\r\n');
}

/** Solo las filas de la cuenta; las que no llevan user_id se dejan (ya vienen filtradas). */
export const soloDeLaCuenta = (filas: readonly object[] | undefined, uid: string): Fila[] =>
  ((filas ?? []) as Fila[]).filter((f) => !('user_id' in f) || f.user_id === uid);

const LEEME = (fecha: string, tablas: string[]) => `Exportación de tus datos de DevFreelancer (${fecha})

facturas/        El PDF de cada factura, con su código QR tributario.
facturas.csv     Resumen de las facturas para abrir con Excel u otra hoja de cálculo.
${tablas.map((t) => `${(t + '.csv').padEnd(17)}Todos los registros de «${t}».`).join('\n')}
datos.json       Todo lo anterior junto, para importarlo en otra herramienta.

Los CSV usan «;» como separador y están en UTF-8, como los abre Excel en español.
Las cantidades terminadas en _cents están en céntimos (12100 = 121,00 €).
Tus datos son tuyos: puedes exportarlos cuantas veces quieras desde Ajustes → Seguridad.
`;

export async function zipDeTodosLosDatos(p: DatosZipFacturas & { tablas: TablasExportables }): Promise<{ blob: Blob; sinCliente: string[] }> {
  const uid = p.perfil.id;
  const facturas = p.facturas.filter((f) => f.user_id === uid);
  const { archivos, sinCliente } = await archivosDeFacturas({ ...p, facturas });

  const json: Record<string, Fila[]> = { facturas: facturas as unknown as Fila[] };
  const nombres: string[] = [];
  const csvs: ArchivoZip[] = [];
  for (const [nombre, filas] of Object.entries(p.tablas)) {
    const propias = soloDeLaCuenta(filas, uid);
    json[nombre] = propias;
    nombres.push(nombre);
    csvs.push({ nombre: `${nombre}.csv`, datos: new TextEncoder().encode(csvGenerico(propias)) });
  }

  const fecha = new Date().toLocaleDateString('es-ES');
  const todos: ArchivoZip[] = [
    { nombre: 'LEEME.txt', datos: new TextEncoder().encode(LEEME(fecha, nombres)) },
    ...archivos,
    ...csvs,
    { nombre: 'datos.json', datos: new TextEncoder().encode(JSON.stringify({ exportado: new Date().toISOString(), ...json }, null, 2)) },
  ];
  return { blob: new Blob([crearZip(todos).buffer as ArrayBuffer], { type: 'application/zip' }), sinCliente };
}
