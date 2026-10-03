/**
 * "Quiero el Plan Fundadores" desde la web pública.
 *
 * Quien pulsa la oferta en /pricing todavía no tiene cuenta. Entre ese clic y
 * el pago hay un registro que puede salir de la web (Google) o pasar por el
 * correo (confirmación de email), así que la intención se recuerda en el
 * navegador, igual que el código de afiliado (lib/afiliados.ts). Al entrar en
 * la app con sesión, se lleva al usuario a /billing?oferta=fundadores, que
 * abre el pago. Plazas, fecha y suscripción previa los sigue comprobando el
 * servidor (checkout-fundadores).
 *
 * Caduca a las 48 h para no sorprender a nadie días después.
 */

const CLAVE = 'devfreelancer_oferta_fundadores';
const VIGENCIA_MS = 48 * 60 * 60 * 1000;

/** Parámetro de URL que marca la oferta: ?oferta=fundadores */
export const PARAM_OFERTA = 'oferta';
export const VALOR_FUNDADORES = 'fundadores';
export const RUTA_PAGO_FUNDADORES = `/billing?${PARAM_OFERTA}=${VALOR_FUNDADORES}`;

export const pideFundadores = (search: string): boolean =>
  new URLSearchParams(search).get(PARAM_OFERTA) === VALOR_FUNDADORES;

// localStorage puede no existir o lanzar (modo privado): nunca debe romper
// el registro ni el inicio de sesión.
export const guardarIntencionFundadores = (ahora: number = Date.now()): void => {
  try { localStorage.setItem(CLAVE, String(ahora)); } catch { /* sin almacenamiento */ }
};

export const hayIntencionFundadores = (ahora: number = Date.now()): boolean => {
  try {
    const guardada = Number(localStorage.getItem(CLAVE));
    if (!guardada) return false;
    if (ahora - guardada > VIGENCIA_MS || guardada > ahora) {
      localStorage.removeItem(CLAVE);
      return false;
    }
    return true;
  } catch {
    return false;
  }
};

export const borrarIntencionFundadores = (): void => {
  try { localStorage.removeItem(CLAVE); } catch { /* sin almacenamiento */ }
};
