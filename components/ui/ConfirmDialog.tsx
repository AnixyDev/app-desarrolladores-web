// Diálogo de confirmación único de la app. Se monta una vez en App.tsx y se
// abre con `confirmar()` de hooks/useConfirmar.ts.
import React, { useEffect, useRef } from 'react';
import { useConfirmar } from '@/hooks/useConfirmar';
import { AlertTriangleIcon } from '@/components/icons/Icon';

const BOTON = 'inline-flex items-center justify-center rounded-md font-semibold px-4 py-2.5 text-sm min-h-[44px] w-full sm:w-auto focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 transition-colors';

const ConfirmDialog: React.FC = () => {
  const abierto = useConfirmar((s) => s.abierto);
  const responder = useConfirmar((s) => s.responder);
  const cancelarRef = useRef<HTMLButtonElement>(null);
  const aceptarRef = useRef<HTMLButtonElement>(null);
  const previoRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!abierto) return;
    previoRef.current = document.activeElement as HTMLElement | null;
    // En una acción destructiva el foco empieza en «Cancelar»: un Intro
    // despistado no debe borrar nada.
    (abierto.peligro ? cancelarRef : aceptarRef).current?.focus();

    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); responder(false); }
      if (e.key === 'Tab') {
        // Mantener el foco dentro del diálogo.
        const botones = [cancelarRef.current, aceptarRef.current].filter(Boolean) as HTMLElement[];
        const i = botones.indexOf(document.activeElement as HTMLElement);
        e.preventDefault();
        botones[(i + (e.shiftKey ? -1 : 1) + botones.length) % botones.length]?.focus();
      }
    };
    document.addEventListener('keydown', alTeclear);
    return () => {
      document.removeEventListener('keydown', alTeclear);
      previoRef.current?.focus?.();
    };
  }, [abierto, responder]);

  if (!abierto) return null;

  const peligro = !!abierto.peligro;
  const textoConfirmar = abierto.textoConfirmar ?? (peligro ? 'Borrar' : 'Aceptar');

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4"
      onClick={() => responder(false)}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirmar-titulo"
        aria-describedby={abierto.mensaje ? 'confirmar-mensaje' : undefined}
        className="w-full sm:max-w-md bg-gray-900 border border-gray-700 rounded-t-2xl sm:rounded-xl shadow-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          {peligro && (
            <div className="shrink-0 rounded-full bg-red-500/15 p-2">
              <AlertTriangleIcon className="w-5 h-5 text-red-400" />
            </div>
          )}
          <div className="min-w-0">
            <h2 id="confirmar-titulo" className="text-base font-semibold text-white">{abierto.titulo}</h2>
            {abierto.mensaje && (
              <div id="confirmar-mensaje" className="mt-1.5 text-sm text-gray-300 leading-relaxed">{abierto.mensaje}</div>
            )}
          </div>
        </div>
        <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            ref={cancelarRef}
            type="button"
            onClick={() => responder(false)}
            className={`${BOTON} bg-gray-700 text-gray-200 hover:bg-gray-600 focus:ring-gray-500`}
          >
            {abierto.textoCancelar ?? 'Cancelar'}
          </button>
          <button
            ref={aceptarRef}
            type="button"
            onClick={() => responder(true)}
            className={`${BOTON} ${peligro ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500' : 'bg-primary-600 hover:bg-primary-700 focus:ring-primary-500'} text-white`}
          >
            {textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
