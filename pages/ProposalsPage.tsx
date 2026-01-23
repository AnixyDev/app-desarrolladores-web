// pages/ProposalsPage.tsx
import React, { useState, lazy, Suspense } from 'react';

import { useAppStore } from '../hooks/useAppStore';
import { useToast } from '../hooks/useToast';

import Card, { CardContent, CardHeader } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import StatusChip from '../components/ui/StatusChip';

import { formatCurrency } from '../lib/utils';
import { Link } from 'react-router-dom';

import { SparklesIcon, RefreshCwIcon } from '../components/icons/Icon';
import { generateProposalText, AI_CREDIT_COSTS } from '../services/geminiService';

const BuyCreditsModal = lazy(
  () => import('../components/modals/BuyCreditsModal')
);

const ProposalsPage: React.FC = () => {
  const {
    proposals,
    clients,
    addProposal,
    getClientById,
    profile,
    consumeCredits,
  } = useAppStore();

  const { addToast } = useToast();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isBuyCreditsModalOpen, setIsBuyCreditsModalOpen] = useState(false);

  const initialProposalState = {
    client_id: clients[0]?.id ?? '',
    title: '',
    content: '',
    amount_cents: 0,
  };

  const [newProposal, setNewProposal] = useState(initialProposalState);

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value } = e.target;
    setNewProposal(prev => ({ ...prev, [name]: value }));
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewProposal(prev => ({
      ...prev,
      amount_cents: Math.round(Number(e.target.value) * 100),
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!newProposal.client_id) {
      addToast('Selecciona un cliente válido.', 'error');
      return;
    }

    addProposal(newProposal);
    setIsModalOpen(false);
    setNewProposal(initialProposalState);
  };

  const handleAiGenerate = async () => {
    if (!profile) return;

    if (!newProposal.title.trim()) {
      addToast(
        'Escribe un título para dar contexto a la IA.',
        'error'
      );
      return;
    }

    if (profile.ai_credits < AI_CREDIT_COSTS.generateProposal) {
      setIsBuyCreditsModalOpen(true);
      return;
    }

    setIsAiLoading(true);

    try {
      const context =
        newProposal.content.trim().length > 10
          ? newProposal.content
          : `Proyecto titulado "${newProposal.title}". Se requiere una propuesta profesional.`;

      const profileSummary =
        profile.bio ||
        `Freelancer profesional. Tarifa: ${formatCurrency(
          profile.hourly_rate_cents
        )}/h.`;

      const generatedText = await generateProposalText(
        newProposal.title,
        context,
        profileSummary
      );

      setNewProposal(prev => ({
        ...prev,
        content: String(generatedText),
      }));

      consumeCredits(AI_CREDIT_COSTS.generateProposal);
      addToast('Propuesta generada con éxito.', 'success');
    } catch (error) {
      addToast('Error al generar la propuesta.', 'error');
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold text-white">
          Propuestas
        </h1>
        <Button onClick={() => setIsModalOpen(true)}>
          Crear Propuesta
        </Button>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-white">
            Listado de Propuestas
          </h2>
        </CardHeader>
        <CardContent className="p-0">
          <div className="hidden md:block">
            <table className="w-full text-left">
              <thead className="border-b border-gray-800">
                <tr>
                  <th className="p-4">Título</th>
                  <th className="p-4">Cliente</th>
                  <th className="p-4">Fecha</th>
                  <th className="p-4">Importe</th>
                  <th className="p-4">Estado</th>
                </tr>
              </thead>
              <tbody>
                {proposals.map(proposal => (
                  <tr
                    key={proposal.id}
                    className="border-b border-gray-800 hover:bg-gray-800/50"
                  >
                    <td className="p-4 font-semibold text-white">
                      {String(proposal.title)}
                    </td>
                    <td className="p-4 text-primary-400">
                      <Link to={`/clients/${proposal.client_id}`}>
                        {String(
                          getClientById(proposal.client_id)?.name ??
                            'Cliente'
                        )}
                      </Link>
                    </td>
                    <td className="p-4 text-gray-300">
                      {String(proposal.created_at)}
                    </td>
                    <td className="p-4 text-white">
                      {formatCurrency(proposal.amount_cents)}
                    </td>
                    <td className="p-4">
                      <StatusChip
                        type="proposal"
                        status={proposal.status}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Crear Nueva Propuesta"
      >
        <form
          onSubmit={handleSubmit}
          className="space-y-4 max-h-[70vh] overflow-y-auto pr-2"
        >
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Cliente
            </label>
            <select
              name="client_id"
              value={newProposal.client_id}
              onChange={handleInputChange}
              className="block w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-white"
            >
              {clients.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <Input
            label="Título de la Propuesta"
            name="title"
            value={newProposal.title}
            onChange={handleInputChange}
            required
          />

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-sm font-medium text-gray-300">
                Contenido
              </label>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleAiGenerate}
                disabled={isAiLoading}
                className="text-xs"
              >
                {isAiLoading ? (
                  <RefreshCwIcon className="w-3 h-3 mr-1 animate-spin" />
                ) : (
                  <SparklesIcon className="w-3 h-3 mr-1 text-purple-400" />
                )}
                {isAiLoading ? 'Redactando…' : 'Redactar con IA'}
              </Button>
            </div>

            <textarea
              name="content"
              rows={10}
              value={newProposal.content}
              onChange={handleInputChange}
              className="block w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-white"
            />
          </div>

          <Input
            label="Importe Total (€)"
            type="number"
            step="0.01"
            onChange={handleAmountChange}
            required
          />

          <div className="flex justify-end pt-4">
            <Button type="submit">
              Guardar Propuesta
            </Button>
          </div>
        </form>
      </Modal>

      <Suspense fallback={null}>
        {isBuyCreditsModalOpen && (
          <BuyCreditsModal
            isOpen
            onClose={() => setIsBuyCreditsModalOpen(false)}
          />
        )}
      </Suspense>
    </div>
  );
};

export default ProposalsPage;
