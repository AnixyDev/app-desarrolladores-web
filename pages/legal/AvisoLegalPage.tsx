// Aviso legal — LSSI-CE (Ley 34/2002), art. 10.
import React from 'react';
import { Link } from 'react-router-dom';
import PaginaLegal, { Dato, Lista, Seccion } from '@/components/legal/PaginaLegal';
import { DATOS_LEGALES as D } from '@/lib/datosLegales';

const AvisoLegalPage: React.FC = () => (
  <PaginaLegal titulo="Aviso legal">
    <Seccion titulo="1. Titular del sitio web">
      <p>
        En cumplimiento del artículo 10 de la Ley 34/2002, de Servicios de la Sociedad de la Información y de Comercio
        Electrónico (LSSI-CE), se informa de los datos del titular de {D.sitio} y del servicio {D.nombreComercial}:
      </p>
      <Lista>
        <li><strong>Titular:</strong> <Dato v={D.titular} /></li>
        <li><strong>NIF:</strong> <Dato v={D.nif} /></li>
        <li><strong>Domicilio:</strong> <Dato v={D.domicilio} /></li>
        <li><strong>Correo electrónico:</strong> <a href={`mailto:${D.email}`}>{D.email}</a></li>
        {D.datosRegistrales ? <li><strong>Datos registrales:</strong> <Dato v={D.datosRegistrales} /></li> : null}
      </Lista>
    </Seccion>

    <Seccion titulo="2. Objeto">
      <p>
        {D.nombreComercial} es una aplicación web de gestión para profesionales independientes del desarrollo de software:
        clientes, proyectos, control de horas, presupuestos, contratos, facturación y cobros. Este aviso regula el acceso y
        uso del sitio web. La contratación de los planes de pago se rige además por los{' '}
        <Link to="/terms">Términos y condiciones</Link>.
      </p>
    </Seccion>

    <Seccion titulo="3. Condiciones de uso">
      <p>
        El acceso al sitio es libre y gratuito, salvo las funciones que requieren registro o un plan de pago. Quien lo usa se
        compromete a hacerlo conforme a la ley y a estas condiciones, y a no realizar actividades que puedan dañar el sitio,
        a otras personas usuarias o a terceros, ni intentar acceder a áreas o datos que no le corresponden.
      </p>
    </Seccion>

    <Seccion titulo="4. Propiedad intelectual e industrial">
      <p>
        El diseño, el código, los textos, los logotipos y la marca {D.nombreComercial} pertenecen a su titular o se usan con
        licencia. No se permite su reproducción, distribución o transformación sin autorización, salvo el uso personal
        necesario para utilizar el servicio. Los contenidos que cada persona usuaria sube a su cuenta siguen siendo suyos.
      </p>
    </Seccion>

    <Seccion titulo="5. Responsabilidad">
      <p>
        Se procura que la información del sitio sea correcta y esté actualizada, y que el servicio funcione sin
        interrupciones, pero no se garantiza la ausencia de errores ni la disponibilidad continua. Las plantillas, cálculos
        e informes (incluidos los fiscales y los generados con inteligencia artificial) son una ayuda para la gestión y no
        sustituyen el asesoramiento de un profesional fiscal o jurídico.
      </p>
      <p>
        Los enlaces a sitios de terceros se ofrecen solo como referencia; el titular no responde de sus contenidos ni de
        sus políticas.
      </p>
    </Seccion>

    <Seccion titulo="6. Protección de datos y cookies">
      <p>
        El tratamiento de datos personales se explica en la <Link to="/privacidad">Política de privacidad</Link> y el uso
        de cookies y almacenamiento local en la <Link to="/cookies">Política de cookies</Link>.
      </p>
    </Seccion>

    <Seccion titulo="7. Legislación aplicable">
      <p>
        Este aviso se rige por la legislación española. Si eres consumidor, podrás acudir a los juzgados de tu domicilio;
        en los demás casos, a los que correspondan conforme a la ley.
      </p>
    </Seccion>
  </PaginaLegal>
);

export default AvisoLegalPage;
