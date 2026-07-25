// supabase/functions/manage-secrets/index.ts
//
// Guarda y gestiona credenciales propias de cada usuario (API key de
// Gemini propia, certificado digital para Veri*Factu). Todo se cifra
// aquí, con una clave que SOLO existe como secreto de este Edge Function
// (APP_ENCRYPTION_KEY) — nunca en la base de datos, nunca en el cliente.
// Ni siquiera el dueño del dato puede leerlo descifrado a través de la
// API normal de Supabase; solo esta función, y solo para cifrar/comprobar
// estado, nunca para devolver el valor en claro una vez guardado.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// --- Cifrado AES-256-GCM con Web Crypto (nativo de Deno, sin dependencias) ---
async function getKey(rawHex: string): Promise<CryptoKey> {
  const keyBytes = new Uint8Array(rawHex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
  return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encryptToBase64(plainBytes: Uint8Array, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plainBytes);
  const combined = new Uint8Array(iv.length + cipherBuf.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuf), iv.length);
  return btoa(String.fromCharCode(...combined));
}

async function encryptString(plain: string, key: CryptoKey): Promise<string> {
  return encryptToBase64(new TextEncoder().encode(plain), key);
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    try {
      const encryptionKeyHex = Deno.env.get('APP_ENCRYPTION_KEY');
      if (!encryptionKeyHex) {
        throw new Error('Missing APP_ENCRYPTION_KEY secret — configúralo en Supabase → Edge Functions → Secrets.');
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

      // Cliente con service role: es el único que puede escribir en
      // user_secrets (la política RLS solo permite SELECT al propio
      // usuario, ni INSERT ni UPDATE directos).
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
            .select('gemini_api_key_encrypted, gemini_api_key_updated_at, veri_factu_cert_storage_path, veri_factu_cert_uploaded_at, veri_factu_cert_expires_at, veri_factu_cert_subject')
            .eq('user_id', user.id)
            .maybeSingle();

          return jsonResponse({
            gemini_configured: !!data?.gemini_api_key_encrypted,
            gemini_updated_at: data?.gemini_api_key_updated_at ?? null,
            certificate_configured: !!data?.veri_factu_cert_storage_path,
            certificate_uploaded_at: data?.veri_factu_cert_uploaded_at ?? null,
            certificate_expires_at: data?.veri_factu_cert_expires_at ?? null,
            certificate_subject: data?.veri_factu_cert_subject ?? null,
          });
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

          // El propio fichero .p12 se cifra otra vez con nuestra clave
          // antes de subirlo — defensa en profundidad, no depende solo de
          // los permisos de Storage.
          const rawBytes = Uint8Array.from(atob(fileBase64), (c) => c.charCodeAt(0));
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
            updated_at: new Date().toISOString(),
          });
          if (dbError) throw dbError;

          return jsonResponse({ success: true });
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