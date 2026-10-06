// Borrar un cliente (06/10/2026, decisión de Ana).
//
// - Con facturas emitidas NO se borra: hay que conservarlas. Se explica y se
//   ofrece descargarlas (mismo ZIP que la baja de cuenta: PDF con QR + CSV).
//   La base de datos lo impide también (disparador clients_no_borrar_con_facturas,
//   error DF001), por si alguien llama a la API directamente.
// - Sin facturas se borra, diciendo antes qué más se va con él.
//
// Antes la ficha llamaba a deleteClient sin esperar y navegaba a la lista: si
// el borrado fallaba, el cliente parecía borrado y volvía al recargar.
import type { Client, Invoice, Profile, FiscalRecord } from '@/types';
import { confirmar } from '@/hooks/useConfirmar';
import { zipDeFacturas } from '@/lib/descargaFacturas';

type Aviso = (mensaje: string, tipo?: 'success' | 'error' | 'info') => void;

export interface DatosBorrarCliente {
  cliente: Client;
  facturas: Invoice[];
  proyectos: number;
  borrar: (id: string) => Promise<void>;
  avisar: Aviso;
  /** Para generar el ZIP de facturas. */
  perfil: Profile | null | undefined;
  registrosFiscales: FiscalRecord[];
  clientePorId: (id: string) => Client | undefined;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

const nombreArchivo = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'cliente';

export async function descargarFacturasDelCliente(d: Pick<DatosBorrarCliente, 'cliente' | 'facturas' | 'perfil' | 'registrosFiscales' | 'clientePorId' | 'avisar'>) {
  if (!d.perfil) return;
  try {
    const { blob } = await zipDeFacturas({
      facturas: d.facturas, cliente: d.clientePorId, perfil: d.perfil, registrosFiscales: d.registrosFiscales,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `facturas-${nombreArchivo(d.cliente.name)}-${new Date().toISOString().slice(0, 10)}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    d.avisar('Facturas descargadas.', 'success');
  } catch (e) {
    console.error('Descarga de facturas del cliente:', e);
    d.avisar('No se pudieron generar los PDF. Inténtalo de nuevo.', 'error');
  }
}

/** Devuelve true si el cliente se ha borrado de verdad. */
export async function borrarClienteConConfirmacion(d: DatosBorrarCliente): Promise<boolean> {
  if (d.facturas.length > 0) {
    const descargar = await confirmar({
      titulo: 'Este cliente no se puede borrar',
      mensaje:
        `${d.cliente.name} tiene ${plural(d.facturas.length, 'factura emitida', 'facturas emitidas')}, y las facturas ` +
        'hay que conservarlas (en España, al menos 4 años). Siguen guardadas aquí; si quieres tu propia copia, descárgalas. ' +
        'Si solo quieres corregir sus datos, edita la ficha.',
      textoConfirmar: 'Descargar sus facturas',
      textoCancelar: 'Cerrar',
    });
    if (descargar) await descargarFacturasDelCliente(d);
    return false;
  }

  const tambien = d.proyectos > 0
    ? ` También se borrarán sus ${plural(d.proyectos, 'proyecto', 'proyectos')} (con sus tareas, horas, hitos y mensajes), presupuestos, propuestas, contratos y facturas recurrentes programadas.`
    : ' También se borrarán sus presupuestos, propuestas, contratos y facturas recurrentes programadas, si tiene.';
  const seguro = await confirmar({
    titulo: `¿Borrar a ${d.cliente.name}?`,
    mensaje: `No tiene facturas.${tambien} No se puede deshacer.`,
    textoConfirmar: 'Borrar cliente',
    peligro: true,
  });
  if (!seguro) return false;

  try {
    await d.borrar(d.cliente.id);
    d.avisar(`Cliente «${d.cliente.name}» borrado.`, 'info');
    return true;
  } catch (e) {
    const err = e as { code?: string; message?: string };
    // DF001: la base de datos ha encontrado facturas que la pantalla no tenía cargadas.
    d.avisar(err.code === 'DF001' && err.message ? err.message : 'No se pudo borrar el cliente. Inténtalo de nuevo.', 'error');
    return false;
  }
}
