// supabase/functions/bank-sync/index.ts
//
// Sincroniza movimientos bancarios (GoCardless) y los coteja con facturas
// pendientes. El cotejo es solo una SUGERENCIA — nunca marca nada como
// cobrado sin que el usuario confirme explícitamente (action=confirm_match).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GC_BASE_URL = 'https://bankaccountdata.gocardless.com/api/v2';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function getKey(rawHex: string): Promise<CryptoKey> {
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

async function getGoCardlessToken(secretId: string, secretKey: string): Promise<string> {
  const res = await fetch(`${GC_BASE_URL}/token/new/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret_id: secretId, secret_key: secretKey }),
  });
  if (!res.ok) throw new Error(`GoCardless auth error ${res.status}: ${await res.text()}`);
  return (await res.json()).access;
}

// Normaliza texto para comparar (quita acentos, mayúsculas, espacios extra)
function normalize(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
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

    // --- Confirmar / ignorar una sugerencia de cotejo: no necesita tocar
    // la API de GoCardless para nada, solo la base de datos propia. ---
    if (action === 'confirm_match') {
      const { transaction_id, invoice_id } = payload || {};
      if (!transaction_id || !invoice_id) return jsonResponse({ error: 'Faltan datos.' }, 400);

      const { data: tx, error: txError } = await supabaseAdmin
        .from('bank_transactions')
        .select('*')
        .eq('id', transaction_id)
        .eq('user_id', user.id)
        .single();
      if (txError || !tx) return jsonResponse({ error: 'Movimiento no encontrado.' }, 404);

      // Registra el cobro real en `payments` — el mismo mecanismo que ya
      // usa el registro manual (RegisterPaymentModal), así el estado de
      // "pagada/parcial/pendiente" de la factura se recalcula solo.
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
        .eq('id', transaction_id);
      if (updateError) throw updateError;

      return jsonResponse({ success: true });
    }

    if (action === 'ignore_match') {
      const { transaction_id } = payload || {};
      const { error } = await supabaseAdmin
        .from('bank_transactions')
        .update({ match_status: 'ignored' })
        .eq('id', transaction_id)
        .eq('user_id', user.id);
      if (error) throw error;
      return jsonResponse({ success: true });
    }

    // --- Sincronizar movimientos nuevos y sugerir cotejos ---
    if (action !== 'sync') return jsonResponse({ error: 'Acción desconocida.' }, 400);

    const { data: secrets } = await supabaseAdmin
      .from('user_secrets')
      .select('gocardless_secret_id_encrypted, gocardless_secret_key_encrypted')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!secrets?.gocardless_secret_id_encrypted) {
      return jsonResponse({ error: 'No has configurado tus credenciales de GoCardless.' }, 400);
    }

    const key = await getKey(encryptionKeyHex);
    const secretId = await decryptFromBase64(secrets.gocardless_secret_id_encrypted, key);
    const secretKey = await decryptFromBase64(secrets.gocardless_secret_key_encrypted, key);
    const token = await getGoCardlessToken(secretId, secretKey);

    const { data: accounts } = await supabaseAdmin
      .from('bank_accounts')
      .select('*')
      .eq('user_id', user.id);

    let newTransactions = 0;
    let newSuggestions = 0;
    const errors: string[] = [];

    // Facturas candidatas a cotejo: no pagadas del todo.
    const { data: invoices } = await supabaseAdmin
      .from('invoices')
      .select('id, invoice_number, total_cents, paid, client_id, clients(name)')
      .eq('user_id', user.id)
      .eq('paid', false);

    for (const account of accounts || []) {
      try {
        // Respetar los límites de peticiones del banco (hasta 4/día) — no
        // reintentar en bucle, solo un intento por cuenta y seguir.
        const res = await fetch(`${GC_BASE_URL}/accounts/${account.gocardless_account_id}/transactions/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          errors.push(`${account.account_name}: ${res.status === 429 ? 'límite de peticiones del banco alcanzado hoy' : await res.text()}`);
          continue;
        }
        const data = await res.json();
        const booked = data?.transactions?.booked || [];

        for (const t of booked) {
          const amountCents = Math.round(parseFloat(t.transactionAmount?.amount || '0') * 100);
          // Solo nos interesan los ingresos (positivos) para cotejar con facturas.
          if (amountCents <= 0) continue;

          const gcTxId = t.transactionId || t.internalTransactionId || `${t.bookingDate}-${amountCents}-${t.remittanceInformationUnstructured || ''}`;
          const counterpartyName = t.debtorName || t.creditorName || '';
          const description = t.remittanceInformationUnstructured || (t.remittanceInformationUnstructuredArray || []).join(' ') || '';

          const { data: inserted, error: insertError } = await supabaseAdmin
            .from('bank_transactions')
            .upsert({
              user_id: user.id,
              bank_account_id: account.id,
              gocardless_transaction_id: gcTxId,
              amount_cents: amountCents,
              booking_date: t.bookingDate,
              counterparty_name: counterpartyName,
              description,
              raw_data: t,
            }, { onConflict: 'bank_account_id,gocardless_transaction_id', ignoreDuplicates: true })
            .select()
            .maybeSingle();

          if (insertError) { errors.push(insertError.message); continue; }
          if (!inserted) continue; // ya existía, no es nuevo
          newTransactions++;

          // Cotejo: mismo importe exacto es la señal más fiable. Si hay
          // varias facturas con el mismo importe, se afina por si el
          // nombre del cliente aparece en el concepto/nombre del pagador.
          const candidates = (invoices || []).filter(inv => inv.total_cents === amountCents);
          if (candidates.length === 0) continue;

          let best = candidates[0];
          let confidence = 0.6; // importe exacto, sin más pistas
          if (candidates.length > 1) {
            const normalizedText = normalize(`${counterpartyName} ${description}`);
            const withNameMatch = candidates.find(c => {
              const clientName = normalize((c as any).clients?.name || '');
              return clientName && normalizedText.includes(clientName);
            });
            if (withNameMatch) { best = withNameMatch; confidence = 0.9; }
          } else {
            const normalizedText = normalize(`${counterpartyName} ${description}`);
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
        errors.push(`${account.account_name}: ${(e as Error).message}`);
      }
    }

    return jsonResponse({ success: true, new_transactions: newTransactions, new_suggestions: newSuggestions, errors });
  } catch (e) {
    console.error('[bank-sync] Error:', (e as Error)?.message ?? e);
    return jsonResponse({ error: (e as Error)?.message || 'No se pudo sincronizar.' }, 500);
  }
});