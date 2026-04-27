import React, { useState, useMemo } from 'react';
import { useAppStore } from '@/hooks/useAppStore';
import { LayoutGrid, List, Plus as PlusIcon, Search as SearchIcon } from 'lucide-react';
import { ProjectCard } from '@/components/projects/ProjectCard';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import { Project, NewProject } from '@/types';
import { useToast } from '@/hooks/useToast';

// DND Kit
import { DndContext, closestCorners, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';

const TODAY = new Date().toISOString().split('T')[0];
const IN_30_DAYS = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

const initialForm: NewProject = {
    name: '',
    client_id: '',
    description: '',
    status: 'planning',
    start_date: TODAY,
    due_date: IN_30_DAYS,
    budget_cents: 0,
    category: '',
    priority: 'Medium',
};

const selectClass = 'w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary-500';

const ProjectPage: React.FC = () => {
    const { projects, tasks, clients, getClientById, addProject, updateProject } = useAppStore();
    const { addToast } = useToast();

    const [viewMode, setViewMode] = useState<'grid' | 'kanban'>('kanban');
    const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [form, setForm] = useState<NewProject>(initialForm);
    const [saving, setSaving] = useState(false);

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

    const KANBAN_COLUMNS: { id: Project['status']; label: string; color: string }[] = [
        { id: 'planning',    label: 'Planificación', color: 'bg-blue-500' },
        { id: 'in-progress', label: 'En Progreso',   color: 'bg-primary-500' },
        { id: 'on-hold',     label: 'En Pausa',      color: 'bg-orange-500' },
        { id: 'completed',   label: 'Finalizado',    color: 'bg-green-500' },
    ];

    const getProjectProgress = (projectId: string) => {
        const projectTasks = tasks?.filter(t => t.project_id === projectId) || [];
        if (projectTasks.length === 0) return 0;
        const completed = projectTasks.filter(t => t.status === 'completed' || t.status === 'done').length;
        return Math.round((completed / projectTasks.length) * 100);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over) return;
        const projectId = active.id as string;
        const overId = over.id as string;
        const isValidStatus = KANBAN_COLUMNS.some(col => col.id === overId);
        if (isValidStatus) {
            updateProject(projectId, { status: overId as Project['status'] });
        }
    };

    const filteredProjects = useMemo(() => {
        return projects.filter(p =>
            p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            getClientById(p.client_id)?.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [projects, searchTerm, getClientById]);

    // ── Formulario ──────────────────────────────────────────────────────────
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setForm(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.name.trim()) {
            addToast('El nombre del proyecto es obligatorio.', 'error');
            return;
        }
        if (!form.client_id) {
            addToast('Selecciona un cliente.', 'error');
            return;
        }
        setSaving(true);
        try {
            await addProject({
                ...form,
                budget_cents: Math.round(Number(form.budget_cents) * 100),
            });
            addToast('Proyecto creado correctamente.', 'success');
            setIsProjectModalOpen(false);
            setForm(initialForm);
        } catch {
            addToast('Error al crear el proyecto.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleClose = () => {
        setIsProjectModalOpen(false);
        setForm(initialForm);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <h1 className="text-2xl font-bold text-white">Proyectos</h1>
                <div className="flex gap-2">
                    <div className="bg-gray-900 p-1 rounded-xl flex border border-gray-800">
                        <button
                            onClick={() => setViewMode('kanban')}
                            className={`p-2 rounded-lg ${viewMode === 'kanban' ? 'bg-gray-800 text-primary-400' : 'text-gray-500'}`}
                        >
                            <LayoutGrid size={18} />
                        </button>
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`p-2 rounded-lg ${viewMode === 'grid' ? 'bg-gray-800 text-primary-400' : 'text-gray-500'}`}
                        >
                            <List size={18} />
                        </button>
                    </div>
                    <Button onClick={() => setIsProjectModalOpen(true)}>
                        <PlusIcon className="w-5 h-5 mr-2" /> Nuevo Proyecto
                    </Button>
                </div>
            </div>

            {/* Buscador */}
            <div className="relative">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                    type="text"
                    placeholder="Buscar proyectos o clientes..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full bg-gray-900 text-white pl-10 pr-4 py-2 rounded-xl border border-gray-800 focus:border-primary-500 outline-none transition-all"
                />
            </div>

            {/* Kanban / Grid */}
            <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
                {viewMode === 'kanban' ? (
                    <div className="flex gap-6 overflow-x-auto pb-6">
                        {KANBAN_COLUMNS.map(column => (
                            <div key={column.id} className="min-w-[300px] flex flex-col gap-4">
                                <div className="flex items-center gap-2 px-2">
                                    <span className={`w-2 h-2 rounded-full ${column.color}`} />
                                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                                        {column.label}
                                    </h3>
                                </div>
                                <SortableContext
                                    id={column.id}
                                    items={filteredProjects.filter(p => p.status === column.id).map(p => p.id)}
                                    strategy={verticalListSortingStrategy}
                                >
                                    <div
                                        id={column.id}
                                        className="flex-1 bg-gray-900/20 border border-dashed border-gray-800 rounded-3xl p-2 min-h-[500px]"
                                    >
                                        {filteredProjects
                                            .filter(p => p.status === column.id)
                                            .map(project => (
                                                <ProjectCard
                                                    key={project.id}
                                                    project={project}
                                                    progress={getProjectProgress(project.id)}
                                                    clientName={getClientById(project.client_id)?.name}
                                                />
                                            ))}
                                    </div>
                                </SortableContext>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {filteredProjects.map(project => (
                            <ProjectCard
                                key={project.id}
                                project={project}
                                progress={getProjectProgress(project.id)}
                                clientName={getClientById(project.client_id)?.name}
                            />
                        ))}
                    </div>
                )}
            </DndContext>

            {/* Modal — Nuevo Proyecto */}
            <Modal isOpen={isProjectModalOpen} onClose={handleClose} title="Nuevo Proyecto">
                <form onSubmit={handleSubmit} className="space-y-4">

                    {/* Nombre */}
                    <Input
                        label="Nombre del proyecto"
                        name="name"
                        value={form.name}
                        onChange={handleChange}
                        placeholder="Ej: Rediseño web corporativa"
                        required
                    />

                    {/* Cliente */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Cliente</label>
                        <select name="client_id" value={form.client_id} onChange={handleChange} className={selectClass} required>
                            <option value="" disabled>Selecciona un cliente…</option>
                            {clients.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Descripción */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Descripción</label>
                        <textarea
                            name="description"
                            value={form.description}
                            onChange={handleChange}
                            rows={3}
                            placeholder="Describe el alcance del proyecto…"
                            className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none"
                        />
                    </div>

                    {/* Estado + Prioridad */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Estado</label>
                            <select name="status" value={form.status} onChange={handleChange} className={selectClass}>
                                <option value="planning">Planificación</option>
                                <option value="in-progress">En Progreso</option>
                                <option value="on-hold">En Pausa</option>
                                <option value="completed">Finalizado</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Prioridad</label>
                            <select name="priority" value={form.priority} onChange={handleChange} className={selectClass}>
                                <option value="Low">Baja</option>
                                <option value="Medium">Media</option>
                                <option value="High">Alta</option>
                            </select>
                        </div>
                    </div>

                    {/* Fechas */}
                    <div className="grid grid-cols-2 gap-3">
                        <Input
                            label="Fecha inicio"
                            name="start_date"
                            type="date"
                            value={form.start_date}
                            onChange={handleChange}
                        />
                        <Input
                            label="Fecha entrega"
                            name="due_date"
                            type="date"
                            value={form.due_date}
                            onChange={handleChange}
                        />
                    </div>

                    {/* Presupuesto */}
                    <Input
                        label="Presupuesto (€)"
                        name="budget_cents"
                        type="number"
                        min={0}
                        step={0.01}
                        value={form.budget_cents}
                        onChange={handleChange}
                        placeholder="0.00"
                    />

                    {/* Categoría */}
                    <Input
                        label="Categoría (opcional)"
                        name="category"
                        value={form.category ?? ''}
                        onChange={handleChange}
                        placeholder="Ej: Web, Mobile, Consultoría…"
                    />

                    {/* Acciones */}
                    <div className="flex justify-end gap-3 pt-2">
                        <Button type="button" variant="secondary" onClick={handleClose}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={saving}>
                            {saving ? 'Guardando…' : 'Crear Proyecto'}
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default ProjectPage;