// Plantilla del contrato de prestación de servicios profesionales, ajustada a
// la legislación española (28/09/2026). Sustituye a la de 4 cláusulas, que no
// decía nada de propiedad intelectual, datos personales, pagos atrasados,
// consumidores ni jurisdicción.
//
// Normas en las que se apoya cada cláusula:
//  - Código Civil: libertad de pactos (arts. 1091, 1255), arrendamiento de
//    servicios y de obra (arts. 1544, 1583 y ss.), resolución por
//    incumplimiento (art. 1124), desistimiento del comitente (art. 1594),
//    responsabilidad por dolo no renunciable (art. 1102).
//  - Ley 3/2004 de morosidad: pago en 30 días (máx. 60 pactados), interés de
//    demora = tipo BCE + 8 puntos, 40 € por costes de cobro. Solo entre
//    empresas/profesionales.
//  - Ley de Propiedad Intelectual (RDL 1/1996): la cesión debe constar por
//    escrito y detallar derechos, modalidades, duración y territorio; si no,
//    se limita a 5 años y al país (arts. 43, 45, 48). Programas de ordenador:
//    arts. 95 a 104.
//  - RGPD (art. 28) y LOPDGDD (Ley Orgánica 3/2018): encargo de tratamiento.
//  - Ley 20/2007 del Estatuto del Trabajo Autónomo: relación mercantil.
//  - TRLGDCU (RDL 1/2007): consumidores — desistimiento de 14 días naturales
//    en contratos a distancia (arts. 102 a 108) y fuero de su domicilio.
//  - Reglamento (UE) 910/2014 eIDAS y Ley 6/2020: firma electrónica.
//  - Ley del IRPF (art. 101.5) y su Reglamento (art. 95): retención del 15 %,
//    o del 7 % el año de inicio y los dos siguientes.
//
// Es una plantilla orientativa: la app lo dice junto al texto.

import { formatCurrency } from './utils';

export interface DatosDelContrato {
  freelancer: {
    nombre: string;
    negocio?: string | null;
    nif?: string | null;
    domicilio?: string | null;
    email?: string | null;
  };
  cliente: {
    nombre: string;
    empresa?: string | null;
    nif?: string | null;
    domicilio?: string | null;
    email?: string | null;
  };
  proyecto: {
    nombre: string;
    descripcion?: string | null;
    fechaEntrega?: string | null; // AAAA-MM-DD
    importeCents?: number | null; // sin impuestos
  };
  /** Localidad donde se firma (la del domicilio fiscal del freelancer). */
  lugar?: string | null;
  /** Fecha de hoy, AAAA-MM-DD. */
  fecha: string;
}

const HUECO = '[________]';
const o = (v: string | null | undefined) => (v && v.trim() ? v.trim() : HUECO);

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** "2026-09-28" → "28 de septiembre de 2026" (sin pasar por Date: nada de husos). */
export const fechaEnLetra = (iso?: string | null): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!m) return HUECO;
  return `${Number(m[3])} de ${MESES[Number(m[2]) - 1]} de ${m[1]}`;
};

export function generarContrato(d: DatosDelContrato): string {
  const f = d.freelancer;
  const c = d.cliente;
  const p = d.proyecto;
  const nombreComercial = f.negocio && f.negocio.trim() && f.negocio.trim() !== f.nombre.trim()
    ? `, que actúa bajo el nombre comercial «${f.negocio.trim()}»` : '';
  const representacion = c.empresa && c.empresa.trim() && c.empresa.trim() !== c.nombre.trim()
    ? `, en nombre y representación de ${c.empresa.trim()}` : '';
  const importe = p.importeCents && p.importeCents > 0 ? formatCurrency(p.importeCents) : HUECO;

  return `CONTRATO DE PRESTACIÓN DE SERVICIOS PROFESIONALES

En ${o(d.lugar)}, a ${fechaEnLetra(d.fecha)}.

REUNIDOS

De una parte, ${o(f.nombre)}, con NIF ${o(f.nif)} y domicilio en ${o(f.domicilio)}, correo electrónico ${o(f.email)}${nombreComercial} (en adelante, «el PROFESIONAL»).

De otra parte, ${o(c.nombre)}${representacion}, con NIF/CIF ${o(c.nif)} y domicilio en ${o(c.domicilio)}, correo electrónico ${o(c.email)} (en adelante, «el CLIENTE»).

Ambas partes se reconocen capacidad legal suficiente para obligarse en este contrato y

EXPONEN

I. Que el PROFESIONAL es un trabajador por cuenta propia que presta servicios de desarrollo y diseño de software y soluciones digitales.

II. Que el CLIENTE está interesado en contratar dichos servicios para el proyecto descrito a continuación.

III. Que ambas partes acuerdan celebrar el presente contrato de prestación de servicios, al amparo de los artículos 1255 y 1544 y siguientes del Código Civil, que se regirá por las siguientes

CLÁUSULAS

PRIMERA. OBJETO
El PROFESIONAL realizará para el CLIENTE el proyecto «${o(p.nombre)}», que consiste en: ${o(p.descripcion)}.
Cualquier trabajo no incluido en esta descripción se considerará fuera del alcance del contrato y se presupuestará aparte (cláusula quinta).

SEGUNDA. PLAZO Y ENTREGA
El contrato entra en vigor en la fecha de su firma. La fecha prevista de entrega es el ${fechaEnLetra(p.fechaEntrega)}.
Este plazo depende de que el CLIENTE facilite a tiempo los contenidos, accesos y aprobaciones necesarios; los retrasos imputables al CLIENTE ampliarán el plazo en el mismo tiempo.

TERCERA. ACEPTACIÓN DEL TRABAJO
Tras cada entrega, el CLIENTE dispondrá de diez (10) días hábiles para revisarla y comunicar por escrito los defectos que encuentre respecto a lo acordado. El PROFESIONAL los corregirá sin coste en un plazo razonable. Pasado ese plazo sin observaciones, o si el CLIENTE empieza a usar el trabajo en producción, la entrega se entenderá aceptada.

CUARTA. PRECIO, FACTURACIÓN Y PAGO
1. El precio total de los servicios es de ${importe}, impuestos no incluidos. A esta cantidad se le sumará el IVA vigente (actualmente el 21 %) y, cuando el CLIENTE sea empresario o profesional, se le restará la retención del IRPF que corresponda legalmente (con carácter general el 15 %, o el 7 % durante el año de inicio de actividad del PROFESIONAL y los dos siguientes), según conste en cada factura.
2. Calendario de pago: el 50 % al firmar este contrato y el 50 % restante a la entrega final. Cada pago se facturará conforme al Reglamento de facturación (Real Decreto 1619/2012).
3. Las facturas se pagarán en un plazo de treinta (30) días naturales desde su emisión, por transferencia bancaria o por el medio de pago que figure en la factura.
4. Si el CLIENTE es empresario o profesional, el retraso en el pago devengará automáticamente, sin necesidad de aviso, el interés de demora previsto en el artículo 7 de la Ley 3/2004, de 29 de diciembre, de lucha contra la morosidad (tipo de interés del Banco Central Europeo más ocho puntos porcentuales), además de una indemnización de 40 euros por costes de cobro (artículo 8 de dicha ley).
5. Si un pago se retrasa más de quince (15) días, el PROFESIONAL podrá suspender los trabajos hasta que se abone, sin que ello le haga responsable del retraso en la entrega.

QUINTA. CAMBIOS EN EL PROYECTO
Cualquier modificación o ampliación del objeto deberá solicitarse por escrito. El PROFESIONAL enviará un presupuesto con el coste y el efecto en el plazo, y no la realizará hasta que el CLIENTE lo acepte por escrito (el correo electrónico es suficiente).

SEXTA. OBLIGACIONES DEL CLIENTE
El CLIENTE facilitará la información, contenidos, accesos y aprobaciones necesarios en tiempo y forma, y garantiza que tiene los derechos sobre los textos, imágenes, marcas y demás materiales que entregue al PROFESIONAL, manteniéndolo indemne frente a cualquier reclamación de terceros por su uso.

SÉPTIMA. PROPIEDAD INTELECTUAL
1. Una vez pagado íntegramente el precio, el PROFESIONAL cede al CLIENTE, con carácter exclusivo, los derechos de explotación sobre los entregables desarrollados específicamente para este proyecto —incluido el código fuente—: reproducción, distribución, comunicación pública y transformación, en cualquier modalidad y soporte, para todo el mundo y durante todo el tiempo de protección legal, conforme a los artículos 43 y siguientes y 95 y siguientes del Real Decreto Legislativo 1/1996, texto refundido de la Ley de Propiedad Intelectual.
2. Hasta el pago completo, el CLIENTE solo dispondrá de una licencia de uso provisional y revocable.
3. Quedan excluidos de la cesión las herramientas, bibliotecas, componentes y conocimientos que el PROFESIONAL ya tuviera o use de forma general en su actividad, así como el software de terceros o de código abierto, que se rigen por sus propias licencias. Sobre los elementos propios preexistentes que queden integrados en los entregables, el PROFESIONAL concede al CLIENTE una licencia de uso no exclusiva, perpetua, gratuita y mundial, limitada a su uso dentro del proyecto.
4. El PROFESIONAL conserva los derechos morales que la ley le reconoce y podrá mencionar el proyecto e incluir capturas en su portafolio, salvo que el CLIENTE se oponga por escrito.

OCTAVA. CONFIDENCIALIDAD
Las partes guardarán secreto sobre la información confidencial de la otra a la que accedan por este contrato y no la usarán con otro fin. Esta obligación se mantiene durante dos (2) años después de terminado el contrato. No se considera confidencial la información pública, la ya conocida por la parte receptora o la que deba revelarse por obligación legal.

NOVENA. PROTECCIÓN DE DATOS PERSONALES
1. Cada parte tratará los datos de contacto de la otra solo para gestionar este contrato (artículo 6.1.b del Reglamento (UE) 2016/679, RGPD) y los conservará durante los plazos legales. Pueden ejercerse los derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad escribiendo al correo de la otra parte, y reclamar ante la Agencia Española de Protección de Datos.
2. Si para prestar el servicio el PROFESIONAL tiene acceso a datos personales de los que el CLIENTE es responsable, actuará como encargado del tratamiento (artículo 28 del RGPD y artículo 33 de la Ley Orgánica 3/2018, LOPDGDD): tratará los datos solo siguiendo las instrucciones documentadas del CLIENTE y para este fin; garantizará la confidencialidad de quienes los traten; aplicará medidas de seguridad adecuadas; no recurrirá a otros encargados sin autorización previa del CLIENTE; le ayudará a atender los derechos de los interesados y a cumplir sus obligaciones; le comunicará sin dilación cualquier violación de seguridad; al terminar el servicio, devolverá o suprimirá los datos, según indique el CLIENTE; y pondrá a su disposición la información necesaria para demostrar el cumplimiento.

DÉCIMA. GARANTÍA Y RESPONSABILIDAD
1. El PROFESIONAL corregirá sin coste los errores de funcionamiento de lo entregado que se le comuniquen dentro de los tres (3) meses siguientes a la aceptación, siempre que no se deban a modificaciones hechas por terceros, a un uso indebido o a cambios en servicios o plataformas ajenos.
2. Salvo dolo o culpa grave, la responsabilidad total del PROFESIONAL por este contrato no superará el importe efectivamente cobrado, y no responderá del lucro cesante ni de daños indirectos.

UNDÉCIMA. NATURALEZA DE LA RELACIÓN
Este contrato es de naturaleza mercantil. El PROFESIONAL actúa como trabajador autónomo, con plena independencia organizativa y con sus propios medios, conforme a la Ley 20/2007, de 11 de julio, del Estatuto del Trabajo Autónomo. No existe relación laboral entre las partes, y el PROFESIONAL es responsable de sus obligaciones fiscales y de Seguridad Social.

DUODÉCIMA. TERMINACIÓN
1. Cualquiera de las partes podrá resolver el contrato si la otra incumple gravemente sus obligaciones y no lo corrige en los quince (15) días siguientes a recibir un requerimiento por escrito (artículo 1124 del Código Civil).
2. El CLIENTE podrá desistir del proyecto en cualquier momento avisando por escrito; en ese caso abonará el trabajo realizado hasta la fecha y los gastos ya comprometidos (artículo 1594 del Código Civil). Lo ya pagado a cuenta se descontará de esa cantidad.
3. A la terminación, el PROFESIONAL entregará lo realizado hasta la fecha una vez abonadas las cantidades pendientes.

DECIMOTERCERA. SI EL CLIENTE ES CONSUMIDOR
Si el CLIENTE actúa con un propósito ajeno a su actividad comercial, empresarial o profesional, le serán aplicables, además, las normas de protección de consumidores (Real Decreto Legislativo 1/2007). En particular, si el contrato se celebra a distancia o fuera de un establecimiento, dispondrá de catorce (14) días naturales desde su celebración para desistir sin justificación. Si pide expresamente que el servicio empiece antes de que termine ese plazo, deberá pagar la parte proporcional de lo ya prestado si desiste, y perderá ese derecho cuando el servicio se haya completado. No se le aplican la cláusula cuarta.4 ni, en lo que contradiga dicha normativa, la limitación de responsabilidad de la cláusula décima.2.

DECIMOCUARTA. COMUNICACIONES Y FIRMA ELECTRÓNICA
Las comunicaciones entre las partes se harán por escrito a los correos electrónicos indicados al inicio. Las partes aceptan firmar este contrato por medios electrónicos, con plena validez conforme al Reglamento (UE) 910/2014 (eIDAS) y a la Ley 6/2020, de 11 de noviembre, reguladora de determinados aspectos de los servicios electrónicos de confianza.

DECIMOQUINTA. LEY APLICABLE Y JURISDICCIÓN
Este contrato se rige por la ley española. Para resolver cualquier controversia, las partes se someten a los juzgados y tribunales del domicilio del PROFESIONAL, salvo que el CLIENTE sea consumidor, en cuyo caso serán competentes los de su domicilio.

DECIMOSEXTA. DISPOSICIONES FINALES
Este contrato recoge el acuerdo completo entre las partes y sustituye a cualquier acuerdo anterior sobre el mismo objeto. Cualquier modificación deberá hacerse por escrito. Si alguna cláusula fuera declarada nula, las demás seguirán siendo válidas.

Y en prueba de conformidad, las partes firman el presente contrato en el lugar y la fecha indicados.

EL PROFESIONAL
Fdo.: ${o(f.nombre)}

EL CLIENTE
Fdo.: ${o(c.nombre)}${representacion ? ` (${c.empresa!.trim()})` : ''}
`;
}

/** ¿Quedan datos por rellenar? (la app lo avisa antes de guardar). */
export const huecosPendientes = (texto: string): number => texto.split(HUECO).length - 1;
