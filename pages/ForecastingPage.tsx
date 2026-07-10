import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useAppStore } from '@/hooks/useAppStore';
import Card, { CardContent, CardHeader } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import { NewInvoice } from '@/types';
import { formatCurrency } from '@/lib/utils';
import { supabase } from '@/lib/supabaseClient';
import { PlusIcon as Plus, DownloadIcon as Download, TrashIcon as Trash, SendIcon as Send, SearchIcon as Search, RepeatIcon as Repeat, DollarSignIcon } from '@/components/icons/Icon';
import { useToast } from '@/hooks/useToast';
import RegisterPaymentModal from '@/components/modals/RegisterPaymentModal';
import { generateInvoicePdf } from '@/services/pdfService';
import { sendEmail } from '@/services/emailService';

interface PaymentSummary {
  paidCents: number;
  count: number;
}

interface InvoiceItemDraft {
  description: string;
  quantity: number;
  price_cents: number;
}

const InvoicesPage: React.FC = () => {
  const {
    invoices,
    recurringInvoices,
    clients,
    profile,
    getClientById,
    addInvoice,
    deleteInvoice,
    addRecurringInvoice,
    deleteRecurringInvoice,
  } = useAppStore();
  const { addToast } = useToast();

  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [isRecurringModalOpen, setIsRecurringModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sourceBudgetId, setSourceBudgetId] = useState<string>('');
  const [sourceContractId, setSourceContractId] = useState<string>('');

const { budgets, contracts } = useAppStore(); // añade budgets y contracts a la desestructuración de arriba
  // Estado de pagos: mapa invoice_id -> { paidCents, count }
  const [paymentsByInvoice, setPaymentsByInvoice] = useState<Record<string, PaymentSummary>>({});
  const [paymentModalInvoiceId, setPaymentModalInvoiceId] = useState<string | null>(null);

  const initialInvoiceState: NewInvoice = {
    client_id: '',
    project_id: '',
    items: [{ description: '', quantity: 1, price_cents: 0 }],
    tax_percent: 21,
    due_date: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    notes: '',
  };

  const [newInvoice, setNewInvoice] = useState<NewInvoice>(initialInvoiceState);

  // Editor de líneas de la factura nueva
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItemDraft[]>([
    { description: '', quantity: 1, price_cents: 0 },
  ]);
  const [taxPercent, setTaxPercent] = useState(21);
  const [irpfPercent, setIrpfPercent] = useState(0);

  const addItemRow = () => {
    setInvoiceItems(prev => [...prev, { description: '', quantity: 1, price_cents: 0 }]);
  };

  const removeItemRow = (index: number) => {
    setInvoiceItems(prev => prev.filter((_, i) => i !== index));
  };

  const updateItemRow = (index: number, field: 'description' | 'quantity' | 'price_cents', value: string) => {
    setInvoiceItems(prev => prev.map((item, i) => {
      if (i !== index) return item;
      if (field === 'description') return { ...item, description: value };
      if (field === 'quantity') return { ...item, quantity: Number(value) || 0 };
      // price_cents: el usuario escribe en euros, lo convertimos a céntimos
      return { ...item, price_cents: Math.round(Number(value) * 100) || 0 };
    }));
  };

  // Cálculo en vivo para mostrar en el modal
  const invoicePreview = useMemo(() => {
    const subtotal = invoiceItems.reduce((sum, item) => sum + item.price_cents * item.quantity, 0);
    const taxAmount = Math.round(subtotal * (taxPercent / 100));
    const irpfAmount = Math.round(subtotal * (irpfPercent / 100));
    const total = subtotal + taxAmount - irpfAmount;
    return { subtotal, taxAmount, irpfAmount, total };
  }, [invoiceItems, taxPercent, irpfPercent]);

  // Carga la suma de pagos de todas las facturas visibles de una sola vez
  const fetchPaymentsSummary = useCallback(async () => {
    if (invoices.length === 0) return;
    const invoiceIds = invoices.map(inv => inv.id);

    const { data, error } = await supabase
      .from('payments')
      .select('invoice_id, amount_cents')
      .in('invoice_id', invoiceIds);

    if (error) {
      console.error('Error cargando pagos:', error);
      return;
    }

    const summary: Record<string, PaymentSummary> = {};
    (data || []).forEach(p => {
      if (!summary[p.invoice_id]) summary[p.invoice_id] = { paidCents: 0, count: 0 };
      summary[p.invoice_id].paidCents += p.amount_cents;
      summary[p.invoice_id].count += 1;
    });

    setPaymentsByInvoice(summary);
  }, [invoices]);

  useEffect(() => {
    fetchPaymentsSummary();
  }, [fetchPaymentsSummary]);

  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      const client = clients.find(c => c.id === inv.client_id);
      return (
        inv.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client?.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    });
  }, [invoices, clients, searchTerm]);

  const handleAddInvoice = async (e: React.FormEvent) => {
    e.preventDefault();

    if (invoiceItems.some(item => !item.description.trim())) {
      addToast('Todas las líneas necesitan una descripción.', 'error');
      return;
    }
    if (invoicePreview.subtotal <= 0) {
      addToast('El importe de la factura no puede ser 0€.', 'error');
      return;
    }

    try {
      const payload = {
  ...newInvoice,
  items: invoiceItems,
  tax_percent: taxPercent,
  irpf_percent: irpfPercent,
  project_id: newInvoice.project_id || null,
  notes: newInvoice.notes || null,
  issue_date: new Date().toISOString().split('T')[0],
  budget_id: sourceBudgetId || null,      // 🆕
  contract_id: sourceContractId || null,  // 🆕
};
      await addInvoice(payload);
      setIsInvoiceModalOpen(false);
      setNewInvoice(initialInvoiceState);
      setInvoiceItems([{ description: '', quantity: 1, price_cents: 0 }]);
      setTaxPercent(21);
      setIrpfPercent(0);
      addToast('Factura creada correctamente', 'success');
    } catch (error: any) {
      addToast(error.message || 'Error al crear factura', 'error');
    }
  };

  const handleCloseInvoiceModal = () => {
    setIsInvoiceModalOpen(false);
    setNewInvoice(initialInvoiceState);
    setInvoiceItems([{ description: '', quantity: 1, price_cents: 0 }]);
    setTaxPercent(21);
    setIrpfPercent(0);
  };

  const availableBudgets = useMemo(() => {
  if (!newInvoice.client_id) return [];
  return budgets.filter(b => b.client_id === newInvoice.client_id && b.status === 'accepted');
}, [budgets, newInvoice.client_id]);

const availableContracts = useMemo(() => {
  if (!newInvoice.client_id) return [];
  return contracts.filter(c => c.client_id === newInvoice.client_id && c.status === 'signed');
}, [contracts, newInvoice.client_id]);

const handleSelectBudget = (budgetId: string) => {
  setSourceBudgetId(budgetId);
  if (!budgetId) return;

  const budget = budgets.find(b => b.id === budgetId);
  if (budget?.items && Array.isArray(budget.items) && budget.items.length > 0) {
    setInvoiceItems(budget.items.map((item: any) => ({
      description: item.description,
      quantity: item.quantity,
      price_cents: item.price_cents,
    })));
    addToast('Líneas e importe autorrellenados desde el presupuesto.', 'success');
  }
};


  const getClientName = (clientId: string) => {
    return clients.find(c => c.id === clientId)?.name || 'Cliente desconocido';
  };

  // Genera y descarga el PDF de la factura usando el servicio ya existente
  // (pdfService.ts) que hasta ahora no estaba conectado a ningún botón.
  const handleDownloadPdf = async (invoice: typeof invoices[number]) => {
    const client = getClientById(invoice.client_id);
    if (!client) {
      addToast('No se encontró el cliente de esta factura.', 'error');
      return;
    }
    if (!profile) {
      addToast('No se pudo cargar tu perfil para generar el PDF.', 'error');
      return;
    }
    try {
      await generateInvoicePdf(invoice, client, profile);
    } catch (error) {
      console.error('Error generando el PDF:', error);
      addToast('No se pudo generar el PDF de la factura.', 'error');
    }
  };

  // Abre el cliente de correo del usuario con un borrador prellenado.
  // IMPORTANTE: esto NO envía el email en segundo plano por sí solo —
  // abre la app de correo (Gmail, Outlook, Mail...) con el mensaje ya
  // redactado para que el usuario pulse "Enviar" desde ahí. Enviar el
  // email automáticamente sin intervención requeriría una Edge Function
  // de backend (ej. con Resend) que hoy no existe en el proyecto.
  const handleSendEmailInvoice = (invoice: typeof invoices[number]) => {
    const client = getClientById(invoice.client_id);
    if (!client?.email) {
      addToast('Este cliente no tiene email registrado.', 'error');
      return;
    }
    const subject = `Factura ${invoice.invoice_number}`;
    const body = `Hola ${client.name},\n\nAdjunto la factura ${invoice.invoice_number} por un importe de ${formatCurrency(invoice.total_cents)}.\n\nUn saludo.`;
    sendEmail(client.email, subject, body);
    addToast('Se abrió tu cliente de correo con el borrador de la factura.', 'success');
  };

  // Devuelve el estado real de cobro combinando `paid` (booleano, sincronizado por trigger)
  // con el importe parcial acumulado, para mostrar 4 estados: pagada / parcial / pendiente / sin importe
  const getPaymentStatus = (invoiceId: string, totalCents: number, isPaidFlag: boolean) => {
    const summary = paymentsByInvoice[invoiceId];
    const trackedPaidCents = summary?.paidCents ?? 0;
    const paidCents = isPaidFlag && trackedPaidCents === 0 ? totalCents : trackedPaidCents;

    // Una factura sin importe nunca debe considerarse "pagada" —
    // exigimos totalCents > 0 explícitamente para evitar el caso 0 >= 0
    if (totalCents > 0 && (isPaidFlag || paidCents >= totalCents)) {
      return { label: 'PAGADA', className: 'bg-green-500/10 text-green-400 border-green-500/30', paidCents };
    }
    if (paidCents > 0) {
      return { label: 'PARCIAL', className: 'bg-blue-500/10 text-blue-400 border-blue-500/30', paidCents };
    }
    if (totalCents === 0) {
      return { label: 'SIN IMPORTE', className: 'bg-gray-500/10 text-gray-400 border-gray-500/30', paidCents };
    }
    return { label: 'PENDIENTE', className: 'bg-orange-500/10 text-orange-400 border-orange-500/30', paidCents };
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Facturación</h1>
          <p className="text-gray-400">Gestiona tus facturas, cobros parciales y facturación recurrente</p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => setIsRecurringModalOpen(true)}>
            <Repeat className="w-4 h-4 mr-2" />
            Factura Recurrente
          </Button>
          <Button onClick={() => setIsInvoiceModalOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Nueva Factura
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input
              type="text"
              placeholder="Buscar por número o cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-10 pr-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all"
            />
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wider">
                      <th className="px-6 py-4 font-medium">Nº Factura</th>
                      <th className="px-6 py-4 font-medium">Cliente</th>
                      <th className="px-6 py-4 font-medium">Vencimiento</th>
                      <th className="px-6 py-4 font-medium text-right">Total</th>
                      <th className="px-6 py-4 font-medium">Cobrado</th>
                      <th className="px-6 py-4 font-medium text-center">Estado</th>
                      <th className="px-6 py-4 font-medium text-center sticky right-0 bg-gray-900">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {filteredInvoices.map((inv) => {
                      const status = getPaymentStatus(inv.id, inv.total_cents, inv.paid);
                      const remainingCents = Math.max(inv.total_cents - status.paidCents, 0);
                      const progressPct = inv.total_cents > 0
                        ? Math.min((status.paidCents / inv.total_cents) * 100, 100)
                        : 0;

                      return (
                        <tr key={inv.id} className="text-sm text-gray-300 hover:bg-gray-800/30 transition-colors">
                          <td className="px-6 py-4 font-mono text-white">{inv.invoice_number}</td>
                          <td className="px-6 py-4">{getClientName(inv.client_id)}</td>
                          <td className="px-6 py-4">{new Date(inv.due_date).toLocaleDateString()}</td>
                          <td className="px-6 py-4 text-right font-bold text-white">{formatCurrency(inv.total_cents)}</td>

                          <td className="px-6 py-4 min-w-[140px]">
                            <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                              <span>{formatCurrency(status.paidCents)}</span>
                              {remainingCents > 0 && <span>Restan {formatCurrency(remainingCents)}</span>}
                            </div>
                            <div className="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all duration-500 ${status.label === 'PAGADA' ? 'bg-green-500' : 'bg-blue-500'}`}
                                style={{ width: `${progressPct}%` }}
                              />
                            </div>
                          </td>

                          <td className="px-6 py-4 text-center">
                            <span className={`px-2 py-1 rounded-full text-[10px] font-bold border ${status.className}`}>
                              {status.label}
                            </span>
                          </td>
                          <td className="px-6 py-4 sticky right-0 bg-gray-900/95 backdrop-blur-sm">
                            <div className="flex items-center justify-center gap-2">
                              {status.label !== 'PAGADA' && (
                                <button
                                  onClick={() => setPaymentModalInvoiceId(inv.id)}
                                  className="p-2 text-gray-400 hover:text-green-400 transition-colors"
                                  title="Registrar pago"
                                >
                                  <DollarSignIcon className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                onClick={() => handleDownloadPdf(inv)}
                                className="p-2 text-gray-400 hover:text-white transition-colors"
                                title="Descargar PDF"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleSendEmailInvoice(inv)}
                                className="p-2 text-gray-400 hover:text-primary-400 transition-colors"
                                title="Enviar por Email"
                              >
                                <Send className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => deleteInvoice(inv.id)}
                                className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                                title="Eliminar"
                              >
                                <Trash className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <h3 className="text-lg font-bold text-white">Facturación Recurrente</h3>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              {recurringInvoices.map((ri) => (
                <div key={ri.id} className="p-3 bg-gray-800/50 rounded-lg border border-gray-700 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm font-bold text-white">{getClientName(ri.client_id)}</p>
                      <p className="text-xs text-gray-500 capitalize">{ri.frequency}</p>
                    </div>
                    <button
                      onClick={() => deleteRecurringInvoice(ri.id)}
                      className="text-gray-500 hover:text-red-500 transition-colors"
                    >
                      <Trash className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <Modal isOpen={isInvoiceModalOpen} onClose={handleCloseInvoiceModal} title="Nueva Factura">
        <form onSubmit={handleAddInvoice} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Cliente</label>
            <select
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white"
              value={newInvoice.client_id}
              onChange={(e) => setNewInvoice({ ...newInvoice, client_id: e.target.value })}
              required
            >
              <option value="">Seleccionar cliente</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
              {newInvoice.client_id && (
  <>
    <div>
      <label className="block text-sm font-medium text-gray-400 mb-1">
        Origen — Presupuesto (opcional, autorrellena importe)
      </label>
      <select
        className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white"
        value={sourceBudgetId}
        onChange={(e) => handleSelectBudget(e.target.value)}
      >
        <option value="">Sin presupuesto — rellenar manualmente</option>
        {availableBudgets.map(b => (
          <option key={b.id} value={b.id}>
            {b.description} — {formatCurrency(b.amount_cents || 0)}
          </option>
        ))}
      </select>
      {availableBudgets.length === 0 && (
        <p className="text-xs text-gray-500 mt-1">Este cliente no tiene presupuestos aceptados.</p>
      )}
    </div>

    <div>
      <label className="block text-sm font-medium text-gray-400 mb-1">
        Contrato relacionado (opcional, solo trazabilidad)
      </label>
      <select
        className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white"
        value={sourceContractId}
        onChange={(e) => setSourceContractId(e.target.value)}
      >
        <option value="">Sin contrato vinculado</option>
        {availableContracts.map(c => (
          <option key={c.id} value={c.id}>
            Contrato firmado el {c.signed_at ? new Date(c.signed_at).toLocaleDateString() : '—'}
          </option>
        ))}
      </select>
    </div>
  </>
)}
          </div>

          <Input
            label="Fecha Vencimiento"
            type="date"
            value={newInvoice.due_date}
            onChange={(e) => setNewInvoice({ ...newInvoice, due_date: e.target.value })}
          />

          {/* Editor de líneas */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-gray-400">Conceptos</label>
              <button type="button" onClick={addItemRow} className="text-xs text-primary-400 hover:underline">
                + Añadir línea
              </button>
            </div>
            <div className="space-y-2">
              {invoiceItems.map((item, index) => (
                <div key={index} className="flex gap-2 items-start">
                  <input
                    type="text"
                    placeholder="Descripción"
                    value={item.description}
                    onChange={(e) => updateItemRow(index, 'description', e.target.value)}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white"
                    required
                  />
                  <input
                    type="number"
                    min={1}
                    placeholder="Cant."
                    value={item.quantity}
                    onChange={(e) => updateItemRow(index, 'quantity', e.target.value)}
                    className="w-16 bg-gray-800 border border-gray-700 rounded-md px-2 py-2 text-sm text-white"
                  />
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    placeholder="€/ud"
                    value={item.price_cents / 100}
                    onChange={(e) => updateItemRow(index, 'price_cents', e.target.value)}
                    className="w-24 bg-gray-800 border border-gray-700 rounded-md px-2 py-2 text-sm text-white"
                  />
                  {invoiceItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItemRow(index)}
                      className="text-gray-500 hover:text-red-500 px-2"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* IVA / IRPF */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">IVA (%)</label>
              <input
                type="number"
                min={0}
                value={taxPercent}
                onChange={(e) => setTaxPercent(Number(e.target.value) || 0)}
                className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">IRPF (%)</label>
              <input
                type="number"
                min={0}
                value={irpfPercent}
                onChange={(e) => setIrpfPercent(Number(e.target.value) || 0)}
                className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white"
              />
            </div>
          </div>

          {/* Resumen en vivo */}
          <div className="bg-gray-800/50 rounded-lg p-3 space-y-1 text-sm">
            <div className="flex justify-between text-gray-400">
              <span>Subtotal</span><span>{formatCurrency(invoicePreview.subtotal)}</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>IVA ({taxPercent}%)</span><span>+{formatCurrency(invoicePreview.taxAmount)}</span>
            </div>
            {irpfPercent > 0 && (
              <div className="flex justify-between text-gray-400">
                <span>IRPF ({irpfPercent}%)</span><span>-{formatCurrency(invoicePreview.irpfAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-white font-bold pt-1 border-t border-gray-700">
              <span>Total</span><span>{formatCurrency(invoicePreview.total)}</span>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <Button type="button" variant="secondary" onClick={handleCloseInvoiceModal}>Cancelar</Button>
            <Button type="submit">Generar Factura</Button>
          </div>
        </form>
      </Modal>

      {/* Modal de registro de pagos parciales */}
      {paymentModalInvoiceId && (() => {
        const inv = invoices.find(i => i.id === paymentModalInvoiceId);
        if (!inv) return null;
        const paidCents = paymentsByInvoice[inv.id]?.paidCents ?? 0;
        const remainingCents = Math.max(inv.total_cents - paidCents, 0);

        return (
          <RegisterPaymentModal
            isOpen={true}
            onClose={() => setPaymentModalInvoiceId(null)}
            invoiceId={inv.id}
            remainingCents={remainingCents}
            onPaymentRegistered={fetchPaymentsSummary}
          />
        );
      })()}
    </div>
  );
};

export default InvoicesPage;
