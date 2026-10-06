// Verifactu (07/10/2026): del registro guardado en fiscal_records.registro al
// XML oficial de la AEAT (SuministroLR.xsd / SuministroInformacion.xsd).
//
// El registro ya se guarda con los nombres de campo del XSD (lo construye la
// base de datos al emitir la factura, ver la migración verifactu_registro_oficial);
// aquí solo se ponen en el ORDEN que exige el esquema y se escapan los textos.
// Puro y sin dependencias: lo usan las Edge Functions (Deno) y vitest.
//
// Pruebas: src/test/verifactu-xml.test.ts (valida contra los XSD oficiales
// guardados en docs/verifactu/aeat/esquemas).

export const NS_SUMINISTRO_LR =
  'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd';
export const NS_SUMINISTRO_INFORMACION =
  'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd';

type Valor = string | number | Nodo | Nodo[] | undefined | null;
interface Nodo { [campo: string]: Valor }

/**
 * Orden de los hijos de cada elemento, según el XSD. Una entrada con «[]»
 * indica una lista: en el JSON es un array y cada elemento se escribe con el
 * nombre que va detrás (p. ej. Destinatarios → IDDestinatario).
 */
const ORDEN: Record<string, string[]> = {
  RegistroAlta: [
    'IDVersion', 'IDFactura', 'RefExterna', 'NombreRazonEmisor', 'Subsanacion', 'RechazoPrevio',
    'TipoFactura', 'TipoRectificativa', 'FacturasRectificadas[]IDFacturaRectificada',
    'FacturasSustituidas[]IDFacturaSustituida', 'ImporteRectificacion', 'FechaOperacion',
    'DescripcionOperacion', 'FacturaSimplificadaArt7273', 'FacturaSinIdentifDestinatarioArt61d',
    'Macrodato', 'EmitidaPorTerceroODestinatario', 'Tercero', 'Destinatarios[]IDDestinatario', 'Cupon',
    'Desglose[]DetalleDesglose', 'CuotaTotal', 'ImporteTotal', 'Encadenamiento', 'SistemaInformatico',
    'FechaHoraHusoGenRegistro', 'NumRegistroAcuerdoFacturacion', 'IdAcuerdoSistemaInformatico',
    'TipoHuella', 'Huella',
  ],
  RegistroAnulacion: [
    'IDVersion', 'IDFactura', 'RefExterna', 'SinRegistroPrevio', 'RechazoPrevio', 'GeneradoPor', 'Generador',
    'Encadenamiento', 'SistemaInformatico', 'FechaHoraHusoGenRegistro', 'TipoHuella', 'Huella',
  ],
  IDFactura: [
    'IDEmisorFactura', 'NumSerieFactura', 'FechaExpedicionFactura',
    'IDEmisorFacturaAnulada', 'NumSerieFacturaAnulada', 'FechaExpedicionFacturaAnulada',
  ],
  IDFacturaRectificada: ['IDEmisorFactura', 'NumSerieFactura', 'FechaExpedicionFactura'],
  IDFacturaSustituida: ['IDEmisorFactura', 'NumSerieFactura', 'FechaExpedicionFactura'],
  ImporteRectificacion: ['BaseRectificada', 'CuotaRectificada', 'CuotaRecargoRectificado'],
  IDDestinatario: ['NombreRazon', 'NIF', 'IDOtro'],
  Tercero: ['NombreRazon', 'NIF', 'IDOtro'],
  Generador: ['NombreRazon', 'NIF', 'IDOtro'],
  IDOtro: ['CodigoPais', 'IDType', 'ID'],
  DetalleDesglose: [
    'Impuesto', 'ClaveRegimen', 'CalificacionOperacion', 'OperacionExenta', 'TipoImpositivo',
    'BaseImponibleOimporteNoSujeto', 'BaseImponibleACoste', 'CuotaRepercutida',
    'TipoRecargoEquivalencia', 'CuotaRecargoEquivalencia',
  ],
  Encadenamiento: ['PrimerRegistro', 'RegistroAnterior'],
  RegistroAnterior: ['IDEmisorFactura', 'NumSerieFactura', 'FechaExpedicionFactura', 'Huella'],
  SistemaInformatico: [
    'NombreRazon', 'NIF', 'IDOtro', 'NombreSistemaInformatico', 'IdSistemaInformatico', 'Version',
    'NumeroInstalacion', 'TipoUsoPosibleSoloVerifactu', 'TipoUsoPosibleMultiOT', 'IndicadorMultiplesOT',
  ],
  Cabecera: ['ObligadoEmision', 'Representante', 'RemisionVoluntaria'],
  ObligadoEmision: ['NombreRazon', 'NIF'],
  Representante: ['NombreRazon', 'NIF'],
  RemisionVoluntaria: ['FechaFinVeriFactu', 'Incidencia'],
};

export const escaparXml = (texto: string): string =>
  texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** Escribe <prefijo:nombre>…</prefijo:nombre> con los hijos en el orden del XSD. */
function elemento(nombre: string, valor: Valor, prefijo: string): string {
  if (valor === undefined || valor === null) return '';
  if (typeof valor === 'string' || typeof valor === 'number') {
    return `<${prefijo}:${nombre}>${escaparXml(String(valor).trim())}</${prefijo}:${nombre}>`;
  }
  if (Array.isArray(valor)) throw new Error(`«${nombre}» es una lista sin orden definido`);
  const orden = ORDEN[nombre];
  if (!orden) throw new Error(`Falta el orden de «${nombre}»`);
  const conocidos = new Set(orden.map((c) => c.split('[]')[0]));
  const sobrantes = Object.keys(valor).filter((k) => !conocidos.has(k));
  if (sobrantes.length) throw new Error(`Campos desconocidos en «${nombre}»: ${sobrantes.join(', ')}`);
  const hijos = orden.map((c) => {
    const [campo, item] = c.split('[]');
    const v = valor[campo];
    if (item) {
      if (v === undefined || v === null) return '';
      if (!Array.isArray(v)) throw new Error(`«${campo}» debería ser una lista`);
      return `<${prefijo}:${campo}>${v.map((x) => elemento(item, x, prefijo)).join('')}</${prefijo}:${campo}>`;
    }
    return elemento(campo, v, prefijo);
  });
  return `<${prefijo}:${nombre}>${hijos.join('')}</${prefijo}:${nombre}>`;
}

/** XML de un registro de alta (fiscal_records.registro de un record_type 'alta'). */
export const xmlRegistroAlta = (registro: Record<string, unknown>, prefijo = 'sf'): string =>
  elemento('RegistroAlta', registro as Nodo, prefijo);

/** XML de un registro de anulación. */
export const xmlRegistroAnulacion = (registro: Record<string, unknown>, prefijo = 'sf'): string =>
  elemento('RegistroAnulacion', registro as Nodo, prefijo);

export interface RegistroGuardado {
  record_type: 'alta' | 'anulacion';
  registro: Record<string, unknown>;
}

/**
 * Mensaje completo de envío (RegFactuSistemaFacturacion): cabecera con el
 * obligado tributario y de 1 a 1.000 registros. Es el cuerpo SOAP de la fase 2.
 */
export function xmlEnvio(obligado: { NombreRazon: string; NIF: string }, registros: RegistroGuardado[]): string {
  if (registros.length < 1 || registros.length > 1000) throw new Error('Un envío lleva de 1 a 1.000 registros.');
  const cuerpo = registros
    .map((r) => `<sum:RegistroFactura>${r.record_type === 'alta' ? xmlRegistroAlta(r.registro, 'sf') : xmlRegistroAnulacion(r.registro, 'sf')}</sum:RegistroFactura>`)
    .join('');
  return `<sum:RegFactuSistemaFacturacion xmlns:sum="${NS_SUMINISTRO_LR}" xmlns:sf="${NS_SUMINISTRO_INFORMACION}">`
    + `<sum:Cabecera>${elemento('ObligadoEmision', obligado as unknown as Nodo, 'sf')}</sum:Cabecera>`
    + cuerpo
    + '</sum:RegFactuSistemaFacturacion>';
}

// ── Huella ──────────────────────────────────────────────────────────────────

const sha256Mayusculas = async (texto: string): Promise<string> => {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
};

const t = (v: unknown) => String(v ?? '').trim();

/** Cadena de entrada de la huella de un registro (alta o anulación). */
export function cadenaHuella(registro: Record<string, any>): string {
  const anterior = t(registro.Encadenamiento?.RegistroAnterior?.Huella);
  const id = registro.IDFactura ?? {};
  if ('IDEmisorFacturaAnulada' in id) {
    return `IDEmisorFacturaAnulada=${t(id.IDEmisorFacturaAnulada)}&NumSerieFacturaAnulada=${t(id.NumSerieFacturaAnulada)}`
      + `&FechaExpedicionFacturaAnulada=${t(id.FechaExpedicionFacturaAnulada)}&Huella=${anterior}`
      + `&FechaHoraHusoGenRegistro=${t(registro.FechaHoraHusoGenRegistro)}`;
  }
  return `IDEmisorFactura=${t(id.IDEmisorFactura)}&NumSerieFactura=${t(id.NumSerieFactura)}`
    + `&FechaExpedicionFactura=${t(id.FechaExpedicionFactura)}&TipoFactura=${t(registro.TipoFactura)}`
    + `&CuotaTotal=${t(registro.CuotaTotal)}&ImporteTotal=${t(registro.ImporteTotal)}&Huella=${anterior}`
    + `&FechaHoraHusoGenRegistro=${t(registro.FechaHoraHusoGenRegistro)}`;
}

/** Recalcula la huella: antes de enviar se comprueba que coincide con la guardada. */
export const huellaDeRegistro = (registro: Record<string, unknown>): Promise<string> =>
  sha256Mayusculas(cadenaHuella(registro));
