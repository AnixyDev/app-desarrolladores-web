import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../hooks/useAppStore';
import { SendIcon, SparklesIcon, UserIcon } from './icons/Icon';
import { ProjectMessage } from '../types';
import Input from './ui/Input';
import Button from './ui/Button';

interface ProjectChatProps {
  projectId: string;
}

const ProjectChat: React.FC<ProjectChatProps> = ({ projectId }) => {
  const { profile } = useAppStore();

  const [messages, setMessages] = useState<ProjectMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

  /**
   * 👉 Guard importante para cuando se refresca la página
   * y el perfil todavía no está hidratado desde Supabase.
   */
  if (!profile) {
    return (
      <div className="h-[500px] flex items-center justify-center text-gray-400">
        Cargando chat...
      </div>
    );
  }

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();

    const trimmed = input.trim();
    if (!trimmed) return;

    const newMessage: ProjectMessage = {
      id: `msg-${Date.now()}`,
      project_id: projectId,
      user_id: profile.id,
      user_name: profile.full_name,
      text: trimmed,
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, newMessage]);
    setInput('');
  };

  const handleSummarize = () => {
    setIsLoading(true);

    // Simulación de IA
    setTimeout(() => {
      const summary =
        'Resumen de la IA: Se discutieron los requisitos de la API y se acordó una próxima reunión para revisar el esquema de la base de datos.';

      const aiMessage: ProjectMessage = {
        id: `msg-ai-${Date.now()}`,
        project_id: projectId,
        user_id: 'ai',
        user_name: 'Asistente IA',
        text: summary,
        timestamp: new Date().toISOString(),
      };

      setMessages(prev => [...prev, aiMessage]);
      setIsLoading(false);
    }, 1500);
  };

  return (
    <div className="flex flex-col h-[500px]">
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-900 rounded-t-lg custom-scrollbar">
        {messages.map(message => (
          <div
            key={message.id}
            className={`flex items-start gap-3 ${
              message.user_id === profile.id ? 'justify-end' : ''
            }`}
          >
            {message.user_id !== profile.id && (
              <div
                className={`p-2 rounded-full ${
                  message.user_id === 'ai' ? 'bg-purple-500' : 'bg-gray-600'
                }`}
              >
                <SparklesIcon className="w-5 h-5 text-white" />
              </div>
            )}

            <div
              className={`max-w-xl p-3 rounded-lg ${
                message.user_id === profile.id
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-800 text-gray-200'
              }`}
            >
              <p className="text-sm font-bold mb-1">
                {String(message.user_name)}
              </p>

              <p className="text-sm" style={{ whiteSpace: 'pre-wrap' }}>
                {String(message.text)}
              </p>

              <p className="text-xs text-right mt-1 opacity-60">
                {new Date(message.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>

            {message.user_id === profile.id && (
              <div className="p-2 bg-gray-700 rounded-full">
                <UserIcon className="w-5 h-5 text-white" />
              </div>
            )}
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-gray-700 bg-gray-900 rounded-b-lg">
        <div className="flex justify-end mb-2">
          <button
            type="button"
            onClick={handleSummarize}
            disabled={isLoading}
            className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 disabled:opacity-50"
          >
            <SparklesIcon className="w-4 h-4" />
            {isLoading ? 'Resumiendo...' : 'Resumir con IA'}
          </button>
        </div>

        <form onSubmit={handleSend} className="flex gap-2">
          <Input
            wrapperClassName="flex-1"
            placeholder="Escribe tu mensaje..."
            value={input}
            onChange={e => setInput(e.target.value)}
          />

          <Button type="submit">
            <SendIcon className="w-5 h-5" />
          </Button>
        </form>
      </div>
    </div>
  );
};

export default ProjectChat;
