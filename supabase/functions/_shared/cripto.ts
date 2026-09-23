// Cifrado AES-256-GCM compartido por las Edge Functions.
//
// Existia una copia de estas funciones en manage-secrets, otra en bank-connect
// y otra en bank-sync, todas con el mismo fallo: la clave hexadecimal no se
// validaba. Si APP_ENCRYPTION_KEY tenia una errata, `parseInt('zz', 16)`
// devolvia NaN, el byte se guardaba como 0, y la clave quedaba DEBILITADA en
// silencio — todo seguia funcionando en apariencia.
//
// Este modulo no importa nada de Deno ni de la red, asi que vitest puede
// cargarlo tal cual (ver src/test/cripto-clave.test.ts).

const HEX = /^[0-9a-fA-F]+$/;

/** Longitudes de clave que acepta AES, en bytes. */
export const BYTES_VALIDOS = [16, 24, 32] as const;

export class ClaveInvalidaError extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ClaveInvalidaError';
  }
}

/**
 * Convierte una clave hexadecimal en bytes, fallando de forma ruidosa si el
 * texto no es hexadecimal valido o no mide 16, 24 o 32 bytes.
 */
// El tipo de retorno se deja inferir a proposito: desde TypeScript 5.7
// Uint8Array es generico sobre su buffer, y anotarlo como `Uint8Array` a secas
// lo ensancha a Uint8Array<ArrayBufferLike>, que Web Crypto ya no acepta.
export function hexABytes(rawHex: string) {
  const hex = (rawHex ?? '').trim();

  if (hex.length === 0) {
    throw new ClaveInvalidaError('La clave de cifrado esta vacia');
  }
  if (!HEX.test(hex)) {
    throw new ClaveInvalidaError('La clave de cifrado no es hexadecimal');
  }
  if (hex.length % 2 !== 0) {
    throw new ClaveInvalidaError('La clave de cifrado tiene un numero impar de caracteres');
  }

  const numBytes = hex.length / 2;
  if (!(BYTES_VALIDOS as readonly number[]).includes(numBytes)) {
    throw new ClaveInvalidaError(
      `La clave de cifrado debe medir 16, 24 o 32 bytes (32, 48 o 64 caracteres hex); mide ${numBytes}`
    );
  }

  const bytes = new Uint8Array(numBytes);
  for (let i = 0; i < numBytes; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/** Importa la clave AES-GCM a partir de su representacion hexadecimal. */
export async function claveAes(rawHex: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', hexABytes(rawHex), { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

/**
 * Codifica bytes en base64 por trozos.
 *
 * `btoa(String.fromCharCode(...bytes))` mete cada byte como un argumento de la
 * llamada y revienta con "Maximum call stack size exceeded" por encima de unos
 * 128 kB.
 */
export function bytesABase64(bytes: Uint8Array): string {
  const TROZO = 0x8000; // 32 kB
  let binario = '';
  for (let i = 0; i < bytes.length; i += TROZO) {
    binario += String.fromCharCode(...bytes.subarray(i, i + TROZO));
  }
  return btoa(binario);
}

export function base64ABytes(b64: string) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** Cifra bytes con AES-GCM. El IV (12 bytes) se antepone al resultado. */
export async function cifrarBytes(plano: BufferSource, clave: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cifrado = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, clave, plano);
  const junto = new Uint8Array(iv.length + cifrado.byteLength);
  junto.set(iv, 0);
  junto.set(new Uint8Array(cifrado), iv.length);
  return bytesABase64(junto);
}

export async function cifrarTexto(plano: string, clave: CryptoKey): Promise<string> {
  return cifrarBytes(new TextEncoder().encode(plano), clave);
}

/** Descifra lo producido por cifrarBytes/cifrarTexto. */
export async function descifrarTexto(b64: string, clave: CryptoKey): Promise<string> {
  const junto = base64ABytes(b64);
  const iv = junto.slice(0, 12);
  const cifrado = junto.slice(12);
  const plano = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, clave, cifrado);
  return new TextDecoder().decode(plano);
}
