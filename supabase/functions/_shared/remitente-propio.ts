// Correo desde el dominio propio del usuario (Pro y Teams).
//
// POR QUÉ EXISTE: todo el correo de la plataforma (facturas, presupuestos,
// recordatorios de cobro, invitaciones al portal) salía por la cuenta de
// Resend de DevFreelancer, que en el plan gratuito da 100 correos al día para
// TODOS los usuarios juntos. Por eso los topes diarios por usuario son bajos.
//
// Un usuario Pro o Teams puede conectar SU cuenta de Resend con SU dominio
// verificado. Entonces sus correos salen desde su dirección (más profesional,
// mejor entrega), con su cupo, y sin los topes de la plataforma.
//
// Reglas:
//   - Solo Pro y Teams. Si baja a Free, la configuración se conserva pero no
//     se usa: vuelve a enviar por la plataforma, con sus topes.
//   - Si SU Resend rechaza un envío, NO se reintenta por la plataforma: se le
//     dice qué ha pasado y se apunta el error para enseñarlo en Ajustes. Así
//     nunca sale un correo desde un remitente distinto del que el usuario ha
//     elegido sin que lo sepa.
//   - La clave se guarda cifrada (AES-GCM, la misma de APP_ENCRYPTION_KEY).
//
// Este módulo no importa nada: el descifrado y `fetch` se le pasan. Así lo
// pueden importar vitest (src/test/remitente-propio.test.ts) y la pantalla de
// Ajustes, que no admiten imports con extensión .ts.

export const RESEND_API_URL = 'https://api.resend.com/emails';

/** Planes que pueden usar su propio remitente. */
export const PLANES_CON_REMITENTE_PROPIO = ['Pro', 'Teams'] as const;

export const planPermiteRemitentePropio = (plan: unknown): boolean =>
  (PLANES_CON_REMITENTE_PROPIO as readonly string[]).includes(String(plan ?? ''));

/**
 * Topes diarios por usuario cuando envía con SU Resend. No protegen el cupo de
 * la plataforma (no lo gasta): solo frenan un bucle o un error que mande cien
 * veces lo mismo. Su propio plan de Resend pone el límite real.
 */
export const TOPES_CON_REMITENTE_PROPIO = {
  documentosPorDia: 200,
  recordatoriosPorDia: 100,
  invitacionesPortalPorDia: 50,
} as const;

const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/;

/** Dirección de envío válida y normalizada, o null. */
export function normalizarDireccion(valor: unknown): string | null {
  const limpio = String(valor ?? '').trim().toLowerCase();
  if (limpio.length > 254 || !EMAIL.test(limpio)) return null;
  return limpio;
}

export const dominioDe = (direccion: string): string => direccion.split('@')[1] ?? '';

/**
 * Dominios que no se pueden verificar en Resend porque son de un proveedor de
 * correo gratuito. Se rechazan al guardar con un mensaje claro, en vez de
 * dejar que el usuario descubra el error de Resend en la prueba.
 */
const DOMINIOS_DE_CORREO_GRATUITO = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.es', 'outlook.com', 'outlook.es',
  'live.com', 'yahoo.com', 'yahoo.es', 'icloud.com', 'me.com', 'protonmail.com', 'proton.me',
  'gmx.com', 'gmx.es', 'aol.com', 'msn.com',
]);

export const esDominioDeCorreoGratuito = (direccion: string): boolean =>
  DOMINIOS_DE_CORREO_GRATUITO.has(dominioDe(direccion));

/** Las claves de Resend empiezan por "re_". */
export function normalizarClaveResend(valor: unknown): string | null {
  const limpia = String(valor ?? '').trim();
  if (!/^re_[A-Za-z0-9_]{10,200}$/.test(limpia)) return null;
  return limpia;
}

/**
 * Nombre visible con dominio propio. Sin la coletilla «vía DevFreelancer»:
 * esa existe porque con el dominio de la plataforma cualquiera podía firmar
 * como otro. Desde su dominio verificado, el usuario firma como quiera.
 */
export function nombreVisiblePropio(nombreNegocio: unknown): string {
  const limpio = String(nombreNegocio ?? '')
    .replace(/[<>"\\\r\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  return limpio || 'Facturación';
}

export const formatearRemitente = (nombre: string, direccion: string): string =>
  `${nombre} <${direccion}>`;

/**
 * Traduce el rechazo de Resend a algo que el usuario pueda arreglar. El texto
 * de Resend se incluye recortado: es SU cuenta, y el mensaje («domain is not
 * verified», «API key is invalid») es justo lo que necesita para arreglarla.
 */
export function motivoDelRechazo(status: number, cuerpo: unknown): string {
  const original = String(
    (cuerpo && typeof cuerpo === 'object' && 'message' in cuerpo ? (cuerpo as { message: unknown }).message : '') ?? ''
  ).replace(/[\r\n]+/g, ' ').slice(0, 240);

  if (status === 401 || status === 403 || /api key/i.test(original)) {
    return 'Resend no acepta tu clave. Comprueba que la has copiado entera y que no la has revocado.' +
      (original ? ` (Resend: ${original})` : '');
  }
  if (/domain|verif/i.test(original)) {
    return 'Tu dominio no está verificado en Resend, o la dirección no es de ese dominio.' +
      (original ? ` (Resend: ${original})` : '');
  }
  if (status === 429) {
    return 'Has llegado al límite de envíos de tu cuenta de Resend. Revisa tu plan en resend.com.';
  }
  return 'Tu cuenta de Resend ha rechazado el envío.' + (original ? ` (Resend: ${original})` : '');
}

export interface RemitentePropio {
  propio: true;
  apiKey: string;
  direccion: string;
}

/** Cliente mínimo que necesita cargarRemitentePropio (el de supabase-js lo cumple). */
interface ClienteMinimo {
  from(tabla: string): any;
}

/**
 * Devuelve la configuración propia del usuario si existe Y su plan la permite.
 * Si no, null: se envía por la plataforma. Si la clave guardada no se puede
 * descifrar, también null (y se registra), para no bloquear sus envíos.
 */
export async function cargarRemitentePropio(
  admin: ClienteMinimo,
  userId: string,
  plan: unknown,
  descifrar: ((cifrado: string) => Promise<string>) | null,
): Promise<RemitentePropio | null> {
  if (!planPermiteRemitentePropio(plan) || !descifrar) return null;

  const { data, error } = await admin
    .from('user_secrets')
    .select('resend_api_key_encrypted, resend_from_email')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data?.resend_api_key_encrypted || !data?.resend_from_email) return null;

  try {
    const apiKey = await descifrar(data.resend_api_key_encrypted);
    return { propio: true, apiKey, direccion: data.resend_from_email };
  } catch (e) {
    console.error('[remitente-propio] no se pudo descifrar la clave de', userId, (e as Error)?.message);
    return null;
  }
}

/** Apunta (o borra, con null) el último error del Resend propio, para Ajustes. */
export async function apuntarErrorPropio(admin: ClienteMinimo, userId: string, motivo: string | null) {
  const { error } = await admin
    .from('user_secrets')
    .update({ resend_ultimo_error: motivo, resend_error_en: motivo ? new Date().toISOString() : null })
    .eq('user_id', userId);
  if (error) console.error('[remitente-propio] no se pudo apuntar el error:', error.message);
}

export interface ResultadoEnvio {
  ok: boolean;
  status: number;
  cuerpo: unknown;
}

/** POST a Resend. `fetchFn` se inyecta para poder probarlo. */
export async function enviarPorResend(
  apiKey: string,
  cuerpo: Record<string, unknown>,
  fetchFn: typeof fetch = fetch,
): Promise<ResultadoEnvio> {
  const res = await fetchFn(RESEND_API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  let datos: unknown = null;
  try { datos = await res.json(); } catch { /* cuerpo vacío o no JSON */ }
  return { ok: res.ok, status: res.status, cuerpo: datos };
}
