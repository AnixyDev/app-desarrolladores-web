import { describe, it, expect } from 'vitest';
import { estadoEnvio, sePuedeCorregir } from '@/lib/verifactu/estadoEnvio';

describe('estado del envío a la AEAT', () => {
  it('muestra el error de la AEAT con su código', () => {
    const e = estadoEnvio({ estado_envio: 'rechazado', envio_error_codigo: '1100', envio_error_descripcion: 'Valor o tipo incorrecto', envio_intentos: 1 });
    expect(e.texto).toBe('Rechazado');
    expect(e.detalle).toBe('[1100] Valor o tipo incorrecto');
  });

  it('un pendiente con intentos fallidos dice que se está reintentando', () => {
    expect(estadoEnvio({ estado_envio: 'pendiente', envio_error_codigo: 'CONEXION', envio_error_descripcion: 'No se ha podido conectar', envio_intentos: 2 }).texto).toBe('Pendiente (reintentando)');
    expect(estadoEnvio({ estado_envio: 'pendiente', envio_error_codigo: null, envio_error_descripcion: null, envio_intentos: 0 }).texto).toBe('Pendiente de envío');
  });

  it('aceptado no muestra detalle; no_aplica dice que no se envía', () => {
    expect(estadoEnvio({ estado_envio: 'aceptado', envio_error_codigo: null, envio_error_descripcion: null }).detalle).toBeNull();
    expect(estadoEnvio({ estado_envio: 'no_aplica', envio_error_codigo: null, envio_error_descripcion: null }).texto).toBe('No se envía');
  });
});


describe('corregir y reenviar (fase 3)', () => {
  const alta = { id: 'a', invoice_id: 'f', record_type: 'alta' as const, modalidad: 'verifactu' as const, estado_envio: 'rechazado' as const, envio_error_codigo: '1239', subsana_registro_id: null };

  it('un alta rechazada o con errores se puede corregir una vez', () => {
    expect(sePuedeCorregir(alta, [alta])).toBe(true);
    expect(sePuedeCorregir({ ...alta, estado_envio: 'aceptado_con_errores' }, [alta])).toBe(true);
    const nueva = { ...alta, id: 'b', estado_envio: 'pendiente' as const, subsana_registro_id: 'a' };
    expect(sePuedeCorregir(alta, [alta, nueva])).toBe(false);
    expect(estadoEnvio(alta, true).texto).toContain('corregido');
  });

  it('no: aceptada, pendiente, anulación, factura anulada, huella manipulada o sin envío a la AEAT', () => {
    expect(sePuedeCorregir({ ...alta, estado_envio: 'aceptado' }, [])).toBe(false);
    expect(sePuedeCorregir({ ...alta, estado_envio: 'pendiente' }, [])).toBe(false);
    expect(sePuedeCorregir({ ...alta, record_type: 'anulacion' }, [])).toBe(false);
    expect(sePuedeCorregir(alta, [alta, { ...alta, id: 'n', record_type: 'anulacion' }])).toBe(false);
    expect(sePuedeCorregir({ ...alta, envio_error_codigo: 'HUELLA' }, [])).toBe(false);
    expect(sePuedeCorregir({ ...alta, modalidad: 'no_verifactu' }, [])).toBe(false);
  });
});
