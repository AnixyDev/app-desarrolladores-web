import { StateCreator } from 'zustand';
import { Job, JobApplication } from '@/types';
import { AppState } from '../useAppStore';
import { supabase } from '@/lib/supabaseClient';

const JOB_SELECT = `
  id,
  titulo,
  descripcionCorta:descripcioncorta,
  descripcionLarga:descripcionlarga,
  presupuesto,
  duracionSemanas:duracionsemanas,
  habilidades,
  cliente,
  fechaPublicacion:fechapublicacion,
  isFeatured:isfeatured,
  compatibilidadIA:compatibilidadia,
  created_at,
  email_contacto,
  postedByUserId:user_id
`;

export interface JobSlice {
  jobs: Job[];
  applications: JobApplication[];
  savedJobIds: string[];
  notifiedJobIds: string[];
  
  fetchJobs: () => Promise<void>;
  fetchApplications: () => Promise<void>;
  fetchSavedJobs: () => Promise<void>;
  
  getJobById: (id: string) => Job | undefined;
  getApplicationsByUserId: (userId: string) => JobApplication[];
  getApplicationsByJobId: (jobId: string) => JobApplication[];
  getSavedJobs: () => Job[];
  
  addJob: (job: Omit<Job, 'id' | 'created_at' | 'postedByUserId'>) => Promise<{ success: boolean; message?: string }>;
  deleteJob: (jobId: string) => Promise<{ success: boolean; message?: string }>;
  applyForJob: (jobId: string, userId: string, proposalText: string) => Promise<{ success: boolean; message?: string }>;
  viewApplication: (applicationId: string) => Promise<void>;
  updateApplicationStatus: (applicationId: string, status: 'accepted' | 'rejected') => Promise<{ success: boolean; message?: string }>;
  
  saveJob: (jobId: string) => Promise<void>;
  markJobAsNotified: (jobId: string) => void;
}

export const createJobSlice: StateCreator<AppState, [], [], JobSlice> = (set, get) => ({
    jobs: [],
    applications: [],
    savedJobIds: [],
    notifiedJobIds: [],

    fetchJobs: async () => {
        const { data, error } = await supabase.from('jobs').select(JOB_SELECT).order('created_at', { ascending: false });
        if (!error && data) set({ jobs: data as unknown as Job[] });
    },

    fetchApplications: async () => {
        const { data, error } = await supabase
            .from('job_applications')
            .select(`
                id,
                jobId:job_id,
                userId:applicant_id,
                proposalText:proposal_text,
                status,
                appliedAt:created_at,
                jobs ( titulo )
            `);

        if (error || !data) return;

        const rows = data as unknown as Array<{
            id: string; jobId: string; userId: string; proposalText: string;
            status: JobApplication['status']; appliedAt: string; jobs: { titulo: string } | null;
        }>;

        const applicantIds = [...new Set(rows.map(r => r.userId))];
        let namesById: Record<string, string> = {};
        if (applicantIds.length > 0) {
            const { data: profilesData } = await supabase
                .from('profiles')
                .select('id, full_name')
                .in('id', applicantIds);
            namesById = Object.fromEntries((profilesData || []).map((p: any) => [p.id, p.full_name]));
        }

        const applications: JobApplication[] = rows.map(row => ({
            id: row.id,
            jobId: row.jobId,
            userId: row.userId,
            applicantName: namesById[row.userId] || 'Freelancer',
            jobTitle: row.jobs?.titulo || 'Oferta',
            proposalText: row.proposalText,
            status: row.status,
            appliedAt: row.appliedAt,
        }));

        set({ applications });
    },

    fetchSavedJobs: async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data, error } = await supabase.from('saved_jobs').select('job_id').eq('user_id', user.id);
        if (!error && data) {
            set({ savedJobIds: data.map((row: any) => row.job_id) });
        }
    },

    getJobById: (id) => get().jobs.find(j => j.id === id),
    getApplicationsByUserId: (userId) => get().applications.filter(app => app.userId === userId),
    getApplicationsByJobId: (jobId) => get().applications.filter(app => app.jobId === jobId),
    getSavedJobs: () => {
        const { jobs, savedJobIds } = get();
        return jobs.filter(job => savedJobIds.includes(job.id));
    },

    addJob: async (job) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false, message: 'No se encontró sesión de usuario.' };

        const { data, error } = await supabase
            .from('jobs')
            .insert({
                titulo: job.titulo,
                descripcioncorta: job.descripcionCorta,
                descripcionlarga: job.descripcionLarga,
                presupuesto: job.presupuesto,
                duracionsemanas: job.duracionSemanas,
                habilidades: job.habilidades,
                cliente: job.cliente,
                fechapublicacion: job.fechaPublicacion,
                isfeatured: job.isFeatured ?? false,
                compatibilidadia: job.compatibilidadIA,
                email_contacto: job.email_contacto,
                user_id: user.id,
            })
            .select(JOB_SELECT)
            .single();

        if (!error && data) {
            set(state => ({ jobs: [data as unknown as Job, ...state.jobs] }));
            return { success: true };
        }

        console.error('Error al publicar la oferta:', error?.message);
        return { success: false, message: error?.message || 'No se pudo publicar la oferta.' };
    },

    deleteJob: async (jobId) => {
        const previous = get().jobs;
        set(state => ({ jobs: state.jobs.filter(j => j.id !== jobId) }));

        const { error } = await supabase.from('jobs').delete().eq('id', jobId);
        if (error) {
            set({ jobs: previous });
            return { success: false, message: error.message };
        }
        return { success: true };
    },

    applyForJob: async (jobId, userId, proposalText) => {
        const job = get().getJobById(jobId);
        const profile = get().profile;

        if (!job || !profile) return { success: false, message: 'No se pudo identificar la oferta o tu perfil.' };

        const { data, error } = await supabase.from('job_applications').insert({
            job_id: jobId,
            applicant_id: userId,
            proposal_text: String(proposalText),
            status: 'sent'
        }).select().single();

        if (error || !data) {
            console.error('Error al enviar la postulación:', error?.message);
            return {
                success: false,
                message: error?.code === '23505' || error?.message?.includes('duplicate')
                    ? 'Ya te has postulado a esta oferta.'
                    : (error?.message || 'No se pudo enviar la postulación.'),
            };
        }

        const newApp: JobApplication = {
            id: data.id,
            jobId: data.job_id,
            userId: data.applicant_id,
            applicantName: String(profile.full_name || 'Freelancer'),
            jobTitle: String(job.titulo || 'Oferta'),
            proposalText: String(data.proposal_text),
            status: data.status,
            appliedAt: data.created_at
        };
        set(state => ({ applications: [newApp, ...state.applications] }));
        return { success: true };
    },

    viewApplication: async (applicationId) => {
        const { error } = await supabase.from('job_applications')
            .update({ status: 'viewed' })
            .eq('id', applicationId)
            .eq('status', 'sent');

        if (!error) {
            set(state => ({
                applications: state.applications.map(app => 
                    app.id === applicationId && app.status === 'sent' 
                    ? { ...app, status: 'viewed' } 
                    : app
                )
            }));
        } else {
            console.error('Error al marcar la postulación como vista:', error.message);
        }
    },

    updateApplicationStatus: async (applicationId, status) => {
        const previous = get().applications;
        set(state => ({
            applications: state.applications.map(app => app.id === applicationId ? { ...app, status } : app),
        }));

        const { error } = await supabase.from('job_applications').update({ status }).eq('id', applicationId);
        if (error) {
            set({ applications: previous });
            return { success: false, message: error.message };
        }
        return { success: true };
    },

    saveJob: async (jobId) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { savedJobIds } = get();
        const alreadySaved = savedJobIds.includes(jobId);

        set({
            savedJobIds: alreadySaved
                ? savedJobIds.filter(id => id !== jobId)
                : [...savedJobIds, jobId]
        });

        if (alreadySaved) {
            const { error } = await supabase.from('saved_jobs').delete().eq('user_id', user.id).eq('job_id', jobId);
            if (error) {
                set({ savedJobIds: [...get().savedJobIds, jobId] });
            }
        } else {
            const { error } = await supabase.from('saved_jobs').insert({ user_id: user.id, job_id: jobId });
            if (error) {
                set({ savedJobIds: get().savedJobIds.filter(id => id !== jobId) });
            }
        }
    },

    markJobAsNotified: (jobId) => {
        set(state => ({
            notifiedJobIds: [...new Set([...state.notifiedJobIds, jobId])]
        }));
    }
});