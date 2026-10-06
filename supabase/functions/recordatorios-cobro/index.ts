// supabase/functions/recordatorios-cobro/index.ts
//
// Recordatorios de cobro automáticos (30/09/2026). La lanza pg_cron cada
// mañana (tarea «recordatorios-cobro-diario») con la clave de servicio.
//
// Para cada usuario con «Enviar recordatorios de pago automáticos» activado
// (profiles.payment_reminders_enabled), recorre sus facturas sin cobrar y
// manda, como mucho una vez por nivel, el recordatorio que toque (3 días
// antes de vencer, y 3, 15 y 30 días después). Reglas y textos en
// _shared/recordatorios-cobro.ts.
//
// El nivel se APUNTA antes de enviar (clave primaria factura+nivel): si la
// tarea se lanzara dos veces a la vez, solo una envía. Si Resend falla, se
// borra el apunte y mañana se reintenta.
//
// RECUERDA: esta función NO se despliega con `git push`.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { esLlamadaDelServicio } from '../_shared/llamada-servicio.ts';
import { nombreDelRemitente } from '../_shared/correo-documentos.ts';
import { nivelQueToca, correoDeRecordatorio, MAX_DIAS_VENCIDA } from '../_shared/recordatorios-cobro.ts';
import {
  cargarRemitentePropio,
  apuntarErrorPropio,
  enviarPorResend,
  formatearRemitente,
  nombreVisiblePropio,
  motivoDelRechazo,
  TOPES_CON_REMITENTE_PROPIO,
} from '../_shared/remitente-propio.ts';
import { descifradorConClave } from '../_shared/cripto.ts';

const FROM_DOMAIN_ADDRESS = 'facturas@devfreelancer.app';
const SITIO = 'https://devfreelancer.app';
// Topes bajados el 06/10/2026 mientras Resend esté en el plan gratuito
// (100 correos al día para TODA la plataforma, también los de acceso).
// Sin ellos, un solo usuario podría agotar el cupo de todos. Al pasar a
// Resend Pro (≈10 suscriptores o >2.000 correos/mes) se vuelven a subir.
// Lo que no sale hoy por el tope sale en los días siguientes. Antes 40.
const MAX_POR_USUARIO_Y_DIA = 5;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (!esLlamadaDelServicio(req.headers.get('Authorization'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))) {
    return new Response('Unauthorized', { status: 401 });
  }
  // La de la plataforma. Los usuarios Pro/Teams con dominio propio usan la suya.
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!resendApiKey) console.error('[recordatorios-cobro] RESEND_API_KEY no configurada: solo saldrán los de dominio propio');
  const descifrar = descifradorConClave(Deno.env.get('APP_ENCRYPTION_KEY'));

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  // Fecha de hoy en España: el cron corre en UTC.
  const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
  const limiteAntiguo = new Date(Date.parse(`${hoy}T00:00:00Z`) - MAX_DIAS_VENCIDA * 86_400_000).toISOString().slice(0, 10);
  const horizonte = new Date(Date.parse(`${hoy}T00:00:00Z`) + 3 * 86_400_000).toISOString().slice(0, 10);

  const resumen: Array<{ user_id: string; enviados: number; fallidos: number }> = [];

  try {
    const { data: usuarios, error: errorUsuarios } = await supabase
      .from('profiles')
      .select('id, email, plan, business_name, full_name, invoice_reply_to_email, reminder_template_upcoming, reminder_template_overdue, stripe_account_id, stripe_onboarding_complete')
      .eq('payment_reminders_enabled', true);
    if (errorUsuarios) throw errorUsuarios;

    for (const u of usuarios ?? []) {
      let enviados = 0;
      let fallidos = 0;

      const { data: facturas, error: errorFacturas } = await supabase
        .from('invoices')
        .select('id, invoice_number, client_id, issue_date, due_date, total_cents')
        .eq('user_id', u.id)
        .eq('paid', false)
        .eq('recordatorios_activos', true)
        .gt('total_cents', 0)
        .gte('due_date', limiteAntiguo)
        .lte('due_date', horizonte);
      if (errorFacturas) { console.error(`[recordatorios-cobro] facturas de ${u.id}:`, errorFacturas.message); continue; }
      if (!facturas?.length) continue;

      const ids = facturas.map(f => f.id);
      const idsClientes = [...new Set(facturas.map(f => f.client_id).filter(Boolean))];
      const [{ data: pagos }, { data: clientes }, { data: yaEnviados }] = await Promise.all([
        supabase.from('payments').select('invoice_id, amount_cents').in('invoice_id', ids),
        supabase.from('clients').select('id, name, email, user_id').in('id', idsClientes),
        supabase.from('recordatorios_cobro_enviados').select('invoice_id, nivel').in('invoice_id', ids),
      ]);

      const cobrado = new Map<string, number>();
      for (const p of pagos ?? []) cobrado.set(p.invoice_id, (cobrado.get(p.invoice_id) ?? 0) + (p.amount_cents ?? 0));
      const cliente = new Map((clientes ?? []).filter(c => c.user_id === u.id).map(c => [c.id, c]));
      const niveles = new Map<string, number[]>();
      for (const r of yaEnviados ?? []) niveles.set(r.invoice_id, [...(niveles.get(r.invoice_id) ?? []), r.nivel]);

      const propio = await cargarRemitentePropio(supabase, u.id, u.plan, descifrar);
      const claveEnvio = propio?.apiKey ?? resendApiKey;
      if (!claveEnvio) continue;
      const topeHoy = propio ? TOPES_CON_REMITENTE_PROPIO.recordatoriosPorDia : MAX_POR_USUARIO_Y_DIA;
      const remitente = propio
        ? formatearRemitente(nombreVisiblePropio(u.business_name || u.full_name), propio.direccion)
        : `${nombreDelRemitente(u.business_name || u.full_name)} <${FROM_DOMAIN_ADDRESS}>`;
      const firma = u.business_name || u.full_name || 'Tu proveedor';
      const replyTo = u.invoice_reply_to_email || u.email;
      const cobraConTarjeta = !!(u.stripe_account_id && u.stripe_onboarding_complete);

      for (const f of facturas) {
        if (enviados >= topeHoy) break;
        const pendiente = (f.total_cents ?? 0) - (cobrado.get(f.id) ?? 0);
        if (pendiente <= 0) continue;
        const c = cliente.get(f.client_id);
        const destinatario = String(c?.email ?? '').trim();
        if (!c || !EMAIL.test(destinatario)) continue;

        const nivel = nivelQueToca({ emision: f.issue_date, vencimiento: f.due_date, hoy, yaEnviados: niveles.get(f.id) ?? [] });
        if (nivel === null) continue;

        // Apuntar primero: si otra ejecución ya lo hizo, la clave primaria lo impide.
        const { error: errorApunte } = await supabase
          .from('recordatorios_cobro_enviados')
          .insert({ invoice_id: f.id, nivel, user_id: u.id, destinatario });
        if (errorApunte) continue;

        const correo = correoDeRecordatorio({
          nivel,
          cliente: c.name,
          numero: f.invoice_number,
          pendienteCents: pendiente,
          vencimiento: f.due_date,
          enlacePago: cobraConTarjeta ? `${SITIO}/pay/${f.id}` : null,
          plantillaProxima: u.reminder_template_upcoming,
          plantillaVencida: u.reminder_template_overdue,
          firma,
        });

        const envio = await enviarPorResend(claveEnvio, {
          from: remitente,
          reply_to: replyTo,
          to: destinatario,
          subject: correo.asunto,
          html: correo.html,
        });

        if (!envio.ok) {
          console.error(`[recordatorios-cobro] Resend rechazó ${f.id} (nivel ${nivel}):`, envio.status);
          await supabase.from('recordatorios_cobro_enviados').delete().eq('invoice_id', f.id).eq('nivel', nivel);
          fallidos++;
          if (propio) {
            // Su cuenta tiene un problema: se le enseña en Ajustes y no se
            // insiste con el resto de sus facturas hoy. Mañana se reintenta.
            await apuntarErrorPropio(supabase, u.id, motivoDelRechazo(envio.status, envio.cuerpo));
            break;
          }
          continue;
        }
        enviados++;
      }
      if (propio && enviados && !fallidos) await apuntarErrorPropio(supabase, u.id, null);
      if (enviados || fallidos) resumen.push({ user_id: u.id, enviados, fallidos });
    }

    return json({ hoy, usuarios: usuarios?.length ?? 0, resumen });
  } catch (e) {
    console.error('[recordatorios-cobro] Error:', (e as Error)?.message ?? e);
    return json({ error: 'Error enviando recordatorios' }, 500);
  }
});
