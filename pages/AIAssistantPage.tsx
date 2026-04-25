import React, { useState, useRef, useEffect } from 'react';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { Send, Sparkles, User, RefreshCw } from '@/components/icons/Icon';
import { getAIResponse, AI_CREDIT_COSTS } from '@/services/geminiService';
import { useAppStore } from '@/hooks/useAppStore';
import { useToast } from '@/hooks/useToast';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
}

const AIAssistantPage = () => {
  const { addToast } = useToast();
  const { profile, consumeCredits } = useAppStore();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
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

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedInput = input.trim();

    if (!trimmedInput || isLoading) return;

    // 1. Verificar créditos localmente antes de empezar
    const currentCredits = profile?.ai_credits ?? 0;
    if (currentCredits < AI_CREDIT_COSTS.chatMessage) {
      addToast('No tienes créditos suficientes para esta consulta.', 'error');
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      text: trimmedInput,
      sender: 'user',
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // 2. Obtener respuesta de la IA
      // Importante: chatHistory debe seguir el formato que espera tu geminiService
      const chatHistory = messages.map(m => ({
        role: m.sender === 'user' ? 'user' : 'model',
        parts: [{ text: m.text }]
      }));

      const response = await getAIResponse(trimmedInput, chatHistory);
      
      // 3. Consumir créditos en el store/DB
      await consumeCredits(AI_CREDIT_COSTS.chatMessage);

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: response,
        sender: 'ai',
      };

      setMessages((prev) => [...prev, aiMessage]);
    } catch (err: any) {
      addToast(err.message || 'Error al conectar con el asistente.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto h-[calc(100vh-12rem)] flex flex-col">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center">
            <Sparkles className="w-6 h-6 mr-2 text-fuchsia-400" />
            Asistente de IA Estratégico
          </h1>
          <p className="text-gray-400">Consultoría senior para tu negocio freelance</p>
        </div>
        <div className="bg-gray-800 px-4 py-2 rounded-lg border border-gray-700">
          <span className="text-sm text-gray-400">Créditos disponibles:</span>
          <span className="ml-2 font-bold text-fuchsia-400">{profile?.ai_credits ?? 0}</span>
        </div>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden border-gray-700 bg-gray-900/50 backdrop-blur-sm">
        <CardContent className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] flex ${
                  m.sender === 'user' ? 'flex-row-reverse' : 'flex-row'
                } items-start gap-3`}
              >
                <div
                  className={`p-2 rounded-lg ${
                    m.sender === 'user' ? 'bg-primary-600' : 'bg-gray-800 border border-gray-700'
                  }`}
                >
                  {m.sender === 'user' ? (
                    <User className="w-5 h-5 text-white" />
                  ) : (
                    <Sparkles className="w-5 h-5 text-fuchsia-400" />
                  )}
                </div>
                <div
                  className={`p-4 rounded-2xl ${
                    m.sender === 'user'
                      ? 'bg-primary-600/10 text-white border border-primary-500/20'
                      : 'bg-gray-800/50 text-gray-200 border border-gray-700'
                  }`}
                >
                  <div className="prose prose-invert prose-sm max-w-none">
                    {m.text.split('\n').map((line, i) => (
                      <p key={i}>{line}</p>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="flex items-center gap-3 bg-gray-800/50 p-4 rounded-2xl border border-gray-700">
                <RefreshCw className="w-5 h-5 text-fuchsia-400 animate-spin" />
                <span className="text-sm text-gray-400">Analizando estrategia...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </CardContent>

        <div className="p-4 border-t border-gray-700 bg-gray-800/30">
          <form onSubmit={handleSend} className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Pregunta sobre tarifas, contratos, clientes..."
              className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all"
              disabled={isLoading}
            />
            <Button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="rounded-xl px-6"
            >
              <Send className="w-5 h-5" />
            </Button>
          </form>
          <p className="text-[10px] text-center text-gray-500 mt-2">
            Cada consulta consume {AI_CREDIT_COSTS.chatMessage} créditos de IA.
          </p>
        </div>
      </Card>
    </div>
  );
};

export default AIAssistantPage;
