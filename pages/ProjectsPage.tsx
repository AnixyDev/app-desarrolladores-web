
import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAppStore } from '../hooks/useAppStore';
import Card, { CardContent, CardHeader } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import { Project, NewProject, NewClient } from '../types';
import { formatCurrency } from '../lib/utils';
import StatusChip from '../components/ui/StatusChip';
import EmptyState from '../components/ui/EmptyState';
import { BriefcaseIcon, PlusIcon, SearchIcon, Filter, Users } from '../components/icons/Icon';
import { useToast } from '../hooks/useToast';

const ProjectsPage: React.FC = () => {
    const { projects, clients, tasks, addProject, getClientById, addClient } = useAppStore();
    const { addToast } = useToast();
    
    // UI State
    const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
    const [isClientModalOpen, setIsClientModalOpen] = useState(false);
    
    // Filters State
    const [filterStatus, setFilterStatus] = useState<'all' | Project['status']>('all');
    const [filterClient, setFilterClient] = useState<string>('all');
    const [searchTerm, setSearchTerm] = useState('');

    const initialProjectState: NewProject = {
        name: '',
        client_id: clients[0]?.id || '',
        description: '',
        status: 'planning',
        start_date: new Date().toISOString().split('T')[0],
        due_date: '',
        budget_cents: 0,
    };
    const [newProject, setNewProject] = useState<NewProject>(initialProjectState);
    
    const initialClientState: NewClient = { name: '', company: '', email: '', phone: '' };
    const [newClient, setNewClient] = useState<NewClient>(initialClientState);

    // Calculate progress for a project based on its tasks
    const getProjectProgress = (projectId: string) => {
        const projectTasks = tasks.filter(t => t.project_id === projectId);
        if (projectTasks.length === 0) return 0;
        const completed = projectTasks.filter(t => t.completed).length;
        return Math.round((completed / projectTasks.length) * 100);
    };

    const filteredProjects = useMemo(() => {
        return projects.filter(p => {
            const matchesStatus = filterStatus === 'all' || p.status === filterStatus;
            const matchesClient = filterClient === 'all' || p.client_id === filterClient;
            const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                  getClientById(p.client_id)?.name.toLowerCase().includes(searchTerm.toLowerCase());
            return matchesStatus && matchesClient && matchesSearch;
        });
    }, [projects, filterStatus, filterClient, searchTerm, getClientById]);

    const handleProjectInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setNewProject(prev => ({ ...prev, [name]: value }));
    };
    
    const handleClientInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setNewClient(prev => ({ ...prev, [name]: value }));
    };

    const handleBudgetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setNewProject(prev => ({ ...prev, budget_cents: Math.round(Number(e.target.value) * 100) }));
    };

    const handleProjectSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newProject.client_id) {
            addToast('Por favor, selecciona o crea un cliente.', 'error');
            return;
        }
        addProject(newProject);
        setIsProjectModalOpen(false);
        setNewProject(initialProjectState);
        addToast('Proyecto añadido con éxito.', 'success');
    };

    // FIX: Made handleClientSubmit async and awaited addClient to correctly access 'id' from the result.
    const handleClientSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newClient.name && newClient.email) {
            const createdClient = await addClient(newClient);
            if (createdClient) {
                setNewProject(prev => ({ ...prev, client_id: createdClient.id }));
            }
            setIsClientModalOpen(false);
            setNewClient(initialClientState);
            addToast('Cliente añadido. Ahora puedes seleccionarlo.', 'success');
        }
    };
    
    const openProjectModal = () => {
        setNewProject({
            ...initialProjectState,
            client_id: clients.length > 0 ? clients[0].id : ''
        });
        setIsProjectModalOpen(true);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h1 className="text-2xl font-semibold text-white">Proyectos</h1>
                <Button onClick={openProjectModal}>
                    <PlusIcon className="w-5 h-5 mr-2" />
                    Nuevo Proyecto
                </Button>
            </div>

            {/* Filters Bar */}
            <Card className="bg-gray-900 border-gray-800">
                <div className="p-4 flex flex-col md:flex-row gap-4 items-center">
                    <div className="relative flex-1 w-full">
                        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <input 
                            type="text" 
                            placeholder="Buscar proyecto..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-gray-800 text-white pl-10 pr-4 py-2 rounded-lg border border-gray-700 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none text-sm"
                        />
                    </div>
                    
                    <div className="flex gap-2 w-full md:w-auto">
                        <div className="relative w-full md:w-48">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Users className="h-4 w-4 text-gray-500" />
                            </div>
                            <select
                                value={filterClient}
                                onChange={(e) => setFilterClient(e.target.value)}
                                className="block w-full pl-10 pr-8 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-primary-500 focus:border-primary-500 appearance-none"
                            >
                                <option value="all">Todos los Clientes</option>
                                {clients.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="relative w-full md:w-48">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Filter className="h-4 w-4 text-gray-500" />
                            </div>
                            <select
                                value={filterStatus}
                                onChange={(e) => setFilterStatus(e.target.value as any)}
                                className="block w-full pl-10 pr-8 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-primary-500 focus:border-primary-500 appearance-none"
                            >
                                <option value="all">Todos los Estados</option>
                                <option value="planning">Planificación</option>
                                <option value="in-progress">En Progreso</option>
                                <option value="completed">Completado</option>
                                <option value="on-hold">En Pausa</option>
                            </select>
                        </div>
                    </div>
                </div>
            </Card>
            
            {filteredProjects.length > 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                    {filteredProjects.map(project => {
                        const progress = getProjectProgress(project.id);
                        const client = getClientById(project.client_id);
                        
                        return (
                            <Card key={project.id} className="flex flex-col hover:border-primary-500/50 transition-all duration-300 group">
                                <CardHeader className="pb-3">
                                    <div className="flex justify-between items-start mb-2">
                                        <StatusChip type="project" status={project.status} />
                                        {project.budget_cents > 0 && (
                                            <span className="text-sm font-semibold text-white bg-gray-800 px-2 py-1 rounded">
                                                {formatCurrency(project.budget_cents)}
                                            </span>
                                        )}
                                    </div>
                                    <Link to={`/projects/${project.id}`} className="text-xl font-bold text-white group-hover:text-primary-400 transition-colors line-clamp-1" title={project.name}>
                                        {project.name}
                                    </Link>
                                    <Link to={`/clients/${project.client_id}`} className="text-sm text-gray-400 hover:text-gray-200 flex items-center gap-1 mt-1">
                                        <BriefcaseIcon className="w-3 h-3" />
                                        {client?.name || 'Cliente desconocido'}
                                    </Link>
                                </CardHeader>
                                
                                <CardContent className="flex-grow space-y-4 pt-0">
                                    <p className="text-sm text-gray-300 line-clamp-2 h-10">
                                        {project.description || 'Sin descripción.'}
                                    </p>
                                    
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                                            <span>Progreso</span>
                                            <span>{progress}%</span>
                                        </div>
                                        <div className="w-full bg-gray-700 rounded-full h-2">
                                            <div 
                                                className={`h-2 rounded-full transition-all duration-500 ${progress === 100 ? 'bg-green-500' : 'bg-primary-500'}`} 
                                                style={{ width: `${progress}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                </CardContent>
                                
                                <div className="px-6 py-4 border-t border-gray-800 bg-gray-900/50 rounded-b-lg flex items-center justify-between text-xs text-gray-400">
                                    <span>Inicio: {new Date(project.start_date).toLocaleDateString()}</span>
                                    <span className={new Date(project.due_date) < new Date() && project.status !== 'completed' ? 'text-red-400 font-bold' : ''}>
                                        Entrega: {new Date(project.due_date).toLocaleDateString()}
                                    </span>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            ) : (
                 <EmptyState
                    icon={BriefcaseIcon}
                    title="No se encontraron proyectos"
                    message={searchTerm || filterClient !== 'all' || filterStatus !== 'all' 
                        ? "No hay proyectos que coincidan con los filtros seleccionados." 
                        : "Aún no has creado ningún proyecto. ¡Empieza ahora!"}
                    action={filterStatus === 'all' && filterClient === 'all' && !searchTerm ? { text: 'Crear Primer Proyecto', onClick: openProjectModal } : { text: 'Limpiar Filtros', onClick: () => { setFilterClient('all'); setFilterStatus('all'); setSearchTerm(''); } }}
                />
            )}

            {/* Modal: Add Project */}
            <Modal isOpen={isProjectModalOpen} onClose={() => setIsProjectModalOpen(false)} title="Nuevo Proyecto">
                <form onSubmit={handleProjectSubmit} className="space-y-4">
                    <Input name="name" label="Nombre del Proyecto" value={newProject.name} onChange={handleProjectInputChange} required />
                    <div>
                         <label className="block text-sm font-medium text-gray-300 mb-1">Cliente</label>
                         <div className="flex gap-2">
                            <select name="client_id" value={newProject.client_id} onChange={handleProjectInputChange} className="flex-1 block w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-gray-800 text-white">
                                {clients.length === 0 && <option disabled value="">Crea un cliente primero</option>}
                                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            <Button type="button" variant="secondary" onClick={() => setIsClientModalOpen(true)}><PlusIcon className="w-4 h-4 mr-1" /> Nuevo</Button>
                         </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Descripción</label>
                         <textarea name="description" rows={3} value={newProject.description} onChange={handleProjectInputChange} className="block w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm placeholder-gray-500 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-gray-800 text-white" />
                    </div>
                     <div className="grid grid-cols-2 gap-4">
                        <Input name="start_date" label="Fecha de Inicio" type="date" value={newProject.start_date} onChange={handleProjectInputChange} required />
                        <Input name="due_date" label="Fecha de Entrega" type="date" value={newProject.due_date} onChange={handleProjectInputChange} required />
                    </div>
                    <Input label="Presupuesto (€, opcional)" type="number" step="0.01" onChange={handleBudgetChange} />
                    <div className="flex justify-end pt-4">
                        <Button type="submit">Crear Proyecto</Button>
                    </div>
                </form>
            </Modal>
            
            {/* Modal: Add Client (Quick Access) */}
            <Modal isOpen={isClientModalOpen} onClose={() => setIsClientModalOpen(false)} title="Añadir Cliente Rápido">
                <form onSubmit={handleClientSubmit} className="space-y-4">
                    <Input name="name" label="Nombre Completo" value={newClient.name} onChange={handleClientInputChange} required />
                    <Input name="company" label="Empresa" value={newClient.company} onChange={handleClientInputChange} />
                    <Input name="email" label="Email" type="email" value={newClient.email} onChange={handleClientInputChange} required />
                    <div className="flex justify-end pt-4">
                        <Button type="submit">Guardar Cliente</Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default ProjectsPage;
