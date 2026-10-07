// Verifactu, fase 2 (07/10/2026): cómo se muestra el envío a la AEAT de cada
// registro fiscal (página Registro Fiscal).
import type { FiscalRecord } from '@/types';

/** Texto y color del estado de envío a la AEAT de un registro. */
export const estadoEnvio = (r: Pick<FiscalRecord, 'estado_envio' | 'envio_error_codigo' | 'envio_error_descripcion' | 'envio_intentos'>) => {
  const error = r.envio_error_descripcion ? `${r.envio_error_codigo ? `[${r.envio_error_codigo}] ` : ''}${r.envio_error_descripcion}` : null;
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
