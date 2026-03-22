import React, { useState, useMemo, useEffect, lazy, Suspense } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppStore } from '@/hooks/useAppStore';
import Card, { CardContent, CardHeader, CardFooter } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import { InvoiceItem } from '@/types';
import { PlusIcon, TrashIcon, SparklesIcon, RepeatIcon } from '@/components/icons/Icon';
import { useToast } from '@/hooks/useToast';
import { generateItemsForDocument, AI_CREDIT_COSTS } from '@/services/geminiService';
import { formatCurrency, calculateInvoiceTotals } from '@/lib/utils';

// Carga diferida — el modal de créditos solo se descarga si el usuario lo necesita
const BuyCreditsModal = lazy(() => import('@/components/modals/BuyCreditsModal'));

const CreateInvoicePage: React.FC = () => {
  const {
    clients,
    projects,
    timeEntries,
    profile,
    addInvoice,
    addRecurringInvoice,
    consumeCredits,
  } = useAppStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { addToast } = useToast();

  const initialInvoiceState = {
    client_id: clients[0]?.id || '',
    project_id: '',
    issue_date: new Date().toISOString().split('T')[0],
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    items: [{ description: '', quantity: 1, price_cents: 0 }] as InvoiceItem[],
    tax_percent: 21,
    irpf_percent: 0,
    isRecurring: false,
    frequency: 'monthly' as 'monthly' | 'yearly',
    start_date: new Date().toISOString().split('T')[0],
  };

  const [newInvoice, setNewInvoice] = useState(initialInvoiceState);
  const [timeEntryIdsToBill, setTimeEntryIdsToBill] = useState<string[]>([]);
  const [isAIGeneratorOpen, setIsAIGeneratorOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isBuyCreditsModalOpen, setIsBuyCreditsModalOpen] = useState(false);

  // ── Carga inicial desde navegación con state (time entries, presupuestos…) ──
  useEffect(() => {
    const { projectId, clientId, timeEntryIds, budgetItems } = location.state || {};

    if (clientId && projectId && timeEntryIds?.length > 0) {
      setTimeEntryIdsToBill(timeEntryIds);
      const entriesToBill = timeEntries.filter((t) => timeEntryIds.includes(t.id));
      const totalHours =
        entriesToBill.reduce((sum, entry) => sum + entry.duration_seconds, 0) / 3600;

      if (totalHours > 0) {
        const newItem: InvoiceItem = {
          description: `Desarrollo y consultoría (${totalHours.toFixed(2)} horas)`,
          quantity: 1,
          price_cents: Math.round(totalHours * profile.hourly_rate_cents),
        };
        setNewInvoice((prev) => ({
          ...prev,
          client_id: clientId,
          project_id: projectId,
          items: [newItem],
        }));
        addToast('Horas cargadas correctamente.', 'info');
      }
    } else if (clientId && projectId && budgetItems?.length > 0) {
      setNewInvoice((prev) => ({
        ...prev,
        client_id: clientId,
        project_id: projectId,
        items: budgetItems,
      }));
      addToast('Datos importados del presupuesto.', 'info');
    } else if (clientId && projectId) {
      setNewInvoice((prev) => ({ ...prev, client_id: clientId, project_id: projectId }));
    }

    window.history.replaceState({}, document.title);
  }, [location.state, timeEntries, profile.hourly_rate_cents, addToast]);

  // ── Cálculos en tiempo real — misma lógica que el PDF para garantizar consistencia ──
  const totals = useMemo(
    () => calculateInvoiceTotals(newInvoice.items, newInvoice.tax_percent, newInvoice.irpf_percent),
    [newInvoice.items, newInvoice.tax_percent, newInvoice.irpf_percent]
  );

  const clientProjects = useMemo(
    () => projects.filter((p) => p.client_id === newInvoice.client_id),
    [projects, newInvoice.client_id]
  );

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
    setNewInvoice((prev) => ({ ...prev, [name]: val }));
  };

  const handleItemChange = (index: number, field: keyof InvoiceItem, value: string | number) => {
    const updatedItems = [...newInvoice.items];
    if (field === 'price_cents') {
      updatedItems[index][field] = Math.round(Number(value) * 100);
    } else if (field === 'quantity') {
      updatedItems[index][field] = Number(value);
    } else {
      updatedItems[index][field] = value as string;
    }
    setNewInvoice((prev) => ({ ...prev, items: updatedItems }));
  };

  const addItem = () => {
    setNewInvoice((prev) => ({
      ...prev,
      items: [...prev.items, { description: '', quantity: 1, price_cents: 0 }],
    }));
  };

  const removeItem = (index: number) => {
    if (newInvoice.items.length > 1) {
      setNewInvoice((prev) => ({
        ...prev,
        items: prev.items.filter((_, i) => i !== index),
      }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (newInvoice.isRecurring) {
      addRecurringInvoice({
        client_id: newInvoice.client_id,
        project_id: newInvoice.project_id || null,
        items: newInvoice.items,
        tax_percent: newInvoice.tax_percent,
        frequency: newInvoice.frequency,
        start_date: newInvoice.start_date,
      });
    } else {
      addInvoice(
        {
          client_id: newInvoice.client_id,
          project_id: newInvoice.project_id || null,
          issue_date: newInvoice.issue_date,
          due_date: newInvoice.due_date,
          items: newInvoice.items,
          tax_percent: newInvoice.tax_percent,
          irpf_percent: newInvoice.irpf_percent,
        },
        timeEntryIdsToBill
      );
    }

    addToast('Factura procesada con éxito.', 'success');
    navigate('/invoices');
  };

  const handleAiGenerate = async () => {
    if (profile.ai_credits < AI_CREDIT_COSTS.generateInvoiceItems) {
      setIsBuyCreditsModalOpen(true);
      return;
    }
    setIsAiLoading(true);
    try {
      const items = await generateItemsForDocument(aiPrompt, profile.hourly_rate_cents);
      if (items?.length > 0) {
        setNewInvoice((prev) => ({ ...prev, items }));
        consumeCredits(AI_CREDIT_COSTS.generateInvoiceItems);
        setIsAIGeneratorOpen(false);
        addToast('Conceptos generados.', 'success');
      }
    } catch {
      addToast('Error al generar con IA.', 'error');
    } finally {
      setIsAiLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-5xl mx-auto pb-20">

      {/* Cabecera */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-white">Nueva Factura</h1>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={() => navigate('/invoices')}>
            Descartar
          </Button>
          <Button type="submit">Guardar Factura</Button>
        </div>
      </div>

      {/* Cliente y proyecto */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-white">Cliente y Proyecto</h2>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Cliente</label>
            <select
              name="client_id"
              value={newInvoice.client_id}
              onChange={handleInputChange}
              required
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              <option value="" disabled>Selecciona un cliente…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Proyecto (opcional)</label>
            <select
              name="project_id"
              value={newInvoice.project_id}
              onChange={handleInputChange}
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              <option value="">Sin proyecto</option>
              {clientProjects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Fechas e impuestos */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-white">Fechas e Impuestos</h2>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Input label="Fecha emisión" type="date" name="issue_date" value={newInvoice.issue_date} onChange={handleInputChange} />
          <Input label="Fecha vencimiento" type="date" name="due_date" value={newInvoice.due_date} onChange={handleInputChange} />
          <Input label="IVA (%)" type="number" name="tax_percent" value={newInvoice.tax_percent} onChange={handleInputChange} min={0} max={100} />
          <Input label="IRPF (%)" type="number" name="irpf_percent" value={newInvoice.irpf_percent} onChange={handleInputChange} min={0} max={100} />
        </CardContent>
      </Card>

      {/* Factura recurrente */}
      <Card>
        <CardContent className="flex items-center gap-4 py-4">
          <input
            type="checkbox"
            id="isRecurring"
            name="isRecurring"
            checked={newInvoice.isRecurring}
            onChange={handleInputChange}
            className="w-4 h-4 accent-primary-500"
          />
          <label htmlFor="isRecurring" className="text-sm text-gray-300 flex items-center gap-2 cursor-pointer">
            <RepeatIcon className="w-4 h-4 text-primary-400" />
            Factura recurrente
          </label>
          {newInvoice.isRecurring && (
            <>
              <select
                name="frequency"
                value={newInvoice.frequency}
                onChange={handleInputChange}
                className="bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="monthly">Mensual</option>
                <option value="yearly">Anual</option>
              </select>
              <Input label="Inicio" type="date" name="start_date" value={newInvoice.start_date} onChange={handleInputChange} />
            </>
          )}
        </CardContent>
      </Card>

      {/* Líneas de factura */}
      <Card>
        <CardHeader className="flex justify-between items-center border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white">Líneas de Factura</h2>
          <Button type="button" variant="secondary" size="sm" onClick={() => setIsAIGeneratorOpen(true)}>
            <SparklesIcon className="w-4 h-4 mr-2 text-primary-400" />
            Autogenerar con IA
          </Button>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          {newInvoice.items.map((item, index) => (
            <div key={index} className="flex gap-3 items-start bg-gray-900/30 p-3 rounded-xl border border-gray-800">
              <div className="flex-1">
                <Input
                  label="Descripción"
                  value={item.description}
                  onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                  placeholder="Ej: Desarrollo Frontend…"
                />
              </div>
              <div className="w-24">
                <Input
                  label="Cant."
                  type="number"
                  step="0.1"
                  value={item.quantity}
                  onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                />
              </div>
              <div className="w-32">
                <Input
                  label="Precio (€)"
                  type="number"
                  step="0.01"
                  value={item.price_cents / 100}
                  onChange={(e) => handleItemChange(index, 'price_cents', e.target.value)}
                />
              </div>
              <div className="pt-7">
                <Button type="button" variant="danger" size="sm" onClick={() => removeItem(index)}>
                  <TrashIcon className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}

          <Button
            type="button"
            variant="secondary"
            className="w-full border-dashed border-2 py-4"
            onClick={addItem}
          >
            <PlusIcon className="w-4 h-4 mr-2" /> Añadir otra línea
          </Button>

          {/* Resumen de totales */}
          <div className="mt-8 ml-auto max-w-xs space-y-3 bg-gray-900/50 p-6 rounded-2xl border border-primary-500/20">
            <div className="flex justify-between text-gray-400 text-sm">
              <span>Base Imponible</span>
              <span>{formatCurrency(totals.subtotal)}</span>
            </div>
            <div className="flex justify-between text-gray-400 text-sm">
              <span>IVA ({newInvoice.tax_percent}%)</span>
              <span>{formatCurrency(totals.taxAmount)}</span>
            </div>
            {newInvoice.irpf_percent > 0 && (
              <div className="flex justify-between text-orange-400/80 text-sm">
                <span>IRPF (-{newInvoice.irpf_percent}%)</span>
                <span>-{formatCurrency(totals.irpfAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-white font-bold text-xl border-t border-gray-700 pt-3 mt-3">
              <span>TOTAL</span>
              <span className="text-primary-400">{formatCurrency(totals.total)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Modal generador IA */}
      <Modal isOpen={isAIGeneratorOpen} onClose={() => setIsAIGeneratorOpen(false)} title="Generar conceptos con IA">
        <div className="space-y-4">
          <textarea
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            rows={4}
            placeholder="Describe el trabajo realizado y la IA generará las líneas de factura…"
            className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none"
          />
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setIsAIGeneratorOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleAiGenerate} disabled={isAiLoading || !aiPrompt.trim()}>
              <SparklesIcon className="w-4 h-4 mr-2" />
              {isAiLoading ? 'Generando…' : 'Generar'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal compra de créditos — carga diferida */}
      <Suspense fallback={null}>
        {isBuyCreditsModalOpen && (
          <BuyCreditsModal
            isOpen={isBuyCreditsModalOpen}
            onClose={() => setIsBuyCreditsModalOpen(false)}
          />
        )}
      </Suspense>
    </form>
  );
};

export default CreateInvoicePage;
