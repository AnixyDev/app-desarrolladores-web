/**
 * Registro unificado para DevFreelancer.
 *
 * ANTES: `const IS_PROD = window.location.hostname !== 'localhost'`.
 * Tres problemas con eso:
 *
 *   1. Se decide en tiempo de EJECUCIÓN, así que los mensajes de desarrollo
 *      viajan igualmente dentro del paquete que descarga el usuario. Solo se
 *      callan; no desaparecen.
 *   2. Toca `window` al cargar el módulo: en cualquier contexto sin navegador
 *      (una prueba, un render en servidor) el módulo falla al importarse.
 *   3. `127.0.0.1` contaba como producción.
 *
 * AHORA se usa `import.meta.env.DEV`, que Vite sustituye por `true` o `false`
 * al construir. En producción la condición queda en `false` y el minificador
 * borra el bloque entero: los mensajes de desarrollo ni se ejecutan ni se
 * descargan.
 */

/** Fábrica separada para poder probar las dos ramas sin tocar el entorno. */
export function crearLogger(enDesarrollo: boolean) {
  return {
    /** Fallos reales. Se ven SIEMPRE, también en producción. */
    error: (mensaje: string, contexto: Record<string, unknown> = {}) => {
      console.error(`[ERROR] ${mensaje}`, contexto);
    },

    /** Algo va mal pero no rompe. Se ve siempre. */
    warn: (mensaje: string, contexto: Record<string, unknown> = {}) => {
      console.warn(`[WARN] ${mensaje}`, contexto);
    },

    /**
     * Traza de desarrollo. NO se ve en producción y no llega al paquete.
     *
     * Aquí no van datos personales — ni emails, ni identificadores de usuario,
     * ni importes. Aunque esto solo se ejecute en local, un `console.log` con
     * el email del usuario acaba en capturas de pantalla, en sesiones
     * compartidas y al alcance de cualquier extensión del navegador.
     */
    info: (mensaje: string, contexto: Record<string, unknown> = {}) => {
      if (enDesarrollo) console.info(`[INFO] ${mensaje}`, contexto);
    },
  };
}

export type Logger = ReturnType<typeof crearLogger>;

export const logger: Logger = crearLogger(import.meta.env.DEV === true);
