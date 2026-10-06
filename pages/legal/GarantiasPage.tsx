// Garantías (06/10/2026): qué pasa con tus datos y tus facturas, en claro.
//
// Regla de esta página: solo lo que es cierto HOY y se puede comprobar en el
// código o en producción. Lo que falta se dice que falta (Verifactu). La
// declaración responsable del RD 1007/2023 NO se publica hasta que el
// software cumpla entero: firmarla antes sería declarar algo falso
// (art. 201 bis LGT, 150.000 € por ejercicio al productor).
import React from 'react';
import { Link } from 'react-router-dom';
import PaginaLegal, { Lista, Seccion } from '@/components/legal/PaginaLegal';
import { DATOS_LEGALES as D } from '@/lib/datosLegales';

export const FECHA_GARANTIAS = '6 de octubre de 2026';

const Estado: React.FC<{ hecho: boolean; children: React.ReactNode }> = ({ hecho, children }) => (
  <li className="flex gap-3">
    <span
      className={`mt-1 inline-flex h-5 shrink-0 items-center rounded px-1.5 text-xs font-bold ${hecho ? 'bg-green-500/15 text-green-400' : 'bg-yellow-500/15 text-yellow-300'}`}
    >
      {hecho ? 'Hecho' : 'En desarrollo'}
    </span>
    <span>{children}</span>
  </li>
);

const GarantiasPage: React.FC = () => (
  <PaginaLegal titulo="Garantías" fecha={FECHA_GARANTIAS} indexable>
    <p className="text-lg text-gray-200">
      Le confías a DevFreelancer tus clientes y tus facturas, que la ley te obliga a guardar. Aquí está, sin letra
      pequeña, qué hacemos con ellos y qué puedes hacer tú.
    </p>

    <Seccion id="tus-datos" titulo="Tus datos son tuyos">
      <p>
        En <strong>Ajustes → Seguridad → Exportar todos mis datos</strong> descargas, en un clic y cuantas veces quieras, un
        ZIP con:
      </p>
      <Lista>
        <li>el PDF de cada factura, con su código QR tributario, y un resumen en CSV;</li>
        <li>un archivo por cada cosa que guardas: clientes, proyectos, horas, presupuestos, propuestas, contratos, recibos, gastos y tu registro fiscal;</li>
        <li>todo junto en un archivo JSON, para llevártelo a otra herramienta.</li>
      </Lista>
      <p>
        No hace falta darte de baja ni pedírnoslo. Los CSV se abren directamente con Excel o se los puedes pasar a tu gestoría.
      </p>
    </Seccion>

    <Seccion id="copias" titulo="Copia de seguridad diaria">
      <p>
        Cada noche se hace una copia completa de la base de datos, se <strong>cifra con AES-256</strong> y se guarda
        cifrada durante 30 días en GitHub, que no puede leerla: la clave para descifrarla solo la tiene DevFreelancer.
      </p>
      <p>La copia cubre todos los datos de la base de datos. Los archivos que subes (logotipo, certificado digital, archivos del portal) no entran en ella; tus facturas sí, porque los PDF se generan a partir de los datos.</p>
    </Seccion>

    <Seccion id="donde" titulo="Dónde están tus datos">
      <Lista>
        <li><strong>Base de datos y archivos:</strong> en la Unión Europea (Irlanda), en Supabase.</li>
        <li><strong>Cada cuenta solo ve lo suyo:</strong> la base de datos lo impide tabla por tabla (seguridad a nivel de fila en todas las tablas), no solo la pantalla.</li>
        <li><strong>Pagos con tarjeta:</strong> los procesa Stripe. DevFreelancer nunca ve ni guarda el número de tu tarjeta.</li>
        <li><strong>La web</strong> se sirve desde la red de Vercel, que entrega la página desde el servidor más cercano a ti.</li>
      </Lista>
      <p>
        Quién más trata tus datos, para qué y con qué garantías está en la <Link to="/privacidad">Política de privacidad</Link>.
      </p>
    </Seccion>

    <Seccion id="facturas" titulo="Tus facturas no se pierden ni se alteran">
      <Lista>
        <li>Una factura emitida queda bloqueada: para corregirla se emite una rectificativa, como exige la ley.</li>
        <li>Un cliente con facturas no se puede borrar, ni por error ni a través de la API.</li>
        <li>Si te das de baja, antes te ofrecemos descargar todas tus facturas. Después conservamos las facturas y los registros fiscales los 4 años que obliga la ley, y el resto se borra.</li>
      </Lista>
    </Seccion>

    <Seccion id="verifactu" titulo="Verifactu: dónde estamos">
      <p>
        Verifactu (Real Decreto 1007/2023) obliga a que el programa de facturación cumpla unos requisitos técnicos. Tras el
        aplazamiento del Real Decreto-ley 15/2025, es obligatorio desde el <strong>1 de enero de 2027</strong> para sociedades
        y desde el <strong>1 de julio de 2027</strong> para autónomos.
      </p>
      <ul className="space-y-2.5">
        <Estado hecho>Cada factura genera un registro con huella digital (SHA-256) encadenada a la anterior.</Estado>
        <Estado hecho>El PDF lleva el código QR de verificación de la Agencia Tributaria.</Estado>
        <Estado hecho>Bloqueo de facturas emitidas, rectificativas y comprobación de la cadena de registros.</Estado>
        <Estado hecho={false}>Firma electrónica de cada registro y registro de eventos del sistema (modalidad «No Veri*Factu»).</Estado>
        <Estado hecho={false}>Envío automático de cada registro a la Agencia Tributaria (modalidad «Veri*Factu»).</Estado>
      </ul>
      <p>
        La ley pide al fabricante del programa una <strong>declaración responsable</strong> de que cumple. La publicaremos
        en esta página cuando el programa cumpla entero, no antes. Estamos trabajando para tenerlo antes de que sea
        obligatorio y lo anunciaremos aquí.
      </p>
      <p>
        Mientras tanto, si tu actividad te obliga a cumplir ya, consúltalo con tu gestoría. Y recuerda que puedes exportar tus
        facturas en cualquier momento.
      </p>
    </Seccion>

    <Seccion id="contacto" titulo="¿Dudas?">
      <p>
        Escríbenos a <a href={`mailto:${D.email}`}>{D.email}</a>.
      </p>
    </Seccion>
  </PaginaLegal>
);

export default GarantiasPage;
