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
  updateProject: (id: string, updates: Partial<Project>) => Promise<void>;
  updateProjectStatus: (id: string, status: Project['status']) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  getTasksByProjectId: (projectId: string) => Task[];
  addTask: (task: Omit<Task, 'id'|'user_id'|'created_at'|'status'|'invoice_id'>) => Promise<void>;
  toggleTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  addTimeEntry: (entry: Omit<NewTimeEntry, 'user_id'>) => Promise<void>;
  updateTimeEntry: (id: string, updates: Partial<NewTimeEntry>) => Promise<void>;
  deleteTimeEntry: (id: string) => Promise<void>;
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

    updateProject: async (id, updates) => {
        const { error } = await supabase.from('projects').update(updates).eq('id', id);
        
        if (!error) {
            set(state => ({ 
                projects: state.projects.map(p => p.id === id ? { ...p, ...updates } : p) 
            }));

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
        await get().updateProject(id, { status });
    },

    deleteProject: async (id) => {
        const { error } = await supabase.from('projects').delete().eq('id', id);
        if (!error) {
            set(state => ({
                projects: state.projects.filter(p => p.id !== id),
                tasks: state.tasks.filter(t => t.project_id !== id),
                timeEntries: state.timeEntries.filter(t => t.project_id !== id),
            }));
        }
    },

    getTasksByProjectId: (projectId) => get().tasks.filter(t => t.project_id === projectId),

    addTask: async (task) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const newTaskData = { ...task, user_id: user.id, status: 'todo' as const };
        const { data, error } = await supabase.from('tasks').insert(newTaskData).select().single();

        if (!error && data) {
            set(state => ({ tasks: [...state.tasks, data as Task] }));
        }
    },

    toggleTask: async (id) => {
        const task = get().tasks.find(t => t.id === id);
        if (!task) return;

        const isDone = task.status === 'completed' || task.status === 'done';
        const newStatus = isDone ? 'todo' : 'completed';
        set(state => ({ tasks: state.tasks.map(t => t.id === id ? { ...t, status: newStatus } : t) }));

        const { error } = await supabase.from('tasks').update({ status: newStatus }).eq('id', id);
        if (error) {
            set(state => ({ tasks: state.tasks.map(t => t.id === id ? { ...t, status: task.status } : t) }));
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

        // Si el usuario es un miembro de equipo invitado, las horas se
        // atribuyen al dueño del equipo (user_id = ownerId) y se deja
        // constancia de quién las registró (logged_by). Así cumple con la
        // política RLS "time_entries_insert_team_member" y aparece en la
        // facturación/reportes del dueño, no en una cuenta "huérfana".
        const { teamMembership } = get();
        const ownerId = teamMembership?.ownerId ?? user.id;

        const { data, error } = await supabase
            .from('time_entries')
            .insert({ ...entry, user_id: ownerId, logged_by: user.id })
            .select()
            .single();

        if (!error && data) {
            set(state => ({ timeEntries: [data as TimeEntry, ...state.timeEntries].sort((a,b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime()) }));
        }
    },

    updateTimeEntry: async (id, updates) => {
        const previous = get().timeEntries;
        set(state => ({
            timeEntries: state.timeEntries.map(t => t.id === id ? { ...t, ...updates } : t)
        }));

        const { error } = await supabase.from('time_entries').update(updates).eq('id', id);
        if (error) {
            set({ timeEntries: previous });
        }
    },

    deleteTimeEntry: async (id) => {
        const previous = get().timeEntries;
        set(state => ({ timeEntries: state.timeEntries.filter(t => t.id !== id) }));

        const { error } = await supabase.from('time_entries').delete().eq('id', id);
        if (error) {
            set({ timeEntries: previous });
        }
    },
});