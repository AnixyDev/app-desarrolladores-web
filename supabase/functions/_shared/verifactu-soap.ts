// Verifactu, fase 2 (07/10/2026): sobre SOAP del envío a la AEAT y lectura de
// su respuesta (RespuestaSuministro.xsd). Puro: lo usan la Edge Function
// verifactu-enviar (Deno) y vitest (src/test/verifactu-soap.test.ts).

/** Dirección del servicio según el entorno (WSDL oficial, certificado personal). */
export const URL_VERIFACTU = {
  pruebas: 'https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP',
  produccion: 'https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP',
} as const;
export type EntornoVerifactu = keyof typeof URL_VERIFACTU;

/** Cotejo del QR según entorno (DetalleEspecificacTecnCodigoQRfactura). */
export const URL_QR_VERIFACTU = {
  pruebas: 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR',
  produccion: 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR',
} as const;

/** Máximo de registros por envío y espera por defecto entre envíos (servicio web v1.0.3). */
export const MAX_REGISTROS_POR_ENVIO = 1000;
export const ESPERA_POR_DEFECTO_SEGUNDOS = 60;

export const sobreSoap = (cuerpoXml: string): string =>
  '<?xml version="1.0" encoding="UTF-8"?>'
  + '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">'
  + '<soapenv:Header/><soapenv:Body>' + cuerpoXml + '</soapenv:Body></soapenv:Envelope>';

// ── Lectura de la respuesta ─────────────────────────────────────────────────
// Sin parser XML (Deno Deploy no trae DOMParser): la respuesta es pequeña y de
// estructura fija; se buscan las etiquetas por su nombre local, sea cual sea el
// prefijo de espacio de nombres que use la AEAT.

const desescapar = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** Contenido de la primera etiqueta `nombre` (sin prefijo) dentro de `xml`, o null. */
export function etiqueta(xml: string, nombre: string): string | null {
  const m = new RegExp(`<(?:[\\w.-]+:)?${nombre}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${nombre}>`).exec(xml);
  return m ? desescapar(m[1].trim()) : null;
}

/** Todos los bloques `nombre` (sin prefijo) dentro de `xml`. */
export function bloques(xml: string, nombre: string): string[] {
  const re = new RegExp(`<(?:[\\w.-]+:)?${nombre}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${nombre}>`, 'g');
  return [...xml.matchAll(re)].map((m) => m[1]);
}

export type EstadoEnvio = 'Correcto' | 'ParcialmenteCorrecto' | 'Incorrecto';
export type EstadoRegistro = 'Correcto' | 'AceptadoConErrores' | 'Incorrecto';

export interface LineaRespuesta {
  numSerie: string;
  fecha: string;
  operacion: 'Alta' | 'Anulacion' | string;
  estado: EstadoRegistro;
  codigoError: string | null;
  descripcionError: string | null;
  duplicado: boolean;
}

export type RespuestaAeat =
  | { tipo: 'respuesta'; csv: string | null; estadoEnvio: EstadoEnvio; esperaSegundos: number; lineas: LineaRespuesta[] }
  | { tipo: 'fallo'; codigo: string | null; mensaje: string };

/** Interpreta lo que devuelve la AEAT: respuesta normal o SoapFault (error que rechaza el envío entero). */
export function leerRespuesta(xml: string): RespuestaAeat {
  const fault = bloques(xml, 'Fault')[0];
  if (fault !== undefined) {
    const texto = etiqueta(fault, 'faultstring') ?? 'Error desconocido de la AEAT';
    const codigo = /Codigo\[(\d+)\]/.exec(texto)?.[1] ?? null;
    return { tipo: 'fallo', codigo, mensaje: texto };
  }
  const cuerpo = bloques(xml, 'RespuestaRegFactuSistemaFacturacion')[0];
  if (cuerpo === undefined) {
    return { tipo: 'fallo', codigo: null, mensaje: 'Respuesta de la AEAT no reconocida: ' + xml.slice(0, 300) };
  }
  const lineas = bloques(cuerpo, 'RespuestaLinea').map((l): LineaRespuesta => {
    const id = bloques(l, 'IDFactura')[0] ?? '';
    return {
      numSerie: etiqueta(id, 'NumSerieFactura') ?? '',
      fecha: etiqueta(id, 'FechaExpedicionFactura') ?? '',
      operacion: etiqueta(l, 'TipoOperacion') ?? '',
      estado: (etiqueta(l, 'EstadoRegistro') ?? 'Incorrecto') as EstadoRegistro,
      codigoError: etiqueta(l, 'CodigoErrorRegistro'),
      descripcionError: etiqueta(l, 'DescripcionErrorRegistro'),
      duplicado: bloques(l, 'RegistroDuplicado').length > 0,
    };
  });
  const espera = Number(etiqueta(cuerpo, 'TiempoEsperaEnvio'));
  return {
    tipo: 'respuesta',
    csv: etiqueta(cuerpo, 'CSV'),
    estadoEnvio: (etiqueta(cuerpo, 'EstadoEnvio') ?? 'Incorrecto') as EstadoEnvio,
    esperaSegundos: Number.isFinite(espera) && espera > 0 ? espera : ESPERA_POR_DEFECTO_SEGUNDOS,
    lineas,
  };
}

/** Estado que se guarda en fiscal_records.estado_envio para cada estado de la AEAT. */
export const ESTADO_GUARDADO: Record<EstadoRegistro, 'aceptado' | 'aceptado_con_errores' | 'rechazado'> = {
  Correcto: 'aceptado',
  AceptadoConErrores: 'aceptado_con_errores',
  Incorrecto: 'rechazado',
};

/**
 * Busca la línea de respuesta de un registro guardado (número de factura +
 * tipo de operación). La AEAT devuelve las líneas en el orden del envío, pero
 * no se confía en el orden.
 */
export function lineaDe(
  lineas: LineaRespuesta[],
  registro: { record_type: 'alta' | 'anulacion'; numero_factura: string },
): LineaRespuesta | undefined {
  const op = registro.record_type === 'alta' ? 'Alta' : 'Anulacion';
  return lineas.find((l) => l.numSerie === registro.numero_factura.trim() && l.operacion === op)
    ?? lineas.find((l) => l.numSerie === registro.numero_factura.trim());
}
