// supabase/functions/manage-secrets/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import forge from 'https://esm.sh/node-forge@1.3.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

// Un .p12 real ronda los 2-10 KB. Este tope es generosisimo y existe solo para
// que nadie pueda tumbar la funcion mandando un fichero enorme.
const MAX_CERT_BASE64_BYTES = 512 * 1024;

const HEX = /^[0-9a-fA-F]+$/;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * FIX: antes esto era `rawHex.match(/.{1,2}/g)!.map(b => parseInt(b, 16))`, sin
 * ninguna validacion. Si APP_ENCRYPTION_KEY tenia una errata (un caracter que
 * no es hexadecimal), parseInt devolvia NaN y el byte se guardaba como 0: la
 * clave quedaba DEBILITADA en silencio y todo seguia funcionando en apariencia.
 * Ahora se valida el formato y la longitud, y si no cuadra se falla de forma
 * ruidosa en vez de cifrar con una clave degradada.
 */
async function getKey(rawHex: string): Promise<CryptoKey> {
  const hex = rawHex.trim();
  if (!HEX.test(hex) || hex.length % 2 !== 0) {
    throw new Error('APP_ENCRYPTION_KEY no es hexadecimal valido');
  }
  const numBytes = hex.length / 2;
  if (numBytes !== 16 && numBytes !== 24 && numBytes !== 32) {
    throw new Error(
      `APP_ENCRYPTION_KEY debe medir 16, 24 o 32 bytes (32, 48 o 64 caracteres hex); mide ${numBytes}`
    );
  }
  const keyBytes = new Uint8Array(numBytes);
  for (let i = 0; i < numBytes; i++) {
    keyBytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/**
 * FIX: antes se hacia `btoa(String.fromCharCode(...bytes))`. El operador de
 * propagacion mete cada byte como un argumento de la llamada, asi que por
 * encima de ~128 KB revienta con "Maximum call stack size exceeded". Se trocea.
 */
function bytesToBase64(bytes: Uint8Array): string {
  const TROZO = 0x8000; // 32 KB
  let binario = '';
  for (let i = 0; i < bytes.length; i += TROZO) {
    binario += String.fromCharCode(...bytes.subarray(i, i + TROZO));
  }
  return btoa(binario);
}

async function encryptToBase64(plainBytes: Uint8Array, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plainBytes);
  const combined = new Uint8Array(iv.length + cipherBuf.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuf), iv.length);
  return bytesToBase64(combined);
}

async function encryptString(plain: string, key: CryptoKey): Promise<string> {
  return encryptToBase64(new TextEncoder().encode(plain), key);
}

interface DatosCertificado {
  titular: string | null;
  emisor: string | null;
  caducaEn: string; // ISO
}

/**
 * Abre el .p12 con su contrasena y saca titular, emisor y fecha de caducidad.
 *
 * Esto NO existia: save_certificate guardaba el fichero a ciegas. Dos
 * consecuencias: una contrasena mal tecleada se guardaba igual y solo se
 * descubria al fallar una firma, y las columnas veri_factu_cert_subject /
 * veri_factu_cert_expires_at quedaban siempre en NULL, asi que nada podia
 * avisar de que el certificado iba a caducar.
 *
 * Lanza con un mensaje distinto segun sea contrasena incorrecta o fichero
 * ilegible, para poder decirselo al usuario.
 */
function leerCertificado(bytes: Uint8Array, password: string): DatosCertificado {
  let p12;
  try {
    const der = forge.util.createBuffer(forge.util.binary.raw.encode(bytes));
    const asn1 = forge.asn1.fromDer(der);
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password);
  } catch (e) {
    const mensaje = String((e as Error)?.message ?? e);
    if (/password|mac/i.test(mensaje)) {
      throw new Error('CONTRASENA_INCORRECTA');
    }
    throw new Error('FICHERO_ILEGIBLE');
  }

  const bolsas = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
  const certificados = bolsas.map((b: any) => b.cert).filter(Boolean);
  if (certificados.length === 0) {
    throw new Error('SIN_CERTIFICADOS');
  }

  // El del titular es el que no es de una autoridad certificadora. Si todos lo
  // parecen (o ninguno declara la extension), se coge el primero.
  const cert =
    certificados.find((c: any) => {
      const bc = c.getExtension('basicConstraints');
      return !(bc && bc.cA);
    }) ?? certificados[0];

  return {
    titular: cert.subject.getField('CN')?.value ?? cert.subject.getField('O')?.value ?? null,
    emisor: cert.issuer.getField('CN')?.value ?? cert.issuer.getField('O')?.value ?? null,
    caducaEn: cert.validity.notAfter.toISOString(),
  };
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    try {
      const encryptionKeyHex = Deno.env.get('APP_ENCRYPTION_KEY');
      if (!encryptionKeyHex) {
        throw new Error('Missing APP_ENCRYPTION_KEY secret.');
      }

      const authHeader = req.headers.get('Authorization') || '';
      const supabaseAuth = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
      if (authError || !user) {
        return jsonResponse({ error: 'No autorizado' }, 401);
      }

      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );

      const key = await getKey(encryptionKeyHex);
      const { action, payload } = await req.json();

      switch (action) {
        case 'status': {
          const { data } = await supabaseAdmin
            .from('user_secrets')
            .select('gemini_api_key_encrypted, gemini_api_key_updated_at, veri_factu_cert_storage_path, veri_factu_cert_uploaded_at, veri_factu_cert_expires_at, veri_factu_cert_subject, enablebanking_app_id, enablebanking_configured_at')
            .eq('user_id', user.id)
            .maybeSingle();

          return jsonResponse({
            gemini_configured: !!data?.gemini_api_key_encrypted,
            gemini_updated_at: data?.gemini_api_key_updated_at ?? null,
            certificate_configured: !!data?.veri_factu_cert_storage_path,
            certificate_uploaded_at: data?.veri_factu_cert_uploaded_at ?? null,
            certificate_expires_at: data?.veri_factu_cert_expires_at ?? null,
            certificate_subject: data?.veri_factu_cert_subject ?? null,
            enablebanking_configured: !!data?.enablebanking_app_id,
            enablebanking_configured_at: data?.enablebanking_configured_at ?? null,
          });
        }

        case 'save_enablebanking_credentials': {
          const appId = String(payload?.app_id || '').trim();
          const privateKeyPem = String(payload?.private_key_pem || '').trim();
          if (!appId || !privateKeyPem) return jsonResponse({ error: 'Falta el ID de aplicación o la clave privada.' }, 400);

          const encryptedKey = await encryptString(privateKeyPem, key);
          const { error } = await supabaseAdmin.from('user_secrets').upsert({
            user_id: user.id,
            enablebanking_app_id: appId,
            enablebanking_private_key_encrypted: encryptedKey,
            enablebanking_configured_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          if (error) throw error;
          return jsonResponse({ success: true });
        }

        case 'delete_enablebanking_credentials': {
          const { error } = await supabaseAdmin
            .from('user_secrets')
            .update({ enablebanking_app_id: null, enablebanking_private_key_encrypted: null, enablebanking_configured_at: null, updated_at: new Date().toISOString() })
            .eq('user_id', user.id);
          if (error) throw error;
          return jsonResponse({ success: true });
        }

        case 'save_gemini_key': {
          const apiKey = String(payload?.api_key || '').trim();
          if (!apiKey) return jsonResponse({ error: 'Falta la API key.' }, 400);

          const encrypted = await encryptString(apiKey, key);
          const { error } = await supabaseAdmin.from('user_secrets').upsert({
            user_id: user.id,
            gemini_api_key_encrypted: encrypted,
            gemini_api_key_updated_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          if (error) throw error;
          return jsonResponse({ success: true });
        }

        case 'delete_gemini_key': {
          const { error } = await supabaseAdmin
            .from('user_secrets')
            .update({ gemini_api_key_encrypted: null, gemini_api_key_updated_at: null, updated_at: new Date().toISOString() })
            .eq('user_id', user.id);
          if (error) throw error;
          return jsonResponse({ success: true });
        }

        case 'save_certificate': {
          const fileBase64 = String(payload?.file_base64 || '');
          const password = String(payload?.password || '');
          if (!fileBase64 || !password) {
            return jsonResponse({ error: 'Falta el certificado o la contraseña.' }, 400);
          }

          if (fileBase64.length > MAX_CERT_BASE64_BYTES) {
            return jsonResponse(
              { error: 'El fichero es demasiado grande para ser un certificado (.p12). Revisa que hayas seleccionado el fichero correcto.' },
              413
            );
          }

          let rawBytes: Uint8Array;
          try {
            rawBytes = Uint8Array.from(atob(fileBase64), (c) => c.charCodeAt(0));
          } catch {
            return jsonResponse({ error: 'No se pudo leer el fichero. Vuelve a seleccionarlo e inténtalo de nuevo.' }, 400);
          }

          // Se abre ANTES de guardar nada: si la contraseña está mal, el
          // usuario se entera ahora y no meses después al firmar una factura.
          let datos: DatosCertificado;
          try {
            datos = leerCertificado(rawBytes, password);
          } catch (e) {
            const codigo = String((e as Error)?.message ?? e);
            if (codigo === 'CONTRASENA_INCORRECTA') {
              return jsonResponse({ error: 'La contraseña del certificado no es correcta.' }, 400);
            }
            if (codigo === 'SIN_CERTIFICADOS') {
              return jsonResponse({ error: 'El fichero se ha abierto pero no contiene ningún certificado.' }, 400);
            }
            console.error('[manage-secrets] certificado ilegible:', codigo);
            return jsonResponse({ error: 'El fichero no parece un certificado .p12 o .pfx válido.' }, 400);
          }

          const caducado = new Date(datos.caducaEn).getTime() < Date.now();

          const encryptedFileBase64 = await encryptToBase64(rawBytes, key);
          const encryptedPassword = await encryptString(password, key);

          const storagePath = `${user.id}/certificado.p12.enc`;
          const { error: uploadError } = await supabaseAdmin.storage
            .from('fiscal-certificates')
            .upload(storagePath, new TextEncoder().encode(encryptedFileBase64), {
              contentType: 'text/plain',
              upsert: true,
            });
          if (uploadError) throw uploadError;

          const { error: dbError } = await supabaseAdmin.from('user_secrets').upsert({
            user_id: user.id,
            veri_factu_cert_storage_path: storagePath,
            veri_factu_cert_password_encrypted: encryptedPassword,
            veri_factu_cert_uploaded_at: new Date().toISOString(),
            veri_factu_cert_subject: datos.titular,
            veri_factu_cert_expires_at: datos.caducaEn,
            updated_at: new Date().toISOString(),
          });
          if (dbError) throw dbError;

          // Se guarda igualmente si ya está caducado (puede estar en mitad de
          // una renovación), pero se avisa para que la interfaz lo marque.
          return jsonResponse({
            success: true,
            certificate_subject: datos.titular,
            certificate_issuer: datos.emisor,
            certificate_expires_at: datos.caducaEn,
            certificate_expired: caducado,
          });
        }

        case 'delete_certificate': {
          const { data } = await supabaseAdmin
            .from('user_secrets')
            .select('veri_factu_cert_storage_path')
            .eq('user_id', user.id)
            .maybeSingle();

          if (data?.veri_factu_cert_storage_path) {
            await supabaseAdmin.storage.from('fiscal-certificates').remove([data.veri_factu_cert_storage_path]);
          }

          const { error } = await supabaseAdmin
            .from('user_secrets')
            .update({
              veri_factu_cert_storage_path: null,
              veri_factu_cert_password_encrypted: null,
              veri_factu_cert_uploaded_at: null,
              veri_factu_cert_subject: null,
              veri_factu_cert_expires_at: null,
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', user.id);
          if (error) throw error;
          return jsonResponse({ success: true });
        }

        default:
          return jsonResponse({ error: 'Acción desconocida.' }, 400);
      }
    } catch (e) {
      console.error('[manage-secrets] Error:', (e as Error)?.message ?? e);
      return jsonResponse({ error: 'No se pudo procesar la solicitud. Inténtalo de nuevo.' }, 500);
    }
});
