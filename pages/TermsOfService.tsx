// Términos y condiciones de contratación (/terms).
// Marco: LSSI-CE, TRLGDCU (RDL 1/2007) para quien contrate como consumidor,
// y art. 28 RGPD para el encargo de tratamiento de los datos de sus clientes.
import React from 'react';
import { Link } from 'react-router-dom';
import PaginaLegal, { Dato, Lista, Seccion } from '@/components/legal/PaginaLegal';
import { DATOS_LEGALES as D } from '@/lib/datosLegales';
import { PLAZAS_TOTALES } from '../supabase/functions/_shared/fundadores';

const Correo = () => <a href={`mailto:${D.email}`}>{D.email}</a>;

const TermsOfService: React.FC = () => (
  <PaginaLegal titulo="Términos y condiciones">
    <Seccion titulo="1. Quiénes somos y qué regulan estos términos">
      <p>
        {D.nombreComercial} es un servicio de <Dato v={D.titular} />, con NIF <Dato v={D.nif} /> y domicilio en{' '}
        <Dato v={D.domicilio} /> (contacto: <Correo />). Estos términos regulan el uso de la aplicación y la contratación
        de sus planes. Al crear una cuenta o contratar un plan los aceptas.
      </p>
      <p>
        El servicio está pensado para profesionales. Si contratas como <strong>consumidor</strong> (para un fin ajeno a
        tu actividad profesional), tienes además los derechos que te reconoce la ley, como el de desistimiento del
        apartado 7. Nada de estos términos limita esos derechos.
      </p>
    </Seccion>

    <Seccion titulo="2. Cuenta">
      <Lista>
        <li>Debes ser mayor de edad y dar datos veraces.</li>
        <li>
          Eres responsable de mantener seguro tu acceso (contraseña o cuenta de Google) y de lo que se haga desde tu
          cuenta.
        </li>
        <li>
          No puedes usar el servicio para actividades ilegales, para enviar comunicaciones no deseadas ni para intentar
          acceder a datos de otras personas usuarias.
        </li>
      </Lista>
    </Seccion>

    <Seccion titulo="3. Planes y precios">
      <p>
        Hay un plan gratuito y planes de pago con facturación mensual o anual. Las funciones y el precio de cada plan son
        los publicados en la página de <Link to="/pricing">precios</Link> en el momento de contratar. Los precios
        mostrados <Dato v={D.ivaPrecios} />.
      </p>
      <p>
        El pago se hace con tarjeta a través de Stripe al contratar y, después, al inicio de cada periodo. Recibirás la
        factura de cada cobro por email.
      </p>
    </Seccion>

    <Seccion titulo="4. Renovación automática">
      <p>
        Las suscripciones se <strong>renuevan automáticamente</strong> al final de cada periodo (mes o año) por el mismo
        periodo y se cobra el precio vigente de tu plan, salvo que la canceles antes.
      </p>
      <p>
        Antes de cada renovación te enviaremos un aviso por email con la fecha y el importe del próximo cobro, para que
        puedas cancelar a tiempo si no quieres continuar.
      </p>
      <p>
        Si cambiamos el precio de un plan, te lo comunicaremos con al menos 30 días de antelación; el nuevo precio se
        aplicará desde la siguiente renovación y podrás cancelar antes si no estás de acuerdo.
      </p>
    </Seccion>

    <Seccion titulo="5. Cómo cancelar">
      <p>
        Puedes cancelar cuando quieras desde <strong>Facturación y Plan → Gestionar en el portal → Cancelar
        suscripción</strong>, o escribiendo a <Correo />. La cancelación evita la siguiente renovación: mantienes el plan
        hasta el final del periodo ya pagado y después tu cuenta pasa al plan gratuito, sin perder tus datos.
      </p>
      <p>
        Fuera del derecho de desistimiento (apartado 7), no se devuelve la parte no consumida del periodo en curso.
      </p>
    </Seccion>

    <Seccion titulo="6. Pagos fallidos">
      <p>
        Si un cobro no se puede realizar, Stripe lo reintentará durante unos días y te avisaremos por email. Si el pago
        sigue sin realizarse, la suscripción se cancelará y la cuenta pasará al plan gratuito.
      </p>
    </Seccion>

    <Seccion id="desistimiento" titulo="7. Derecho de desistimiento (consumidores)">
      <p>
        Si contratas como consumidor, puedes desistir del contrato en un plazo de <strong>14 días naturales</strong>{' '}
        desde la contratación sin indicar el motivo. Para hacerlo, escríbenos a <Correo /> con una declaración clara (por
        ejemplo: «Desisto del contrato del plan X contratado el día Y», con tu nombre y el email de tu cuenta). Basta con
        enviarla antes de que acabe el plazo.
      </p>
      <p>
        Te devolveremos lo pagado en un máximo de 14 días desde que recibamos tu solicitud, por el mismo medio de pago.
        Como el servicio empieza a prestarse en cuanto lo contratas a petición tuya, podremos descontar la parte
        proporcional al tiempo que lo hayas usado hasta que nos comuniques el desistimiento (art. 108 TRLGDCU).
      </p>
      <p>
        Si contratas para tu actividad profesional (como autónomo o empresa), la ley no reconoce este derecho, aunque
        puedes cancelar en cualquier momento como se explica en el apartado 5.
      </p>
    </Seccion>

    <Seccion id="fundadores" titulo="8. Condiciones del Plan Fundadores">
      <Lista>
        <li>
          Es una oferta de lanzamiento del plan Freelancer Pro con facturación anual, limitada a{' '}
          <strong>{PLAZAS_TOTALES} plazas</strong> y disponible hasta las 23:59 (hora peninsular) del 31 de diciembre de
          2026 o hasta que se agoten las plazas, lo que ocurra antes.
        </li>
        <li>Solo pueden contratarla cuentas que no tengan otra suscripción de pago activa. Una plaza por cuenta.</li>
        <li>No se puede combinar con códigos promocionales ni con otros descuentos.</li>
        <li>
          <strong>El precio de fundador se mantiene en cada renovación anual mientras la suscripción siga activa sin
          interrupción.</strong>
        </li>
        <li>
          <strong>Si cancelas la suscripción, o termina por impago, pierdes el precio de fundador</strong> y la plaza no
          se puede recuperar. Si vuelves a suscribirte, se aplicará el precio vigente en ese momento.
        </li>
        <li>
          Si cambias a otro plan, se aplicará el precio de ese plan y también se pierde el precio de fundador.
        </li>
        <li>
          Mientras completas el pago, tu plaza queda reservada unos 30 minutos. Si no terminas el pago, la plaza vuelve a
          estar disponible.
        </li>
        <li>El resto de condiciones (renovación, cancelación, desistimiento) son las de estos términos.</li>
      </Lista>
    </Seccion>

    <Seccion titulo="9. Tus datos y tu contenido">
      <p>
        Los datos y documentos que creas en {D.nombreComercial} (clientes, proyectos, facturas, contratos) son tuyos.
        Puedes eliminar tu cuenta cuando quieras desde Ajustes. Las facturas emitidas se conservan
        bloqueadas el tiempo que exige la normativa fiscal.
      </p>
    </Seccion>

    <Seccion id="encargo" titulo="10. Encargo del tratamiento de los datos de tus clientes">
      <p>
        Respecto a los datos personales de tus clientes que introduces en el servicio, tú eres el responsable del
        tratamiento y nosotros el encargado (art. 28 RGPD). En consecuencia, nos comprometemos a:
      </p>
      <Lista>
        <li>Tratarlos solo para prestarte el servicio y siguiendo tus instrucciones.</li>
        <li>Garantizar la confidencialidad de las personas que puedan acceder a ellos.</li>
        <li>Aplicar medidas de seguridad adecuadas.</li>
        <li>
          Recurrir solo a los subencargados indicados en la <Link to="/privacidad">Política de privacidad</Link>, con las
          mismas obligaciones; te avisaremos de cualquier cambio para que puedas oponerte.
        </li>
        <li>Ayudarte a atender los derechos de tus clientes y avisarte sin demora de cualquier brecha de seguridad.</li>
        <li>Al terminar el servicio, suprimir los datos, salvo los que la ley obligue a conservar.</li>
        <li>Ponerte a disposición la información necesaria para demostrar el cumplimiento de estas obligaciones.</li>
      </Lista>
    </Seccion>

    <Seccion titulo="11. Herramientas de ayuda e inteligencia artificial">
      <p>
        Los cálculos fiscales, informes, plantillas y textos generados con IA son una ayuda. No sustituyen el
        asesoramiento de un profesional fiscal o jurídico: revisa siempre los resultados antes de enviar documentos o
        presentar impuestos. Consulta en la <Link to="/privacidad#ia">Política de privacidad</Link> qué datos no debes
        introducir en el asistente.
      </p>
    </Seccion>

    <Seccion titulo="12. Disponibilidad y responsabilidad">
      <p>
        Trabajamos para que el servicio esté disponible y sin errores, pero puede haber interrupciones por mantenimiento,
        fallos o causas ajenas. Responderemos de los daños causados por dolo o negligencia grave. En los demás casos, y
        siempre que no contratas como consumidor, nuestra responsabilidad se limita al importe pagado en los 12 meses
        anteriores al hecho que la cause.
      </p>
    </Seccion>

    <Seccion titulo="13. Suspensión">
      <p>
        Podemos suspender o cerrar una cuenta que incumpla gravemente estos términos, avisando antes salvo que el
        incumplimiento lo impida o la ley lo exija. Si se cierra por un motivo que no te sea imputable, te devolveremos la
        parte no consumida del periodo pagado.
      </p>
    </Seccion>

    <Seccion titulo="14. Cambios en estos términos">
      <p>
        Si modificamos estos términos de forma relevante, te avisaremos por email con al menos 30 días de antelación. Si
        no estás de acuerdo, puedes cancelar antes de que se apliquen.
      </p>
    </Seccion>

    <Seccion titulo="15. Ley aplicable y reclamaciones">
      <p>
        Estos términos se rigen por la ley española. Si tienes cualquier problema, escríbenos primero a <Correo />. Si
        eres consumidor, puedes reclamar ante los juzgados de tu domicilio y ante los servicios de consumo de tu comunidad
        autónoma.
      </p>
    </Seccion>
  </PaginaLegal>
);

export default TermsOfService;
