import React, { useState, useMemo } from 'react';
import { useAppStore } from '@/hooks/useAppStore';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import { Project, NewProject, NewClient } from '@/types';
import EmptyState from '@/components/ui/EmptyState';
import { BriefcaseIcon, PlusIcon, SearchIcon, Filter, Users, LayoutGrid, List } from '@/components/icons/Icon';
import { useToast } from '@/hooks/useToast';
import { ProjectCard } from '@/components/projects/ProjectCard'; // Importamos el nuevo componente

// DND Kit
import { DndContext, closestCorners, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';

const ProjectsPage: React.FC = () => {
    const { projects, clients, tasks, addProject, getClientById, addClient, updateProject } = useAppStore();
    const { addToast } = useToast();
    
    const [viewMode, setViewMode] = useState<'grid' | 'kanban'>('kanban');
    const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    
    // Configuración de sensores para que los botones dentro de las tarjetas funcionen
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

    const KANBAN_COLUMNS: { id: Project['status']; label: string; color: string }[] = [
        { id: 'planning', label: 'Planificación', color: 'bg-blue-500' },
        { id: 'in-progress', label: 'En Progreso', color: 'bg-primary-500' },
        { id: 'on-hold', label: 'En Pausa', color: 'bg-orange-500' },
        { id: 'completed', label: 'Finalizado', color: 'bg-green-500' },
    ];

    const getProjectProgress = (projectId: string) => {
        const projectTasks = tasks.filter(t => t.project_id === projectId);
        if (projectTasks.length === 0) return 0;
        const completed = projectTasks.filter(t => t.completed).length;
        return Math.round((completed / projectTasks.length) * 100);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over) return;

        const projectId = active.id as string;
        const overId = over.id as string;

        // Si soltamos sobre una columna (id de columna) o sobre otra tarjeta (buscamos su columna)
        let newStatus = overId as Project['status'];
        
        // Verificamos si overId es realmente un estado válido
        const isValidStatus = KANBAN_COLUMNS.some(col => col.id === overId);
        
        if (isValidStatus && active.data.current?.status !== newStatus) {
            updateProject(projectId, { status: newStatus });
            addToast(`Proyecto movido a ${newStatus}`, 'success');
        }
    };

    const filteredProjects = useMemo(() => {
        return projects.filter(p => 
            p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
            getClientById(p.client_id)?.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [projects, searchTerm, getClientById]);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <h1 className="text-2xl font-bold text-white">Proyectos</h1>
                <div className="flex gap-2">
                    <div className="bg-gray-900 p-1 rounded-xl flex border border-gray-800">
                        <button onClick={() => setViewMode('kanban')} className={`p-2 rounded-lg ${viewMode === 'kanban' ? 'bg-gray-800 text-primary-400' : 'text-gray-500'}`}><LayoutGrid size={18} /></button>
                        <button onClick={() => setViewMode('grid')} className={`p-2 rounded-lg ${viewMode === 'grid' ? 'bg-gray-800 text-primary-400' : 'text-gray-500'}`}><List size={18} /></button>
                    </div>
                    <Button onClick={() => setIsProjectModalOpen(true)}><PlusIcon className="w-5 h-5 mr-2" /> Nuevo Proyecto</Button>
                </div>
            </div>

            {/* Buscador */}
            <div className="relative">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input type="text" placeholder="Buscar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-gray-900 text-white pl-10 pr-4 py-2 rounded-xl border border-gray-800 focus:border-primary-500 outline-none" />
            </div>

            <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
                {viewMode === 'kanban' ? (
                    <div className="flex gap-6 overflow-x-auto pb-6">
                        {KANBAN_COLUMNS.map(column => (
                            <div key={column.id} className="min-w-[300px] flex flex-col gap-4">
                                <div className="flex items-center gap-2 px-2">
                                    <span className={`w-2 h-2 rounded-full ${column.color}`}></span>
                                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">{column.label}</h3>
                                </div>
                                
                                <SortableContext id={column.id} items={filteredProjects.filter(p => p.status === column.id).map(p => p.id)} strategy={verticalListSortingStrategy}>
                                    <div id={column.id} className="flex-1 bg-gray-900/20 border border-dashed border-gray-800 rounded-3xl p-2 min-h-[500px]">
                                        {filteredProjects
                                            .filter(p => p.status === column.id)
                                            .map(project => (
                                                <ProjectCard key={project.id} project={project} progress={getProjectProgress(project.id)} clientName={getClientById(project.client_id)?.name} />
                                            ))}
                                    </div>
                                </SortableContext>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {filteredProjects.map(project => (
                            <ProjectCard key={project.id} project={project} progress={getProjectProgress(project.id)} clientName={getClientById(project.client_id)?.name} />
                        ))}
                    </div>
                )}
            </DndContext>

            {/* Modal Simplificado (Usa tu lógica anterior) */}
            <Modal isOpen={isProjectModalOpen} onClose={() => setIsProjectModalOpen(false)} title="Nuevo Proyecto">
               {/* Tu formulario de handleProjectSubmit aquí */}
            </Modal>
        </div>
    );
};

export default ProjectsPage;