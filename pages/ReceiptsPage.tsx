// pages/ReceiptsPage.tsx
// Recibos sueltos: cobros de trabajos informales o parciales que no pasan
// por la facturación formal (con IVA/IRPF y numeración legal), pero de los
// que el cliente quiere una constancia por escrito de lo que ha pagado.
import React, { useState, useMemo } from 'react';
import { useAppStore } from '@/hooks/useAppStore';
import { useToast } from '@/hooks/useToast';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import EmptyState from '@/components/ui/EmptyState';
import { Receipt as ReceiptIcon, Plus, Download, Send, Trash2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { generateReceiptPdf } from '@/services/pdfService';
import { sendEmail } from '@/services/emailService';
import { Receipt } from '@/types';

const initialFormState = {
  client_id: '',
  project_id: '',
  concept: '',
  amount: '',
  paid_at: new Date().toISOString().slice(0, 10),
  method: 'Efectivo',
  notes: '',
};

const ReceiptsPage: React.FC = () => {
  const { receipts, clients, projects, profile, addReceipt, deleteReceipt } = useAppStore();
  const { addToast } = useToast();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(initialFormState);
  const [saving, setSaving] = useState(false);
  const [receiptToDelete, setReceiptToDelete] = useState<Receipt | null>(null);

  const getClientName = (clientId: string | null) => clients.find(c => c.id === clientId)?.name || 'Cliente sin especificar';
  const getClientEmail = (clientId: string | null) => clients.find(c => c.id === clientId)?.email;

  const clientProjects = useMemo(
    () => projects.filter(p => p.client_id === form.client_id),
    [projects, form.client_id]
  );

  const openModal = () => {
    setForm(initialFormState);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountCents = Math.round(Number(form.amount) * 100);
    if (!amountCents || amountCents <= 0) {
      addToast('Introduce un importe válido.', 'error');
      return;
    }
    if (!form.concept.trim()) {
      addToast('Indica el concepto del recibo.', 'error');
      return;
    }

    setSaving(true);
    try {
      await addReceipt({
        client_id: form.client_id || null,
        project_id: form.project_id || null,
        concept: form.concept.trim(),
        amount_cents: amountCents,
        paid_at: form.paid_at,
        method: form.method,
        notes: form.notes.trim() || null,
      });
      addToast('Recibo creado correctamente.', 'success');
      setIsModalOpen(false);
    } catch (err) {
      addToast((err as Error).message || 'No se pudo crear el recibo.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = (receipt: Receipt) => {
    if (!profile) return;
    generateReceiptPdf(receipt, getClientName(receipt.client_id), profile);
  };

  const handleSendEmail = (receipt: Receipt) => {
    const email = getClientEmail(receipt.client_id);
    if (!email) {
      addToast('Este cliente no tiene email registrado.', 'error');
      return;
    }
    if (!profile) return;
    generateReceiptPdf(receipt, getClientName(receipt.client_id), profile);

    const subject = `Recibo ${receipt.receipt_number}`;
    const body = `Hola ${getClientName(receipt.client_id)},\n\nTe envío el recibo ${receipt.receipt_number} por un importe de ${formatCurrency(receipt.amount_cents)}, en concepto de: ${receipt.concept}.\n\nAdjunto el PDF a este email.\n\nUn saludo.`;
    sendEmail(email, subject, body);
    addToast('PDF descargado y borrador de email abierto. Adjunta el PDF descargado antes de enviarlo.', 'success');
  };

  const confirmDelete = async () => {
    if (!receiptToDelete) return;
    try {
      await deleteReceipt(receiptToDelete.id);
      addToast('Recibo eliminado.', 'info');
    } catch (err) {
      addToast((err as Error).message || 'No se pudo eliminar el recibo.', 'error');
    } finally {
      setReceiptToDelete(null);
    }
  };

  const totalCollected = receipts.reduce((sum, r) => sum + r.amount_cents, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ReceiptIcon className="w-6 h-6" /> Recibos
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Cobros sueltos o parciales que no pasan por la facturación formal — el cliente se queda con el PDF como constancia.
          </p>
        </div>
        <Button onClick={openModal}>
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Recibo
        </Button>
      </div>

      {receipts.length > 0 && (
        <Card>
          <CardContent className="flex items-center justify-between py-4">
            <span className="text-gray-400 text-sm">Total cobrado en recibos</span>
            <span className="text-xl font-bold text-white">{formatCurrency(totalCollected)}</span>
          </CardContent>
        </Card>
      )}

      {receipts.length === 0 ? (
        <EmptyState
          icon={ReceiptIcon}
          title="Todavía no has creado ningún recibo"
          message="Úsalos para trabajos informales o cobros parciales de los que quieras dejar constancia sin pasar por una factura formal."
          action={{ text: 'Nuevo Recibo', onClick: openModal }}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="border-b border-gray-800">
                  <tr>
                    <th className="p-4">Nº</th>
                    <th className="p-4">Cliente</th>
                    <th className="p-4">Concepto</th>
                    <th className="p-4">Fecha</th>
                    <th className="p-4 text-right">Importe</th>
                    <th className="p-4 text-right sticky right-0 bg-gray-900">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {receipts.map(receipt => (
                    <tr key={receipt.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                      <td className="p-4 font-mono text-sm text-gray-400">{receipt.receipt_number}</td>
                      <td className="p-4 text-white font-medium">{getClientName(receipt.client_id)}</td>
                      <td className="p-4 text-gray-300 max-w-xs truncate">{receipt.concept}</td>
                      <td className="p-4 text-gray-400">{receipt.paid_at}</td>
                      <td className="p-4 text-right font-semibold text-white">{formatCurrency(receipt.amount_cents)}</td>
                      <td className="p-4 text-right sticky right-0 bg-gray-900/95 backdrop-blur-sm">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="secondary" onClick={() => handleDownload(receipt)} title="Descargar PDF">
                            <Download className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => handleSendEmail(receipt)} title="Enviar por email">
                            <Send className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => setReceiptToDelete(receipt)} title="Eliminar">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Nuevo Recibo">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Cliente (opcional)</label>
            <select
              value={form.client_id}
              onChange={(e) => setForm(prev => ({ ...prev, client_id: e.target.value, project_id: '' }))}
              className="w-full p-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-primary-500 outline-none"
            >
              <option value="">Sin cliente asociado</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {form.client_id && clientProjects.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Proyecto (opcional)</label>
              <select
                value={form.project_id}
                onChange={(e) => setForm(prev => ({ ...prev, project_id: e.target.value }))}
                className="w-full p-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-primary-500 outline-none"
              >
                <option value="">Sin proyecto asociado</option>
                {clientProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}

          <Input
            label="Concepto"
            value={form.concept}
            onChange={(e) => setForm(prev => ({ ...prev, concept: e.target.value }))}
            placeholder="Ej. Conectar el PC y el móvil a la TV"
            required
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Importe (€)"
              type="number"
              min={0.01}
              step={0.01}
              value={form.amount}
              onChange={(e) => setForm(prev => ({ ...prev, amount: e.target.value }))}
              required
            />
            <Input
              label="Fecha"
              type="date"
              value={form.paid_at}
              onChange={(e) => setForm(prev => ({ ...prev, paid_at: e.target.value }))}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Método de pago</label>
            <select
              value={form.method}
              onChange={(e) => setForm(prev => ({ ...prev, method: e.target.value }))}
              className="w-full p-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-primary-500 outline-none"
            >
              <option value="Efectivo">Efectivo</option>
              <option value="Transferencia">Transferencia</option>
              <option value="Tarjeta">Tarjeta</option>
              <option value="Bizum">Bizum</option>
              <option value="Otro">Otro</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Notas (opcional)</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
              rows={2}
              className="w-full p-2 bg-gray-800 text-white rounded-lg border border-gray-700 resize-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Crear Recibo'}</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!receiptToDelete} onClose={() => setReceiptToDelete(null)} title="¿Eliminar recibo?">
        <div className="space-y-4">
          <p className="text-gray-300">
            ¿Seguro que quieres eliminar el recibo {receiptToDelete?.receipt_number}? Esta acción no se puede deshacer.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setReceiptToDelete(null)}>Cancelar</Button>
            <Button variant="danger" onClick={confirmDelete}>Eliminar</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ReceiptsPage;