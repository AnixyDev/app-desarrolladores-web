// Verifactu, fase 4 (07/10/2026): declaración responsable del sistema
// informático de facturación (art. 15 de la Orden HAC/1177/2024, en el orden
// que fija ese artículo; modelo: «Ejemplos de declaración responsable» de la
// AEAT, v0.5.1).
//
// MIENTRAS `firmada` SEA false ES UN BORRADOR: la página pública no la muestra
// (solo la cuenta de administración la ve, marcada como borrador). Firmarla
// antes de que el sistema cumpla entero sería declarar algo falso
// (art. 201 bis LGT: 150.000 € por ejercicio al productor).
//
// Los datos del sistema TIENEN que coincidir con el bloque SistemaInformatico
// que la base de datos pone en cada registro (función
// verifactu_sistema_informatico): nombre, código, versión y NIF del productor.
// Una versión nueva del sistema necesita su propia declaración.
import { DATOS_LEGALES as D } from '@/lib/datosLegales';

export const DECLARACION_RESPONSABLE = {
  /** Cambiar a true SOLO cuando Ana la haya revisado y firmado (fase 4). */
  firmada: false,
  /** Fecha de la firma, p. ej. '15 de marzo de 2027'. */
  fechaFirma: null as string | null,
  lugarFirma: 'Málaga (España)',

  // a) a c) — iguales que en SistemaInformatico de cada registro.
  nombreSistema: 'DevFreelancer',
  codigoSistema: 'DF',
  version: '1.0',

  // d) Componentes y funcionalidades.
  componentes: [
    'Aplicación web en la nube (SaaS) accesible en https://devfreelancer.app desde cualquier navegador actual. No necesita instalar programas ni hardware específico.',
    'Interfaz web (React) servida por Vercel.',
    'Base de datos (Supabase, PostgreSQL, alojada en la Unión Europea) donde se emiten las facturas y se generan, encadenan y conservan los registros de facturación. Los registros no se pueden modificar ni borrar.',
    'Servicio de envío (funciones de Supabase) que remite cada registro a la Agencia Tributaria por el servicio web VERI*FACTU, con el certificado electrónico del propio obligado tributario, y guarda íntegras la petición y la respuesta.',
  ],
  funcionalidades: [
    'Emisión de facturas completas (F1), simplificadas (F2) y rectificativas por diferencias (R1, R4 y R5).',
    'Registro de facturación de alta y de anulación por cada factura, con huella SHA-256 encadenada al registro anterior.',
    'Envío inmediato y automático de los registros a la AEAT, reintento si no hay conexión y subsanación de los registros rechazados.',
    'Código QR tributario y la mención «VERI*FACTU» en cada factura.',
    'Consulta por el usuario de sus registros, de su estado ante la AEAT y de la integridad de la cadena.',
    'Conservación de facturas, registros y envíos durante 6 años, también si el usuario se da de baja.',
  ],

  // e) a g)
  soloVerifactu: true,
  multiplesObligados: true,
  tiposFirma: 'No aplica: el sistema funciona exclusivamente como VERI*FACTU.',

  // h) a j) — productor.
  productor: D.titular,
  nifProductor: D.nif,
  direccionProductor: `${D.domicilio} (España)`,

  // Anexo (art. 15.2, recomendado).
  contacto: D.email,
  web: `https://${D.sitio}`,
  paginaDeclaracion: `https://${D.sitio}/declaracion-responsable`,
  implementacion: [
    'Registros de facturación con los campos y el formato de los esquemas XSD oficiales (SuministroLR y SuministroInformacion) y huella según la especificación de la AEAT.',
    'Envío por el servicio web SOAP VERI*FACTU con certificado electrónico, respetando el tiempo de espera entre envíos que indica la AEAT.',
    'QR conforme a la especificación técnica del código QR y del servicio de cotejo de la AEAT (nivel de corrección M, entre 30 y 40 mm).',
    'Comprobado contra el entorno de pruebas de la AEAT con todos los tipos de factura que emite el sistema.',
  ],
} as const;

/**
 * Lo que falta para poder firmar (se muestra en el borrador). Quitar cada
 * punto cuando esté hecho; con la lista vacía, Ana revisa y firma.
 */
export const PENDIENTE_ANTES_DE_FIRMAR: readonly string[] = [
  'Dirección postal completa del productor (con número) y alta como autónoma.',
  'Visto bueno de la gestoría al texto.',
];

/** Texto obligatorio del art. 15.1.k) (redacción del modelo de la AEAT). */
export const textoCumplimiento = (d: typeof DECLARACION_RESPONSABLE = DECLARACION_RESPONSABLE): string =>
  `${d.productor}, como productora del sistema informático de facturación ${d.nombreSistema}, `
  + `declara que la versión ${d.version} de este sistema cumple con lo dispuesto en el artículo 29.2.j) de la `
  + 'Ley 58/2003, de 17 de diciembre, General Tributaria, en el Real Decreto 1007/2023, de 5 de diciembre, '
  + 'en la Orden HAC/1177/2024, de 17 de octubre, y en las especificaciones publicadas en la sede electrónica '
  + 'de la Agencia Estatal de Administración Tributaria.';
