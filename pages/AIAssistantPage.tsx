import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import {
  SendIcon,
  SparklesIcon,
  UserIcon,
  RefreshCwIcon,
} from '@/components/icons/Icon';

import { getAIResponse, AI_CREDIT_COSTS } from '@/services/geminiService';
import { useAppStore } from '@/hooks/useAppStore';
import { useToast } from '@/hooks/useToast';

interface Message {
  id: number;
  text: string;
  sender: 'user' | 'ai';
}

const AIAssistantPage = () => {
  const navigate = useNavigate(); // mantenido por si se usa después
  const { addToast } = useToast();
  const { profile, consumeCredits } = useAppStore();

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      text: 'Hola. Soy tu **Consultor Senior de Estrategia**. ¿Cuál es tu desafío hoy?',
      sender: 'ai',
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading) return;

    if ((profile?.ai_credits ?? 0) < AI_CREDIT_COSTS.chatMessage) {
      addToast('Créditos insuficientes.', 'error');
      return;
    }

    const userMessage: Message = {
      id: Date.now(),
      text: trimmedInput,
      sender: 'user',
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    const chatHistory = messages.slice(-6).map((msg) => ({
      role: msg.sender === 'user' ? 'user' : 'model',
      parts: [{ text: String(msg.text) }],
    }));

    try {
      const response = await getAIResponse(trimmedInput, chatHistory);
      const aiText = String(
        response?.text ?? 'No se pudo obtener una respuesta clara.'
      );

      const wasConsumed = await consumeCredits(
        AI_CREDIT_COSTS.chatMessage
      );

      if (wasConsumed) {
        setMessages((prev) => [
          ...prev,
          { id: Date.now() + 1, text: aiText, sender: 'ai' },
        ]);
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : 'Ocurrió un error inesperado al consultar la IA.';

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          text: `⚠️ Error: ${message}`,
          sender: 'ai',
        },
      ]);

      addToast(message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] max-w-5xl mx-auto">
      <header className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary-600/20 rounded-xl">
            <SparklesIcon className="w-6 h-6 text-primary-400" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">
            Consultor IA
          </h1>
        </div>
      </header>

      <Card className="flex-1 flex flex-col overflow-hidden border-gray-800 bg-gray-950/50 backdrop-blur-md">
        <CardContent className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex items-start gap-4 ${
                message.sender === 'user' ? 'flex-row-reverse' : ''
              }`}
            >
              <div
                className={`shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg border ${
                  message.sender === 'user'
                    ? 'bg-primary-600 border-primary-500'
                    : 'bg-gray-800 border-gray-700'
                }`}
              >
                {message.sender === 'user' ? (
                  <UserIcon className="w-5 h-5 text-white" />
                ) : (
                  <SparklesIcon className="w-5 h-5 text-primary-400" />
                )}
              </div>

              <div
                className={`max-w-[85%] p-5 rounded-2xl text-sm leading-relaxed ${
                  message.sender === 'user'
                    ? 'bg-primary-600/10 text-white border border-primary-500/20'
                    : 'bg-gray-900/80 text-gray-200 border border-gray-800'
                }`}
              >
                <p style={{ whiteSpace: 'pre-wrap' }}>
                  {String(message.text)}
                </p>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center gap-3 animate-pulse">
              <RefreshCwIcon className="w-4 h-4 animate-spin text-primary-500" />
              <span className="text-xs text-gray-500 uppercase font-bold tracking-widest">
                Analizando desafío…
              </span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </CardContent>

        <div className="p-4 border-t border-gray-800 bg-gray-900/80">
          <form onSubmit={handleSend} className="flex gap-4">
            <input
              placeholder="Haz una pregunta estratégica…"
              className="w-full bg-gray-800 text-white rounded-2xl py-4 px-5 border border-gray-700 outline-none focus:border-primary-500 transition-all"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading}
            />
            <Button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="shrink-0 w-14 h-14 rounded-2xl shadow-xl shadow-primary-600/20"
            >
              <SendIcon className="w-6 h-6" />
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
};

export default AIAssistantPage;
