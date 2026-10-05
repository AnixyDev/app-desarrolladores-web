// Preguntas frecuentes de la home: acordeón accesible.
//
// - Cada pregunta es un <button> con aria-expanded/aria-controls: se abre con
//   clic, Enter o Espacio y se recorre con Tab.
// - Con el foco en una pregunta: ↑/↓ pasan a la anterior/siguiente e
//   Inicio/Fin a la primera/última (patrón de acordeón de WAI-ARIA).
// - Las respuestas cerradas siguen en el HTML (hidden), así que buscadores y
//   lectores de pantalla las encuentran.
// - Los datos estructurados FAQPage se añaden al <head> mientras la home está
//   abierta, generados desde lib/faq.ts.
import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { PREGUNTAS_FAQ, faqJsonLd, trozosConPendientes, type PreguntaFaq } from '@/lib/faq';

const ID_JSONLD = 'faq-jsonld';

function useJsonLd(preguntas: PreguntaFaq[]) {
  useEffect(() => {
    const datos = faqJsonLd(preguntas);
    if (!datos) return;
    document.getElementById(ID_JSONLD)?.remove();
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = ID_JSONLD;
    script.textContent = JSON.stringify(datos);
    document.head.appendChild(script);
    return () => script.remove();
  }, [preguntas]);
}

const Parrafo: React.FC<{ texto: string }> = ({ texto }) => (
  <p>
    {trozosConPendientes(texto).map((t, i) =>
      t.pendiente ? (
        <mark key={i} className="bg-yellow-300 text-gray-900 font-semibold px-1 rounded">{t.texto}</mark>
      ) : (
        <React.Fragment key={i}>{t.texto}</React.Fragment>
      ),
    )}
  </p>
);

interface Props {
  preguntas?: PreguntaFaq[];
}

const FaqHome: React.FC<Props> = ({ preguntas = PREGUNTAS_FAQ }) => {
  const base = useId();
  const [abiertas, setAbiertas] = useState<Set<string>>(() => new Set());
  const botones = useRef<(HTMLButtonElement | null)[]>([]);
  useJsonLd(preguntas);

  const alternar = (id: string) =>
    setAbiertas((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });

  const moverFoco = (e: React.KeyboardEvent, i: number) => {
    const ultimo = preguntas.length - 1;
    const destino =
      e.key === 'ArrowDown' ? (i === ultimo ? 0 : i + 1)
      : e.key === 'ArrowUp' ? (i === 0 ? ultimo : i - 1)
      : e.key === 'Home' ? 0
      : e.key === 'End' ? ultimo
      : null;
    if (destino === null) return;
    e.preventDefault();
    botones.current[destino]?.focus();
  };

  return (
    <section className="py-24 px-6 max-w-3xl mx-auto" aria-labelledby={`${base}-titulo`}>
      <div className="mb-10 text-center">
        <h2 id={`${base}-titulo`} className="font-display text-3xl sm:text-4xl font-bold mb-3">Preguntas frecuentes</h2>
        <p className="text-gray-400">Lo que suele preguntarse antes de crear la cuenta.</p>
      </div>

      <div className="divide-y divide-gray-800 rounded-xl border border-gray-800 bg-gray-900/40">
        {preguntas.map((p, i) => {
          const abierta = abiertas.has(p.id);
          const idBoton = `${base}-${p.id}-pregunta`;
          const idPanel = `${base}-${p.id}-respuesta`;
          return (
            <div key={p.id}>
              <h3 className="m-0">
                <button
                  ref={(el) => { botones.current[i] = el; }}
                  id={idBoton}
                  type="button"
                  aria-expanded={abierta}
                  aria-controls={idPanel}
                  onClick={() => alternar(p.id)}
                  onKeyDown={(e) => moverFoco(e, i)}
                  className="w-full flex items-center justify-between gap-4 text-left px-5 sm:px-6 py-5 font-semibold text-gray-100 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-inset rounded-xl"
                >
                  <span>{p.pregunta}</span>
                  <ChevronDown
                    aria-hidden="true"
                    className={`w-5 h-5 shrink-0 text-gray-400 transition-transform duration-200 ${abierta ? 'rotate-180' : ''}`}
                  />
                </button>
              </h3>
              <div
                id={idPanel}
                role="region"
                aria-labelledby={idBoton}
                hidden={!abierta}
                className="px-5 sm:px-6 pb-6 -mt-1 space-y-3 text-gray-400 leading-relaxed"
              >
                {p.respuesta.map((r, j) => <Parrafo key={j} texto={r} />)}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default FaqHome;
