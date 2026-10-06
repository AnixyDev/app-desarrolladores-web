// pages/ProjectDetailPage.tsx
import React, { useState, useMemo, lazy, Suspense } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { MoreVertical } from 'lucide-react';
// FIX: Remove .tsx and .ts extensions from imports to resolve module resolution errors.
import { useAppStore } from '@/hooks/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import Card, { CardContent, CardHeader } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { formatCurrency, formatearFecha } from '@/lib/utils';
import { Project, Task, InvoiceItem } from '@/types';
import { PlusIcon, TrashIcon, ClockIcon, FileTextIcon, MessageSquareIcon, DollarSignIcon, EditIcon } from '@/components/icons/Icon';
import ProjectFormModal, { type DatosDelProyecto } from '@/components/projects/ProjectFormModal';
import { puede } from '@/lib/permisosEquipo';
import HitosDelProyecto from '@/components/projects/HitosDelProyecto';
import EmptyState from '@/components/ui/EmptyState';
import { useToast } from '@/hooks/useToast';

const ProjectChat = lazy(() => import('@/components/ProjectChat'));
const ConfirmationModal = lazy(() => import('@/components/modals/ConfirmationModal'));

const ProjectDetailPage: React.FC = () => {
    const { projectId } = useParams<{ projectId: string }>();
    const navigate = useNavigate();
    const { addToast } = useToast();

    const { datosDeTrabajoCargados, getProjectById, getClientById, getTasksByProjectId, timeEntries, expenses, profile, addTask, toggleTask, deleteTask, deleteProject, updateProjectStatus, teamMembership, updateProject, updateTask } = useAppStore(useShallow(s => ({ datosDeTrabajoCargados: s.datosDeTrabajoCargados, getProjectById: s.getProjectById, getClientById: s.getClientById, getTasksByProjectId: s.getTasksByProjectId, timeEntries: s.timeEntries, expenses: s.expenses, profile: s.profile, addTask: s.addTask, toggleTask: s.toggleTask, deleteTask: s.deleteTask, deleteProject: s.deleteProject, updateProjectStatus: s.updateProjectStatus, teamMembership: s.teamMembership, updateProject: s.updateProject, updateTask: s.updateTask })));
    const [editandoProyecto, setEditandoProyecto] = useState(false);
    const [menuAbierto, setMenuAbierto] = useState(false);
    const [tareaEnEdicion, setTareaEnEdicion] = useState<{ id: string; texto: string } | null>(null);

    const [newTaskDescription, setNewTaskDescription] = useState('');
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
    // FIX: al simplificar la tarjeta del Kanban para que sea más manejable en
    // móvil, se quitó el botón de borrar de ahí (competía con el gesto de
    // arrastre). Esta es ahora la única forma de borrar un proyecto — con
    // confirmación, en vez de un icono suelto pegado al asa de arrastre.
    const [isDeleteProjectModalOpen, setIsDeleteProjectModalOpen] = useState(false);
    const [deletingProject, setDeletingProject] = useState(false);

    const project = projectId ? getProjectById(projectId) : undefined;
    const client = project ? getClientById(project.client_id) : undefined;
    const tasks = projectId ? getTasksByProjectId(projectId) : [];
    
    const projectTimeEntries = useMemo(() => {
        return timeEntries.filter(entry => entry.project_id === projectId);
    }, [timeEntries, projectId]);

    const projectStats = useMemo(() => {
        const completedTasks = tasks.filter(t => t.status === 'done' || t.status === 'completed').length;
        const progress = tasks.length > 0 ? (completedTasks / tasks.length) * 100 : 0;
        const totalSeconds = projectTimeEntries.reduce((sum, entry) => sum + entry.duration_seconds, 0);
        const hoursTracked = totalSeconds / 3600;

        return {
            completedTasks,
            progress,
            hoursTracked
        };
    }, [tasks, projectTimeEntries]);
    
    const budgetStats = useMemo(() => {
        if (!project || !profile || project.budget_cents <= 0) {
            return null;
        }

        const projectExpensesCost = expenses
            .filter(e => e.project_id === project.id)
            .reduce((sum, e) => sum + e.amount_cents, 0);

        const totalSecondsTracked = projectTimeEntries.reduce((sum, entry) => sum + entry.duration_seconds, 0);
        // Sin tarifa por hora configurada salía NaN € en el control de presupuesto.
        const hourlyRate = Number(profile.hourly_rate_cents) || 0;
        const projectTimeCost = (totalSecondsTracked / 3600) * hourlyRate;

        const totalCosts = projectExpensesCost + projectTimeCost;
        const consumedPercentage = (totalCosts / project.budget_cents) * 100;
        const remainingBudget = project.budget_cents - totalCosts;

        return {
            totalCosts,
            consumedPercentage,
            remainingBudget,
        };
    }, [project, expenses, projectTimeEntries, profile]);


    // Sin este chequeo, mientras los datos aun estaban llegando esta pagina
    // enseñaba el error rojo de "no encontrado": al refrescar, lo primero
    // que veia el usuario era que su registro no existia.
    if (!datosDeTrabajoCargados) {
        return (
            <div className="flex justify-center py-16">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500" />
            </div>
        );
    }

    if (!project || !client) {
        return <div className="text-center text-red-500 mt-8">Proyecto o cliente no encontrado.</div>;
    }

    const handleAddTask = (e: React.FormEvent) => {
        e.preventDefault();
        if (newTaskDescription.trim() && projectId) {
            addTask({ project_id: projectId, description: newTaskDescription });
            setNewTaskDescription('');
        }
    };

    const handleCreateInvoice = () => {
        navigate('/invoices/create', {
            state: {
                projectId: project.id,
                clientId: client.id
            }
        });
    };
    
    const handleCreateInvoiceFromBudget = () => {
        if (project.budget_cents > 0) {
            const budgetItem: InvoiceItem = {
                description: `Facturación basada en el presupuesto del proyecto: ${project.name}`,
                quantity: 1,
                price_cents: project.budget_cents
            };
            navigate('/invoices/create', {
                state: {
                    clientId: project.client_id,
                    projectId: project.id,
                    budgetItems: [budgetItem]
                }
            });
        }
    };

    const handleDeleteClick = (task: Task) => {
        setTaskToDelete(task);
        setIsConfirmModalOpen(true);
    };

    const confirmDelete = () => {
        if (taskToDelete) {
            deleteTask(taskToDelete.id);
            setIsConfirmModalOpen(false);
            setTaskToDelete(null);
        }
    };

    const guardarProyecto = async (datos: DatosDelProyecto) => {
        await updateProject(project.id, {
            ...datos,
            description: datos.description || undefined,
            start_date: datos.start_date || undefined,
            due_date: datos.due_date || undefined,
        });
        addToast('Proyecto actualizado.', 'success');
    };

    const guardarTarea = async () => {
        if (!tareaEnEdicion) return;
        try {
            await updateTask(tareaEnEdicion.id, tareaEnEdicion.texto);
            setTareaEnEdicion(null);
        } catch (err) {
            addToast((err as Error)?.message || 'No se pudo guardar la tarea.', 'error');
        }
    };

    const handleDeleteProject = async () => {
        setDeletingProject(true);
        try {
            await deleteProject(project.id);
            navigate('/projects');
        } catch (err) {
            addToast('No se pudo eliminar el proyecto.', 'error');
            setDeletingProject(false);
            setIsDeleteProjectModalOpen(false);
        }
    };

    const puedeEditar = puede('editarProyecto', project.user_id, profile?.id, teamMembership);
    const puedeBorrar = puede('borrarProyecto', project.user_id, profile?.id, teamMembership);

    return (
        <div className="space-y-6">
            <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-4">
                <div className="min-w-0">
                    <h1 className="text-2xl sm:text-3xl font-bold text-white break-words">{project.name}</h1>
                    <Link to={`/clients/${client.id}`} className="text-lg text-primary-400 hover:underline">{client.name}</Link>
                </div>
                {/* Escritorio: todos los botones. Móvil: la acción principal y el resto en «Más acciones». */}
                <div className="hidden sm:flex items-center gap-2 flex-wrap">
                    <Button variant="secondary" onClick={handleCreateInvoice}>
                        <FileTextIcon className="w-4 h-4 mr-2"/> Crear Factura
                    </Button>
                    {project.budget_cents > 0 && (
                        <Button onClick={handleCreateInvoiceFromBudget}>
                            <DollarSignIcon className="w-4 h-4 mr-2"/> Facturar Presupuesto
                        </Button>
                    )}
                    {puedeEditar && (
                    <Button variant="secondary" onClick={() => setEditandoProyecto(true)} aria-label="Editar proyecto" title="Editar proyecto">
                        <EditIcon className="w-4 h-4 mr-2" /> Editar
                    </Button>
                    )}
                    {puedeBorrar && (
                    <Button
                        variant="secondary"
                        onClick={() => setIsDeleteProjectModalOpen(true)}
                        className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
                        aria-label="Eliminar proyecto"
                    >
                        <TrashIcon className="w-4 h-4" />
                    </Button>
                    )}
                </div>
                <div className="sm:hidden flex w-full items-center gap-2">
                    {project.budget_cents > 0 ? (
                        <Button className="flex-1 justify-center" onClick={handleCreateInvoiceFromBudget}>
                            <DollarSignIcon className="w-4 h-4 mr-2"/> Facturar presupuesto
                        </Button>
                    ) : (
                        <Button className="flex-1 justify-center" onClick={handleCreateInvoice}>
                            <FileTextIcon className="w-4 h-4 mr-2"/> Crear factura
                        </Button>
                    )}
                    {(project.budget_cents > 0 || puedeEditar || puedeBorrar) && (
                    <div className="relative">
                        <Button
                            variant="secondary"
                            onClick={() => setMenuAbierto((v) => !v)}
                            aria-label="Más acciones"
                            aria-haspopup="menu"
                            aria-expanded={menuAbierto}
                        >
                            <MoreVertical className="w-5 h-5" />
                        </Button>
                        {menuAbierto && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setMenuAbierto(false)} aria-hidden="true" />
                                <div role="menu" className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-gray-700 bg-gray-900 shadow-xl">
                                    {project.budget_cents > 0 && (
                                        <button role="menuitem" className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-gray-200 hover:bg-gray-800" onClick={() => { setMenuAbierto(false); handleCreateInvoice(); }}>
                                            <FileTextIcon className="w-4 h-4" /> Crear factura
                                        </button>
                                    )}
                                    {puedeEditar && (
                                        <button role="menuitem" className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-gray-200 hover:bg-gray-800" onClick={() => { setMenuAbierto(false); setEditandoProyecto(true); }}>
                                            <EditIcon className="w-4 h-4" /> Editar proyecto
                                        </button>
                                    )}
                                    {puedeBorrar && (
                                        <button role="menuitem" className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-red-400 hover:bg-red-500/10" onClick={() => { setMenuAbierto(false); setIsDeleteProjectModalOpen(true); }}>
                                            <TrashIcon className="w-4 h-4" /> Eliminar proyecto
                                        </button>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1 space-y-6">
                    <Card>
                        <CardHeader className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-white">Detalles del Proyecto</h2>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <label className="text-sm font-medium text-gray-400 block">Estado</label>
                                <select 
                                    aria-label="Estado"
                                    value={project.status} 
                                    disabled={!puede('editarProyecto', project.user_id, profile?.id, teamMembership)}
                                    onChange={(e) => updateProjectStatus(project.id, e.target.value as Project['status']).catch(() => addToast('No se pudo cambiar el estado.', 'error'))}
                                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-600 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm rounded-md bg-gray-800 text-white"
                                >
                                    <option value="planning">Planificación</option>
                                    <option value="in-progress">En Progreso</option>
                                    <option value="completed">Completado</option>
                                    <option value="on-hold">En Pausa</option>
                                </select>
                            </div>
                             <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-sm font-medium text-gray-400">Categoría</p>
                                    <p className="text-white">{project.category || 'Sin definir'}</p>
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-gray-400">Prioridad</p>
                                    <p className="text-white">{({ Low: 'Baja', Medium: 'Media', High: 'Alta' } as Record<string, string>)[project.priority] ?? project.priority ?? 'Sin definir'}</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-sm font-medium text-gray-400">Fecha de Inicio</p>
                                    <p className="text-white">{project.start_date ? formatearFecha(project.start_date) : 'Sin definir'}</p>
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-gray-400">Fecha de Entrega</p>
                                    <p className="text-white">{project.due_date ? formatearFecha(project.due_date) : 'Sin definir'}</p>
                                </div>
                            </div>
                            {project.budget_cents > 0 && (
                                <div>
                                    <p className="text-sm font-medium text-gray-400">Presupuesto</p>
                                    <p className="text-white font-semibold">{formatCurrency(project.budget_cents)}</p>
                                </div>
                            )}
                             <div>
                                <p className="text-sm font-medium text-gray-400">Progreso de Tareas</p>
                                <div className="w-full bg-gray-700 rounded-full h-2.5 mt-1">
                                    <div className="bg-primary-600 h-2.5 rounded-full" style={{ width: `${projectStats.progress}%` }}></div>
                                </div>
                                 <p className="text-xs text-right text-gray-400 mt-1">{projectStats.completedTasks} de {tasks.length} completadas</p>
                            </div>
                             <div>
                                <p className="text-sm font-medium text-gray-400 flex items-center gap-2"><ClockIcon className="w-4 h-4"/> Horas Registradas</p>
                                <p className="text-2xl font-bold text-white mt-1">{projectStats.hoursTracked.toFixed(2)}h</p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <h2 className="text-lg font-semibold text-white">Hitos</h2>
                        </CardHeader>
                        <CardContent>
                            <HitosDelProyecto
                                projectId={project.id}
                                puedeEditar={puede('editarProyecto', project.user_id, profile?.id, teamMembership)}
                            />
                        </CardContent>
                    </Card>

                    {budgetStats && project.budget_cents > 0 && (
                        <Card>
                            <CardHeader>
                                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                                    <DollarSignIcon className="w-5 h-5"/> Control Presupuestario
                                </h2>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div>
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="text-gray-300">Consumido</span>
                                        <span className="font-semibold text-white">{formatCurrency(budgetStats.totalCosts)}</span>
                                    </div>
                                    <div className="w-full bg-gray-700 rounded-full h-4">
                                        <div 
                                            className={`h-4 rounded-full text-center text-xs text-white font-bold transition-all duration-500 ${
                                                budgetStats.consumedPercentage > 90 ? 'bg-red-600' :
                                                budgetStats.consumedPercentage > 75 ? 'bg-yellow-500' :
                                                'bg-green-600'
                                            }`} 
                                            style={{ width: `${Math.min(budgetStats.consumedPercentage, 100)}%` }}
                                        >
                                            {budgetStats.consumedPercentage.toFixed(0)}%
                                        </div>
                                    </div>
                                    <div className="flex justify-between text-sm mt-1">
                                        <span className="text-gray-400">Restante: {formatCurrency(budgetStats.remainingBudget)}</span>
                                        <span className="text-gray-400">Total: {formatCurrency(project.budget_cents)}</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>

                <Card className="lg:col-span-2">
                    <CardHeader>
                        <h2 className="text-lg font-semibold text-white">Tareas del Proyecto</h2>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleAddTask} className="flex gap-2 mb-4">
                            <Input
                                wrapperClassName="flex-1"
                                placeholder="Añadir nueva tarea..."
                                value={newTaskDescription}
                                onChange={(e) => setNewTaskDescription(e.target.value)}
                            />
                            <Button type="submit" aria-label="Añadir nueva tarea"><PlusIcon className="w-5 h-5"/></Button>
                        </form>
                        {tasks.length > 0 ? (
                            <ul className="space-y-2 max-h-96 overflow-y-auto pr-2">
                                {tasks.map(task => (
                                    <li key={task.id} className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                                        <div className="flex items-center gap-3">
                                            <button onClick={() => toggleTask(task.id)} aria-label={(task.status === 'done' || task.status === 'completed') ? `Marcar tarea '${task.description}' como incompleta` : `Marcar tarea '${task.description}' como completada`}>
                                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${(task.status === 'done' || task.status === 'completed') ? 'border-primary-500 bg-primary-500' : 'border-gray-500'}`}>
                                                    {(task.status === 'done' || task.status === 'completed') && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                                </div>
                                            </button>
                                            {tareaEnEdicion?.id === task.id ? (
                                                <input
                                                    autoFocus
                                                    aria-label="Texto de la tarea"
                                                    value={tareaEnEdicion.texto}
                                                    onChange={(e) => setTareaEnEdicion({ id: task.id, texto: e.target.value })}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') { e.preventDefault(); guardarTarea(); }
                                                        if (e.key === 'Escape') setTareaEnEdicion(null);
                                                    }}
                                                    onBlur={guardarTarea}
                                                    className="flex-1 bg-gray-900 border border-gray-700 rounded-md px-2 py-1 text-sm text-white"
                                                />
                                            ) : (
                                                <span className={` ${(task.status === 'done' || task.status === 'completed') ? 'line-through text-gray-500' : 'text-white'}`}>{task.description}</span>
                                            )}
                                        </div>
                                        <div className="flex gap-2">
                                        {tareaEnEdicion?.id !== task.id && (
                                        <Button size="sm" variant="secondary" onClick={() => setTareaEnEdicion({ id: task.id, texto: task.description })} aria-label={`Editar tarea '${task.description}'`}>
                                            <EditIcon className="w-4 h-4"/>
                                        </Button>
                                        )}
                                        {puede('borrarTarea', task.user_id ?? project.user_id, profile?.id, teamMembership) && (
                                        <Button size="sm" variant="danger" onClick={() => handleDeleteClick(task)} aria-label={`Eliminar tarea '${task.description}'`}>
                                            <TrashIcon className="w-4 h-4"/>
                                        </Button>
                                        )}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <EmptyState
                                icon={FileTextIcon}
                                title="No hay tareas"
                                message="Aún no has añadido ninguna tarea a este proyecto. ¡Añade la primera para empezar a organizarte!"
                            />
                        )}
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                        <MessageSquareIcon className="w-5 h-5"/> Canal del Proyecto
                    </h2>
                </CardHeader>
                <CardContent>
                    <Suspense fallback={<div className="h-[500px] flex items-center justify-center text-gray-400">Cargando chat...</div>}>
                        <ProjectChat projectId={project.id} puedeResumir />
                    </Suspense>
                </CardContent>
            </Card>

            <Suspense fallback={null}>
                {isConfirmModalOpen && (
                    <ConfirmationModal 
                        isOpen={isConfirmModalOpen}
                        onClose={() => setIsConfirmModalOpen(false)}
                        onConfirm={confirmDelete}
                        title="¿Eliminar Tarea?"
                        message={`¿Estás seguro de que quieres eliminar la tarea: "${taskToDelete?.description}"?`}
                    />
                )}
                {isDeleteProjectModalOpen && (
                    <ConfirmationModal
                        isOpen={isDeleteProjectModalOpen}
                        onClose={() => setIsDeleteProjectModalOpen(false)}
                        onConfirm={handleDeleteProject}
                        title="¿Eliminar proyecto?"
                        message={`Se eliminará "${project.name}" junto a sus tareas, registros de tiempo y contratos. Las facturas y gastos ya emitidos no se borran, solo quedan sin proyecto asociado. Esta acción no se puede deshacer.${deletingProject ? ' Eliminando…' : ''}`}
                    />
                )}
            </Suspense>
            <ProjectFormModal
                isOpen={editandoProyecto}
                onClose={() => setEditandoProyecto(false)}
                proyecto={project}
                onGuardar={guardarProyecto}
            />
        </div>
    );
};

export default ProjectDetailPage;