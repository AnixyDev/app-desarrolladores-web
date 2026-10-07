import { describe, it, expect } from 'vitest';
import { estadoEnvio } from '@/lib/verifactu/estadoEnvio';

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

