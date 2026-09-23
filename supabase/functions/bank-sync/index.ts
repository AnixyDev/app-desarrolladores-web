// supabase/functions/bank-sync/index.ts
//
// Sincroniza movimientos bancarios (Enable Banking) y los coteja con
// facturas pendientes. El cotejo es solo una SUGERENCIA — nunca marca
// nada como cobrado sin que el usuario confirme (action=confirm_match).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { claveAes, descifrarTexto } from '../_shared/cripto.ts';

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
  return crypto.subtle.importKey('pkcs8', pemToArrayBuffer(pem), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

async function createEnableBankingJWT(appId: string, privateKeyPem: string): Promise<string> {
  const key = await importEnableBankingPrivateKey(privateKeyPem);
  const iat = Math.floor(Date.now() / 1000);
  const header = { typ: 'JWT', alg: 'RS256', kid: appId };
  const body = { iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat, exp: iat + 3600 };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(body))}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64url(signature)}`;
}

function normalize(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
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

    const { action, payload } = await req.json();

    if (action === 'confirm_match') {
      const { transaction_id, invoice_id } = payload || {};
      if (!transaction_id || !invoice_id) return jsonResponse({ error: 'Faltan datos.' }, 400);

      const { data: tx, error: txError } = await supabaseAdmin
        .from('bank_transactions').select('*').eq('id', transaction_id).eq('user_id', user.id).single();
      if (txError || !tx) return jsonResponse({ error: 'Movimiento no encontrado.' }, 404);

      // FIX (fallo entre usuarios): el movimiento bancario si se comprobaba,
      // pero invoice_id llegaba del navegador y NUNCA se verificaba. Como esta
      // funcion usa la clave de servicio (sin RLS) y un trigger en payments
      // (sync_invoice_paid_status) marca la factura como pagada en cuanto la
      // suma de pagos cubre el total, cualquier usuario con sesion podia
      // marcar como PAGADA la factura de otro con solo conocer su UUID — y
      // esos UUID circulan en los enlaces publicos de pago /pay/:factura.
      const { data: invoice, error: invoiceError } = await supabaseAdmin
        .from('invoices').select('id').eq('id', invoice_id).eq('user_id', user.id).maybeSingle();
      if (invoiceError || !invoice) {
        console.error(`[bank-sync] intento de cotejo contra factura ajena o inexistente por ${user.id}`);
        return jsonResponse({ error: 'Factura no encontrada.' }, 404);
      }

      // Confirmar dos veces el mismo cotejo insertaba dos pagos, y con el
      // trigger sumando eso descuadra el total de la factura.
      if (tx.match_status === 'confirmed') {
        return jsonResponse({ success: true, already_confirmed: true });
      }

      const { error: paymentError } = await supabaseAdmin.from('payments').insert({
        user_id: user.id,
        invoice_id,
        amount_cents: tx.amount_cents,
        paid_at: tx.booking_date,
        method: 'Transferencia bancaria',
        notes: `Conciliado automáticamente con movimiento bancario: ${tx.description || tx.counterparty_name || ''}`.trim(),
      });
      if (paymentError) throw paymentError;

      const { error: updateError } = await supabaseAdmin
        .from('bank_transactions')
        .update({ match_status: 'confirmed', matched_invoice_id: invoice_id })
        .eq('id', transaction_id)
        .eq('user_id', user.id);
      if (updateError) throw updateError;

      return jsonResponse({ success: true });
    }

    if (action === 'ignore_match') {
      const { transaction_id } = payload || {};
      if (!transaction_id) return jsonResponse({ error: 'Faltan datos.' }, 400);
      const { error } = await supabaseAdmin
        .from('bank_transactions').update({ match_status: 'ignored' }).eq('id', transaction_id).eq('user_id', user.id);
      if (error) throw error;
      return jsonResponse({ success: true });
    }

    if (action !== 'sync') return jsonResponse({ error: 'Acción desconocida.' }, 400);

    const { data: secrets } = await supabaseAdmin
      .from('user_secrets')
      .select('enablebanking_app_id, enablebanking_private_key_encrypted')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!secrets?.enablebanking_app_id || !secrets?.enablebanking_private_key_encrypted) {
      return jsonResponse({ error: 'No has configurado tus credenciales de Enable Banking.' }, 400);
    }

    // claveAes valida que APP_ENCRYPTION_KEY sea hexadecimal de longitud valida
    // en vez de degradarla en silencio (ver _shared/cripto.ts).
    const aesKey = await claveAes(encryptionKeyHex);
    const privateKeyPem = await descifrarTexto(secrets.enablebanking_private_key_encrypted, aesKey);
    const jwt = await createEnableBankingJWT(secrets.enablebanking_app_id, privateKeyPem);
    const ebHeaders = { Authorization: `Bearer ${jwt}` };

    const { data: accounts } = await supabaseAdmin.from('bank_accounts').select('*').eq('user_id', user.id);

    let newTransactions = 0;
    let newSuggestions = 0;
    const errors: string[] = [];

    const { data: invoices } = await supabaseAdmin
      .from('invoices')
      .select('id, invoice_number, total_cents, paid, client_id, clients(name)')
      .eq('user_id', user.id)
      .eq('paid', false);

    for (const account of accounts || []) {
      try {
        const dateFrom = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const res = await fetch(`${EB_BASE_URL}/accounts/${account.gocardless_account_id}/transactions?date_from=${dateFrom}`, { headers: ebHeaders });
        if (!res.ok) {
          // El cuerpo de error del banco va al log, no al navegador: puede
          // contener detalles internos que no pintan nada en la interfaz.
          const detalle = await res.text();
          console.error(`[bank-sync] ${account.account_name}: ${res.status} ${detalle}`);
          errors.push(
            `${account.account_name}: ${
              res.status === 429
                ? 'límite de peticiones del banco alcanzado hoy'
                : 'el banco ha rechazado la consulta, inténtalo más tarde'
            }`
          );
          continue;
        }
        const data = await res.json();
        const txList = data?.transactions || [];

        for (const t of txList) {
          const amountCents = Math.round(parseFloat(t.transaction_amount?.amount || '0') * 100);
          // credit_debit_indicator es la señal fiable de si es un ingreso
          // ("CRDT") o un gasto ("DBIT") — el importe en sí puede venir
          // siempre en positivo, sin indicar la dirección por el signo.
          const isCredit = t.credit_debit_indicator ? t.credit_debit_indicator === 'CRDT' : amountCents > 0;
          if (!isCredit || amountCents === 0) continue; // solo ingresos

          const ebTxId = t.entry_reference || t.transaction_id || `${t.booking_date}-${amountCents}-${t.remittance_information?.[0] || ''}`;
          const counterpartyName = t.creditor?.name || t.debtor?.name || '';
          const description = (t.remittance_information || []).join(' ');

          const { data: inserted, error: insertError } = await supabaseAdmin
            .from('bank_transactions')
            .upsert({
              user_id: user.id,
              bank_account_id: account.id,
              gocardless_transaction_id: ebTxId,
              enablebanking_transaction_id: ebTxId,
              amount_cents: amountCents,
              booking_date: t.booking_date,
              counterparty_name: counterpartyName,
              description,
              raw_data: t,
            }, { onConflict: 'bank_account_id,gocardless_transaction_id', ignoreDuplicates: true })
            .select()
            .maybeSingle();

          if (insertError) {
            console.error('[bank-sync] error insertando movimiento:', insertError.message);
            errors.push(`${account.account_name}: no se pudo guardar un movimiento`);
            continue;
          }
          if (!inserted) continue;
          newTransactions++;

          const candidates = (invoices || []).filter(inv => inv.total_cents === amountCents);
          if (candidates.length === 0) continue;

          let best = candidates[0];
          let confidence = 0.6;
          const normalizedText = normalize(`${counterpartyName} ${description}`);
          if (candidates.length > 1) {
            const withNameMatch = candidates.find(c => {
              const clientName = normalize((c as any).clients?.name || '');
              return clientName && normalizedText.includes(clientName);
            });
            if (withNameMatch) { best = withNameMatch; confidence = 0.9; }
          } else {
            const clientName = normalize((best as any).clients?.name || '');
            if (clientName && normalizedText.includes(clientName)) confidence = 0.95;
          }

          await supabaseAdmin
            .from('bank_transactions')
            .update({ match_status: 'suggested', matched_invoice_id: best.id, match_confidence: confidence })
            .eq('id', inserted.id);
          newSuggestions++;
        }

        await supabaseAdmin.from('bank_accounts').update({ last_synced_at: new Date().toISOString() }).eq('id', account.id);
      } catch (e) {
        console.error(`[bank-sync] ${account.account_name}:`, (e as Error)?.message ?? e);
        errors.push(`${account.account_name}: no se pudo sincronizar`);
      }
    }

    return jsonResponse({ success: true, new_transactions: newTransactions, new_suggestions: newSuggestions, errors });
  } catch (e) {
    // Mensaje generico al navegador, detalle al log.
    console.error('[bank-sync] Error:', (e as Error)?.message ?? e);
    return jsonResponse({ error: 'No se pudo sincronizar con el banco. Inténtalo de nuevo.' }, 500);
  }
});
