import { StateCreator } from 'zustand';
import { Job, JobApplication } from '@/types';
import { AppState } from '../useAppStore';
import { supabase } from '@/lib/supabaseClient';

// FIX: la tabla `jobs` en Supabase tiene columnas en minúsculas pegadas
// (descripcionlarga, duracionsemanas, isfeatured, compatibilidadia...) porque
// se crearon sin comillas y Postgres las pliega a minúsculas automáticamente.
// El resto del código (formularios, páginas del marketplace) siempre ha usado
// camelCase (descripcionLarga, duracionSemanas...). Sin este alias, un
// `select('*')` devolvía las claves en minúsculas y todos esos campos
// aparecían como `undefined` en pantalla para cualquier job real (no de
// mock-data). Este alias hace que PostgREST devuelva las claves ya en el
// nombre que espera el frontend, sin tener que tocar el esquema de la BD.
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
  
  addJob: (job: Omit<Job, 'id' | 'created_at' | 'postedByUserId'>) => Promise<void>;
  applyForJob: (jobId: string, userId: string, proposalText: string) => Promise<void>;
  viewApplication: (applicationId: string) => Promise<void>;
  
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

    // FIX: antes hacía `select('*')` sin ningún mapeo. La tabla real usa
    // job_id/applicant_id/proposal_text (snake_case), pero getApplicationsByUserId
    // y getApplicationsByJobId filtran por .userId/.jobId (camelCase) — sin
    // este alias esas dos funciones SIEMPRE devolvían un array vacío, así que
    // "Mis Postulaciones" aparecía vacía aunque hubieras aplicado a ofertas
    // de verdad. También se resuelve jobTitle vía join (FK real a jobs) y
    // applicantName vía una segunda consulta a profiles (applicant_id
    // referencia auth.users, que PostgREST no expone para hacer join directo).
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

    // FIX: "Ofertas Guardadas" solo vivía en memoria (savedJobIds nunca se
    // leía de ningún sitio al arrancar). Ahora se carga desde la tabla real.
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
        if (!user) return;

        // FIX: se mapea explícitamente cada campo camelCase a su columna real
        // en minúsculas. Antes se hacía `{ ...job, user_id: user.id }` tal
        // cual, y Postgres rechazaba el insert porque columnas como
        // "descripcionCorta" no existen (la real es "descripcioncorta").
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

    // FIX: antes solo tocaba el estado local de Zustand, nunca Supabase.
    // Guardar una oferta se perdía en cuanto se refrescaba la página o se
    // volvía a iniciar sesión. Ahora persiste en la tabla saved_jobs, con
    // actualización optimista del estado local para que la UI responda al instante.
    saveJob: async (jobId) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { savedJobIds } = get();
        const alreadySaved = savedJobIds.includes(jobId);

        // Actualización optimista
        set({
            savedJobIds: alreadySaved
                ? savedJobIds.filter(id => id !== jobId)
                : [...savedJobIds, jobId]
        });

        if (alreadySaved) {
            const { error } = await supabase.from('saved_jobs').delete().eq('user_id', user.id).eq('job_id', jobId);
            if (error) {
                // Revertir si falla
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