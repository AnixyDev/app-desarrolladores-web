// Política de privacidad — RGPD (UE 2016/679) y LOPDGDD (LO 3/2018).
// Se sirve en /privacidad y también en /privacy (la URL registrada en Google).
import React from 'react';
import { Link } from 'react-router-dom';
import PaginaLegal, { Dato, Lista, Seccion, TablaLegal } from '@/components/legal/PaginaLegal';
import { DATOS_LEGALES as D } from '@/lib/datosLegales';

const Correo = () => <a href={`mailto:${D.email}`}>{D.email}</a>;

const PROVEEDORES: React.ReactNode[][] = [
  ['Supabase, Inc.', 'Base de datos, inicio de sesión, almacenamiento de archivos y funciones del servidor', 'Unión Europea (Irlanda)', 'Datos alojados en la UE. Accesos puntuales de soporte desde fuera de la UE amparados por Cláusulas Contractuales Tipo'],
  ['Stripe Payments Europe, Ltd.', 'Cobro de las suscripciones y de las facturas que tus clientes pagan con tarjeta', 'Irlanda y EE. UU. (Stripe, Inc.)', 'Marco de Privacidad de Datos UE-EE. UU. (DPF) y Cláusulas Contractuales Tipo'],
  ['Vercel, Inc.', 'Alojamiento y entrega de la web', 'EE. UU. y red global', 'DPF y Cláusulas Contractuales Tipo'],
  ['Google Ireland Ltd. / Google LLC', 'Inicio de sesión con Google y asistente de inteligencia artificial (Gemini)', 'Irlanda y EE. UU.', 'DPF y Cláusulas Contractuales Tipo'],
  ['Cloudflare, Inc.', 'Verificación antirrobots (Turnstile) en registro e inicio de sesión', 'EE. UU. y red global', 'DPF y Cláusulas Contractuales Tipo'],
  ['Resend, Inc.', 'Envío de correos (facturas, recordatorios, invitaciones, avisos de la cuenta)', 'Unión Europea (Irlanda, sobre Amazon Web Services); empresa con sede en EE. UU.', 'Cláusulas Contractuales Tipo'],
  ['ImprovMX Incorporated', `Recepción y reenvío de los correos enviados a ${D.email}`, 'EE. UU.', 'Cláusulas Contractuales Tipo'],
  ['Enable Banking Oy', 'Conexión con tu banco para conciliar movimientos (solo si la activas)', 'Unión Europea (Finlandia)', 'Datos en la UE'],
];

const PrivacidadPage: React.FC = () => (
  <PaginaLegal titulo="Política de privacidad">
    <Seccion titulo="1. Responsable del tratamiento">
      <Lista>
        <li><strong>Responsable:</strong> <Dato v={D.titular} /></li>
        <li><strong>NIF:</strong> <Dato v={D.nif} /></li>
        <li><strong>Domicilio:</strong> <Dato v={D.domicilio} /></li>
        <li><strong>Contacto y ejercicio de derechos:</strong> <Correo /></li>
      </Lista>
      <p>
        Esta política explica qué datos tratamos cuando visitas {D.sitio}, creas una cuenta en {D.nombreComercial}, contratas
        un plan o usas Lead Hunter PRO.
      </p>
    </Seccion>

    <Seccion titulo="2. Qué datos tratamos, para qué y con qué base legal">
      <TablaLegal
        titulo="Tratamientos de datos"
        columnas={['Datos', 'Finalidad', 'Base legal']}
        filas={[
          ['Nombre, email, contraseña cifrada o cuenta de Google, foto de perfil', 'Crear y gestionar tu cuenta e identificarte', 'Ejecución del contrato (art. 6.1.b RGPD)'],
          ['Datos fiscales y profesionales (NIF, dirección, logo, datos bancarios para tus facturas)', 'Emitir tus facturas, presupuestos y contratos', 'Ejecución del contrato'],
          ['Plan contratado, historial de pagos, últimos dígitos de la tarjeta (los datos completos solo los trata Stripe)', 'Cobrar la suscripción y emitir sus facturas', 'Ejecución del contrato y obligación legal fiscal (art. 6.1.c)'],
          ['Cuentas, saldos y movimientos bancarios', 'Conciliación bancaria con Enable Banking, solo si conectas tu banco', 'Tu consentimiento (art. 6.1.a), que puedes retirar desconectando el banco'],
          ['Textos que escribes en el asistente de IA', 'Generar propuestas, análisis y respuestas', 'Ejecución del contrato'],
          ['Correos que nos envías', 'Atender consultas y soporte', 'Ejecución del contrato o interés legítimo en responderte (art. 6.1.f)'],
          ['IP, navegador, registros técnicos y de seguridad', 'Proteger el servicio, evitar abusos y detectar fallos', 'Interés legítimo'],
          ['Código de afiliado del enlace con el que te registraste', 'Atribuir la recomendación al afiliado y pagarle su comisión', 'Interés legítimo (art. 6.1.f)'],
        ]}
      />
      <p>
        No vendemos tus datos ni los usamos para publicidad. No tomamos decisiones automatizadas con efectos jurídicos sobre
        ti.
      </p>
    </Seccion>

    <Seccion titulo="3. Datos de tus clientes">
      <p>
        Los datos de tus clientes que introduces en {D.nombreComercial} (nombres, emails, NIF, direcciones, facturas,
        contratos) los tratas tú como responsable. Nosotros actuamos como <strong>encargado del tratamiento</strong>: solo
        los usamos para prestarte el servicio, siguiendo tus instrucciones, con las garantías del artículo 28 del RGPD que
        se recogen en los <Link to="/terms#encargo">Términos y condiciones</Link>. Si tus clientes acceden al portal de
        clientes o pagan una factura online, sus datos de acceso y de pago se tratan para ese fin.
      </p>
    </Seccion>

    <Seccion id="ia" titulo="4. Asistente de inteligencia artificial (Gemini)">
      <p>
        El asistente usa Gemini, de Google. Lo que escribes en él y las respuestas se envían a Google para generarlas.
      </p>
      <p>
        Para responder con contexto, el asistente envía también un resumen de tu negocio: facturas, cobros, proyectos y
        nombres de tus clientes. Las funciones de resumen de conversaciones con clientes y de análisis financiero envían
        esos textos y datos.
      </p>
      <p>
        Google trata estos datos como encargado del tratamiento y, según las condiciones de la API de Gemini para el
        Espacio Económico Europeo, <strong>no los usa para entrenar ni mejorar sus productos</strong>; solo los registra
        temporalmente para detectar abusos. Aun así, te recomendamos no escribir en el asistente contraseñas, datos
        bancarios ni información especialmente sensible.
      </p>
      <p>
        Si configuras tu propia clave de Gemini (Ajustes), se aplican además las condiciones de tu cuenta de Google.
      </p>
    </Seccion>

    <Seccion titulo="5. Lead Hunter PRO">
      <p>
        Lead Hunter PRO (captacion.devfreelancer.app) ayuda a encontrar posibles clientes. Para ello trata datos de
        contacto profesional de empresas y profesionales (nombre, empresa, cargo, web, email o teléfono profesional)
        obtenidos de <Dato v={D.fuentesLeadHunter} />.
      </p>
      <p>
        La base legal es el interés legítimo en la prospección comercial entre profesionales (art. 6.1.f RGPD). Si tus
        datos aparecen en Lead Hunter PRO, puedes pedir que los borremos u oponerte a su tratamiento escribiendo a{' '}
        <Correo />. El responsable y el contacto son los mismos indicados en el apartado 1.
      </p>
    </Seccion>

    <Seccion titulo="6. Proveedores y transferencias internacionales">
      <p>
        Usamos estos proveedores, que tratan datos por cuenta nuestra con contrato de encargo. Algunos están en EE. UU.;
        en ese caso la transferencia se ampara en el Marco de Privacidad de Datos UE-EE. UU. (decisión de adecuación de la
        Comisión Europea de 10 de julio de 2023) y/o en las Cláusulas Contractuales Tipo aprobadas por la Comisión.
      </p>
      <TablaLegal
        titulo="Proveedores"
        columnas={['Proveedor', 'Para qué', 'Dónde', 'Garantía']}
        filas={PROVEEDORES}
      />
      <p>
        También comunicaremos datos a la Agencia Tributaria, juzgados u otras autoridades cuando una ley lo exija.
      </p>
    </Seccion>

    <Seccion titulo="7. Cuánto tiempo los conservamos">
      <Lista>
        <li>Datos de la cuenta: mientras la mantengas activa.</li>
        <li>
          Si eliminas la cuenta, borramos tus datos. Las facturas y registros fiscales se conservan bloqueados el tiempo
          que obliga la ley (hasta 6 años, Código de Comercio y normativa tributaria) y después se borran.
        </li>
        <li>Datos bancarios de Enable Banking: hasta que desconectes el banco o elimines la cuenta.</li>
        <li>Correos de soporte: el tiempo necesario para atenderte y, como máximo, 2 años.</li>
        <li>Registros técnicos y de seguridad: hasta 12 meses.</li>
      </Lista>
    </Seccion>

    <Seccion titulo="8. Tus derechos">
      <p>
        Puedes ejercer los derechos de acceso, rectificación, supresión, oposición, limitación del tratamiento y
        portabilidad, y retirar tu consentimiento en cualquier momento, escribiendo a <Correo />. Muchos datos puedes
        cambiarlos o borrarlos tú mismo desde Ajustes, incluida la eliminación completa de la cuenta.
      </p>
      <p>
        Si crees que no hemos tratado bien tus datos, puedes reclamar ante la Agencia Española de Protección de Datos
        (<a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer">www.aepd.es</a>).
      </p>
    </Seccion>

    <Seccion titulo="9. Seguridad">
      <p>
        Las comunicaciones van cifradas (HTTPS), el acceso a los datos está limitado por cuenta en la base de datos y las
        claves sensibles se guardan cifradas. Ningún sistema es infalible: si detectamos una brecha que afecte a tus datos,
        te avisaremos y lo comunicaremos a la AEPD cuando la ley lo exija.
      </p>
    </Seccion>

    <Seccion titulo="10. Cambios">
      <p>
        Si cambiamos esta política de forma relevante, te lo avisaremos por email o en la aplicación antes de que se
        aplique.
      </p>
    </Seccion>
  </PaginaLegal>
);

export default PrivacidadPage;
