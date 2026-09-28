// Editar los datos de un proyecto ya creado (nombre, cliente, fechas,
// presupuesto…). Hasta el 28/09 solo se podía cambiar el estado.
import React, { useEffect, useState } from 'react';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { useAppStore } from '@/hooks/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import type { Project } from '@/types';

const selectClass = 'w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary-500';

export interface DatosDelProyecto {
  name: string;
  client_id: string;
  description: string;
  priority: Project['priority'];
  start_date: string;
  due_date: string;
  budget_cents: number;
  category: string;
}

/** Del proyecto guardado al formulario (el presupuesto en euros). */
export const formularioDesdeProyecto = (p: Project) => ({
  name: p.name,
  client_id: p.client_id,
  description: p.description ?? '',
  priority: p.priority ?? 'Medium',
  start_date: (p.start_date ?? '').slice(0, 10),
  due_date: (p.due_date ?? '').slice(0, 10),
  budget: p.budget_cents ? String(p.budget_cents / 100) : '',
  category: p.category ?? '',
});

interface Props {
  isOpen: boolean;
  onClose: () => void;
  proyecto: Project;
  onGuardar: (datos: DatosDelProyecto) => Promise<void>;
}

const ProjectFormModal: React.FC<Props> = ({ isOpen, onClose, proyecto, onGuardar }) => {
  const { clients } = useAppStore(useShallow(s => ({ clients: s.clients })));
  const [form, setForm] = useState(() => formularioDesdeProyecto(proyecto));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setForm(formularioDesdeProyecto(proyecto));
      setError(null);
    }
  }, [isOpen, proyecto]);

  const cambiar = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return setError('El nombre del proyecto es obligatorio.');
    if (!form.client_id) return setError('Selecciona un cliente.');
    if (form.start_date && form.due_date && form.due_date < form.start_date) {
      return setError('La fecha de entrega no puede ser anterior a la de inicio.');
    }
    setGuardando(true);
    setError(null);
    try {
      await onGuardar({
        name: form.name.trim(),
        client_id: form.client_id,
        description: form.description,
        priority: form.priority,
        start_date: form.start_date,
        due_date: form.due_date,
        budget_cents: Math.round((Number(form.budget) || 0) * 100),
        category: form.category.trim(),
      });
      onClose();
    } catch (err) {
      setError((err as Error)?.message || 'No se pudo guardar el proyecto.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Editar proyecto">
      <form onSubmit={enviar} className="space-y-4">
        <Input label="Nombre del proyecto" name="name" value={form.name} onChange={cambiar} required />
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Cliente</label>
          <select name="client_id" value={form.client_id} onChange={cambiar} className={selectClass} required>
            <option value="" disabled>Selecciona un cliente…</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Descripción</label>
          <textarea
            name="description"
            value={form.description}
            onChange={cambiar}
            rows={3}
            className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Prioridad</label>
            <select name="priority" value={form.priority} onChange={cambiar} className={selectClass}>
              <option value="Low">Baja</option>
              <option value="Medium">Media</option>
              <option value="High">Alta</option>
            </select>
          </div>
          <Input label="Categoría" name="category" value={form.category} onChange={cambiar} placeholder="Ej: Web, Mobile…" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Fecha inicio" name="start_date" type="date" value={form.start_date} onChange={cambiar} />
          <Input label="Fecha entrega" name="due_date" type="date" value={form.due_date} onChange={cambiar} />
        </div>
        <Input label="Presupuesto (€)" name="budget" type="number" min={0} step={0.01} value={form.budget} onChange={cambiar} placeholder="0.00" />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar cambios'}</Button>
        </div>
      </form>
    </Modal>
  );
};

export default ProjectFormModal;
