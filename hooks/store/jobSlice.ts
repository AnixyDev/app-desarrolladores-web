import { StateCreator } from 'zustand';
import { Job, JobApplication } from '@/types';
import { AppState } from '@/useAppStore';
import { supabase } from '.@/lib/supabaseClient';

export interface JobSlice {
  jobs: Job[];
  applications: JobApplication[];
  savedJobIds: string[];
  notifiedJobIds: string[];
  
  fetchJobs: () => Promise<void>;
  fetchApplications: () => Promise<void>;
  
  getJobById: (id: string) => Job | undefined;
  getApplicationsByUserId: (userId: string) => JobApplication[];
  getApplicationsByJobId: (jobId: string) => JobApplication[];
  getSavedJobs: () => Job[];
  
  addJob: (job: Omit<Job, 'id'>) => Promise<void>;
  applyForJob: (jobId: string, userId: string, proposalText: string) => Promise<void>;
  viewApplication: (applicationId: string) => Promise<void>;
  
  saveJob: (jobId: string) => void;
  markJobAsNotified: (jobId: string) => void;
}

export const createJobSlice: StateCreator<AppState, [], [], JobSlice> = (set, get) => ({
    jobs: [],
    applications: [],
    savedJobIds: [],
    notifiedJobIds: [],

    fetchJobs: async () => {
        const { data, error } = await supabase.from('jobs').select('*').order('created_at', { ascending: false });
        if (!error && data) set({ jobs: data as Job[] });
    },

    fetchApplications: async () => {
        const { data, error } = await supabase.from('job_applications').select('*');
        if (!error && data) set({ applications: data as JobApplication[] });
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
        if (!user) return;

        const { data, error } = await supabase.from('jobs').insert({ ...job, user_id: user.id }).select().single();
        if (!error && data) {
            set(state => ({ jobs: [data as Job, ...state.jobs] }));
        }
    },

    applyForJob: async (jobId, userId, proposalText) => {
        const job = get().getJobById(jobId);
        const profile = get().profile;

        if (!job || !profile) return;

        const { data, error } = await supabase.from('job_applications').insert({
            job_id: jobId,
            applicant_id: userId,
            proposal_text: String(proposalText), // Sanitización forzada a string
            status: 'sent'
        }).select().single();

        if (!error && data) {
            const newApp: JobApplication = {
                id: data.id,
                jobId: data.job_id,
                userId: data.applicant_id,
                applicantName: String(profile.full_name || 'Freelancer'),
                jobTitle: String(job.titulo || 'Oferta'), // Fix prop name
                proposalText: String(data.proposal_text),
                status: data.status,
                appliedAt: data.created_at
            };
            set(state => ({ applications: [newApp, ...state.applications] }));
        }
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
        }
    },

    saveJob: (jobId) => {
        const { savedJobIds } = get();
        if (savedJobIds.includes(jobId)) {
            set({ savedJobIds: savedJobIds.filter(id => id !== jobId) });
        } else {
            set({ savedJobIds: [...savedJobIds, jobId] });
        }
    },

    markJobAsNotified: (jobId) => {
        set(state => ({
            notifiedJobIds: [...new Set([...state.notifiedJobIds, jobId])]
        }));
    }
});
