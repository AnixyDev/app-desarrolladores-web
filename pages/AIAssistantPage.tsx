// Asistente de IA (rediseño del 28/09/2026).
//
// Antes: cada mensaje era una pregunta suelta (el servidor tiraba el
// historial), la IA no sabía nada del negocio, el chat se perdía al recargar
// y las respuestas salían con asteriscos sueltos.
// Ahora: conversaciones guardadas en la cuenta (ai_conversaciones /
// ai_mensajes), memoria de los últimos turnos, un resumen del negocio como
// contexto (lo arma el servidor), Markdown saneado, copiar, reintentar,
// sugerencias para empezar y compra de créditos si se acaban.
import React, { useCallback, useEffect, useRef, useState, lazy, Suspense } from 'react';
import Button from '@/components/ui/Button';
import Markdown from '@/components/ui/Markdown';
import { SendIcon, SparklesIcon, PlusIcon, TrashIcon, CopyIcon, RefreshCwIcon, MenuIcon } from '@/components/icons/Icon';
import {
  AI_CREDIT_COSTS, enviarAlAsistente, cargarConversaciones, cargarMensajes, borrarConversacion,
  type ConversacionIA, type MensajeIA,
} from '@/services/geminiService';
import { useAppStore } from '@/hooks/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { useToast } from '@/hooks/useToast';
import { formatearFecha } from '@/lib/utils';
import { confirmar } from '@/hooks/useConfirmar';

const BuyCreditsModal = lazy(() => import('@/components/modals/BuyCreditsModal'));

const MAX_CARACTERES = 6000;

export const SUGERENCIAS = [
  '¿Cómo va mi negocio este año? Dame un resumen con cifras.',
  '¿Qué facturas tengo vencidas? Redáctame un email amable para reclamar el pago.',
  '¿Cuánto debería cobrar por hora como desarrollador freelance en España?',
  '¿Qué tengo que presentar a Hacienda este trimestre y cuándo?',
  'Ayúdame a preparar una propuesta para un cliente que quiere una tienda online.',
  '¿Qué cláusulas no pueden faltar en mis contratos con clientes?',
];

type Pendiente = { texto: string; error?: string };

const AIAssistantPage: React.FC = () => {
  const { addToast } = useToast();
  const { profile, consumeCredits } = useAppStore(useShallow(s => ({ profile: s.profile, consumeCredits: s.consumeCredits })));

  const [conversaciones, setConversaciones] = useState<ConversacionIA[]>([]);
  const [actual, setActual] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<MensajeIA[]>([]);
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [cargandoChat, setCargandoChat] = useState(false);
  const [input, setInput] = useState('');
  const [verLista, setVerLista] = useState(false);
  const [comprarCreditos, setComprarCreditos] = useState(false);
  const [copiado, setCopiado] = useState<number | null>(null);

  const listaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Baja solo la lista de mensajes (nunca la página entera).
  useEffect(() => {
    const el = listaRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [mensajes, pendiente, enviando]);

  const refrescarLista = useCallback(async () => {
    try {
      setConversaciones(await cargarConversaciones());
    } catch (e) {
      addToast((e as Error).message, 'error');
    }
  }, [addToast]);

  useEffect(() => { refrescarLista(); }, [refrescarLista]);

  const abrir = async (id: string) => {
    setVerLista(false);
    if (id === actual) return;
    setActual(id);
    setPendiente(null);
    setCargandoChat(true);
    try {
      setMensajes(await cargarMensajes(id));
    } catch (e) {
      addToast((e as Error).message, 'error');
    } finally {
      setCargandoChat(false);
    }
  };

  const nueva = () => {
    setActual(null);
    setMensajes([]);
    setPendiente(null);
    setVerLista(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const borrar = async (c: ConversacionIA) => {
    if (!(await confirmar({ titulo: '¿Borrar esta conversación?', mensaje: `«${c.titulo}» y todos sus mensajes se borrarán.`, peligro: true }))) return;
    try {
      await borrarConversacion(c.id);
      setConversaciones(prev => prev.filter(x => x.id !== c.id));
      if (actual === c.id) nueva();
    } catch (e) {
      addToast((e as Error).message, 'error');
    }
  };

  const enviar = async (texto: string) => {
    const mensaje = texto.trim().slice(0, MAX_CARACTERES);
    if (!mensaje || enviando) return;
    if ((profile?.ai_credits ?? 0) < AI_CREDIT_COSTS.chatMessage) {
      setComprarCreditos(true);
      return;
    }
    setEnviando(true);
    setPendiente({ texto: mensaje });
    setInput('');
    try {
      const r = await enviarAlAsistente(mensaje, actual);
      setMensajes(prev => [...prev, { rol: 'user', texto: mensaje }, { rol: 'model', texto: r.respuesta }]);
      setPendiente(null);
      consumeCredits(AI_CREDIT_COSTS.chatMessage);
      if (!actual) setActual(r.conversacion_id);
      refrescarLista();
    } catch (e) {
      const motivo = (e as Error).message || 'No se pudo obtener respuesta.';
      if (/cr[eé]ditos suficientes/i.test(motivo)) {
        setPendiente(null);
        setInput(mensaje);
        setComprarCreditos(true);
      } else {
        setPendiente({ texto: mensaje, error: motivo });
      }
    } finally {
      setEnviando(false);
    }
  };

  const copiar = async (texto: string, i: number) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(i);
      setTimeout(() => setCopiado(null), 1500);
    } catch {
      addToast('No se pudo copiar.', 'error');
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      enviar(input);
    }
  };

  // Altura del cuadro de texto según el contenido (hasta ~8 líneas).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  const creditos = profile?.ai_credits ?? 0;
  const vacio = mensajes.length === 0 && !pendiente && !cargandoChat;
  const tituloActual = conversaciones.find(c => c.id === actual)?.titulo;

  const Lista = (
    <div className="flex h-full flex-col">
      <Button onClick={nueva} className="w-full justify-center">
        <PlusIcon className="mr-2 h-4 w-4" /> Nueva conversación
      </Button>
      <div className="mt-3 flex-1 space-y-1 overflow-y-auto custom-scrollbar pr-1">
        {conversaciones.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-gray-500">Tus conversaciones aparecerán aquí.</p>
        )}
        {conversaciones.map(c => (
          <div
            key={c.id}
            className={`group flex items-center gap-1 rounded-lg px-2 py-2 text-sm cursor-pointer ${c.id === actual ? 'bg-primary-500/15 text-white' : 'text-gray-300 hover:bg-gray-800'}`}
            onClick={() => abrir(c.id)}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate">{c.titulo}</p>
              <p className="text-[11px] text-gray-500">{formatearFecha(c.updated_at)}</p>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); borrar(c); }}
              aria-label={`Borrar la conversación ${c.titulo}`}
              className="p-1 text-gray-500 opacity-100 md:opacity-0 group-hover:opacity-100 hover:text-red-400"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex h-[calc(100vh-9rem)] min-h-[520px] gap-4">
      {/* Conversaciones (escritorio) */}
      <aside className="hidden w-64 shrink-0 rounded-xl border border-gray-800 bg-gray-900 p-3 md:block">{Lista}</aside>

      {/* Conversaciones (móvil) */}
      {verLista && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setVerLista(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <aside className="absolute left-0 top-0 h-full w-72 border-r border-gray-800 bg-gray-900 p-3" onClick={e => e.stopPropagation()}>{Lista}</aside>
        </div>
      )}

      <section className="flex min-w-0 flex-1 flex-col rounded-xl border border-gray-800 bg-gray-900">
        <header className="flex items-center justify-between gap-2 border-b border-gray-800 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <button type="button" className="p-1 text-gray-400 md:hidden" onClick={() => setVerLista(true)} aria-label="Ver conversaciones">
              <MenuIcon className="h-5 w-5" />
            </button>
            <SparklesIcon className="h-5 w-5 shrink-0 text-primary-400" />
            <h1 className="truncate text-base font-semibold text-white">{tituloActual || 'Asistente IA'}</h1>
          </div>
          <span className="shrink-0 rounded-full border border-gray-700 px-3 py-1 text-xs text-gray-300">
            {creditos} {creditos === 1 ? 'crédito' : 'créditos'}{profile?.creditos_compartidos ? ' del equipo' : ''}
          </span>
        </header>

        <div ref={listaRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4 custom-scrollbar">
          {cargandoChat && <p className="text-center text-sm text-gray-500">Cargando conversación…</p>}

          {vacio && (
            <div className="mx-auto max-w-2xl py-6 text-center">
              <SparklesIcon className="mx-auto mb-3 h-10 w-10 text-primary-400" />
              <h2 className="text-lg font-semibold text-white">¿En qué te ayudo hoy{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}?</h2>
              <p className="mt-1 text-sm text-gray-400">
                Conozco el resumen de tu negocio (facturas, cobros, proyectos y clientes) y recuerdo lo que hablamos en cada conversación.
              </p>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {SUGERENCIAS.map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => enviar(s)}
                    disabled={enviando}
                    className="rounded-xl border border-gray-800 bg-gray-800/40 p-3 text-left text-sm text-gray-300 hover:border-primary-500/50 hover:text-white disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {mensajes.map((m, i) => (
            m.rol === 'user' ? (
              <div key={m.id ?? `u${i}`} className="flex justify-end">
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-primary-600 px-4 py-2 text-sm text-white">{m.texto}</div>
              </div>
            ) : (
              <div key={m.id ?? `m${i}`} className="flex gap-3">
                <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-800">
                  <SparklesIcon className="h-4 w-4 text-primary-400" />
                </div>
                <div className="min-w-0 max-w-[85%] flex-1">
                  <div className="rounded-2xl rounded-tl-sm border border-gray-800 bg-gray-800/60 px-4 py-3 text-gray-200">
                    <Markdown texto={m.texto} />
                  </div>
                  <button
                    type="button"
                    onClick={() => copiar(m.texto, i)}
                    className="mt-1 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300"
                  >
                    <CopyIcon className="h-3.5 w-3.5" /> {copiado === i ? 'Copiado' : 'Copiar'}
                  </button>
                </div>
              </div>
            )
          ))}

          {pendiente && (
            <>
              <div className="flex justify-end">
                <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-sm px-4 py-2 text-sm text-white ${pendiente.error ? 'bg-primary-600/50' : 'bg-primary-600'}`}>{pendiente.texto}</div>
              </div>
              {pendiente.error ? (
                <div className="ml-10 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  <p>{pendiente.error}</p>
                  <button type="button" onClick={() => { const t = pendiente.texto; setPendiente(null); enviar(t); }} className="mt-2 flex items-center gap-1 text-xs font-semibold text-red-100 hover:underline">
                    <RefreshCwIcon className="h-3.5 w-3.5" /> Reintentar
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-800">
                    <SparklesIcon className="h-4 w-4 animate-pulse text-primary-400" />
                  </div>
                  <div className="flex gap-1" aria-label="Escribiendo">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-gray-500 [animation-delay:-0.3s]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-gray-500 [animation-delay:-0.15s]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-gray-500" />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); enviar(input); }}
          className="border-t border-gray-800 p-3"
        >
          <div className="flex items-end gap-2 rounded-xl border border-gray-700 bg-gray-800 p-2 focus-within:border-primary-500">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              maxLength={MAX_CARACTERES}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Pregunta sobre tus clientes, facturas, precios, impuestos…"
              aria-label="Mensaje para el asistente"
              className="max-h-[200px] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-white placeholder-gray-500 outline-none border-0 focus:ring-0 focus:border-0"
            />
            <Button type="submit" disabled={enviando || !input.trim()} aria-label="Enviar">
              <SendIcon className="h-4 w-4" />
            </Button>
          </div>
          <p className="mt-1.5 px-1 text-[11px] text-gray-500">
            Intro para enviar · Mayús+Intro para nueva línea · Cada mensaje cuesta {AI_CREDIT_COSTS.chatMessage} {AI_CREDIT_COSTS.chatMessage === 1 ? 'crédito' : 'créditos'} (si falla, no se cobra). La IA puede equivocarse: revisa cifras y temas fiscales.
          </p>
        </form>
      </section>

      <Suspense fallback={null}>
        {comprarCreditos && (
          <BuyCreditsModal isOpen={comprarCreditos} creditosNecesarios={AI_CREDIT_COSTS.chatMessage} onClose={() => setComprarCreditos(false)} />
        )}
      </Suspense>
    </div>
  );
};

export default AIAssistantPage;
