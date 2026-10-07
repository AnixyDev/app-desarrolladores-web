// Verifactu, fase 2 (07/10/2026): certificado digital de un usuario listo para
// la conexión TLS con la AEAT. Lo sube el propio usuario en Ajustes →
// Cumplimiento fiscal (manage-secrets lo guarda cifrado con AES-GCM y
// APP_ENCRYPTION_KEY). Aquí se descifra EN MEMORIA y nunca sale de la función.
// deno-lint-ignore-file no-explicit-any
import forge from 'https://esm.sh/node-forge@1.3.1';

export class ErrorCertificado extends Error {
  constructor(public codigo: 'SIN_CERTIFICADO' | 'CADUCADO' | 'ILEGIBLE', mensaje: string) {
    super(mensaje);
  }
}

async function clave(rawHex: string): Promise<CryptoKey> {
  const hex = rawHex.trim();
  if (!/^[0-9a-fA-F]+$/.test(hex) || ![32, 48, 64].includes(hex.length)) throw new Error('APP_ENCRYPTION_KEY no válida');
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['decrypt']);
}

async function descifrar(b64: string, k: CryptoKey): Promise<Uint8Array> {
  const todo = Uint8Array.from(atob(b64.trim()), (c) => c.charCodeAt(0));
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: todo.slice(0, 12) }, k, todo.slice(12)));
}

export interface CertificadoTls {
  cert: string;   // PEM del certificado del titular
  key: string;    // PEM de la clave privada
  titular: string | null;
  caducaEn: Date;
}

/** Lee, descifra y abre el .p12 del usuario. Lanza ErrorCertificado con un mensaje para el usuario. */
export async function certificadoDe(admin: any, userId: string): Promise<CertificadoTls> {
  const { data: s, error } = await admin.from('user_secrets')
    .select('veri_factu_cert_storage_path, veri_factu_cert_password_encrypted')
    .eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (!s?.veri_factu_cert_storage_path || !s?.veri_factu_cert_password_encrypted) {
    throw new ErrorCertificado('SIN_CERTIFICADO', 'No has subido tu certificado digital (Ajustes → Cumplimiento fiscal).');
  }

  const k = await clave(Deno.env.get('APP_ENCRYPTION_KEY') ?? '');
  const { data: fichero, error: errDescarga } = await admin.storage.from('fiscal-certificates').download(s.veri_factu_cert_storage_path);
  if (errDescarga || !fichero) throw new ErrorCertificado('ILEGIBLE', 'No se ha podido leer tu certificado digital. Vuelve a subirlo.');

  let p12: any;
  try {
    const bytes = await descifrar(await fichero.text(), k);
    const password = new TextDecoder().decode(await descifrar(s.veri_factu_cert_password_encrypted, k));
    p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.createBuffer(forge.util.binary.raw.encode(bytes))), false, password);
  } catch {
    throw new ErrorCertificado('ILEGIBLE', 'No se ha podido abrir tu certificado digital. Vuelve a subirlo.');
  }

  const certs = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? []).map((b: any) => b.cert).filter(Boolean);
  const titular = certs.find((c: any) => !(c.getExtension('basicConstraints')?.cA)) ?? certs[0];
  const bolsa = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0]
    ?? p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0];
  if (!titular || !bolsa?.key) throw new ErrorCertificado('ILEGIBLE', 'Tu certificado digital no contiene la clave privada. Vuelve a subirlo.');

  const caducaEn: Date = titular.validity.notAfter;
  if (caducaEn.getTime() < Date.now()) {
    throw new ErrorCertificado('CADUCADO', `Tu certificado digital caducó el ${caducaEn.toLocaleDateString('es-ES')}. Renuévalo y súbelo de nuevo.`);
  }
  return {
    cert: forge.pki.certificateToPem(titular),
    key: forge.pki.privateKeyToPem(bolsa.key),
    titular: titular.subject.getField('CN')?.value ?? null,
    caducaEn,
  };
}
