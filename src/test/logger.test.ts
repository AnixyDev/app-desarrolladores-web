import { describe, it, expect, vi, afterEach } from 'vitest';
import { crearLogger } from '../../lib/loggerService';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('logger en produccion', () => {
  it('info no escribe nada', () => {
    const espia = vi.spyOn(console, 'info').mockImplementation(() => {});
    crearLogger(false).info('traza de desarrollo', { dato: 1 });
    expect(espia).not.toHaveBeenCalled();
  });

  it('error si escribe — los fallos reales se ven siempre', () => {
    const espia = vi.spyOn(console, 'error').mockImplementation(() => {});
    crearLogger(false).error('algo ha fallado', { causa: 'timeout' });
    expect(espia).toHaveBeenCalledTimes(1);
    expect(espia.mock.calls[0][0]).toContain('algo ha fallado');
  });

  it('warn si escribe', () => {
    const espia = vi.spyOn(console, 'warn').mockImplementation(() => {});
    crearLogger(false).warn('atencion');
    expect(espia).toHaveBeenCalledTimes(1);
  });
});

describe('logger en desarrollo', () => {
  it('info escribe, con su contexto', () => {
    const espia = vi.spyOn(console, 'info').mockImplementation(() => {});
    crearLogger(true).info('arrancando', { paso: 2 });
    expect(espia).toHaveBeenCalledTimes(1);
    expect(espia.mock.calls[0][0]).toContain('arrancando');
    expect(espia.mock.calls[0][1]).toEqual({ paso: 2 });
  });

  it('el contexto es opcional', () => {
    const espia = vi.spyOn(console, 'info').mockImplementation(() => {});
    crearLogger(true).info('sin contexto');
    expect(espia).toHaveBeenCalledTimes(1);
    expect(espia.mock.calls[0][1]).toEqual({});
  });
});

describe('el modulo se puede importar sin navegador', () => {
  it('no toca window al cargarse', async () => {
    // La version anterior hacia `window.location.hostname` en el cuerpo del
    // modulo: importarlo sin navegador reventaba. Aqui se comprueba que la
    // fabrica no depende de ningun global del navegador.
    // Se silencia la consola: esta prueba llama a error() a proposito y sin
    // esto dejaba un "[ERROR] algo {}" en rojo en medio de la salida, que
    // parece un fallo sin serlo.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});

    const original = globalThis.window;
    // @ts-expect-error: se quita window a proposito para la prueba
    delete globalThis.window;
    try {
      expect(() => crearLogger(false).info('nada')).not.toThrow();
      expect(() => crearLogger(true).error('algo')).not.toThrow();
    } finally {
      globalThis.window = original;
    }
  });
});

describe('sin datos personales en las trazas', () => {
  it('ningun mensaje de authSlice lleva email ni identificador', async () => {
    // Dos de los console.log que habia aqui escribian el email del usuario en
    // la consola del navegador. Esta prueba lee el archivo y falla si vuelve a
    // aparecer un logger.info con un campo que parezca personal.
    // Ruta desde la raiz del proyecto: en vitest con jsdom, import.meta.url
    // no es un file:// y readFileSync lo rechaza.
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const fuente = readFileSync(resolve(process.cwd(), 'hooks/store/authSlice.ts'), 'utf8');

    const llamadas = fuente.match(/logger\.info\([^;]*\);/g) ?? [];
    expect(llamadas.length).toBeGreaterThan(0);

    for (const llamada of llamadas) {
      expect(llamada).not.toMatch(/\.email/);
      expect(llamada).not.toMatch(/user\.id/);
      expect(llamada).not.toMatch(/session\.user/);
    }
  });

  it('no queda ningun console.log suelto en authSlice ni en App', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    for (const ruta of ['hooks/store/authSlice.ts', 'App.tsx']) {
      const fuente = readFileSync(resolve(process.cwd(), ruta), 'utf8');
      expect(fuente).not.toMatch(/console\.log\(/);
    }
  });
});
