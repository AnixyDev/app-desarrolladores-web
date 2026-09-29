// ¿La petición trae la clave de servicio? (29/09/2026). Pura: la usan las
// funciones que solo lanza el cron y la prueba vitest.
//
// Antes cada función comparaba con `!==`, que se detiene en el primer carácter
// distinto: en teoría, midiendo tiempos se puede ir adivinando la clave. Aquí
// se recorre siempre la cadena entera. Además, si la variable de entorno
// faltaba, la cabecera «Bearer undefined» pasaba la comprobación.

export function esLlamadaDelServicio(cabecera: string | null | undefined, claveServicio: string | null | undefined): boolean {
  if (!claveServicio || !cabecera) return false;
  const esperado = new TextEncoder().encode(`Bearer ${claveServicio}`);
  const recibido = new TextEncoder().encode(cabecera);
  let diferencia = esperado.length ^ recibido.length;
  for (let i = 0; i < esperado.length; i++) {
    diferencia |= esperado[i] ^ (recibido[i] ?? 0);
  }
  return diferencia === 0;
}
