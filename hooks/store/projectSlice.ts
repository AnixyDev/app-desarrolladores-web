import { StateCreator } from 'zustand';
import { Project, NewProject, Task, TimeEntry, NewTimeEntry } from '@/types';
import { AppState } from '../useAppStore';
import { supabase } from '@/lib/supabaseClient';

export interface ProjectSlice {
  projects: Project[];
  tasks: Task[];
  timeEntries: TimeEntry[];
  fetchProjects: () => Promise<void>;
  fetchTasks: () => Promise<void>;
  fetchTimeEntries: () => Promise<void>;
  getProjectById: (id: string) => Project | undefined;
  getProjectByName: (name: string) => Project | undefined;
  addProject: (project: NewProject) => Promise<void>;
  // AÑADIMOS ESTA LÍNEA PARA EL KANBAN Y EDICIONES GENERALES
  updateProject: (id: string, updates: Partial<Project>) => Promise<void>;
  updateProjectStatus: (id: string, status: Project['status']) => Promise<void>;
  getTasksByProjectId: (projectId: string) => Task[];
  addTask: (task: Omit<Task, 'id'|'user_id'|'created_at'|'completed'|'invoice_id'>) => Promise<void>;
  toggleTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  addTimeEntry: (entry: Omit<NewTimeEntry, 'user_id'>) => Promise<void>;
}

export const createProjectSlice: StateCreator<AppState, [], [], ProjectSlice> = (set, get) => ({
    projects: [],
    tasks: [],
    timeEntries: [],

    fetchProjects: async () => {
        const { data, error } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
        if (!error && data) set({ projects: data as Project[] });
    },

    fetchTasks: async () => {
        const { data, error } = await supabase.from('tasks').select('*').order('created_at', { ascending: true });
        if (!error && data) set({ tasks: data as Task[] });
    },

    fetchTimeEntries: async () => {
        const { data, error } = await supabase.from('time_entries').select('*').order('start_time', { ascending: false });
        if (!error && data) set({ timeEntries: data as TimeEntry[] });
    },

    getProjectById: (id) => get().projects.find(p => p.id === id),
    getProjectByName: (name) => get().projects.find(p => p.name.toLowerCase() === name.toLowerCase()),

    addProject: async (project) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const newProjectData = { ...project, user_id: user.id };
        const { data, error } = await supabase.from('projects').insert(newProjectData).select().single();
        
        if (!error && data) {
            set(state => ({ projects: [data as Project, ...state.projects] }));
        }
    },

    // ESTA ES LA NUEVA FUNCIÓN QUE ARREGLA TU ERROR EN PROJECTPAGE
    updateProject: async (id, updates) => {
        const { error } = await supabase.from('projects').update(updates).eq('id', id);
        
        if (!error) {
            set(state => ({ 
                projects: state.projects.map(p => p.id === id ? { ...p, ...updates } : p) 
            }));

            // Si el update incluye cambio de estado, enviamos notificación (opcional)
            if (updates.status) {
                const project = get().projects.find(p => p.id === id);
                const statusMap = {
                    'planning': 'Planificación',
                    'in-progress': 'En Progreso',
                    'completed': 'Completado',
                    'on-hold': 'En Pausa'
                };
                get().addNotification(
                    `El estado del proyecto "${project?.name}" ha cambiado a "${statusMap[updates.status]}".`,
                    `/projects/${id}`
                );
            }
        }
    },

    updateProjectStatus: async (id, status) => {
        // Ahora simplemente llamamos a la función general para no repetir código
        await get().updateProject(id, { status });
    },

    getTasksByProjectId: (projectId) => get().tasks.filter(t => t.project_id === projectId),

    addTask: async (task) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const newTaskData = { ...task, user_id: user.id, completed: false };
        const { data, error } = await supabase.from('tasks').insert(newTaskData).select().single();

        if (!error && data) {
            set(state => ({ tasks: [...state.tasks, data as Task] }));
        }
    },

    toggleTask: async (id) => {
        const task = get().tasks.find(t => t.id === id);
        if (!task) return;

        const newCompleted = !task.completed;
        set(state => ({ tasks: state.tasks.map(t => t.id === id ? { ...t, completed: newCompleted } : t) }));

        const { error } = await supabase.from('tasks').update({ completed: newCompleted }).eq('id', id);
        if (error) {
            set(state => ({ tasks: state.tasks.map(t => t.id === id ? { ...t, completed: !newCompleted } : t) }));
        }
    },

    deleteTask: async (id) => {
        const { error } = await supabase.from('tasks').delete().eq('id', id);
        if (!error) {
            set(state => ({ tasks: state.tasks.filter(t => t.id !== id) }));
        }
    },

    addTimeEntry: async (entry) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase.from('time_entries').insert({ ...entry, user_id: user.id }).select().single();
        if (!error && data) {
            set(state => ({ timeEntries: [data as TimeEntry, ...state.timeEntries].sort((a,b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime()) }));
        }
    },
});