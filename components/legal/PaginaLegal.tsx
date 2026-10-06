// Plantilla común de Aviso legal, Privacidad, Cookies y Términos.
import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/icons/Logo';
import PieLegal from '@/components/PieLegal';
import { FECHA_TEXTOS_LEGALES, esMarcador } from '@/lib/datosLegales';

/** Muestra un dato del titular; si aún es un marcador, resaltado en amarillo. */
export const Dato: React.FC<{ v: string }> = ({ v }) =>
  esMarcador(v) ? (
    <mark className="bg-yellow-300 text-gray-900 font-semibold px-1 rounded">{v}</mark>
  ) : (
    <>{v}</>
  );

export const Seccion: React.FC<{ id?: string; titulo: string; children: React.ReactNode }> = ({ id, titulo, children }) => (
  <section id={id} className="scroll-mt-6">
    <h2 className="text-xl font-bold text-white mb-3">{titulo}</h2>
    <div className="space-y-3">{children}</div>
  </section>
);

export const Lista: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ul className="list-disc pl-5 space-y-1.5">{children}</ul>
);

/**
 * Tabla legible en móvil: en pantallas pequeñas cada fila se muestra como una
 * tarjeta con sus etiquetas; desde sm, como tabla normal.
 */
export const TablaLegal: React.FC<{ columnas: string[]; filas: React.ReactNode[][]; titulo: string; nombresTecnicos?: boolean }> = ({ columnas, filas, titulo, nombresTecnicos = false }) => {
  const primera = nombresTecnicos ? 'font-mono text-xs text-gray-200 break-all' : 'font-semibold text-gray-200';
  return (
  <div>
    <table className="hidden sm:table w-full text-left text-sm border-collapse">
      <caption className="sr-only">{titulo}</caption>
      <thead>
        <tr className="border-b border-gray-700">
          {columnas.map((c) => (
            <th key={c} scope="col" className="py-2 pr-4 font-semibold text-gray-200 align-bottom">{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {filas.map((f, i) => (
          <tr key={i} className="border-b border-gray-800 align-top">
            {f.map((celda, j) => (
              <td key={j} className={`py-2.5 pr-4 ${j === 0 ? primera : ''}`}>{celda}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>

    <div className="sm:hidden space-y-3" role="list" aria-label={titulo}>
      {filas.map((f, i) => (
        <div key={i} role="listitem" className="rounded-lg border border-gray-800 bg-gray-900/60 p-3">
          {/* role="listitem" va en un envoltorio: puesto en el <dl> le quitaba su significado de lista de definiciones. */}
          <dl className="space-y-1.5">
            {f.map((celda, j) => (
              <div key={j}>
                <dt className="text-xs uppercase tracking-wide text-gray-500">{columnas[j]}</dt>
                <dd className={j === 0 ? primera : ''}>{celda}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  </div>
  );
};

interface Props {
  titulo: string;
  children: React.ReactNode;
}

const PaginaLegal: React.FC<Props> = ({ titulo, children }) => {
  useEffect(() => {
    const anterior = document.title;
    document.title = `${titulo} · DevFreelancer`;
    window.scrollTo(0, 0);
    // Las páginas legales muestran el nombre, NIF y domicilio del titular:
    // se piden a los buscadores que no las indexen, para que no aparezcan al
    // buscar esos datos. Quien visita la web las sigue viendo con normalidad.
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex, follow';
    document.head.appendChild(robots);
    return () => {
      document.title = anterior;
      robots.remove();
    };
  }, [titulo]);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-300 flex flex-col">
      <header className="px-4 sm:px-6 py-6 border-b border-gray-900">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2.5">
            <Logo className="h-7 w-7 text-primary-500" />
            <span className="text-lg font-bold text-white italic">DevFreelancer</span>
          </Link>
          <Link to="/" className="text-sm text-primary-400 hover:underline">Volver al inicio</Link>
        </div>
      </header>

      <main className="flex-1 px-4 sm:px-6 py-10">
        <article className="max-w-3xl mx-auto">
          <h1 className="text-3xl sm:text-4xl font-black text-white mb-2">{titulo}</h1>
          <p className="text-xs text-gray-500 mb-10">Última actualización: {FECHA_TEXTOS_LEGALES}</p>
          <div className="space-y-10 text-[15px] leading-relaxed [&_a]:text-primary-400 [&_a:hover]:underline [&_strong]:text-gray-100">
            {children}
          </div>
        </article>
      </main>

      <PieLegal />
    </div>
  );
};

export default PaginaLegal;
