import React, { useState, useMemo, lazy, Suspense } from 'react';
import { useAppStore } from '@/hooks/useAppStore';
import Card, { CardContent, CardHeader } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import StatusChip from '@/components/ui/StatusChip';
import EmptyState from '@/components/ui/EmptyState';
import { InvoiceItem } from '@/types';
import { formatCurrency } from '@/lib/utils';
import {
  CheckCircleIcon,
  XCircleIcon,
  MessageSquareIcon,
} from '../components/icons/Icon';

import { generateItemsForDocument, AI_CREDIT_COSTS } from '../services/geminiService';
import { useToast } from '../hooks/useToast';
// Al principio del archivo
import CreateBudgetModal from '../components/modals/CreateBudgetModal';

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addBudget(newBudget);
      addToast('Presupuesto creado.', 'success');
      setIsModalOpen(false);
      setNewBudget(initialBudgetState);
    } catch (err) {
      addToast((err as Error).message || 'No se pudo crear el presupuesto.', 'error');
    }
  };

  const handleUpdateStatus = async (id: string, status: 'accepted' | 'rejected') => {
    try {
      await updateBudgetStatus(id, status);
    } catch (err) {
      addToast((err as Error).message || 'No se pudo actualizar el presupuesto.', 'error');
    }
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
        <h1 className="text-2xl font-semibold text-white">
          Presupuestos
        </h1>

        <Button
          onClick={() => setIsModalOpen(true)}
        >
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
            <div className="overflow-x-auto">
            <table className="w-full text-left hidden md:table">
              <thead className="border-b border-gray-800">
                <tr>
                  <th className="p-4">Descripción</th>
                  <th className="p-4">Cliente</th>
                  <th className="p-4">Fecha</th>
                  <th className="p-4">Importe</th>
                  <th className="p-4">Estado</th>
                  <th className="p-4 text-right sticky right-0 bg-gray-900">Acciones</th>
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

                    <td className="p-4 text-right sticky right-0 bg-gray-900/95 backdrop-blur-sm">
                      {budget.status === 'pending' && (
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleUpdateStatus(budget.id, 'accepted')}
                          >
                            <CheckCircleIcon className="w-4 h-4 text-green-400" />
                          </Button>

                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleUpdateStatus(budget.id, 'rejected')}
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

            {/* Vista de tarjetas para móvil */}
            <div className="md:hidden divide-y divide-gray-800">
              {budgets.map(budget => (
                <div key={budget.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-white">{budget.description}</p>
                    <StatusChip type="budget" status={budget.status} />
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-primary-400">{getClientById(budget.client_id)?.name}</span>
                    <span className="text-white font-bold">{formatCurrency(budget.amount_cents)}</span>
                  </div>
                  <p className="text-xs text-gray-500">{budget.created_at}</p>
                  {budget.status === 'pending' && (
                    <div className="flex justify-end gap-2 pt-1 border-t border-gray-800/50">
                      <Button size="sm" variant="secondary" onClick={() => handleUpdateStatus(budget.id, 'accepted')}>
                        <CheckCircleIcon className="w-4 h-4 text-green-400" />
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => handleUpdateStatus(budget.id, 'rejected')}>
                        <XCircleIcon className="w-4 h-4 text-red-400" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            </div>
          </CardContent>
        </Card>
      )}
     
{isModalOpen && (
  <CreateBudgetModal 
    isOpen={isModalOpen} 
    onClose={() => setIsModalOpen(false)} 
  />
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