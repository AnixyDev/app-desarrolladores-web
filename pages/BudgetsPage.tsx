// pages/BudgetsPage.tsx
import React, { useState, useMemo, lazy, Suspense } from 'react';

import { useAppStore } from '../hooks/useAppStore';
import Card, { CardContent, CardHeader } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import StatusChip from '../components/ui/StatusChip';
import EmptyState from '../components/ui/EmptyState';

import { Budget, InvoiceItem } from '../types';
import { formatCurrency } from '../lib/utils';
import {
  PlusIcon,
  TrashIcon,
  CheckCircleIcon,
  XCircleIcon,
  MessageSquareIcon,
  SparklesIcon,
} from '../components/icons/Icon';

import { generateItemsForDocument, AI_CREDIT_COSTS } from '../services/geminiService';
import { useToast } from '../hooks/useToast';

const BuyCreditsModal = lazy(
  () => import('../components/modals/BuyCreditsModal')
);

const BudgetsPage: React.FC = () => {
  const {
    budgets,
    clients,
    profile,
    addBudget,
    updateBudgetStatus,
    getClientById,
    consumeCredits,
  } = useAppStore();

  const { addToast } = useToast();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAIGeneratorOpen, setIsAIGeneratorOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isBuyCreditsModalOpen, setIsBuyCreditsModalOpen] = useState(false);

  const initialBudgetState = {
    client_id: clients.length > 0 ? clients[0].id : '',
    description: '',
    items: [{ description: '', quantity: 1, price_cents: 0 }],
  };

  const [newBudget, setNewBudget] = useState(initialBudgetState);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setNewBudget(prev => ({ ...prev, [name]: value }));
  };

  const handleItemChange = (
    index: number,
    field: keyof InvoiceItem,
    value: string | number
  ) => {
    const items = [...newBudget.items];

    if (field === 'price_cents') {
      items[index][field] = Math.round(Number(value) * 100);
    } else if (field === 'quantity') {
      items[index][field] = Number(value);
    } else {
      items[index][field] = String(value);
    }

    setNewBudget(prev => ({ ...prev, items }));
  };

  const addItem = () => {
    setNewBudget(prev => ({
      ...prev,
      items: [...prev.items, { description: '', quantity: 1, price_cents: 0 }],
    }));
  };

  const removeItem = (index: number) => {
    if (newBudget.items.length > 1) {
      setNewBudget(prev => ({
        ...prev,
        items: prev.items.filter((_, i) => i !== index),
      }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addBudget(newBudget);
    setIsModalOpen(false);
    setNewBudget(initialBudgetState);
  };

  const handleAiGenerate = async () => {
    if (!profile) return;

    if (profile.ai_credits < AI_CREDIT_COSTS.generateInvoiceItems) {
      setIsBuyCreditsModalOpen(true);
      return;
    }

    setIsAiLoading(true);

    try {
      const items = await generateItemsForDocument(
        aiPrompt,
        profile.hourly_rate_cents
      );

      if (items.length > 0) {
        setNewBudget(prev => ({ ...prev, items }));
        consumeCredits(AI_CREDIT_COSTS.generateInvoiceItems);
        addToast('Conceptos generados con IA.', 'success');
        setIsAIGeneratorOpen(false);
      } else {
        addToast('No se pudieron generar conceptos.', 'error');
      }
    } catch (err) {
      addToast((err as Error).message, 'error');
    } finally {
      setIsAiLoading(false);
    }
  };

  const totalAmount = useMemo(
    () =>
      newBudget.items.reduce(
        (sum, item) => sum + item.price_cents * item.quantity,
        0
      ),
    [newBudget.items]
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold text-white">Presupuestos</h1>
        <Button onClick={() => setIsModalOpen(true)}>
          Crear Presupuesto
        </Button>
      </div>

      {budgets.length === 0 ? (
        <EmptyState
          icon={MessageSquareIcon}
          title="No hay presupuestos"
          message="Crea y envía presupuestos a tus clientes."
          action={{
            text: 'Crear Presupuesto',
            onClick: () => setIsModalOpen(true),
          }}
        />
      ) : (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-white">
              Listado de Presupuestos
            </h2>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-left">
              <thead className="border-b border-gray-800">
                <tr>
                  <th className="p-4">Descripción</th>
                  <th className="p-4">Cliente</th>
                  <th className="p-4">Fecha</th>
                  <th className="p-4">Importe</th>
                  <th className="p-4">Estado</th>
                  <th className="p-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {budgets.map(budget => (
                  <tr
                    key={budget.id}
                    className="border-b border-gray-800 hover:bg-gray-800/50"
                  >
                    <td className="p-4 font-semibold text-white">
                      {budget.description}
                    </td>
                    <td className="p-4 text-primary-400">
                      {getClientById(budget.client_id)?.name}
                    </td>
                    <td className="p-4 text-gray-300">
                      {budget.created_at}
                    </td>
                    <td className="p-4 text-white">
                      {formatCurrency(budget.amount_cents)}
                    </td>
                    <td className="p-4">
                      <StatusChip
                        type="budget"
                        status={budget.status}
                      />
                    </td>
                    <td className="p-4 text-right">
                      {budget.status === 'pending' && (
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              updateBudgetStatus(budget.id, 'accepted')
                            }
                          >
                            <CheckCircleIcon className="w-4 h-4 text-green-400" />
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              updateBudgetStatus(budget.id, 'rejected')
                            }
                          >
                            <XCircleIcon className="w-4 h-4 text-red-400" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

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

export default BudgetsPage;
