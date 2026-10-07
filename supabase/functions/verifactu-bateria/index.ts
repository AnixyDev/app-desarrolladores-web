// supabase/functions/verifactu-bateria/index.ts
//
// Verifactu, fase 3 (07/10/2026): batería de casos contra el entorno de
// PRUEBAS de la AEAT. Solo con la clave de servicio y nunca en producción.
//
// Los registros los genera la base de datos con las mismas funciones que la app
// (verifactu_bateria_de_prueba, que lo deshace todo) y aquí se envían en pasos,
// con el certificado de la cuenta de administración:
//   paso 1: un registro por caso real (nacional, IRPF, UE, fuera de la UE,
//           particular, simplificada, NIF fuera del censo, rectificativas R1, R4
//           y R5, anulación) y uno estropeado a propósito (cuota mal calculada);
//   paso 2: duplicado, subsanación del rechazado, subsanación de uno aceptado y
//           anulación de una factura que la AEAT no tiene, tal como los genera
//           la base de datos (subsanar_registro_fiscal, generate_fiscal_cancellation).
// Entre pasos hay que esperar lo que pida la AEAT (60 s). Cada paso devuelve
// `ultimo`, el registro con el que encadena el siguiente.
//
// RECUERDA: esta función NO se despliega con `git push`.
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { esLlamadaDelServicio } from '../_shared/llamada-servicio.ts';
import { xmlEnvio, huellaDeRegistro } from '../_shared/verifactu-xml.ts';
import { URL_VERIFACTU, sobreSoap, leerRespuesta, lineaDe, resultadoDeLinea } from '../_shared/verifactu-soap.ts';
import { certificadoDe } from '../_shared/verifactu-certificado.ts';

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo, null, 1), { status, headers: { 'Content-Type': 'application/json' } });

interface Generado {
  caso: string;
  record_type: 'alta' | 'anulacion';
  numero_factura: string;
  nif_emisor: string;
  nombre_emisor: string;
  registro: Record<string, any>;
}
interface Anterior { IDEmisorFactura: string; NumSerieFactura: string; FechaExpedicionFactura: string; Huella: string }
interface AEnviar extends Generado { etiqueta: string }

const copia = <T>(x: T): T => JSON.parse(JSON.stringify(x));

function caso(registros: Generado[], nombre: string): Generado {
  const r = registros.find((x) => x.caso === nombre);
  if (!r) throw new Error(`Falta el caso ${nombre}`);
  return copia(r);
}

/** Registros de cada paso, con lo que se cambia a propósito. */
function registrosDelPaso(paso: number, g: Generado[]): AEnviar[] {
  if (paso === 1) {
    const normales = ['nacional_21', 'nacional_21_irpf', 'empresa_ue_sin_iva', 'fuera_ue_empresa', 'fuera_ue_particular',
      'simplificada', 'nif_fuera_de_censo', 'rectificativa_r1_abono_total', 'rectificativa_r5', 'rectificativa_r4']
      .map((n) => ({ ...caso(g, n), etiqueta: n }));
    const mal = caso(g, 'para_rechazo');
    mal.registro.Desglose[0].CuotaRepercutida = '30.00';
    mal.registro.CuotaTotal = '30.00';
    mal.registro.ImporteTotal = '130.00';
    return [...normales, { ...mal, etiqueta: 'cuota_mal_calculada' }, { ...caso(g, 'anulacion_nacional_21_irpf'), etiqueta: 'anulacion' }];
  }
  if (paso === 2) {
    // Lo que genera la app DESPUÉS de la respuesta del paso 1 (subsanar_registro_fiscal
    // y generate_fiscal_cancellation, ver verifactu_bateria_de_prueba), sin tocar nada:
    //   - la 07, rechazada por NIF fuera del censo (1239), con el cliente corregido;
    //   - la 10, aceptada (con la cuota mal), con los importes buenos;
    //   - la anulación de la 11, que la AEAT no tiene (SinRegistroPrevio=S);
    // y un reenvío de la 01, que la AEAT ya tiene (duplicado).
    return [
      { ...caso(g, 'nacional_21'), etiqueta: 'duplicado' },
      { ...caso(g, 'subsanacion_nif_fuera_de_censo'), etiqueta: 'subsanacion_tras_rechazo' },
      { ...caso(g, 'subsanacion_para_rechazo'), etiqueta: 'subsanacion_de_aceptado' },
      { ...caso(g, 'anulacion_nunca_enviada'), etiqueta: 'anulacion_sin_registro_previo' },
    ];
  }
  throw new Error('Paso no válido (1 o 2)');
}

/** Identificador de un registro para encadenar el siguiente. */
function comoAnterior(reg: Record<string, any>): Anterior {
  const id = reg.IDFactura;
  return 'IDEmisorFacturaAnulada' in id
    ? { IDEmisorFactura: id.IDEmisorFacturaAnulada, NumSerieFactura: id.NumSerieFacturaAnulada, FechaExpedicionFactura: id.FechaExpedicionFacturaAnulada, Huella: reg.Huella }
    : { IDEmisorFactura: id.IDEmisorFactura, NumSerieFactura: id.NumSerieFactura, FechaExpedicionFactura: id.FechaExpedicionFactura, Huella: reg.Huella };
}

Deno.serve(async (req) => {
  const claveServicio = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!esLlamadaDelServicio(req.headers.get('Authorization'), claveServicio)) return json({ error: 'No autorizado' }, 401);
  if (Deno.env.get('VERIFACTU_ENTORNO') === 'produccion') return json({ error: 'La batería solo va contra el entorno de pruebas.' }, 400);

  const { paso, sufijo, anterior } = await req.json().catch(() => ({})) as { paso?: number; sufijo?: string; anterior?: Anterior | null };
  if (!paso || !sufijo) return json({ error: 'Faltan paso y sufijo' }, 400);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, claveServicio!);
  try {
    const { data: perfil } = await admin.from('profiles').select('id').eq('role', 'Admin').limit(1).maybeSingle();
    if (!perfil) return json({ error: 'Sin cuenta de administración' }, 500);
    const { data: generados, error } = await admin.rpc('verifactu_bateria_de_prueba', { p_user: perfil.id, p_sufijo: sufijo });
    if (error) return json({ error: 'Generación: ' + error.message }, 500);

    // Antes de tocar nada: las huellas que genera la base de datos son correctas.
    const huellasBd = await Promise.all((generados as Generado[]).map(async (r) => ({
      caso: r.caso, ok: (await huellaDeRegistro(r.registro)) === r.registro.Huella,
    })));

    // Encadenar en el orden de envío y recalcular cada huella.
    const lote = registrosDelPaso(paso, generados as Generado[]);
    let prev: Anterior | null = anterior ?? null;
    for (const r of lote) {
      r.registro.Encadenamiento = prev ? { RegistroAnterior: prev } : { PrimerRegistro: 'S' };
      r.registro.Huella = await huellaDeRegistro(r.registro);
      prev = comoAnterior(r.registro);
    }

    const cert = await certificadoDe(admin, perfil.id);
    const client = (Deno as any).createHttpClient({ cert: cert.cert, key: cert.key });
    let texto: string;
    let status: number;
    try {
      const resp = await fetch(URL_VERIFACTU.pruebas, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' },
        body: sobreSoap(xmlEnvio({ NombreRazon: lote[0].nombre_emisor, NIF: lote[0].nif_emisor }, lote)),
        client,
        signal: AbortSignal.timeout(30_000),
      } as RequestInit);
      status = resp.status;
      texto = await resp.text();
    } finally {
      client.close?.();
    }

    const r = leerRespuesta(texto);
    if (r.tipo === 'fallo') return json({ paso, status, huellasBd, fallo: r, bruto: texto.slice(0, 3000) });

    return json({
      paso, status, csv: r.csv, estadoEnvio: r.estadoEnvio, esperaSegundos: r.esperaSegundos, huellasBd,
      resultados: lote.map((x) => {
        const l = lineaDe(r.lineas, x);
        return {
          caso: x.etiqueta, numero: x.numero_factura, tipo: x.registro.TipoFactura ?? 'anulación',
          marcas: [x.registro.Subsanacion && 'Subsanacion=S', x.registro.RechazoPrevio && `RechazoPrevio=${x.registro.RechazoPrevio}`, x.registro.SinRegistroPrevio && 'SinRegistroPrevio=S'].filter(Boolean),
          estado: l?.estado ?? 'SIN LÍNEA', codigo: l?.codigoError ?? null, error: l?.descripcionError ?? null,
          duplicado: l?.duplicado ?? null, seGuarda: l ? resultadoDeLinea(l).estado : null,
        };
      }),
      lineasSinCasar: r.lineas.length !== lote.length ? r.lineas : undefined,
      ultimo: prev,
    });
  } catch (e) {
    console.error('[verifactu-bateria]', e);
    return json({ error: String((e as Error)?.message ?? e).slice(0, 500) }, 500);
  }
});
