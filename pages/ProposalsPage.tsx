// pages/ProposalsPage.tsx
import React, { useState, useMemo } from 'react';
import { useAppStore } from '@/hooks/useAppStore';
import Card, { CardContent, CardHeader } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import StatusChip from '@/components/ui/StatusChip';
import EmptyState from '@/components/ui/EmptyState';
import { formatCurrency } from '@/lib/utils';
import { 
  FileSignatureIcon, 
  PlusIcon, 
  TrashIcon, 
  SearchIcon,
  EyeIcon,
  MoreVerticalIcon 
} from '../components/icons/Icon';
import { useToast } from '../hooks/useToast';
import { Proposal } from '@/types';

// ─── Tipos locales ────────────────────────────────────────────────────────────
type FilterStatus = 'all' | Proposal['status'];

const ProposalsPage: React.FC = () => {
  const { proposals, clients, addProposal, deleteProposal, profile } = useAppStore();
  const { addToast } = useToast();

  // ── Estado del modal y carga ────────────────────────────────────────────────
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    clients.find(c => c.id === clientId)?.name ?? 'Cliente no encontrado';

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  // ── Lista filtrada ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const list = proposals || [];
    return list
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
    const total = proposals?.length || 0;
    const accepted = proposals?.filter(p => p.status === 'accepted').length || 0;
    const pending = proposals?.filter(p => p.status === 'sent').length || 0;
    const totalValue = proposals
      ?.filter(p => p.status === 'accepted')
      .reduce((sum, p) => sum + (p.amount_cents || 0), 0) || 0;
    return { total, accepted, pending, totalValue };
  }, [proposals]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.client_id) return addToast('Selecciona un cliente.', 'error');
    if (!form.title.trim()) return addToast('El título es obligatorio.', 'error');
    if (!profile?.id) return addToast('No se encontró sesión de usuario.', 'error');

    setIsSubmitting(true);
    try {
      // PREVENCIÓN ERROR 400: Enviamos todos los campos necesarios
      await addProposal({
        user_id: profile.id,
        client_id: form.client_id,
        title: form.title,
        content: form.content,
        status: form.status,
        amount_cents: Math.round(Number(form.amount_cents) * 100), // Conversión a céntimos
        items: [], // Estructura base para la tabla proposals
        valid_until: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
      });

      addToast('Propuesta creada correctamente.', 'success');
      setIsModalOpen(false);
      setForm(initialFormState);
    } catch (error: any) {
      addToast(`Error: ${error.message || 'No se pudo crear'}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('¿Estás seguro de que quieres eliminar esta propuesta?')) {
      try {
        await deleteProposal(id);
        addToast('Propuesta eliminada.', 'success');
      } catch (error) {
        addToast('Error al eliminar.', 'error');
      }
    }
  };

  return (
    <div className="space-y-6 pb-10">
      {/* Cabecera */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Propuestas Comerciales</h1>
          <p className="text-gray-400 text-sm">Gestiona tus presupuestos y ofertas enviadas.</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="bg-primary-500 hover:bg-primary-600 shadow-lg shadow-primary-500/20">
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

      {/* Filtros y Buscador */}
      <div className="flex flex-col sm:flex-row gap-3 bg-gray-900/30 p-2 rounded-2xl border border-gray-800">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Buscar por título o cliente..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-gray-900/50 border border-gray-800 rounded-xl pl-10 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:border-primary-500 outline-none transition-all"
          />
        </div>

        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value as FilterStatus)}
          className="bg-gray-900/50 border border-gray-800 rounded-xl px-4 py-2 text-sm text-white focus:border-primary-500 outline-none cursor-pointer"
        >
          <option value="all">Todos los estados</option>
          <option value="draft">Borrador</option>
          <option value="sent">Enviada</option>
          <option value="accepted">Aceptada</option>
          <option value="rejected">Rechazada</option>
        </select>
      </div>

      {/* Listado de Propuestas */}
      {proposals.length === 0 ? (
        <EmptyState
          icon={FileSignatureIcon}
          title="Sin propuestas todavía"
          message="Comienza creando una propuesta profesional para tus clientes."
          action={{ text: 'Nueva propuesta', onClick: () => setIsModalOpen(true) }}
        />
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 bg-gray-900/20 rounded-3xl border border-gray-800">
          <p className="text-gray-400">No hay propuestas que coincidan con tu búsqueda.</p>
          <Button variant="secondary" className="mt-4" onClick={() => { setSearch(''); setFilterStatus('all'); }}>Limpiar filtros</Button>
        </div>
      ) : (
        <Card className="bg-gray-900/40 border-gray-800 rounded-3xl overflow-hidden">
          <CardHeader className="border-b border-gray-800 bg-gray-900/20">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest">
              Mostrando {filtered.length} propuesta{filtered.length !== 1 ? 's' : ''}
            </h2>
          </CardHeader>

          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-800">
                    <th className="px-6 py-4 font-semibold">Título / Concepto</th>
                    <th className="px-6 py-4 font-semibold">Cliente</th>
                    <th className="px-6 py-4 font-semibold">Fecha creación</th>
                    <th className="px-6 py-4 font-semibold">Presupuesto</th>
                    <th className="px-6 py-4 font-semibold">Estado</th>
                    <th className="px-6 py-4 font-semibold text-right">Acciones</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-800">
                  {filtered.map(proposal => (
                    <tr key={proposal.id} className="group hover:bg-primary-500/5 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-bold text-white group-hover:text-primary-400 transition-colors">{proposal.title}</div>
                        <div className="text-xs text-gray-500 truncate max-w-[200px]">{proposal.content?.substring(0, 40)}...</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-gray-300 bg-gray-800/50 px-2 py-1 rounded-lg text-xs">
                          {getClientName(proposal.client_id)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-400">{formatDate(proposal.created_at)}</td>
                      <td className="px-6 py-4">
                        <span className="font-mono font-bold text-white">{formatCurrency(proposal.amount_cents)}</span>
                      </td>
                      <td className="px-6 py-4">
                        <StatusChip type="proposal" status={proposal.status} />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                           <button className="p-2 text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg transition-all"><EyeIcon className="w-4 h-4" /></button>
                           <button onClick={() => handleDelete(proposal.id)} className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"><TrashIcon className="w-4 h-4" /></button>
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

      {/* Modal - Nueva propuesta */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => { if(!isSubmitting) { setIsModalOpen(false); setForm(initialFormState); } }}
        title="Crear Nueva Propuesta"
      >
        <form onSubmit={handleSubmit} className="space-y-5 p-1">
          <div className="grid grid-cols-1 gap-5">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-2 ml-1">Cliente</label>
              <select
                name="client_id"
                value={form.client_id}
                onChange={handleChange}
                required
                className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white focus:border-primary-500 outline-none appearance-none cursor-pointer"
              >
                <option value="" disabled>Selecciona un cliente...</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-2 ml-1">Título del Proyecto</label>
              <input
                type="text"
                name="title"
                value={form.title}
                onChange={handleChange}
                placeholder="Ej: Desarrollo de App Móvil"
                required
                className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:border-primary-500 outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-2 ml-1">Presupuesto (€)</label>
                <input
                  type="number"
                  name="amount_cents"
                  value={form.amount_cents}
                  onChange={handleChange}
                  min={0}
                  step={0.01}
                  placeholder="0.00"
                  required
                  className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white focus:border-primary-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-2 ml-1">Estado</label>
                <select
                  name="status"
                  value={form.status}
                  onChange={handleChange}
                  className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white focus:border-primary-500 outline-none cursor-pointer"
                >
                  <option value="draft">Borrador</option>
                  <option value="sent">Enviada</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-2 ml-1">Descripción / Notas</label>
              <textarea
                name="content"
                value={form.content}
                onChange={handleChange}
                rows={4}
                placeholder="Describe el alcance del trabajo..."
                className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:border-primary-500 outline-none resize-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              disabled={isSubmitting}
              onClick={() => { setIsModalOpen(false); setForm(initialFormState); }}
              className="px-6"
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting} className="px-8 bg-primary-500 hover:bg-primary-600">
              {isSubmitting ? 'Guardando...' : 'Crear Propuesta'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

// ─── Subcomponente: Tarjeta de estadística ────────────────────────────────────
const SummaryCard = ({ label, value, accent }: any) => {
  const accentClasses = {
    blue: 'text-blue-400 bg-blue-400/5',
    green: 'text-green-400 bg-green-400/5',
    purple: 'text-purple-400 bg-purple-400/5',
    default: 'text-white bg-white/5'
  };

  const selectedAccent = accent ? accentClasses[accent as keyof typeof accentClasses] : accentClasses.default;

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-4 flex flex-col justify-center">
      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-xl font-bold truncate ${selectedAccent.split(' ')[0]}`}>
        {value}
      </p>
    </div>
  );
};

export default ProposalsPage;