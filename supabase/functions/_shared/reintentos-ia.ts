// Política de reintentos de las llamadas a Gemini (28/09/2026). Pura: la usa
// ai-gemini y la prueba vitest.
//
// Por qué existe: en producción, el 28/09, la mitad de los mensajes fallaban.
// La clave propia guardada en Ajustes era inválida (400) y, al pasar a la
// compartida, el modelo de respaldo devolvía 503 «high demand». Había un solo
// intento por modelo. Ahora los fallos pasajeros se reintentan con espera,
// alternando modelos, y una clave propia inválida cae a la compartida sin
// gastar un intento.

export const ES_TRANSITORIO = /\b(429|500|502|503|504)\b|unavailable|high demand|overloaded|deadline|timed? ?out|aborted|resource_exhausted/i;
export const ES_MODELO_NO_DISPONIBLE = /\b404\b|not found|empty gemini response/i;

export function esErrorDeClave(mensaje: string): boolean {
  const m = mensaje.toLowerCase();
  return m.includes('api key not valid') || m.includes('api_key_invalid') || m.includes('permission_denied') ||
    m.includes('error 401') || m.includes('error 403');
}

export interface OpcionesReintento {
  plan: string[];
  clavePropia: string;
  claveCompartida: string;
  esperar?: (ms: number) => Promise<void>;
  registrar?: (texto: string) => void;
}

export async function conRespaldo<T>(o: OpcionesReintento, llamar: (clave: string, modelo: string) => Promise<T>): Promise<T> {
  const esperar = o.esperar ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let clave = o.clavePropia;
  let ultimo: unknown = new Error('Empty Gemini response');
  for (let i = 0; i < o.plan.length; i++) {
    const modelo = o.plan[i];
    try {
      return await llamar(clave, modelo);
    } catch (e) {
      ultimo = e;
      const msg = String((e as Error)?.message ?? e);
      const propia = clave !== o.claveCompartida;
      o.registrar?.(`intento ${i + 1} fallido (${modelo}, clave ${propia ? 'propia' : 'compartida'}): ${msg.slice(0, 300)}`);
      if (propia && esErrorDeClave(msg)) {
        // La clave propia no vale: se repite el MISMO paso con la compartida.
        clave = o.claveCompartida;
        i--;
        continue;
      }
      if (!ES_TRANSITORIO.test(msg) && !ES_MODELO_NO_DISPONIBLE.test(msg)) throw e;
      if (i < o.plan.length - 1) await esperar(700 * (i + 1));
    }
  }
  throw ultimo;
}
