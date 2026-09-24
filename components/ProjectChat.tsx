import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../hooks/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { SendIcon, SparklesIcon, UserIcon } from './icons/Icon';
import { useProjectChat, LIMITE_CARACTERES } from '../hooks/useProjectChat';
import { AI_CREDIT_COSTS, getAIResponse } from '@/services/geminiService';
import { useToast } from '@/hooks/useToast';
import Input from './ui/Input';
import Button from './ui/Button';

/**
 * Canal del proyecto, lado del freelancer.
 *
 * ANTES: los mensajes vivían en un `useState`, no se guardaban en ningún
 * sitio, se borraban al refrescar y el cliente no los veía nunca porque el
 * portal no tenía chat. Y "Resumir con IA" era un `setTimeout` que escribía
 * un texto fijo sobre "los requisitos de la API".
 *
 * AHORA: los mensajes están en `project_messages` con RLS, llegan en tiempo
 * real, y el cliente escribe desde el portal. El resumen llama a la IA de
 * verdad y cuesta lo que cuesta un mensaje de chat.
 */

interface ProjectChatProps {
  projectId: string;
  /** Solo el freelancer resume: se cobra de sus créditos. */
  puedeResumir?: boolean;
}

const COLOR_POR_ROL: Record<string, string> = {
  freelancer: 'bg-primary-600',
  equipo: 'bg-indigo-600',
  cliente: 'bg-gray-700',
};

const ETIQUETA_POR_ROL: Record<string, string> = {
  freelancer: '',
  equipo: 'Equipo',
  cliente: 'Cliente',
};

const ProjectChat: React.FC<ProjectChatProps> = ({ projectId, puedeResumir = false }) => {
  const { profile } = useAppStore(useShallow(s => ({ profile: s.profile })));
  const { addToast } = useToast();

  const { mensajes, cargando, error, enviando, enviar } = useProjectChat(projectId);
  const [input, setInput] = useState('');
  const [resumen, setResumen] = useState<string | null>(null);
  const [resumiendo, setResumiendo] = useState(false);

  const finRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const texto = input.trim();
    if (!texto || enviando) return;
    const ok = await enviar(texto);
    if (ok) setInput('');
  };

  const handleResumir = async () => {
    if (mensajes.length === 0 || resumiendo) return;
    setResumiendo(true);
    try {
      const conversacion = mensajes
        .map(m => `${m.author_name} (${m.author_role}): ${m.body}`)
        .join('\n');

      const texto = await getAIResponse(
        'Resume esta conversación de un proyecto entre un freelancer y su cliente. ' +
        'Enumera los acuerdos alcanzados y lo que queda pendiente, en español y en pocas líneas. ' +
        'Si no hay acuerdos claros, dilo en vez de inventarlos.\n\n' +
        conversacion,
        [],
        'chatMessage'
      );

      setResumen(texto);
    } catch (e) {
      addToast((e as Error).message || 'No se pudo generar el resumen.', 'error');
    } finally {
      setResumiendo(false);
    }
  };

  if (!profile?.id) {
    return (
      <div className="h-[500px] flex items-center justify-center text-gray-400">
        Cargando chat...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[500px]">
      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-1">
        {cargando ? (
          <div className="h-full flex items-center justify-center text-gray-500 text-sm">
            Cargando mensajes…
          </div>
        ) : mensajes.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-500 text-sm text-center px-6">
            <p>Aún no hay mensajes en este proyecto.</p>
            <p className="mt-1">Lo que escribas aquí lo verá tu cliente desde su portal.</p>
          </div>
        ) : (
          mensajes.map(m => {
            const esMio = m.author_id === profile.id;
            const etiqueta = ETIQUETA_POR_ROL[m.author_role] ?? '';
            return (
              <div key={m.id} className={`flex ${esMio ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] rounded-2xl px-4 py-2 ${COLOR_POR_ROL[m.author_role] ?? 'bg-gray-700'}`}>
                  {!esMio && (
                    <p className="text-[11px] font-semibold text-gray-300 mb-0.5 flex items-center gap-1">
                      <UserIcon className="w-3 h-3" />
                      {m.author_name}
                      {etiqueta && <span className="text-gray-400 font-normal">· {etiqueta}</span>}
                    </p>
                  )}
                  <p className="text-sm text-white whitespace-pre-wrap break-words">{m.body}</p>
                  <p className="text-[10px] text-gray-300/70 mt-1 text-right">
                    {new Date(m.created_at).toLocaleString('es-ES', {
                      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={finRef} />
      </div>

      {error && <p className="text-xs text-red-400 pt-2">{error}</p>}

      {resumen && (
        <div className="mt-3 p-3 rounded-lg bg-gray-800 border border-gray-700">
          <p className="text-xs font-semibold text-primary-400 mb-1">Resumen de la conversación</p>
          <p className="text-sm text-gray-300 whitespace-pre-wrap">{resumen}</p>
        </div>
      )}

      <form onSubmit={handleSend} className="pt-3 flex gap-2 items-center">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escribe un mensaje para tu cliente…"
          maxLength={LIMITE_CARACTERES}
          disabled={enviando}
          className="flex-1"
        />
        {puedeResumir && (
          <Button
            type="button"
            variant="secondary"
            onClick={handleResumir}
            disabled={resumiendo || mensajes.length === 0}
            title={`Resumir la conversación (${AI_CREDIT_COSTS.chatMessage} crédito)`}
          >
            <SparklesIcon className="w-4 h-4" />
          </Button>
        )}
        <Button type="submit" disabled={enviando || input.trim().length === 0}>
          <SendIcon className="w-4 h-4" />
        </Button>
      </form>
    </div>
  );
};

export default ProjectChat;
