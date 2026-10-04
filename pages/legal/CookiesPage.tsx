// Política de cookies — LSSI-CE art. 22.2 y Guía sobre el uso de las cookies de la AEPD.
//
// Inventario revisado el 04/10/2026 a partir del código (lib/, hooks/,
// components/ y @supabase/ssr). Si se añade una cookie o una clave de
// localStorage nueva, hay que añadirla aquí.
import React from 'react';
import { Link } from 'react-router-dom';
import PaginaLegal, { Seccion, TablaLegal } from '@/components/legal/PaginaLegal';
import { DATOS_LEGALES as D } from '@/lib/datosLegales';

const COLUMNAS = ['Nombre', 'Quién la pone', 'Finalidad', 'Duración', 'Tipo'];

const COOKIES: React.ReactNode[][] = [
  [
    'sb-umqsjycqypxvhbhmidma-auth-token (puede dividirse en .0, .1…)',
    'DevFreelancer (Supabase)',
    'Mantener tu sesión iniciada. Se comparte con los subdominios de devfreelancer.app para no pedirte el acceso dos veces en Lead Hunter PRO.',
    '400 días; se renueva mientras uses la app y se borra al cerrar sesión',
    'Técnica (necesaria)',
  ],
  [
    'sb-umqsjycqypxvhbhmidma-auth-token-code-verifier',
    'DevFreelancer (Supabase)',
    'Completar de forma segura el inicio de sesión con Google o con enlace por email.',
    'Hasta terminar el inicio de sesión',
    'Técnica (necesaria)',
  ],
  [
    '__stripe_mid',
    'Stripe',
    'Prevenir el fraude en los pagos con tarjeta. Solo se instala en las páginas de pago.',
    '1 año',
    'Técnica (necesaria para el pago)',
  ],
  [
    '__stripe_sid',
    'Stripe',
    'Prevenir el fraude durante el pago. Solo se instala en las páginas de pago.',
    '30 minutos',
    'Técnica (necesaria para el pago)',
  ],
];

const ALMACENAMIENTO: React.ReactNode[][] = [
  ['devfreelancer-storage-v4', 'Recordar tus preferencias en este navegador: ofertas guardadas, objetivo mensual, notificaciones vistas.', 'Hasta que borres los datos del navegador', 'Técnica (preferencias que tú eliges)'],
  ['devfreelancer_active_timer', 'Que el cronómetro de horas siga en marcha aunque cierres la pestaña.', 'Hasta que detienes el cronómetro', 'Técnica (necesaria)'],
  ['devfreelancer_oferta_fundadores', 'Recordar que elegiste el Plan Fundadores para llevarte al pago al terminar el registro.', '48 horas como máximo; se borra al usarse', 'Técnica (necesaria)'],
  ['portal:destino', 'Llevar a tu cliente al documento que abrió desde el email tras iniciar sesión en el portal.', '1 hora como máximo; se borra al usarse', 'Técnica (necesaria)'],
  ['portal:cliente', 'Recordar qué ficha estaba viendo tu cliente en el portal si trabaja con varios profesionales.', 'Hasta que borre los datos del navegador', 'Técnica (preferencia)'],
  ['df_cookie_consent, df_cookie_prefs', 'Recordar que has visto el aviso de cookies y tu elección.', 'Hasta que borres los datos del navegador', 'Técnica (necesaria)'],
  ['devfreelancer_ref', 'Recordar el código del afiliado que te recomendó si llegas con un enlace de afiliado (?ref=), para atribuirle la recomendación al crear tu cuenta.', 'Se borra al iniciar sesión con tu cuenta nueva; si no llegas a registrarte, hasta que borres los datos del navegador', 'Afiliación (no es estrictamente necesaria)'],
];

const CookiesPage: React.FC = () => (
  <PaginaLegal titulo="Política de cookies">
    <Seccion titulo="1. Qué son">
      <p>
        Las cookies son pequeños archivos que una web guarda en tu navegador. El almacenamiento local (localStorage) es
        parecido: datos que la web guarda en tu navegador y que no se envían solos a ningún servidor. Esta política explica
        los dos.
      </p>
    </Seccion>

    <Seccion titulo="2. Resumen">
      <p>
        {D.nombreComercial} <strong>no usa cookies de analítica, publicidad ni redes sociales</strong>, ni propias ni de
        terceros. Casi todo lo que guardamos es técnico: sirve para que inicies sesión, pagues de forma segura o la app
        recuerde lo que estabas haciendo. Estas cookies no necesitan tu consentimiento (art. 22.2 LSSI-CE).
      </p>
      <p>
        La única excepción es el código de afiliado (<code>devfreelancer_ref</code>), que solo se guarda si llegas a
        través del enlace de un afiliado.
      </p>
    </Seccion>

    <Seccion titulo="3. Cookies">
      <TablaLegal titulo="Cookies" columnas={COLUMNAS} filas={COOKIES} nombresTecnicos />
      <p>
        La verificación antirrobots de registro e inicio de sesión (Cloudflare Turnstile) funciona dentro de un marco de
        Cloudflare y no instala cookies en {D.sitio}. Más información en la{' '}
        <a href="https://www.cloudflare.com/turnstile-privacy-policy/" target="_blank" rel="noopener noreferrer">
          política de privacidad de Turnstile
        </a>{' '}
        y en la de{' '}
        <a href="https://stripe.com/es/cookie-settings" target="_blank" rel="noopener noreferrer">cookies de Stripe</a>.
      </p>
    </Seccion>

    <Seccion titulo="4. Almacenamiento local (localStorage)">
      <TablaLegal
        titulo="Almacenamiento local"
        columnas={['Nombre', 'Finalidad', 'Duración', 'Tipo']}
        filas={ALMACENAMIENTO}
        nombresTecnicos
      />
    </Seccion>

    <Seccion titulo="5. Cómo borrarlas o bloquearlas">
      <p>
        Puedes borrar o bloquear las cookies y el almacenamiento local desde la configuración de tu navegador (en
        Chrome, Firefox, Safari y Edge, en el apartado de privacidad o datos de sitios). Si bloqueas las cookies técnicas,
        no podrás iniciar sesión ni pagar.
      </p>
    </Seccion>

    <Seccion titulo="6. Más información">
      <p>
        Para saber cómo tratamos tus datos, consulta la <Link to="/privacidad">Política de privacidad</Link>. Si tienes
        dudas, escribe a <a href={`mailto:${D.email}`}>{D.email}</a>.
      </p>
    </Seccion>
  </PaginaLegal>
);

export default CookiesPage;
