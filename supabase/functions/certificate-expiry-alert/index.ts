// supabase/functions/certificate-expiry-alert/index.ts
//
// Avisa por correo de que el certificado digital esta a punto de caducar.
//
// POR QUE EXISTE: la fecha de caducidad se guarda y se ve en Ajustes desde la
// auditoria, pero solo si el usuario entra a mirar. Un certificado caduca una
// vez cada dos o tres anos; nadie entra a mirar la vispera. Cuando vence, las
// facturas dejan de poder firmarse y los envios a Verifactu fallan — con la
// Agencia Tributaria de por medio.
//
// Se avisa en cuatro tramos (60, 30, 7 dias y el vencimiento), UNA vez cada
// uno. Un correo diario se ignora a la tercera.
//
// La dispara pg_cron una vez al dia. Mismo patron que
// weekly-profitability-alert: solo se acepta la clave de servicio.
//
// RECUERDA: esta funcion NO se despliega con `git push`.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { nivelDeCaducidad, hayQueAvisar } from '../_shared/caducidad-certificado.ts';

const RESEND_API_URL = 'https://api.resend.com/emails';
const FROM_ADDRESS = 'alertas@devfreelancer.app';
const URL_AJUSTES = 'https://devfreelancer.app/settings';

interface FilaSecreto {
  user_id: string;
  veri_factu_cert_expires_at: string | null;
  veri_factu_cert_subject: string | null;
  veri_factu_cert_alert_tramo: number | null;
  veri_factu_cert_alert_para: string | null;
}

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function asunto(dias: number): string {
  if (dias < 0) return 'Tu certificado digital ha caducado — las facturas no se podrán firmar';
  if (dias === 0) return 'Tu certificado digital caduca hoy';
  if (dias === 1) return 'Tu certificado digital caduca mañana';
  return `Tu certificado digital caduca en ${dias} días`;
}

function cuerpo(nombre: string, dias: number, fechaTexto: string, titular: string | null): string {
  const caducado = dias < 0;

  const titulo = caducado
    ? 'Tu certificado digital ha caducado'
    : dias === 0
      ? 'Tu certificado digital caduca hoy'
      : `Tu certificado digital caduca en ${dias} ${dias === 1 ? 'día' : 'días'}`;

  const consecuencia = caducado
    ? `Desde el ${escaparHtml(fechaTexto)} no se pueden firmar facturas ni enviarlas a Verifactu. Cualquier factura que emitas ahora mismo fallará al sellarse.`
    : `A partir del ${escaparHtml(fechaTexto)} no podrás firmar facturas ni enviarlas a Verifactu.`;

  const lineaTitular = titular
    ? `<p style="margin:0 0 16px;color:#666;font-size:13px;">Certificado a nombre de: ${escaparHtml(titular)}</p>`
    : '';

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;">
      <h2 style="margin:0 0 8px;color:${caducado ? '#dc2626' : '#d97706'};font-size:20px;">
        ${caducado ? '&#9940;' : '&#9888;&#65039;'} ${escaparHtml(titulo)}
      </h2>
      <p style="margin:0 0 16px;color:#333;font-size:15px;line-height:1.5;">
        Hola ${escaparHtml(nombre)}, ${consecuencia}
      </p>
      ${lineaTitular}
      <p style="margin:0 0 24px;color:#333;font-size:15px;line-height:1.5;">
        Renovar el certificado se hace en la sede electrónica de la FNMT o de tu
        autoridad de certificación. Una vez lo tengas, súbelo en Ajustes y todo
        seguirá funcionando sin más pasos.
      </p>
      <p style="margin:0 0 24px;">
        <a href="${URL_AJUSTES}"
           style="background:#d9009f;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600;font-size:14px;display:inline-block;">
          Subir el certificado renovado
        </a>
      </p>
      <p style="margin:0;color:#999;font-size:13px;">
        Recibes este aviso porque tienes un certificado digital configurado en
        DevFreelancer. Se envía cuando faltan 60, 30 y 7 días, y el día del
        vencimiento — nunca más de una vez por tramo.
      </p>
    </div>`;
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

  const resultados: Array<{ user_id: string; tramo: number; enviado: boolean }> = [];

  try {
    const { data: secretos, error: errorSecretos } = await supabase
      .from('user_secrets')
      .select(
        'user_id, veri_factu_cert_expires_at, veri_factu_cert_subject, veri_factu_cert_alert_tramo, veri_factu_cert_alert_para'
      )
      .not('veri_factu_cert_storage_path', 'is', null)
      .not('veri_factu_cert_expires_at', 'is', null);

    if (errorSecretos) throw errorSecretos;

    for (const fila of (secretos ?? []) as FilaSecreto[]) {
      const estado = nivelDeCaducidad(fila.veri_factu_cert_expires_at);
      if (!estado) continue;

      // Si la fecha de caducidad guardada en el aviso no es la del certificado
      // actual, es que ha subido uno nuevo: el contador empieza de cero.
      const caducidadActual = fila.veri_factu_cert_expires_at!.slice(0, 10);
      const mismoCertificado = fila.veri_factu_cert_alert_para === caducidadActual;
      const tramoYaAvisado = mismoCertificado ? fila.veri_factu_cert_alert_tramo : null;

      const { avisar, tramo } = hayQueAvisar(estado.dias, tramoYaAvisado);
      if (!avisar || tramo === null) continue;

      const { data: perfil, error: errorPerfil } = await supabase
        .from('profiles')
        .select('email, full_name, business_name')
        .eq('id', fila.user_id)
        .maybeSingle();

      if (errorPerfil || !perfil?.email) {
        console.error(`Sin email para el usuario ${fila.user_id}`);
        continue;
      }

      const nombre = perfil.business_name || perfil.full_name || 'freelancer';

      const respuesta = await fetch(RESEND_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `DevFreelancer <${FROM_ADDRESS}>`,
          to: perfil.email,
          subject: asunto(estado.dias),
          html: cuerpo(nombre, estado.dias, estado.fechaTexto, fila.veri_factu_cert_subject),
        }),
      });

      const enviado = respuesta.ok;
      if (!enviado) {
        console.error(`Error enviando aviso de caducidad al usuario ${fila.user_id}:`, await respuesta.text());
        // No se marca el tramo: asi se reintenta manana en vez de perderse
        // el aviso para siempre por un fallo puntual de Resend.
        resultados.push({ user_id: fila.user_id, tramo, enviado: false });
        continue;
      }

      const { error: errorMarca } = await supabase
        .from('user_secrets')
        .update({
          veri_factu_cert_alert_tramo: tramo,
          veri_factu_cert_alert_para: caducidadActual,
        })
        .eq('user_id', fila.user_id);

      if (errorMarca) {
        // El correo ya salio. Si esto falla, manana se mandaria otra vez el
        // mismo tramo: molesto, no grave. Queda el aviso en los logs.
        console.error(`Aviso enviado pero no registrado para ${fila.user_id}:`, errorMarca.message);
      }

      resultados.push({ user_id: fila.user_id, tramo, enviado: true });
    }

    return new Response(
      JSON.stringify({ revisados: secretos?.length ?? 0, avisos: resultados.length, resultados }),
      { headers: { 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('Error en certificate-expiry-alert:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
