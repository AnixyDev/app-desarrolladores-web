import React, { useState, useMemo, lazy, Suspense } from 'react';
// FIX: Remove .tsx extensions from imports to fix module resolution errors.
import { useAppStore } from '../hooks/useAppStore';
import Card, { CardContent, CardHeader } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import { ClockIcon, PlusIcon, SparklesIcon, RefreshCwIcon } from '../components/icons/Icon';
import { useToast } from '../hooks/useToast';
import { generateTimeEntryDescription, AI_CREDIT_COSTS } from '../services/geminiService';

const TimeDistributionChart = lazy(() => import('../components/charts/TimeDistributionChart'));
const WeeklyHoursChart = lazy(() => import('../components/charts/WeeklyHoursChart'));
const BuyCreditsModal = lazy(() => import('../components/modals/BuyCreditsModal'));


interface ManualEntryForm {
    project_id: string;
    description: string;
    date: string;
    duration_hours: string; // Use string for input field
}

const TimeTrackingPage: React.FC = () => {
    const { timeEntries, projects, getProjectById, addTimeEntry, profile, consumeCredits } = useAppStore();
    const { addToast } = useToast();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [isBuyCreditsModalOpen, setIsBuyCreditsModalOpen] = useState(false);
    
    const initialFormState: ManualEntryForm = {
        project_id: projects[0]?.id || '',
        description: '',
        date: new Date().toISOString().split('T')[0],
        duration_hours: '',
    };
    const [formState, setFormState] = useState<ManualEntryForm>(initialFormState);

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

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormState(prev => ({ ...prev, [name]: value }));
    };

    const handleAddEntry = (e: React.FormEvent) => {
        e.preventDefault();
        const durationHoursNum = parseFloat(formState.duration_hours);
        if (isNaN(durationHoursNum) || durationHoursNum <= 0) {
            addToast('Por favor, introduce una duración válida.', 'error');
            return;
        }

        const duration_seconds = durationHoursNum * 3600;
        const entryDate = new Date(formState.date);
        
        // Use a neutral time to avoid timezone issues with just date
        const start_time = new Date(entryDate.getFullYear(), entryDate.getMonth(), entryDate.getDate(), 9, 0, 0).toISOString();
        const end_time = new Date(new Date(start_time).getTime() + duration_seconds * 1000).toISOString();

        addTimeEntry({
            project_id: formState.project_id,
            description: formState.description,
            start_time,
            end_time,
            duration_seconds,
            invoice_id: null,
        });
        
        addToast('Entrada de tiempo añadida con éxito', 'success');
        setIsModalOpen(false);
        setFormState(initialFormState);
    };

    const openModal = () => {
        setFormState({
            ...initialFormState,
            project_id: projects.length > 0 ? projects[0].id : '',
        });
        setIsModalOpen(true);
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
            setFormState(prev => ({...prev, description }));
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
                <h1 className="text-2xl font-semibold text-white flex items-center gap-2">
                    <ClockIcon className="w-6 h-6"/> Time Tracking
                </h1>
                <Button onClick={openModal}><PlusIcon className="w-4 h-4 mr-2"/>Añadir Entrada Manual</Button>
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
                <CardHeader><h2 className="text-lg font-semibold">Registros de Tiempo</h2></CardHeader>
                <CardContent className="p-0">
                    <table className="w-full text-left">
                        <thead className="border-b border-gray-800">
                            <tr>
                                <th className="p-4">Proyecto</th>
                                <th className="p-4">Descripción</th>
                                <th className="p-4">Fecha</th>
                                <th className="p-4">Duración</th>
                            </tr>
                        </thead>
                        <tbody>
                            {timeEntries.map(entry => (
                                <tr key={entry.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                                    <td className="p-4 text-primary-400">{getProjectById(entry.project_id)?.name}</td>
                                    <td className="p-4 text-white">{entry.description}</td>
                                    <td className="p-4 text-gray-300">{new Date(entry.start_time).toLocaleDateString()}</td>
                                    <td className="p-4 text-white font-semibold">{(entry.duration_seconds / 3600).toFixed(2)}h</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </CardContent>
            </Card>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Añadir Entrada de Tiempo Manual">
                <form onSubmit={handleAddEntry} className="space-y-4">
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
                                {isAiLoading ? <RefreshCwIcon className="w-4 h-4 animate-spin"/> : <SparklesIcon className="w-4 h-4" />}
                            </Button>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <Input name="date" label="Fecha" type="date" value={formState.date} onChange={handleInputChange} required />
                        <Input name="duration_hours" label="Duración (horas)" type="number" step="0.01" value={formState.duration_hours} onChange={handleInputChange} required placeholder="Ej: 1.5"/>
                    </div>
                    <div className="flex justify-end pt-4">
                        <Button type="submit">Guardar Entrada</Button>
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