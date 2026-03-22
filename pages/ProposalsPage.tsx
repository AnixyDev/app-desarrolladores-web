// pages/ProposalsPage.tsx
import React, { useState, useMemo } from 'react';

import { useAppStore } from '@/hooks/useAppStore';
import Card, { CardContent, CardHeader } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import StatusChip from '@/components/ui/StatusChip';
import EmptyState from '@/components/ui/EmptyState';
import { formatCurrency } from '@/lib/utils';
import { FileSignatureIcon, PlusIcon, TrashIcon, SearchIcon } from '../components/icons/Icon';
import { useToast } from '../hooks/useToast';
import { Proposal } from '@/types';

// ─── Tipos locales ────────────────────────────────────────────────────────────

type FilterStatus = 'all' | Proposal['status'];

// ─── Componente principal ─────────────────────────────────────────────────────

const ProposalsPage: React.FC = () => {
  const { proposals, clients, addProposal } = useAppStore();
  const { addToast } = useToast();

  // ── Estado del modal ────────────────────────────────────────────────────────
  const [isModalOpen, setIsModalOpen] = useState(false);

  // ── Estado del formulario ───────────────────────────────────────────────────
  const initialFormState = {
    client_id: '',
    title: '',
    content: '',
    amount_cents: 0,
    status: 'draft' as Proposal['status'],
  };
  const [form, setForm] = useState(initialFormState);

  // ── Estado de filtros ───────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const getClientName = (clientId: string) =>
    clients.find(c => c.id === clientId)?.name ?? '—';

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

  // ── Lista filtrada ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return proposals
      .filter(p => filterStatus === 'all' || p.status === filterStatus)
      .filter(p => {
        const q = search.toLowerCase();
        return (
          p.title.toLowerCase().includes(q) ||
          getClientName(p.client_id).toLowerCase().includes(q)
        );
      });
  }, [proposals, filterStatus, search, clients]);

  // ── Estadísticas rápidas ────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = proposals.length;
    const accepted = proposals.filter(p => p.status === 'accepted').length;
    const pending = proposals.filter(p => p.status === 'sent').length;
    const totalValue = proposals
      .filter(p => p.status === 'accepted')
      .reduce((sum, p) => sum + p.amount_cents, 0);
    return { total, accepted, pending, totalValue };
  }, [proposals]);

  // ── Handlers del formulario ─────────────────────────────────────────────────
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.client_id) {
      addToast('Selecciona un cliente.', 'error');
      return;
    }
    if (!form.title.trim()) {
      addToast('El título es obligatorio.', 'error');
      return;
    }

    await addProposal({
      ...form,
      amount_cents: Math.round(Number(form.amount_cents) * 100),
    });

    addToast('Propuesta creada correctamente.', 'success');
    setIsModalOpen(false);
    setForm(initialFormState);
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-white">Propuestas</h1>
        <Button onClick={() => setIsModalOpen(true)}>
          <PlusIcon className="w-4 h-4 mr-2" />
          Nueva propuesta
        </Button>
      </div>

      {/* Tarjetas de resumen */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="Total" value={String(stats.total)} />
        <SummaryCard label="Enviadas" value={String(stats.pending)} accent="blue" />
        <SummaryCard label="Aceptadas" value={String(stats.accepted)} accent="green" />
        <SummaryCard label="Valor aceptado" value={formatCurrency(stats.totalValue)} accent="purple" />
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por título o cliente…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-md pl-9 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>

        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value as FilterStatus)}
          className="bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
        >
          <option value="all">Todos los estados</option>
          <option value="draft">Borrador</option>
          <option value="sent">Enviada</option>
          <option value="accepted">Aceptada</option>
          <option value="rejected">Rechazada</option>
        </select>
      </div>

      {/* Contenido principal */}
      {proposals.length === 0 ? (
        <EmptyState
          icon={FileSignatureIcon}
          title="Sin propuestas todavía"
          message="Crea tu primera propuesta comercial y envíasela a un cliente."
          action={{ text: 'Nueva propuesta', onClick: () => setIsModalOpen(true) }}
        />
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-center text-gray-400 py-8">
              No hay propuestas que coincidan con los filtros.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-white">
              {filtered.length} propuesta{filtered.length !== 1 ? 's' : ''}
            </h2>
          </CardHeader>

          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Título</th>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Importe</th>
                    <th className="px-4 py-3">Estado</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-800">
                  {filtered.map(proposal => (
                    <tr
                      key={proposal.id}
                      className="hover:bg-gray-800/50 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-white">
                        {proposal.title}
                      </td>

                      <td className="px-4 py-3 text-primary-400">
                        {getClientName(proposal.client_id)}
                      </td>

                      <td className="px-4 py-3 text-gray-400">
                        {formatDate(proposal.created_at)}
                      </td>

                      <td className="px-4 py-3 text-white font-medium">
                        {formatCurrency(proposal.amount_cents)}
                      </td>

                      <td className="px-4 py-3">
                        <StatusChip type="proposal" status={proposal.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Modal — Nueva propuesta */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setForm(initialFormState); }}
        title="Nueva propuesta"
      >
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Cliente */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Cliente</label>
            <select
              name="client_id"
              value={form.client_id}
              onChange={handleChange}
              required
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              <option value="" disabled>Selecciona un cliente…</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Título */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Título</label>
            <input
              type="text"
              name="title"
              value={form.title}
              onChange={handleChange}
              placeholder="Ej: Desarrollo web para proyecto X"
              required
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          {/* Importe */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Importe (€)</label>
            <input
              type="number"
              name="amount_cents"
              value={form.amount_cents}
              onChange={handleChange}
              min={0}
              step={0.01}
              placeholder="0.00"
              required
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          {/* Estado */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Estado inicial</label>
            <select
              name="status"
              value={form.status}
              onChange={handleChange}
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              <option value="draft">Borrador</option>
              <option value="sent">Enviada</option>
              <option value="accepted">Aceptada</option>
              <option value="rejected">Rechazada</option>
            </select>
          </div>

          {/* Contenido / descripción */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Descripción / contenido
            </label>
            <textarea
              name="content"
              value={form.content}
              onChange={handleChange}
              rows={4}
              placeholder="Detalla el alcance, entregables y condiciones de la propuesta…"
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none"
            />
          </div>

          {/* Acciones */}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => { setIsModalOpen(false); setForm(initialFormState); }}
            >
              Cancelar
            </Button>
            <Button type="submit">
              Guardar propuesta
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

// ─── Subcomponente: tarjeta de estadística ────────────────────────────────────

interface SummaryCardProps {
  label: string;
  value: string;
  accent?: 'blue' | 'green' | 'purple';
}

const accentMap: Record<string, string> = {
  blue:   'text-blue-400',
  green:  'text-green-400',
  purple: 'text-purple-400',
};

const SummaryCard: React.FC<SummaryCardProps> = ({ label, value, accent }) => (
  <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-1">
    <p className="text-xs text-gray-400 uppercase tracking-wider">{label}</p>
    <p className={`text-2xl font-bold ${accent ? accentMap[accent] : 'text-white'}`}>
      {value}
    </p>
  </div>
);

export default ProposalsPage;
