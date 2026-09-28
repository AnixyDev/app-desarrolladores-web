// components/modals/CreateRecurringInvoiceModal.tsx
// NUEVO: el botón "Factura Recurrente" de /invoices activaba
// isRecurringModalOpen, pero no existía ningún modal en el render que
// comprobara ese estado — el botón era puramente decorativo. Este es el
// modal que faltaba.
import React, { useState, useMemo, useEffect } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { useAppStore } from '@/hooks/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { InvoiceItem, RecurringInvoice } from '@/types';
import { PlusIcon, TrashIcon } from '@/components/icons/Icon';
import { formatCurrency } from '@/lib/utils';

interface CreateRecurringInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Si llega, el modal edita esta recurrente en vez de crear una. */
  recurrente?: RecurringInvoice | null;
}

const emptyItem: InvoiceItem = { description: '', quantity: 1, price_cents: 0 };

const CreateRecurringInvoiceModal: React.FC<CreateRecurringInvoiceModalProps> = ({ isOpen, onClose, recurrente = null }) => {
  const { clients, projects, addRecurringInvoice, updateRecurringInvoice } = useAppStore(useShallow(s => ({ clients: s.clients, projects: s.projects, addRecurringInvoice: s.addRecurringInvoice, updateRecurringInvoice: s.updateRecurringInvoice })));
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [clientId, setClientId] = useState(clients[0]?.id || '');
  const [projectId, setProjectId] = useState('');
  const [items, setItems] = useState<InvoiceItem[]>([{ ...emptyItem }]);
  const [taxPercent, setTaxPercent] = useState(21);
  // FIX: solo 'monthly' y 'yearly' están soportados de verdad por el cron
  // (process-recurring-invoices) — cualquier otro valor generaría la
  // primera factura pero nunca calcularía la siguiente fecha, dejando la
  // recurrencia rota en silencio.
  const [frequency, setFrequency] = useState<'monthly' | 'yearly'>('monthly');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));

  // En edición: la fecha que se edita es la de la próxima emisión.
  const [proximaEmision, setProximaEmision] = useState('');
  useEffect(() => {
    if (!isOpen || !recurrente) return;
    setClientId(recurrente.client_id);
    setProjectId(recurrente.project_id || '');
    setItems(recurrente.items?.length ? recurrente.items.map(i => ({ ...i })) : [{ ...emptyItem }]);
    setTaxPercent(Number(recurrente.tax_percent) || 0);
    setFrequency(recurrente.frequency === 'yearly' ? 'yearly' : 'monthly');
    setProximaEmision(recurrente.next_due_date.slice(0, 10));
  }, [isOpen, recurrente]);

  const clientProjects = useMemo(() => projects.filter(p => p.client_id === clientId), [projects, clientId]);

  const totalCents = useMemo(
    () => items.reduce((sum, item) => sum + item.price_cents * item.quantity, 0),
    [items]
  );

  const resetForm = () => {
    setError(null);
    setClientId(clients[0]?.id || '');
    setProjectId('');
    setItems([{ ...emptyItem }]);
    setTaxPercent(21);
    setFrequency('monthly');
    setStartDate(new Date().toISOString().slice(0, 10));
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const updateItem = (index: number, field: keyof InvoiceItem, value: string | number) => {
    setItems(prev => {
      const next = [...prev];
      if (field === 'price_cents') {
        next[index] = { ...next[index], price_cents: Math.round(Number(value) * 100) };
      } else if (field === 'quantity') {
        next[index] = { ...next[index], quantity: Number(value) };
      } else {
        next[index] = { ...next[index], description: String(value) };
      }
      return next;
    });
  };

  const addItem = () => setItems(prev => [...prev, { ...emptyItem }]);
  const removeItem = (index: number) => setItems(prev => prev.length > 1 ? prev.filter((_, i) => i !== index) : prev);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId) return;

    setIsSubmitting(true);
    setError(null);
    try {
      if (recurrente) {
        await updateRecurringInvoice(recurrente.id, {
          client_id: clientId,
          project_id: projectId || null,
          items,
          tax_percent: taxPercent,
          frequency,
          next_due_date: proximaEmision || recurrente.next_due_date,
        });
      } else {
        await addRecurringInvoice({
          client_id: clientId,
          project_id: projectId || null,
          items,
          tax_percent: taxPercent,
          frequency,
          start_date: startDate,
        });
      }
      handleClose();
    } catch (err) {
      console.error('Error guardando la factura recurrente:', err);
      setError((err as Error)?.message || 'No se pudo guardar la factura recurrente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={recurrente ? 'Editar factura recurrente' : 'Nueva Factura Recurrente'}>
      <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">Cliente</label>
          <select
            className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-white"
            value={clientId}
            onChange={(e) => { setClientId(e.target.value); setProjectId(''); }}
            required
          >
            <option value="" disabled>Selecciona un cliente</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {clientProjects.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Proyecto (opcional)</label>
            <select
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-white"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">Sin proyecto asociado</option>
              {clientProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Frecuencia</label>
            <select
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-white"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as 'monthly' | 'yearly')}
            >
              <option value="monthly">Mensual</option>
              <option value="yearly">Anual</option>
            </select>
          </div>
          {recurrente ? (
            <Input
              label="Próxima emisión"
              type="date"
              value={proximaEmision}
              onChange={(e) => setProximaEmision(e.target.value)}
              required
            />
          ) : (
            <Input
              label="Fecha de inicio"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          )}
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-400">Conceptos</label>
          {items.map((item, index) => (
            <div key={index} className="flex gap-2 items-end">
              <div className="flex-1">
                <Input
                  value={item.description}
                  onChange={(e) => updateItem(index, 'description', e.target.value)}
                  placeholder="Descripción"
                  required
                />
              </div>
              <div className="w-20">
                <Input
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                />
              </div>
              <div className="w-32">
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={item.price_cents / 100}
                  onChange={(e) => updateItem(index, 'price_cents', e.target.value)}
                  placeholder="Precio"
                />
              </div>
              <Button type="button" variant="secondary" onClick={() => removeItem(index)}>
                <TrashIcon className="w-4 h-4 text-red-400" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="secondary" onClick={addItem} className="w-full">
            <PlusIcon className="w-4 h-4 mr-2" /> Añadir Concepto
          </Button>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">IVA (%)</label>
          <Input
            type="number"
            min={0}
            max={100}
            value={taxPercent}
            onChange={(e) => setTaxPercent(Number(e.target.value))}
          />
        </div>

        <div className="flex justify-between items-center pt-2 border-t border-gray-800 text-sm">
          <span className="text-gray-400">Total por emisión (base + IVA)</span>
          <span className="text-white font-bold">
            {formatCurrency(Math.round(totalCents * (1 + taxPercent / 100)))}
          </span>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <p className="text-xs text-gray-500">
          {recurrente ? 'Los cambios valen para las próximas facturas; las ya emitidas no se tocan. ' : ''}La primera factura se generará automáticamente en la fecha de inicio, y a partir de ahí cada {frequency === 'monthly' ? 'mes' : 'año'} — no hace falta que hagas nada más.
        </p>

        <div className="flex justify-end gap-3 mt-6">
          <Button type="button" variant="secondary" onClick={handleClose}>Cancelar</Button>
          <Button type="submit" disabled={isSubmitting || !clientId}>
            {isSubmitting ? 'Guardando...' : recurrente ? 'Guardar cambios' : 'Crear Factura Recurrente'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default CreateRecurringInvoiceModal;