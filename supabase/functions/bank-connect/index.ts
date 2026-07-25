// supabase/functions/bank-connect/index.ts
//
// Flujo de conexión con el banco vía Enable Banking (AISP, PSD2). Se
// cambió desde GoCardless, que cerró altas nuevas en julio de 2025.
// Enable Banking se autentica con JWT firmado (RS256) usando la clave
// privada propia de cada usuario — nunca una cuenta compartida.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const EB_BASE_URL = 'https://api.enablebanking.com';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// --- Descifrado de credenciales propias (AES-256-GCM, igual que manage-secrets) ---
async function getAesKey(rawHex: string): Promise<CryptoKey> {
  const keyBytes = new Uint8Array(rawHex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
  return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function decryptFromBase64(b64: string, key: CryptoKey): Promise<string> {
  const combined = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const cipherBytes = combined.slice(12);
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherBytes);
  return new TextDecoder().decode(plainBuf);
}

// --- JWT firmado RS256 con la clave privada del usuario, para hablar con Enable Banking ---
function base64url(input: ArrayBuffer | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----BEGIN (.*)-----/, '').replace(/-----END (.*)-----/, '').replace(/\s+/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function importEnableBankingPrivateKey(pem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(pem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

async function createEnableBankingJWT(appId: string, privateKeyPem: string): Promise<string> {
  let key: CryptoKey;
  try {
    key = await importEnableBankingPrivateKey(privateKeyPem);
  } catch (e) {
    throw new Error('No se pudo leer la clave privada de Enable Banking. Verifica que el archivo .pem sea el correcto (formato PKCS8).');
  }
  const iat = Math.floor(Date.now() / 1000);
  const header = { typ: 'JWT', alg: 'RS256', kid: appId };
  const body = { iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat, exp: iat + 3600 };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(body))}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64url(signature)}`;
}

async function getUserCredentials(supabaseAdmin: any, userId: string, aesKey: CryptoKey) {
  const { data: secrets } = await supabaseAdmin
    .from('user_secrets')
    .select('enablebanking_app_id, enablebanking_private_key_encrypted')
    .eq('user_id', userId)
    .maybeSingle();

  if (!secrets?.enablebanking_app_id || !secrets?.enablebanking_private_key_encrypted) {
    throw new Error('No has configurado tus credenciales de Enable Banking todavía.');
  }

  const privateKeyPem = await decryptFromBase64(secrets.enablebanking_private_key_encrypted, aesKey);
  const jwt = await createEnableBankingJWT(secrets.enablebanking_app_id, privateKeyPem);
  return jwt;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const encryptionKeyHex = Deno.env.get('APP_ENCRYPTION_KEY');
    if (!encryptionKeyHex) throw new Error('Missing APP_ENCRYPTION_KEY secret.');

    const authHeader = req.headers.get('Authorization') || '';
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) return jsonResponse({ error: 'No autorizado' }, 401);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const aesKey = await getAesKey(encryptionKeyHex);
    const { action, payload } = await req.json();
    const jwt = await getUserCredentials(supabaseAdmin, user.id, aesKey);
    const ebHeaders = { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' };

    switch (action) {
      // Lista bancos disponibles para el país indicado (código ISO de 2 letras).
      case 'list_institutions': {
        const country = payload?.country || 'ES';
        const res = await fetch(`${EB_BASE_URL}/aspsps?country=${country}`, { headers: ebHeaders });
        if (!res.ok) throw new Error(`Error listando bancos: ${await res.text()}`);
        const data = await res.json();
        return jsonResponse({ institutions: data.aspsps || [] });
      }

      // Inicia el proceso de autorización con el banco elegido.
      case 'create_requisition': {
        const institutionName = payload?.institution_name;
        const country = payload?.country || 'ES';
        const redirectUrl = payload?.redirect_url;
        if (!institutionName || !redirectUrl) {
          return jsonResponse({ error: 'Falta institution_name o redirect_url.' }, 400);
        }

        const state = crypto.randomUUID();
        const validUntil = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

        const res = await fetch(`${EB_BASE_URL}/auth`, {
          method: 'POST',
          headers: ebHeaders,
          body: JSON.stringify({
            access: { valid_until: validUntil },
            aspsp: { name: institutionName, country },
            state,
            redirect_url: redirectUrl,
            psu_type: 'personal',
          }),
        });
        if (!res.ok) throw new Error(`Error creando la conexión: ${await res.text()}`);
        const data = await res.json();

        await supabaseAdmin.from('bank_connections').insert({
          user_id: user.id,
          gocardless_requisition_id: state, // reutilizamos la columna como identificador de sesión genérico
          institution_id: institutionName,
          institution_name: institutionName,
          aspsp_country: country,
          status: 'pending',
          expires_at: validUntil,
        });

        return jsonResponse({ link: data.url, state });
      }

      // Se llama cuando el usuario vuelve del banco tras autorizar, con
      // un `code` en la URL — completa la sesión y guarda las cuentas.
      case 'finalize': {
        const code = payload?.code;
        const state = payload?.state;
        if (!code) return jsonResponse({ error: 'Falta el código de autorización.' }, 400);

        const res = await fetch(`${EB_BASE_URL}/sessions`, {
          method: 'POST',
          headers: ebHeaders,
          body: JSON.stringify({ code }),
        });
        if (!res.ok) throw new Error(`Error completando la conexión: ${await res.text()}`);
        const session = await res.json();

        const { data: connection } = await supabaseAdmin
          .from('bank_connections')
          .update({ status: 'linked', enablebanking_session_id: session.session_id })
          .eq('gocardless_requisition_id', state)
          .eq('user_id', user.id)
          .select()
          .single();

        const accountsList = session.accounts || [];
        for (const acc of accountsList) {
          const accountUid = typeof acc === 'string' ? acc : acc.uid;
          if (!accountUid) continue;

          let iban: string | null = null;
          let name = 'Cuenta bancaria';
          try {
            const detailsRes = await fetch(`${EB_BASE_URL}/accounts/${accountUid}/details`, { headers: ebHeaders });
            if (detailsRes.ok) {
              const details = await detailsRes.json();
              iban = details?.account?.identification ?? details?.uid ?? null;
              name = details?.name || details?.account?.name || name;
            }
          } catch { /* no crítico, seguimos con lo que tenemos */ }

          await supabaseAdmin.from('bank_accounts').upsert({
            user_id: user.id,
            connection_id: connection?.id,
            gocardless_account_id: accountUid, // misma columna, ahora guarda el UID de Enable Banking
            iban,
            account_name: name,
          }, { onConflict: 'gocardless_account_id' });
        }

        return jsonResponse({ success: true, accounts_linked: accountsList.length });
      }

      default:
        return jsonResponse({ error: 'Acción desconocida.' }, 400);
    }
  } catch (e) {
    console.error('[bank-connect] Error:', (e as Error)?.message ?? e);
    return jsonResponse({ error: (e as Error)?.message || 'No se pudo conectar con el banco.' }, 500);
  }
});