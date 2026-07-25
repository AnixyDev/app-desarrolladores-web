import { StateCreator } from 'zustand';
import { Project, NewProject, Task, TimeEntry, NewTimeEntry } from '@/types';
import { AppState } from '../useAppStore';
import { supabase } from '@/lib/supabaseClient';

// NUEVO: el cronómetro vivía en useState local de MyTeamTimesheet.tsx —
// se paraba (y se perdía el tiempo acumulado) en cuanto se navegaba a
// otra página, porque el componente se desmontaba. Ahora vive en el store
// global y se basa en un timestamp de inicio (startedAt), no en un
// contador que necesita un intervalo corriendo sin parar: el tiempo
// transcurrido real siempre se puede recalcular con Date.now() - startedAt,
// sin importar por qué páginas se haya navegado mientras tanto.
export interface ActiveTimer {
  taskId: string;
  projectId: string;
  description: string;
  startedAt: number;
}

export interface ProjectSlice {
  projects: Project[];
  tasks: Task[];
  timeEntries: TimeEntry[];
  activeTimer: ActiveTimer | null;
  fetchProjects: () => Promise<void>;
  fetchTasks: () => Promise<void>;
  fetchTimeEntries: () => Promise<void>;
  getProjectById: (id: string) => Project | undefined;
  getProjectByName: (name: string) => Project | undefined;
  addProject: (project: NewProject) => Promise<void>;
  // AÑADIMOS ESTA LÍNEA PARA EL KANBAN Y EDICIONES GENERALES
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
  startTimer: (task: Task) => void;
  stopTimer: () => Promise<{ success: boolean; message?: string }>;
  cancelTimer: () => void;
}

export const createProjectSlice: StateCreator<AppState, [], [], ProjectSlice> = (set, get) => ({
    projects: [],
    tasks: [],
    timeEntries: [],
    activeTimer: null,

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

    // FIX: no existía ninguna forma de borrar un proyecto desde la UI.
    // A nivel de BD, tasks/time_entries/contracts/comments/files del proyecto
    // se borran en cascada; invoices/expenses/recurring_invoices solo se
    // desvinculan (project_id pasa a null), no se borran — así no se pierde
    // ningún dato de facturación real solo por borrar un proyecto.
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

        // Alterna entre 'todo' y 'completed'
        const isDone = task.status === 'completed' || task.status === 'done';
        const newStatus = isDone ? 'todo' : 'completed';
        set(state => ({ tasks: state.tasks.map(t => t.id === id ? { ...t, status: newStatus } : t) }));

        const { error } = await supabase.from('tasks').update({ status: newStatus }).eq('id', id);
        if (error) {
            // Revertir en caso de error
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
        if (!user) throw new Error('Usuario no autenticado');

        const { teamMembership } = get();
        const ownerId = teamMembership?.ownerId ?? user.id;

        const { data, error } = await supabase
            .from('time_entries')
            .insert({ ...entry, user_id: ownerId, logged_by: user.id })
            .select()
            .single();

        if (error) { console.error('Error adding time entry:', error); throw error; }
        set(state => ({ timeEntries: [data as TimeEntry, ...state.timeEntries].sort((a,b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime()) }));
    },

    // NUEVO: inicia el cronómetro global. Solo guarda el timestamp de
    // inicio — el tiempo transcurrido se recalcula siempre a partir de él,
    // así que sigue siendo válido aunque el componente que lo muestra se
    // desmonte (cambiar de página) y se vuelva a montar después.
    startTimer: (task) => {
        if (get().activeTimer) return; // ya hay uno corriendo, no pisar
        set({
            activeTimer: {
                taskId: task.id,
                projectId: task.project_id,
                description: task.description,
                startedAt: Date.now(),
            },
        });
    },

    // Detiene el cronómetro y registra el parte de horas correspondiente.
    // Solo se limpia activeTimer si el registro se guarda con éxito — si
    // falla, el cronómetro sigue corriendo para no perder el tiempo ya
    // trabajado, y se puede reintentar.
    stopTimer: async () => {
        const timer = get().activeTimer;
        if (!timer) return { success: false, message: 'No hay ningún cronómetro en marcha.' };

        const duration_seconds = Math.max(1, Math.round((Date.now() - timer.startedAt) / 1000));
        const start_time = new Date(timer.startedAt).toISOString();
        const end_time = new Date().toISOString();

        try {
            await get().addTimeEntry({
                project_id: timer.projectId,
                description: timer.description,
                start_time,
                end_time,
                duration_seconds,
                invoice_id: null,
            });
            set({ activeTimer: null });
            return { success: true };
        } catch (err) {
            return { success: false, message: (err as Error).message || 'No se pudo registrar el tiempo.' };
        }
    },

    // Descarta el cronómetro en marcha sin registrar nada (p. ej. si el
    // usuario se equivocó de tarea).
    cancelTimer: () => set({ activeTimer: null }),

    // FIX: no existía forma de editar ni borrar un registro de tiempo ya creado.
    updateTimeEntry: async (id, updates) => {
        const previous = get().timeEntries;
        set(state => ({
            timeEntries: state.timeEntries.map(t => t.id === id ? { ...t, ...updates } : t)
        }));

        const { error } = await supabase.from('time_entries').update(updates).eq('id', id);
        if (error) {
            set({ timeEntries: previous }); // revertir si falla
        }
    },

    deleteTimeEntry: async (id) => {
        const previous = get().timeEntries;
        set(state => ({ timeEntries: state.timeEntries.filter(t => t.id !== id) }));

        const { error } = await supabase.from('time_entries').delete().eq('id', id);
        if (error) {
            set({ timeEntries: previous }); // revertir si falla
        }
    },
});