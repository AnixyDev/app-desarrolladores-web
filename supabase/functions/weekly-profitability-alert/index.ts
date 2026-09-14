import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
 
const RESEND_API_URL = 'https://api.resend.com/emails';
const FROM_ADDRESS = 'alertas@devfreelancer.app';
 
// Umbrales — un proyecto se considera "en riesgo" si:
// - lleva al menos MIN_HOURS_FOR_ALERT horas registradas (evita ruido en
//   proyectos recién creados con 1-2h sueltas), Y
// - su tarifa/hora efectiva cae por debajo de RATE_THRESHOLD_RATIO de la
//   tarifa objetivo del usuario, O su margen neto es inferior a MIN_MARGIN_PERCENT.
const MIN_HOURS_FOR_ALERT = 8;
const RATE_THRESHOLD_RATIO = 0.7;
const MIN_MARGIN_PERCENT = 15;
 
interface ProjectRow {
  id: string;
  name: string;
  client_id: string | null;
  status: string;
}
 
Deno.serve(async (req: Request) => {
  const authHeader = req.headers.get('Authorization');
  if (authHeader !== `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`) {
    return new Response('Unauthorized', { status: 401 });
  }
 
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!resendApiKey) {
    console.error('RESEND_API_KEY no configurada en los secrets de Supabase');
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY no configurada' }), { status: 500 });
  }
 
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
 
  const results: Array<{ user_id: string; alerted_projects: number; email_sent: boolean }> = [];
 
  try {
    // 1. Solo usuarios de pago con la alerta activada (es una función Pro/Teams).
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, email, full_name, business_name, hourly_rate_cents, plan')
      .in('plan', ['Pro', 'Teams'])
      .eq('profitability_alerts_enabled', true);
 
    if (profilesError) throw profilesError;
 
    for (const profile of profiles ?? []) {
      const targetRateCents = profile.hourly_rate_cents ?? 0;
      if (targetRateCents <= 0) continue; // sin tarifa objetivo no hay umbral que comparar
 
      // 2. Proyectos activos del usuario
      const { data: projects, error: projectsError } = await supabase
        .from('projects')
        .select('id, name, client_id, status')
        .eq('user_id', profile.id)
        .in('status', ['in-progress', 'active', 'planning']);
 
      if (projectsError) {
        console.error(`Error obteniendo proyectos de ${profile.id}:`, projectsError);
        continue;
      }
      if (!projects || projects.length === 0) continue;
 
      const projectIds = (projects as ProjectRow[]).map(p => p.id);
 
      const [{ data: clients }, { data: invoices }, { data: expenses }, { data: timeEntries }] = await Promise.all([
        supabase.from('clients').select('id, name').eq('user_id', profile.id),
        supabase.from('invoices').select('project_id, total_cents').in('project_id', projectIds),
        supabase.from('expenses').select('project_id, amount_cents').in('project_id', projectIds),
        supabase.from('time_entries').select('project_id, duration_seconds').in('project_id', projectIds),
      ]);
 
      const riskyProjects: Array<{
        name: string;
        clientName: string;
        effectiveRateCents: number;
        marginPercent: number;
        hours: number;
      }> = [];
 
      for (const project of projects as ProjectRow[]) {
        const income = (invoices ?? [])
          .filter(i => i.project_id === project.id)
          .reduce((sum, i) => sum + (i.total_cents ?? 0), 0);
        const costs = (expenses ?? [])
          .filter(e => e.project_id === project.id)
          .reduce((sum, e) => sum + (e.amount_cents ?? 0), 0);
        const seconds = (timeEntries ?? [])
          .filter(t => t.project_id === project.id)
          .reduce((sum, t) => sum + (t.duration_seconds ?? 0), 0);
        const hours = seconds / 3600;
 
        if (hours < MIN_HOURS_FOR_ALERT) continue;
 
        const effectiveRateCents = income / hours;
        const marginPercent = income > 0 ? ((income - costs) / income) * 100 : 0;
 
        const rateIsLow = effectiveRateCents < targetRateCents * RATE_THRESHOLD_RATIO;
        const marginIsLow = income > 0 && marginPercent < MIN_MARGIN_PERCENT;
 
        if (rateIsLow || marginIsLow) {
          riskyProjects.push({
            name: project.name,
            clientName: (clients ?? []).find(c => c.id === project.client_id)?.name ?? 'Cliente desconocido',
            effectiveRateCents,
            marginPercent,
            hours,
          });
        }
      }
 
      if (riskyProjects.length === 0) {
        results.push({ user_id: profile.id, alerted_projects: 0, email_sent: false });
        continue;
      }
 
      const displayName = profile.business_name || profile.full_name || 'Devfreelancer';
      const targetRateEuros = (targetRateCents / 100).toFixed(2);
 
      const rowsHtml = riskyProjects
        .map(p => `
          <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #333;">${escapeHtml(p.name)}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #333;">${escapeHtml(p.clientName)}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #333;">${(p.effectiveRateCents / 100).toFixed(2)}€/h</td>
            <td style="padding:8px 12px;border-bottom:1px solid #333;">${p.marginPercent.toFixed(1)}%</td>
            <td style="padding:8px 12px;border-bottom:1px solid #333;">${p.hours.toFixed(1)}h</td>
          </tr>`)
        .join('');
 
      const html = `
        <div style="font-family:sans-serif;background:#111;color:#eee;padding:24px;">
          <h2 style="color:#fff;">⚠️ Alerta de rentabilidad semanal</h2>
          <p>Hola ${escapeHtml(displayName)}, estos proyectos activos están por debajo de tu tarifa objetivo
          (${targetRateEuros}€/h) o con margen ajustado:</p>
          <table style="border-collapse:collapse;width:100%;margin-top:12px;">
            <thead>
              <tr style="text-align:left;color:#999;">
                <th style="padding:8px 12px;">Proyecto</th>
                <th style="padding:8px 12px;">Cliente</th>
                <th style="padding:8px 12px;">€/h real</th>
                <th style="padding:8px 12px;">Margen</th>
                <th style="padding:8px 12px;">Horas</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
          <p style="margin-top:16px;color:#999;font-size:13px;">
            Puedes desactivar estas alertas en Ajustes → Notificaciones dentro de DevFreelancer.
          </p>
        </div>`;
 
      const emailResponse = await fetch(RESEND_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `DevFreelancer <${FROM_ADDRESS}>`,
          to: profile.email,
          subject: `⚠️ ${riskyProjects.length} proyecto(s) por debajo de tu tarifa objetivo esta semana`,
          html,
        }),
      });
 
      const emailOk = emailResponse.ok;
      if (!emailOk) {
        console.error(`Error enviando email a ${profile.email}:`, await emailResponse.text());
      }
 
      results.push({ user_id: profile.id, alerted_projects: riskyProjects.length, email_sent: emailOk });
    }
 
    return new Response(JSON.stringify({ processed_users: results.length, results }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Error en weekly-profitability-alert:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
 
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
 
