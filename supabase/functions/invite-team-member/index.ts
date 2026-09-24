// supabase/functions/invite-team-member/index.ts
//
// Envía la invitación de equipo por email, usando
// supabase.auth.admin.inviteUserByEmail() — el mismo mecanismo (Supabase
// Auth + SMTP personalizado con Resend) que ya funciona para el login del
// Portal de Cliente (magic link).
//
// RECUERDA: esta función NO se despliega con `git push`. Hay que desplegarla
// explícitamente cada vez que cambie este archivo.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { puedeInvitar, INVITACIONES_POR_DIA } from '../_shared/limites-equipo.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ORIGEN_POR_DEFECTO = 'https://devfreelancer.app';
const ORIGENES_PERMITIDOS = [
  'https://devfreelancer.app',
  'https://www.devfreelancer.app',
];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function origenSeguro(origen: string | null): string {
  if (!origen) return ORIGEN_POR_DEFECTO;
  try {
    const parsed = new URL(origen);
    if (parsed.protocol === 'http:' && parsed.hostname === 'localhost') return parsed.origin;
    if (parsed.protocol === 'https:' && ORIGENES_PERMITIDOS.includes(parsed.origin)) {
      return parsed.origin;
    }
  } catch { /* origen ilegible */ }
  return ORIGEN_POR_DEFECTO;
}

/** Rechazo que el usuario debe ver. El frontend lee `success:false` + `message`. */
function rechazo(message: string) {
  return new Response(JSON.stringify({ success: false, message }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Cliente "normal" (anon key + token del usuario) solo para verificar quién llama.
  const supabaseAuth = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user: inviter }, error: authError } = await supabaseAuth.auth.getUser();
  if (authError || !inviter) {
    return new Response(JSON.stringify({ error: 'Fallo al autenticar al usuario' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { email, name, role } = await req.json();
    if (!email || !name) {
      return new Response(JSON.stringify({ error: 'Faltan email o nombre' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const destinatario = String(email).trim().toLowerCase();
    if (!EMAIL.test(destinatario)) {
      return rechazo('La dirección de email no es válida.');
    }

    // El destino del enlace de la invitacion salia de la cabecera Origin sin
    // comprobarla. Esa cabecera la fija quien hace la peticion, asi que era
    // una URL sin validar dentro de un correo que sale con tu dominio.
    // (Supabase Auth ademas filtra redirectTo contra su lista de URLs
    // permitidas, pero no conviene depender solo de eso.)
    const origin = origenSeguro(req.headers.get('Origin'));

    // Cliente con la Service Role Key: único con permiso para invitar usuarios.
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // ── CONTROL 1: la invitación tiene que existir y ser suya ──────────────
    //
    // Antes, `email` venía del cuerpo de la petición y se enviaba tal cual:
    // con una sesión válida se podía mandar un correo de invitación a
    // CUALQUIER dirección, saltándose la aplicación entera. Ahora la
    // dirección tiene que corresponder a una fila de `team_members` que ese
    // mismo usuario haya creado — filas que RLS ya limita a las suyas.
    const { data: fila, error: errorFila } = await supabaseAdmin
      .from('team_members')
      .select('id, status')
      .eq('user_id', inviter.id)
      .ilike('email', destinatario)
      .maybeSingle();

    if (errorFila) {
      console.error('No se pudo comprobar la invitación:', errorFila.message);
      return new Response(JSON.stringify({ error: 'Error interno' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!fila) {
      return rechazo('Esa dirección no está entre los miembros de tu equipo.');
    }

    // ── CONTROL 2: tope diario de envíos ──────────────────────────────────
    //
    // El límite por plan cuenta filas de `team_members`, y esas filas se
    // pueden borrar. Sin este tope bastaría con añadir, invitar, borrar y
    // repetir. El registro de envíos no se borra al eliminar al miembro.
    const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: enviadasHoy, error: errorEnvios } = await supabaseAdmin
      .from('invitaciones_enviadas')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', inviter.id)
      .gte('enviada_en', hace24h);

    if (errorEnvios) {
      console.error('No se pudo leer el registro de invitaciones:', errorEnvios.message);
      return new Response(JSON.stringify({ error: 'Error interno' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── CONTROL 3: límite de miembros del plan ────────────────────────────
    //
    // Se cuenta todo el equipo MENOS la persona que se está invitando: el
    // frontend guarda su fila antes de llamar aquí, y contarla sería contarla
    // dos veces.
    const { count: otrosMiembros, error: errorMiembros } = await supabaseAdmin
      .from('team_members')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', inviter.id)
      .neq('id', fila.id);

    if (errorMiembros) {
      console.error('No se pudo contar el equipo:', errorMiembros.message);
      return new Response(JSON.stringify({ error: 'Error interno' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: inviterProfile } = await supabaseAdmin
      .from('profiles')
      .select('business_name, full_name, plan')
      .eq('id', inviter.id)
      .maybeSingle();

    const veredicto = puedeInvitar(
      inviterProfile?.plan,
      otrosMiembros ?? 0,
      enviadasHoy ?? 0
    );

    if (!veredicto.permitida) {
      return rechazo(veredicto.motivo);
    }

    const inviterName = inviterProfile?.business_name || inviterProfile?.full_name || 'Tu equipo';

    // Esto es lo que dispara el email real, vía el SMTP (Resend) ya
    // configurado en Supabase Auth. Usa la plantilla "Invite user" —
    // personalizable en Supabase Dashboard → Authentication → Email Templates.
    const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(destinatario, {
      data: {
        full_name: name,
        invited_role: role,
        invited_by_name: inviterName,
      },
      redirectTo: `${origin}/`,
    });

    if (inviteError) {
      // Si el email ya tiene cuenta, Supabase devuelve error — no es un fallo
      // real del sistema de invitación, solo que esa persona ya existe.
      // Se devuelve 200 (no 400) con success:false para que el frontend
      // pueda leer el mensaje de forma fiable sin lidiar con las
      // particularidades de supabase-js al extraer el cuerpo de errores
      // no-2xx de una Edge Function.
      return rechazo(inviteError.message);
    }

    // Solo se registra si el correo ha salido: un fallo de Resend no debe
    // gastar cupo del usuario.
    const { error: errorRegistro } = await supabaseAdmin
      .from('invitaciones_enviadas')
      .insert({ user_id: inviter.id, email: destinatario });

    if (errorRegistro) {
      // No se revierte la invitación: el correo ya ha salido. Queda el aviso
      // en los logs — si esto fallara siempre, el tope diario dejaría de
      // contar y habría que mirarlo.
      console.error('Invitación enviada pero no registrada:', errorRegistro.message);
    }

    return new Response(
      JSON.stringify({ success: true, restantesHoy: INVITACIONES_POR_DIA - (enviadasHoy ?? 0) - 1 }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error enviando invitación de equipo:', error);
    return new Response(JSON.stringify({ success: false, message: error.message || 'Error interno' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
