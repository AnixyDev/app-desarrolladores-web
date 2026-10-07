// supabase/functions/verifactu-enviar/index.ts
//
// Verifactu, fase 2 (07/10/2026): envía a la AEAT los registros de facturación
// pendientes (modalidad VERI*FACTU), con el certificado digital de cada usuario.
//
// Lo llama el cron «verifactu-enviar» cada minuto, solo cuando hay registros
// pendientes (ver la migración verifactu_envio). Por usuario:
//   - respeta la espera que fija la AEAT entre envíos (TiempoEsperaEnvio, 60 s
//     por defecto) y manda hasta 1.000 registros juntos, en orden de cadena;
//   - antes de enviar, recalcula la huella de cada registro: si no coincide con
//     la guardada, no se envía (el registro estaría manipulado);
//   - guarda en cada registro el resultado: aceptado, aceptado con errores o
//     rechazado, con el código y el texto del error, y el CSV del envío;
//   - si falla la conexión, el certificado o la AEAT rechaza el envío entero,
//     los registros siguen pendientes y se reintenta más tarde (cada vez más
//     espaciado, hasta una hora). La factura ya está emitida: no se bloquea.
//
// Fase 3 (07/10/2026), tras la batería contra la AEAT de pruebas:
//   - DUPLICADO (3000): si un envío llegó pero se perdió la respuesta, al
//     reenviarlo la AEAT dice «duplicado» y cómo lo tiene guardado. No es un
//     rechazo: se guarda ese estado (resultadoDeLinea).
//   - AVISOS por correo (verifactu-avisos.ts): registros rechazados, y
//     certificado que falta, caduca o la AEAT no acepta (como mucho uno al día).
//   - Cada envío se guarda ENTERO en verifactu_envios: XML enviado y respuesta
//     íntegra de la AEAT (lo pidió la gestoría), enlazado desde cada registro
//     (fiscal_records.envio_id).
//
// Modo «prueba» (solo con la clave de servicio): genera registros de prueba de
// la cuenta de administración SIN guardarlos (verifactu_registros_de_prueba) y
// los envía, para comprobar el circuito completo contra la AEAT.
//
// Entorno: VERIFACTU_ENTORNO = 'produccion' para la AEAT real; cualquier otro
// valor (o ninguno) usa el entorno de PRUEBAS. Hasta la fase 4, pruebas.
//
// RECUERDA: esta función NO se despliega con `git push`.
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { esLlamadaDelServicio } from '../_shared/llamada-servicio.ts';
import { xmlEnvio, huellaDeRegistro } from '../_shared/verifactu-xml.ts';
import {
  URL_VERIFACTU, MAX_REGISTROS_POR_ENVIO, ESPERA_POR_DEFECTO_SEGUNDOS,
  sobreSoap, leerRespuesta, lineaDe, resultadoDeLinea, type EntornoVerifactu, type RespuestaAeat,
} from '../_shared/verifactu-soap.ts';
import { certificadoDe, ErrorCertificado } from '../_shared/verifactu-certificado.ts';
import {
  esErrorDeCertificado, hayQueAvisar, correoRechazo, correoCertificado, type RegistroRechazado,
} from '../_shared/verifactu-avisos.ts';

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo, null, 1), { status, headers: { 'Content-Type': 'application/json' } });

const ENTORNO: EntornoVerifactu = Deno.env.get('VERIFACTU_ENTORNO') === 'produccion' ? 'produccion' : 'pruebas';
const TIEMPO_MAXIMO_MS = 45_000;

interface RegistroPendiente {
  id: string;
  user_id: string;
  record_type: 'alta' | 'anulacion';
  numero_factura: string;
  nif_emisor: string;
  nombre_emisor: string;
  registro: Record<string, unknown>;
  envio_intentos?: number;
}

/** Lo que de verdad viajó: se guarda en verifactu_envios si hubo respuesta HTTP. */
interface Intercambio { peticion: string; httpStatus: number; respuesta: string }

type ResultadoEnvio =
  | { tipo: 'respuesta'; respuesta: Extract<RespuestaAeat, { tipo: 'respuesta' }>; intercambio: Intercambio }
  | { tipo: 'error'; codigo: string | null; mensaje: string; reintentar: boolean; intercambio?: Intercambio };

/** Envía un lote (mismo emisor) y devuelve lo que contestó la AEAT, o el error. */
async function enviarLote(admin: any, userId: string, lote: RegistroPendiente[]): Promise<ResultadoEnvio> {
  let cert;
  try {
    cert = await certificadoDe(admin, userId);
  } catch (e) {
    if (e instanceof ErrorCertificado) return { tipo: 'error', codigo: e.codigo, mensaje: e.message, reintentar: true };
    throw e;
  }

  const obligado = { NombreRazon: lote[0].nombre_emisor, NIF: lote[0].nif_emisor };
  const cuerpo = sobreSoap(xmlEnvio(obligado, lote.map((r) => ({ record_type: r.record_type, registro: r.registro }))));

  const client = (Deno as any).createHttpClient({ cert: cert.cert, key: cert.key });
  try {
    const resp = await fetch(URL_VERIFACTU[ENTORNO], {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' },
      body: cuerpo,
      client,
      signal: AbortSignal.timeout(30_000),
    } as RequestInit);
    const texto = await resp.text();
    const intercambio: Intercambio = { peticion: cuerpo, httpStatus: resp.status, respuesta: texto };
    const r = leerRespuesta(texto);
    if (r.tipo === 'fallo') {
      const mensaje = resp.status === 401 || resp.status === 403
        ? `La AEAT no acepta el certificado digital (HTTP ${resp.status}).`
        : r.mensaje;
      return { tipo: 'error', codigo: r.codigo ?? String(resp.status), mensaje, reintentar: true, intercambio };
    }
    return { tipo: 'respuesta', respuesta: r, intercambio };
  } catch (e) {
    return { tipo: 'error', codigo: 'CONEXION', mensaje: 'No se ha podido conectar con la AEAT: ' + String((e as Error)?.message ?? e).slice(0, 300), reintentar: true };
  } finally {
    client.close?.();
  }
}

/** Espera antes de reintentar tras un error: 1, 2, 4… minutos, hasta una hora. */
const esperaTrasError = (intentos: number) => Math.min(60 * 2 ** Math.max(0, intentos), 3600);

const DESDE_AVISOS = 'alertas@devfreelancer.app';

/** Envía un correo al usuario por la cuenta de Resend de la plataforma. Nunca lanza. */
async function avisar(admin: any, userId: string, correo: { asunto: string; html: string }): Promise<boolean> {
  const clave = Deno.env.get('RESEND_API_KEY');
  if (!clave) { console.error('[verifactu-enviar] RESEND_API_KEY no configurada: aviso sin enviar'); return false; }
  try {
    const { data: perfil } = await admin.from('profiles').select('email').eq('id', userId).maybeSingle();
    if (!perfil?.email) return false;
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `DevFreelancer <${DESDE_AVISOS}>`, to: [perfil.email], subject: correo.asunto, html: correo.html }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) console.error(`[verifactu-enviar] aviso a ${userId}: Resend HTTP ${r.status}`);
    return r.ok;
  } catch (e) {
    console.error(`[verifactu-enviar] aviso a ${userId}:`, (e as Error)?.message ?? e);
    return false;
  }
}

/** Guarda el envío completo y devuelve su id (null si no se pudo: no bloquea el resto). */
async function guardarEnvio(
  admin: any, userId: string, nif: string, numRegistros: number, i: Intercambio,
  extra: { estado: string | null; csv: string | null; codigo: string | null },
): Promise<string | null> {
  const { data, error } = await admin.from('verifactu_envios').insert({
    user_id: userId, nif_emisor: nif, entorno: ENTORNO, num_registros: numRegistros,
    http_status: i.httpStatus, estado_envio: extra.estado, csv: extra.csv, codigo_error: extra.codigo,
    peticion_xml: i.peticion, respuesta_xml: i.respuesta,
  }).select('id').single();
  if (error) { console.error(`[verifactu-enviar] no se pudo guardar el envío de ${userId}:`, error.message); return null; }
  return data.id;
}

async function nombreDe(admin: any, userId: string): Promise<string> {
  const { data } = await admin.from('profiles').select('full_name, business_name').eq('id', userId).maybeSingle();
  return String(data?.full_name || data?.business_name || '').trim().split(/\s+/)[0] ?? '';
}

async function procesarPendientes(admin: any) {
  const inicio = Date.now();
  const { data: pendientes, error } = await admin.from('fiscal_records')
    .select('id, user_id, record_type, numero_factura, nif_emisor, nombre_emisor, registro, envio_intentos')
    .eq('estado_envio', 'pendiente').eq('modalidad', 'verifactu')
    .order('user_id').order('orden')
    .limit(5000);
  if (error) throw error;
  if (!pendientes?.length) return { usuarios: 0, enviados: 0 };

  const { data: controles } = await admin.from('verifactu_control_envio').select('user_id, siguiente_envio_en, ultimo_aviso, ultimo_aviso_en');
  const siguiente = new Map<string, number>((controles ?? []).map((c: any) => [c.user_id, new Date(c.siguiente_envio_en).getTime()]));

  const porUsuario = new Map<string, RegistroPendiente[]>();
  for (const r of pendientes as RegistroPendiente[]) {
    if (!porUsuario.has(r.user_id)) porUsuario.set(r.user_id, []);
    porUsuario.get(r.user_id)!.push(r);
  }

  const resumen: Record<string, unknown>[] = [];
  for (const [userId, registros] of porUsuario) {
    if (Date.now() - inicio > TIEMPO_MAXIMO_MS) break;
    if ((siguiente.get(userId) ?? 0) > Date.now()) continue;

    // Un envío = un emisor y hasta 1.000 registros, en orden de cadena.
    const nif = registros[0].nif_emisor;
    const candidatos = registros.filter((r) => r.nif_emisor === nif).slice(0, MAX_REGISTROS_POR_ENVIO);

    // Integridad: la huella guardada tiene que salir de su propio contenido.
    const lote: RegistroPendiente[] = [];
    for (const r of candidatos) {
      if (await huellaDeRegistro(r.registro) === (r.registro as any).Huella) { lote.push(r); continue; }
      await admin.from('fiscal_records').update({
        estado_envio: 'rechazado', envio_error_codigo: 'HUELLA',
        envio_error_descripcion: 'La huella guardada no coincide con el contenido del registro: no se envía. Revisa el registro fiscal.',
        envio_ultimo_intento: new Date().toISOString(),
      }).eq('id', r.id);
    }
    if (!lote.length) continue;

    const ahora = new Date();
    const resultado = await enviarLote(admin, userId, lote);

    if (resultado.tipo === 'error') {
      const intentos = Math.max(...lote.map((r) => r.envio_intentos ?? 0)) + 1;
      const envioId = resultado.intercambio
        ? await guardarEnvio(admin, userId, nif, lote.length, resultado.intercambio, { estado: null, csv: null, codigo: resultado.codigo })
        : null;
      await admin.from('fiscal_records').update({
        envio_intentos: intentos, envio_ultimo_intento: ahora.toISOString(),
        envio_error_codigo: resultado.codigo, envio_error_descripcion: resultado.mensaje,
        ...(envioId ? { envio_id: envioId } : {}),
      }).in('id', lote.map((r) => r.id));
      await admin.from('verifactu_control_envio').upsert({
        user_id: userId,
        siguiente_envio_en: new Date(ahora.getTime() + esperaTrasError(intentos - 1) * 1000).toISOString(),
        ultimo_error: resultado.mensaje, actualizado_en: ahora.toISOString(),
      });
      console.error(`[verifactu-enviar] ${userId}: ${resultado.codigo} ${resultado.mensaje}`);

      // Certificado: el usuario tiene que hacer algo. Un aviso al día como mucho.
      if (esErrorDeCertificado(resultado.codigo)) {
        const motivo = `certificado:${resultado.codigo}`;
        const control = controles?.find((c: any) => c.user_id === userId);
        if (hayQueAvisar(motivo, control ? { motivo: control.ultimo_aviso, en: control.ultimo_aviso_en } : null, ahora)
            && await avisar(admin, userId, correoCertificado(await nombreDe(admin, userId), resultado.mensaje, registros.length))) {
          await admin.from('verifactu_control_envio').update({ ultimo_aviso: motivo, ultimo_aviso_en: ahora.toISOString() }).eq('user_id', userId);
        }
      }
      resumen.push({ userId, registros: lote.length, error: resultado.codigo });
      continue;
    }

    const r = resultado.respuesta;
    const envioId = await guardarEnvio(admin, userId, nif, lote.length, resultado.intercambio, { estado: r.estadoEnvio, csv: r.csv, codigo: null });
    const rechazados: RegistroRechazado[] = [];
    for (const reg of lote) {
      const linea = lineaDe(r.lineas, reg);
      if (!linea) {
        await admin.from('fiscal_records').update({
          envio_intentos: (reg.envio_intentos ?? 0) + 1, envio_ultimo_intento: ahora.toISOString(),
          envio_error_codigo: 'SIN_RESPUESTA', envio_error_descripcion: 'La AEAT no ha devuelto el resultado de este registro: se reenviará.',
          ...(envioId ? { envio_id: envioId } : {}),
        }).eq('id', reg.id);
        continue;
      }
      const res = resultadoDeLinea(linea);
      await admin.from('fiscal_records').update({
        estado_envio: res.estado,
        envio_intentos: (reg.envio_intentos ?? 0) + 1,
        envio_ultimo_intento: ahora.toISOString(),
        envio_error_codigo: res.codigoError,
        envio_error_descripcion: res.descripcionError,
        csv_respuesta_aeat: r.csv,
        envio_aceptado_en: res.estado === 'rechazado' ? null : ahora.toISOString(),
        ...(envioId ? { envio_id: envioId } : {}),
      }).eq('id', reg.id);
      if (res.estado === 'rechazado') rechazados.push({ numero: reg.numero_factura, codigo: res.codigoError, error: res.descripcionError });
    }
    if (rechazados.length) {
      await avisar(admin, userId, correoRechazo(await nombreDe(admin, userId), rechazados));
    }
    await admin.from('verifactu_control_envio').upsert({
      user_id: userId,
      siguiente_envio_en: new Date(ahora.getTime() + (r.esperaSegundos || ESPERA_POR_DEFECTO_SEGUNDOS) * 1000).toISOString(),
      ultimo_error: null, actualizado_en: ahora.toISOString(),
    });
    resumen.push({ userId, registros: lote.length, estadoEnvio: r.estadoEnvio });
  }
  return { usuarios: porUsuario.size, envios: resumen };
}

Deno.serve(async (req) => {
  const claveServicio = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!esLlamadaDelServicio(req.headers.get('Authorization'), claveServicio)) {
    return json({ error: 'No autorizado' }, 401);
  }
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, claveServicio!);
  const { modo = 'pendientes' } = await req.json().catch(() => ({}));

  try {
    if (modo === 'prueba') {
      // Circuito completo con registros de prueba de la cuenta de administración,
      // que no se guardan en ningún sitio. Solo para el entorno de pruebas.
      if (ENTORNO !== 'pruebas') return json({ error: 'El modo prueba solo funciona contra el entorno de pruebas.' }, 400);
      const { data: perfil, error: e1 } = await admin.from('profiles').select('id').eq('role', 'Admin').limit(1).maybeSingle();
      if (e1 || !perfil) return json({ error: 'Sin cuenta de administración' }, 500);
      const { data: registros, error: e2 } = await admin.rpc('verifactu_registros_de_prueba', { p_user: perfil.id });
      if (e2) return json({ error: 'No se pudieron generar los registros de prueba: ' + e2.message }, 500);
      const huellasOk = await Promise.all((registros as any[]).map(async (r) => (await huellaDeRegistro(r.registro)) === r.registro.Huella));
      const resultado = await enviarLote(admin, perfil.id, registros as RegistroPendiente[]);
      return json({
        entorno: ENTORNO,
        registros: (registros as any[]).map((r, i) => ({ tipo: r.record_type, numero: r.numero_factura, tipoFactura: r.registro.TipoFactura ?? null, huellaOk: huellasOk[i] })),
        resultado: { ...resultado, intercambio: undefined },
      });
    }

    return json({ entorno: ENTORNO, ...(await procesarPendientes(admin)) });
  } catch (e) {
    console.error('[verifactu-enviar]', e);
    return json({ error: String((e as Error)?.message ?? e).slice(0, 500) }, 500);
  }
});
