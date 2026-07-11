import React, { useState, useMemo, lazy, Suspense } from 'react';
import { useAppStore } from '@/hooks/useAppStore';
import Card, { CardContent, CardHeader } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import { ClockIcon, PlusIcon, SparklesIcon, RefreshCwIcon, EditIcon, TrashIcon, ChevronDownIcon, ChevronUpIcon } from '@/components/icons/Icon';
import { useToast } from '@/hooks/useToast';
import { generateTimeEntryDescription, AI_CREDIT_COSTS } from '@/services/geminiService';
import { TimeEntry } from '@/types';

const TimeDistributionChart = lazy(() => import('@/components/charts/TimeDistributionChart'));
const WeeklyHoursChart = lazy(() => import('@/components/charts/WeeklyHoursChart'));
const BuyCreditsModal = lazy(() => import('@/components/modals/BuyCreditsModal'));

interface ManualEntryForm {
    project_id: string;
    description: string;
    date: string;
    duration_hours: string; // Use string for input field
}

const initialFormState = (defaultProjectId: string): ManualEntryForm => ({
    project_id: defaultProjectId,
    description: '',
    date: new Date().toISOString().split('T')[0],
    duration_hours: '',
});

// Formatea segundos como "Xh Ym" para que los totales se lean con naturalidad,
// en vez de solo horas decimales (ej. "1.75h" -> "1h 45m").
const formatHoursMinutes = (totalSeconds: number): string => {
    const totalMinutes = Math.round(totalSeconds / 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
};

const TimeTrackingPage: React.FC = () => {
    const { timeEntries, projects, getProjectById, addTimeEntry, updateTimeEntry, deleteTimeEntry, profile, consumeCredits } = useAppStore();
    const { addToast } = useToast();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [isBuyCreditsModalOpen, setIsBuyCreditsModalOpen] = useState(false);
    const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
    const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({});

    const [formState, setFormState] = useState<ManualEntryForm>(initialFormState(projects[0]?.id || ''));

    const timeByProject = useMemo(() => {
        const data: { [key: string]: number } = {};
        timeEntries.forEach(entry => {
            const project = getProjectById(entry.project_id);
            if (project) {
                if (!data[project.name]) {
                    data[project.name] = 0;
                }
                data[project.name] += entry.duration_seconds / 3600; // convert to hours
            }
        });
        return Object.entries(data).map(([name, value]) => ({ name, value }));
    }, [timeEntries, getProjectById]);

    const timeByWeek = useMemo(() => {
        const data: { [key: string]: number } = { 'Dom': 0, 'Lun': 0, 'Mar': 0, 'Mié': 0, 'Jue': 0, 'Vie': 0, 'Sáb': 0 };
        const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        const today = new Date();
        const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(endOfWeek.getDate() + 6);

        timeEntries.forEach(entry => {
            const entryDate = new Date(entry.start_time);
            if (entryDate >= startOfWeek && entryDate <= endOfWeek) {
                const dayName = dayNames[entryDate.getDay()];
                data[dayName] += entry.duration_seconds / 3600;
            }
        });
        return Object.entries(data).map(([name, hours]) => ({ name, hours }));
    }, [timeEntries]);

    // FIX: petición explícita — "que cada proyecto se unifique, si hay varios
    // tiempos introducidos que se sumen y salga el total". Antes era una
    // lista plana de registros sin agrupar ni sumar por proyecto.
    const groupedByProject = useMemo(() => {
        const groups: Record<string, { projectId: string; projectName: string; entries: TimeEntry[]; totalSeconds: number }> = {};

        timeEntries.forEach(entry => {
            const key = entry.project_id || 'sin-proyecto';
            if (!groups[key]) {
                groups[key] = {
                    projectId: entry.project_id,
                    projectName: getProjectById(entry.project_id)?.name || 'Sin proyecto',
                    entries: [],
                    totalSeconds: 0,
                };
            }
            groups[key].entries.push(entry);
            groups[key].totalSeconds += entry.duration_seconds;
        });

        return Object.values(groups)
            .map(g => ({
                ...g,
                entries: g.entries.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime()),
            }))
            .sort((a, b) => b.totalSeconds - a.totalSeconds);
    }, [timeEntries, getProjectById]);

    const totalTrackedSeconds = useMemo(
        () => timeEntries.reduce((acc, e) => acc + e.duration_seconds, 0),
        [timeEntries]
    );

    const toggleProjectCollapse = (projectKey: string) => {
        setCollapsedProjects(prev => ({ ...prev, [projectKey]: !prev[projectKey] }));
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormState(prev => ({ ...prev, [name]: value }));
    };

    // FIX: handleAddEntry ahora también sirve para EDITAR. Si editingEntryId
    // tiene valor, actualiza en vez de crear un registro nuevo.
    const handleSubmitEntry = async (e: React.FormEvent) => {
        e.preventDefault();
        const durationHoursNum = parseFloat(formState.duration_hours);
        if (isNaN(durationHoursNum) || durationHoursNum <= 0) {
            addToast('Por favor, introduce una duración válida.', 'error');
            return;
        }
        if (!formState.project_id) {
            addToast('Selecciona un proyecto.', 'error');
            return;
        }

        const duration_seconds = durationHoursNum * 3600;
        const entryDate = new Date(formState.date);

        // Use a neutral time to avoid timezone issues with just date
        const start_time = new Date(entryDate.getFullYear(), entryDate.getMonth(), entryDate.getDate(), 9, 0, 0).toISOString();
        const end_time = new Date(new Date(start_time).getTime() + duration_seconds * 1000).toISOString();

        try {
            if (editingEntryId) {
                await updateTimeEntry(editingEntryId, {
                    project_id: formState.project_id,
                    description: formState.description,
                    start_time,
                    end_time,
                    duration_seconds,
                });
                addToast('Registro de tiempo actualizado.', 'success');
            } else {
                await addTimeEntry({
                    project_id: formState.project_id,
                    description: formState.description,
                    start_time,
                    end_time,
                    duration_seconds,
                    invoice_id: null,
                });
                addToast('Entrada de tiempo añadida con éxito', 'success');
            }
            handleCloseModal();
        } catch (error) {
            addToast('No se pudo guardar el registro de tiempo.', 'error');
        }
    };

    const openModal = () => {
        setEditingEntryId(null);
        setFormState(initialFormState(projects.length > 0 ? projects[0].id : ''));
        setIsModalOpen(true);
    };

    // FIX: nuevo — antes no existía forma de editar un registro ya creado.
    const openEditModal = (entry: TimeEntry) => {
        setEditingEntryId(entry.id);
        setFormState({
            project_id: entry.project_id,
            description: entry.description || '',
            date: entry.start_time.split('T')[0],
            duration_hours: (entry.duration_seconds / 3600).toFixed(2),
        });
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingEntryId(null);
        setFormState(initialFormState(projects[0]?.id || ''));
    };

    // FIX: nuevo — antes no existía forma de borrar un registro de tiempo.
    const handleDeleteEntry = async (entry: TimeEntry) => {
        if (window.confirm(`¿Eliminar este registro de tiempo (${formatHoursMinutes(entry.duration_seconds)})? Esta acción no se puede deshacer.`)) {
            try {
                await deleteTimeEntry(entry.id);
                addToast('Registro de tiempo eliminado.', 'success');
            } catch (error) {
                addToast('No se pudo eliminar el registro.', 'error');
            }
        }
    };

    const handleAiGenerateDescription = async () => {
        if (!formState.project_id) {
            addToast('Por favor, selecciona un proyecto primero.', 'error');
            return;
        }
        if (profile.ai_credits < AI_CREDIT_COSTS.enhanceTimeEntry) {
            setIsBuyCreditsModalOpen(true);
            return;
        }

        setIsAiLoading(true);
        const selectedProject = getProjectById(formState.project_id);
        if (!selectedProject) {
            addToast('Proyecto no encontrado.', 'error');
            setIsAiLoading(false);
            return;
        }

        try {
            const description = await generateTimeEntryDescription(
                selectedProject.name,
                selectedProject.description || '',
                formState.description // Use current description as keywords
            );
            setFormState(prev => ({ ...prev, description }));
            consumeCredits(AI_CREDIT_COSTS.enhanceTimeEntry);
            addToast('Descripción generada con IA', 'success');
        } catch (error) {
            addToast('Error al generar la descripción.', 'error');
        } finally {
            setIsAiLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-semibold text-white flex items-center gap-2">
                        <ClockIcon className="w-6 h-6" /> Time Tracking
                    </h1>
                    {timeEntries.length > 0 && (
                        <p className="text-sm text-gray-500 mt-1">
                            Total registrado: <span className="text-primary-400 font-semibold">{formatHoursMinutes(totalTrackedSeconds)}</span> en {groupedByProject.length} proyecto{groupedByProject.length !== 1 ? 's' : ''}
                        </p>
                    )}
                </div>
                <Button onClick={openModal}><PlusIcon className="w-4 h-4 mr-2" />Añadir Entrada Manual</Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <CardHeader><h2 className="text-lg font-semibold">Horas por Proyecto</h2></CardHeader>
                    <CardContent>
                        <Suspense fallback={<div className="h-[300px] flex items-center justify-center text-gray-400">Cargando gráfico...</div>}>
                            <TimeDistributionChart data={timeByProject} />
                        </Suspense>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader><h2 className="text-lg font-semibold">Actividad Semanal</h2></CardHeader>
                    <CardContent>
                        <Suspense fallback={<div className="h-[300px] flex items-center justify-center text-gray-400">Cargando gráfico...</div>}>
                            <WeeklyHoursChart data={timeByWeek} />
                        </Suspense>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader><h2 className="text-lg font-semibold">Registros de Tiempo por Proyecto</h2></CardHeader>
                <CardContent className="p-0 divide-y divide-gray-800">
                    {groupedByProject.length === 0 && (
                        <p className="p-6 text-center text-gray-500 text-sm">Aún no has registrado tiempo. Pulsa "Añadir Entrada Manual" para empezar.</p>
                    )}
                    {groupedByProject.map(group => {
                        const isCollapsed = collapsedProjects[group.projectId];
                        return (
                            <div key={group.projectId}>
                                {/* Cabecera del grupo: nombre del proyecto + total sumado de todas sus entradas */}
                                <button
                                    onClick={() => toggleProjectCollapse(group.projectId)}
                                    className="w-full flex items-center justify-between p-4 hover:bg-gray-800/30 transition-colors text-left"
                                >
                                    <div className="flex items-center gap-2">
                                        {isCollapsed ? <ChevronDownIcon className="w-4 h-4 text-gray-500" /> : <ChevronUpIcon className="w-4 h-4 text-gray-500" />}
                                        <span className="text-primary-400 font-semibold">{group.projectName}</span>
                                        <span className="text-xs text-gray-500">({group.entries.length} registro{group.entries.length !== 1 ? 's' : ''})</span>
                                    </div>
                                    <span className="text-white font-bold">{formatHoursMinutes(group.totalSeconds)}</span>
                                </button>

                                {!isCollapsed && (
                                    <div className="divide-y divide-gray-800/60 bg-gray-950/30">
                                        {group.entries.map(entry => (
                                            <div key={entry.id} className="flex items-center justify-between gap-3 p-4 pl-10">
                                                <div className="min-w-0">
                                                    <p className="text-white text-sm truncate">{entry.description || <span className="text-gray-600 italic">Sin descripción</span>}</p>
                                                    <p className="text-xs text-gray-500">{new Date(entry.start_time).toLocaleDateString()}</p>
                                                </div>
                                                <div className="flex items-center gap-3 shrink-0">
                                                    <span className="text-sm font-semibold text-gray-300">{formatHoursMinutes(entry.duration_seconds)}</span>
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            onClick={() => openEditModal(entry)}
                                                            title="Editar"
                                                            className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                                                        >
                                                            <EditIcon className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteEntry(entry)}
                                                            title="Eliminar"
                                                            className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                                                        >
                                                            <TrashIcon className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </CardContent>
            </Card>

            <Modal isOpen={isModalOpen} onClose={handleCloseModal} title={editingEntryId ? 'Editar Entrada de Tiempo' : 'Añadir Entrada de Tiempo Manual'}>
                <form onSubmit={handleSubmitEntry} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Proyecto</label>
                        <select name="project_id" value={formState.project_id} onChange={handleInputChange} className="block w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-gray-800 text-white" required>
                            {projects.length > 0 ? (
                                projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)
                            ) : (
                                <option value="" disabled>Crea un proyecto primero</option>
                            )}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="description" className="block text-sm font-medium text-gray-300 mb-1">Descripción</label>
                        <div className="flex gap-2">
                            <Input
                                id="description"
                                name="description"
                                wrapperClassName="flex-1"
                                value={formState.description}
                                onChange={handleInputChange}
                                required
                            />
                            <Button type="button" variant="secondary" onClick={handleAiGenerateDescription} disabled={isAiLoading} aria-label="Generar descripción con IA">
                                {isAiLoading ? <RefreshCwIcon className="w-4 h-4 animate-spin" /> : <SparklesIcon className="w-4 h-4" />}
                            </Button>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <Input name="date" label="Fecha" type="date" value={formState.date} onChange={handleInputChange} required />
                        <Input name="duration_hours" label="Duración (horas)" type="number" step="0.01" value={formState.duration_hours} onChange={handleInputChange} required placeholder="Ej: 1.5" />
                    </div>
                    <div className="flex justify-end gap-3 pt-4">
                        <Button type="button" variant="secondary" onClick={handleCloseModal}>Cancelar</Button>
                        <Button type="submit">{editingEntryId ? 'Guardar Cambios' : 'Guardar Entrada'}</Button>
                    </div>
                </form>
            </Modal>

            <Suspense fallback={null}>
                {isBuyCreditsModalOpen && <BuyCreditsModal isOpen={isBuyCreditsModalOpen} onClose={() => setIsBuyCreditsModalOpen(false)} />}
            </Suspense>
        </div>
    );
};

export default TimeTrackingPage;