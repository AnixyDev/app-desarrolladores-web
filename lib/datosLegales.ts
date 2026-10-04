// Datos del titular que aparecen en Aviso legal, Privacidad, Cookies y
// Términos. Están en un solo sitio para rellenarlos una vez.
//
// Los valores entre corchetes son MARCADORES: se ven resaltados en amarillo en
// la web hasta que se sustituyen por el dato real. No los borres sin poner el
// dato: el aviso legal está obligado a mostrarlos (LSSI art. 10).
export const DATOS_LEGALES = {
  /** Nombre y apellidos (autónomo) o razón social (sociedad). */
  titular: 'Ana Fernández Rodríguez',
  /** NIF / DNI con letra, o CIF de la sociedad. */
  nif: '74870299D',
  /** Dirección postal completa: calle, número, CP, localidad y provincia. */
  domicilio: 'Paseo El Pedregal, 29017 Málaga',
  /** Correo de contacto y de ejercicio de derechos. */
  email: 'soporte@devfreelancer.app',
  /**
   * Solo si el titular es una sociedad: "Inscrita en el Registro Mercantil de
   * X, tomo, folio, hoja". Si eres autónomo, déjalo como cadena vacía ('').
   */
  datosRegistrales: '',
  /** Días de antelación con que se avisa de la renovación de un plan anual. */
  diasPreavisoRenovacion: '[DÍAS DE PREAVISO]',
  /** Si los precios de /pricing llevan el IVA incluido. Ej.: 'incluyen el IVA'. */
  ivaPrecios: '[INCLUYEN EL IVA / NO INCLUYEN EL IVA]',
  /** De dónde obtiene Lead Hunter PRO los datos de empresas y profesionales. */
  fuentesLeadHunter: '[FUENTES DE DATOS DE LEAD HUNTER]',
  sitio: 'devfreelancer.app',
  nombreComercial: 'DevFreelancer',
} as const;

/** Fecha de la última revisión de los textos legales. */
export const FECHA_TEXTOS_LEGALES = '4 de octubre de 2026';

export const esMarcador = (valor: string): boolean => /^\[.*\]$/.test(valor.trim());
