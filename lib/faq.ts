// Preguntas frecuentes de la home (04/10/2026).
//
// Edita aquí las preguntas y respuestas: la sección de la home (components/
// FaqHome.tsx) y los datos estructurados para Google (FAQPage) salen de este
// mismo archivo.
//
// - Cada respuesta es una lista de párrafos de texto plano.
// - Lo que esté entre [PENDIENTE: …] se ve resaltado en amarillo en la web y
//   la pregunta NO se incluye en los datos estructurados hasta que lo quites:
//   Google no debe leer como respuesta algo que aún no está confirmado.
// - Todas las respuestas describen lo que hace hoy el código de la app. Si
//   cambia una función, cambia también su respuesta.

export interface PreguntaFaq {
  id: string;
  pregunta: string;
  respuesta: string[];
}

export const PREGUNTAS_FAQ: PreguntaFaq[] = [
  {
    id: 'iva-irpf',
    pregunta: '¿Calcula automáticamente el IVA y el IRPF?',
    respuesta: [
      'Sí. Al crear una factura, DevFreelancer calcula a partir de las líneas la base imponible, la cuota de IVA, la retención de IRPF y el total a cobrar (base + IVA − IRPF).',
      'El IVA viene al 21 % y el IRPF al 0 %; puedes cambiar los dos porcentajes en cada factura para poner los que te correspondan. Si el cliente es de otro país de la UE o de fuera de la UE, el IVA y el IRPF se ponen a 0 % automáticamente.',
    ],
  },
  {
    id: 'clientes-extranjeros',
    pregunta: '¿Puedo facturar a clientes extranjeros?',
    respuesta: [
      'Sí. En la ficha de cada cliente indicas si es de España, una empresa de otro país de la UE o un cliente de fuera de la UE. Para los dos últimos, la factura sale sin IVA y el PDF incluye la mención legal que explica por qué no lleva IVA español.',
      'Para facturar sin IVA a una empresa de la UE necesitas su NIF-IVA (número de IVA intracomunitario), que se guarda en su ficha y aparece en la factura. Las facturas se emiten siempre en euros.',
    ],
  },
  {
    id: 'verifactu',
    pregunta: '¿Mis facturas cumplen Verifactu?',
    respuesta: [
      'DevFreelancer ya hace la parte que se queda en tu cuenta: cada factura genera un registro con una huella digital (SHA-256) encadenada a la anterior, el PDF lleva el código QR de verificación de la Agencia Tributaria y, una vez emitida, la factura queda bloqueada. Para corregirla se emite una factura rectificativa.',
      'Lo que todavía no está disponible es el envío automático de cada registro a la Agencia Tributaria (modalidad Veri*Factu). Mientras tanto la app funciona en la modalidad «No Veri*Factu» y puedes dejar tu certificado digital preparado en Ajustes.',
      'Las obligaciones y los plazos dependen de tu actividad: si necesitas cumplir ya con el reglamento, consúltalo con tu gestoría.',
    ],
  },
  {
    id: 'gestoria',
    pregunta: '¿Puedo pasarle los datos a mi gestoría?',
    respuesta: [
      'Sí. En el Libro Fiscal (planes de pago) puedes descargar, por trimestre o por año, un archivo CSV con tus ingresos y gastos (fecha, tercero, base imponible, IVA, IRPF y total) y un borrador en PDF de los modelos 303 y 130 para que tu gestoría lo revise. El borrador no sustituye la presentación oficial ante la Agencia Tributaria.',
      'Incluye también las facturas a clientes de otro país, que van sin IVA español, con el motivo en una columna aparte para que tu gestoría las identifique.',
      'Además, cada factura se descarga en PDF y el registro fiscal de tus facturas se puede exportar completo.',
    ],
  },
  {
    id: 'datos-al-cancelar',
    pregunta: '¿Qué pasa con mis datos si cancelo?',
    respuesta: [
      'No se borra nada. Al terminar tu suscripción, la cuenta pasa al plan gratuito y conservas tus clientes, proyectos, facturas y el resto de documentos.',
      'Dejas de tener las funciones de pago, como el Libro Fiscal o el portal de clientes, y con el plan gratuito no puedes dar de alta más de un cliente, aunque los que ya tengas se mantienen y se pueden editar. Si vuelves a suscribirte, todo sigue donde lo dejaste.',
      'Tus datos solo se borran si eliminas tu cuenta desde Ajustes. Antes puedes descargar todas tus facturas, y las que exige la ley se conservan bloqueadas durante el plazo legal.',
    ],
  },
  {
    id: 'plan-fundadores',
    pregunta: '¿Qué incluye el Plan Fundadores y qué significa «para siempre»?',
    respuesta: [
      'Es el plan Freelancer Pro con pago anual a 59 €/año, con las mismas funciones que Pro. Hay 50 plazas, disponibles hasta el 31 de diciembre de 2026 o hasta que se agoten, solo para cuentas que no tengan otra suscripción de pago, y no se combina con códigos promocionales.',
      '«Para siempre» significa que mantienes ese precio en cada renovación anual mientras tu suscripción siga activa sin interrupción. Si la cancelas, termina por falta de pago o cambias de plan, pierdes el precio de fundador y la plaza no se recupera.',
    ],
  },
  {
    id: 'cancelar',
    pregunta: '¿Puedo cancelar cuando quiera?',
    respuesta: [
      'Sí, sin permanencia. Desde Facturación y Plan → Cancelar suscripción eliges cuándo termina: al final del periodo ya pagado (sigues con tu plan hasta ese día y puedes reanudarla antes) o en el momento (tu cuenta pasa al plan gratuito al instante).',
      'En los dos casos conservas todos tus datos. No se devuelve la parte no usada del periodo en curso, salvo el derecho de desistimiento de 14 días si contratas como consumidor. Lo tienes todo en los Términos y condiciones.',
    ],
  },
];

const PATRON_PENDIENTE = /\[PENDIENTE:[^\]]*\]/;

export const tienePendiente = (p: PreguntaFaq): boolean => p.respuesta.some((r) => PATRON_PENDIENTE.test(r));

/** Parte un párrafo en trozos normales y trozos [PENDIENTE: …] para resaltarlos. */
export function trozosConPendientes(texto: string): { texto: string; pendiente: boolean }[] {
  return texto
    .split(/(\[PENDIENTE:[^\]]*\])/)
    .filter(Boolean)
    .map((t) => ({ texto: t, pendiente: PATRON_PENDIENTE.test(t) }));
}

/**
 * Datos estructurados FAQPage (schema.org) a partir de PREGUNTAS_FAQ.
 * Solo incluye las preguntas sin nada pendiente; si no queda ninguna, null.
 */
export function faqJsonLd(preguntas: PreguntaFaq[] = PREGUNTAS_FAQ): Record<string, unknown> | null {
  const publicables = preguntas.filter((p) => !tienePendiente(p));
  if (publicables.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: publicables.map((p) => ({
      '@type': 'Question',
      name: p.pregunta,
      acceptedAnswer: { '@type': 'Answer', text: p.respuesta.join('\n\n') },
    })),
  };
}
