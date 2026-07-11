// supabase/functions/invite-team-member/index.ts
//
// NUEVO: envía la invitación de equipo por email de verdad, usando
// supabase.auth.admin.inviteUserByEmail() — el mismo mecanismo (Supabase
// Auth + SMTP personalizado con Resend) que YA está funcionando para el
// login del Portal de Cliente (magic link). Antes, "Invitar Nuevo Miembro"
// solo guardaba una fila en team_members y abría un borrador de correo
// manual (mailto) — nunca mandaba nada en segundo plano.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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

    const origin = req.headers.get('Origin') || 'https://devfreelancer.app';

    // Cliente con la Service Role Key: único con permiso para invitar usuarios.
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: inviterProfile } = await supabaseAdmin
      .from('profiles')
      .select('business_name, full_name')
      .eq('id', inviter.id)
      .maybeSingle();

    const inviterName = inviterProfile?.business_name || inviterProfile?.full_name || 'Tu equipo';

    // Esto es lo que dispara el email real, vía el SMTP (Resend) ya
    // configurado en Supabase Auth. Usa la plantilla "Invite user" —
    // personalizable en Supabase Dashboard → Authentication → Email Templates.
    const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
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
      return new Response(JSON.stringify({ error: inviteError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ sent: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error enviando invitación de equipo:', error);
    return new Response(JSON.stringify({ error: error.message || 'Error interno' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});