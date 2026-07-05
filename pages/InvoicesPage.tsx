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

interface PaymentSummary {
  paidCents: number;
  count: number;
}

const InvoicesPage: React.FC = () => {
  const {
    invoices,
    recurringInvoices,
    clients,
    addInvoice,
    deleteInvoice,
    addRecurringInvoice,
    deleteRecurringInvoice,
  } = useAppStore();
  const { addToast } = useToast();

  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [isRecurringModalOpen, setIsRecurringModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // 🆕 Estado de pagos: mapa invoice_id -> { paidCents, count }
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

  // 🆕 Carga la suma de pagos de todas las facturas visibles de una sola vez
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
    try {
      await addInvoice(newInvoice);
      setIsInvoiceModalOpen(false);
      setNewInvoice(initialInvoiceState);
      addToast('Factura creada correctamente', 'success');
    } catch (error: any) {
      addToast(error.message || 'Error al crear factura', 'error');
    }
  };

  const getClientName = (clientId: string) => {
    return clients.find(c => c.id === clientId)?.name || 'Cliente desconocido';
  };

  // 🆕 Devuelve el estado real de cobro combinando `paid` (booleano, sincronizado por trigger)
  // con el importe parcial acumulado, para mostrar 3 estados: pagada / parcial / pendiente
  const getPaymentStatus = (invoiceId: string, totalCents: number, isPaidFlag: boolean) => {
    const summary = paymentsByInvoice[invoiceId];
    const paidCents = summary?.paidCents ?? 0;

    if (isPaidFlag || paidCents >= totalCents) {
      return { label: 'PAGADA', className: 'bg-green-500/10 text-green-400 border-green-500/30', paidCents };
    }
    if (paidCents > 0) {
      return { label: 'PARCIAL', className: 'bg-blue-500/10 text-blue-400 border-blue-500/30', paidCents };
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
          <Button variant="outline" onClick={() => setIsRecurringModalOpen(true)}>
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
                      <th className="px-6 py-4 font-medium text-center">Acciones</th>
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

                          {/* 🆕 Columna de cobro: barra de progreso + importe cobrado/restante */}
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
                          <td className="px-6 py-4">
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
                              <button className="p-2 text-gray-400 hover:text-white transition-colors" title="Descargar PDF">
                                <Download className="w-4 h-4" />
                              </button>
                              <button className="p-2 text-gray-400 hover:text-primary-400 transition-colors" title="Enviar por Email">
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

      <Modal isOpen={isInvoiceModalOpen} onClose={() => setIsInvoiceModalOpen(false)} title="Nueva Factura">
        <form onSubmit={handleAddInvoice} className="space-y-4">
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
          </div>
          <Input
            label="Fecha Vencimiento"
            type="date"
            value={newInvoice.due_date}
            onChange={(e) => setNewInvoice({ ...newInvoice, due_date: e.target.value })}
          />
          <div className="flex justify-end gap-3 mt-6">
            <Button type="button" variant="outline" onClick={() => setIsInvoiceModalOpen(false)}>Cancelar</Button>
            <Button type="submit">Generar Factura</Button>
          </div>
        </form>
      </Modal>

      {/* 🆕 Modal de registro de pagos parciales */}
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