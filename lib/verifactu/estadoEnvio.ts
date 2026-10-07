// Verifactu, fase 2 (07/10/2026): cómo se muestra el envío a la AEAT de cada
// registro fiscal (página Registro Fiscal).
import type { FiscalRecord } from '@/types';

/**
 * Texto y color del estado de envío a la AEAT de un registro.
 * `corregido`: ya hay otro registro que lo subsana (fase 3), así que no hay
 * nada pendiente con este.
 */
export const estadoEnvio = (
  r: Pick<FiscalRecord, 'estado_envio' | 'envio_error_codigo' | 'envio_error_descripcion' | 'envio_intentos'>,
  corregido = false,
) => {
  const error = r.envio_error_descripcion ? `${r.envio_error_codigo ? `[${r.envio_error_codigo}] ` : ''}${r.envio_error_descripcion}` : null;
  if (corregido && (r.estado_envio === 'rechazado' || r.estado_envio === 'aceptado_con_errores')) {
    return {
      texto: r.estado_envio === 'rechazado' ? 'Rechazado · corregido y reenviado' : 'Con errores · corregido y reenviado',
      clase: 'bg-gray-700/50 text-gray-300',
      detalle: error,
    };
  }
  switch (r.estado_envio) {
    case 'aceptado': return { texto: 'Aceptado por la AEAT', clase: 'bg-green-500/20 text-green-400', detalle: null };
    case 'aceptado_con_errores': return { texto: 'Aceptado con errores', clase: 'bg-yellow-500/20 text-yellow-300', detalle: error };
    case 'rechazado': return { texto: 'Rechazado', clase: 'bg-red-500/20 text-red-400', detalle: error };
    case 'pendiente': return {
      texto: (r.envio_intentos ?? 0) > 0 ? 'Pendiente (reintentando)' : 'Pendiente de envío',
      clase: 'bg-blue-500/20 text-blue-300',
      detalle: error,
    };
    case 'enviado': return { texto: 'Enviado', clase: 'bg-blue-500/20 text-blue-300', detalle: null };
    default: return { texto: 'No se envía', clase: 'bg-gray-700/50 text-gray-400', detalle: null };
  }
};

type RegistroParaCorregir = Pick<FiscalRecord, 'id' | 'invoice_id' | 'record_type' | 'modalidad' | 'estado_envio' | 'envio_error_codigo' | 'subsana_registro_id'>;

/**
 * ¿Se puede corregir y reenviar este registro? (botón «Corregir y reenviar»).
 * Mismas condiciones que subsanar_registro_fiscal en la base de datos.
 */
export function sePuedeCorregir(r: RegistroParaCorregir, todos: RegistroParaCorregir[]): boolean {
  return r.record_type === 'alta'
    && r.modalidad === 'verifactu'
    && (r.estado_envio === 'rechazado' || r.estado_envio === 'aceptado_con_errores')
    && r.envio_error_codigo !== 'HUELLA'
    && !todos.some((o) => o.subsana_registro_id === r.id)
    && !todos.some((o) => o.invoice_id === r.invoice_id && o.record_type === 'anulacion');
}
