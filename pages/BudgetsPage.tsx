import React, { useState } from 'react';
import { useAppStore } from '@/hooks/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import Card, { CardContent, CardHeader } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import StatusChip from '@/components/ui/StatusChip';
import EmptyState from '@/components/ui/EmptyState';
import { Budget } from '@/types';
import { formatCurrency, formatearFecha } from '@/lib/utils';
import {
  CheckCircleIcon,
  XCircleIcon,
  MessageSquareIcon,
  SendIcon,
  EditIcon,
  TrashIcon,
  DownloadIcon,
} from '../components/icons/Icon';

import { sendDocumentEmail } from '../services/emailService';
import { generateBudgetPdf, generateBudgetPdfBase64 } from '../services/pdfService';
import { useToast } from '../hooks/useToast';
import CreateBudgetModal from '../components/modals/CreateBudgetModal';

const BudgetsPage: React.FC = () => {
  const { budgets, profile, getClientById, updateBudgetStatus, deleteBudget } = useAppStore(useShallow(s => ({ budgets: s.budgets, profile: s.profile, getClientById: s.getClientById, updateBudgetStatus: s.updateBudgetStatus, deleteBudget: s.deleteBudget })));
  const [enviando, setEnviando] = useState<string | null>(null);

  const { addToast } = useToast();

  const [isModalOpen, setIsModalOpen] = useState(false);
  // NUEVO: presupuesto que se está editando (null = el modal está en modo
  // "crear nuevo"). CreateBudgetModal usa esto para precargar el formulario.
  const [budgetToEdit, setBudgetToEdit] = useState<Budget | null>(null);

  const openCreateModal = () => {
    setBudgetToEdit(null);
    setIsModalOpen(true);
  };

  const openEditModal = (budget: Budget) => {
    setBudgetToEdit(budget);
    setIsModalOpen(true);
  };

  const handleUpdateStatus = async (id: string, status: 'accepted' | 'rejected') => {
    try {
      await updateBudgetStatus(id, status);
    } catch (err) {
      addToast((err as Error).message || 'No se pudo actualizar el presupuesto.', 'error');
    }
  };

  // Envío real desde facturas@devfreelancer.app, con el PDF adjunto y el
  // enlace al portal para aceptarlo o rechazarlo (antes: borrador de mailto).
  const handleSendBudget = async (budget: Budget) => {
    const client = getClientById(budget.client_id);
    if (!client?.email) {
      addToast('Este cliente no tiene email registrado.', 'error');
      return;
    }
    if (!profile) return;
    setEnviando(budget.id);
    try {
      await sendDocumentEmail({
        tipo: 'presupuesto',
        documentoId: budget.id,
        pdfBase64: generateBudgetPdfBase64(budget, client.name, profile),
      });
      addToast(`Presupuesto enviado a ${client.email}.`, 'success');
    } catch (error) {
      addToast((error as Error)?.message || 'No se pudo enviar el presupuesto.', 'error');
    } finally {
      setEnviando(null);
    }
  };

  const handleDownload = (budget: Budget) => {
    if (!profile) return;
    generateBudgetPdf(budget, getClientById(budget.client_id)?.name ?? '', profile);
  };

  const handleDelete = async (budget: Budget) => {
    if (!window.confirm(`¿Borrar el presupuesto "${budget.description}"? No se puede deshacer.`)) return;
    try {
      await deleteBudget(budget.id);
      addToast('Presupuesto borrado.', 'info');
    } catch (err) {
      addToast((err as Error).message || 'No se pudo borrar el presupuesto.', 'error');
    }
  };

  const renderAcciones = (budget: Budget) => (
    <>
      <Button size="sm" variant="secondary" onClick={() => openEditModal(budget)} title="Editar">
        <EditIcon className="w-4 h-4" />
      </Button>
      <Button size="sm" variant="secondary" onClick={() => handleDownload(budget)} title="Descargar PDF">
        <DownloadIcon className="w-4 h-4" />
      </Button>
      <Button size="sm" variant="secondary" onClick={() => handleSendBudget(budget)} title="Enviar por email" disabled={enviando === budget.id}>
        <SendIcon className="w-4 h-4" />
      </Button>
      {budget.status === 'pending' && (
        <>
          <Button size="sm" variant="secondary" onClick={() => handleUpdateStatus(budget.id, 'accepted')} title="Marcar como aceptado">
            <CheckCircleIcon className="w-4 h-4 text-green-400" />
          </Button>
          <Button size="sm" variant="secondary" onClick={() => handleUpdateStatus(budget.id, 'rejected')} title="Marcar como rechazado">
            <XCircleIcon className="w-4 h-4 text-red-400" />
          </Button>
        </>
      )}
      <Button size="sm" variant="danger" onClick={() => handleDelete(budget)} title="Eliminar">
        <TrashIcon className="w-4 h-4" />
      </Button>
    </>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold text-white">
          Presupuestos
        </h1>

        <Button
          onClick={openCreateModal}
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
            onClick: openCreateModal,
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
                      {formatearFecha(budget.created_at)}
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
                      <div className="flex justify-end gap-2">
                        {renderAcciones(budget)}
                      </div>
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
                  <p className="text-xs text-gray-500">{formatearFecha(budget.created_at)}</p>
                  <div className="flex flex-wrap justify-end gap-2 pt-1 border-t border-gray-800/50">
                    {renderAcciones(budget)}
                  </div>
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
          budgetToEdit={budgetToEdit}
        />
      )}
    </div>
  );
};

export default BudgetsPage;