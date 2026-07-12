import { StateCreator } from 'zustand';
import { UserData, Referral, KnowledgeArticle, TeamMembership } from '@/types';
import { AppState } from '../useAppStore';
import { supabase } from '@/lib/supabaseClient';

export interface TeamSlice {
  users: UserData[];
  referrals: Referral[];
  articles: KnowledgeArticle[];
  teamMembership: TeamMembership | null;
  fetchUsers: () => Promise<void>;
  fetchTeamMembership: () => Promise<void>;
  inviteUser: (name: string, email: string, role: UserData['role']) => Promise<{ success: boolean; message?: string }>;
  updateUserRole: (id: string, role: UserData['role']) => Promise<void>;
  updateUserStatus: (id: string, status: UserData['status']) => Promise<void>;
  updateUserHourlyRate: (id: string, rateCents: number) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  fetchArticles: () => Promise<void>;
  addArticle: (article: Pick<KnowledgeArticle, 'title' | 'content' | 'tags'>) => Promise<void>;
  updateArticle: (id: string, updates: Partial<Pick<KnowledgeArticle, 'title' | 'content' | 'tags'>>) => Promise<void>;
  deleteArticle: (id: string) => Promise<void>;
}

export const createTeamSlice: StateCreator<AppState, [], [], TeamSlice> = (set, get) => ({
    users: [],
    referrals: [],
    articles: [],
    teamMembership: null,

    fetchTeamMembership: async () => {
        const { data, error } = await supabase.rpc('link_team_membership');
        if (!error && data && data.length > 0) {
            const row = data[0];
            set({
                teamMembership: {
                    membershipId: row.membership_id,
                    role: row.role,
                    status: row.status,
                    ownerId: row.owner_user_id,
                    ownerBusinessName: row.owner_business_name,
                    ownerFullName: row.owner_full_name,
                },
            });
        } else {
            set({ teamMembership: null });
        }
    },

    fetchUsers: async () => {
        const { data, error } = await supabase
            .from('team_members')
            .select(`
                id,
                name,
                email,
                role,
                status,
                invitedOn:invited_on,
                hourly_rate_cents
            `)
            .order('created_at', { ascending: true });

        if (!error && data) {
            set({ users: data as unknown as UserData[] });
        }
    },

    inviteUser: async (name, email, role) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false, message: 'No se encontró sesión de usuario.' };

        const { data, error } = await supabase
            .from('team_members')
            .insert({
                user_id: user.id,
                name,
                email,
                role,
                status: 'Pendiente',
                invited_on: new Date().toISOString().slice(0, 10),
                hourly_rate_cents: 5000,
            })
            .select(`
                id,
                name,
                email,
                role,
                status,
                invitedOn:invited_on,
                hourly_rate_cents
            `)
            .single();

        if (error || !data) {
            return { success: false, message: 'No se pudo guardar la invitación.' };
        }

        set(state => ({ users: [...state.users, data as unknown as UserData] }));

        const { data: fnData, error: fnError } = await supabase.functions.invoke('invite-team-member', {
            body: { email, name, role },
        });

        if (fnError || fnData?.success === false) {
            const message = fnData?.message || 'No se pudo enviar el email de invitación.';
            console.error('No se pudo enviar el email de invitación:', message);
            return { success: false, message };
        }

        return { success: true };
    },

    updateUserRole: async (id, role) => {
        const previous = get().users;
        set(state => ({ users: state.users.map(u => u.id === id ? { ...u, role } : u) }));
        const { error } = await supabase.from('team_members').update({ role }).eq('id', id);
        if (error) set({ users: previous });
    },

    updateUserStatus: async (id, status) => {
        const previous = get().users;
        set(state => ({ users: state.users.map(u => u.id === id ? { ...u, status } : u) }));
        const { error } = await supabase.from('team_members').update({ status }).eq('id', id);
        if (error) set({ users: previous });
    },

    updateUserHourlyRate: async (id, rateCents) => {
        const previous = get().users;
        set(state => ({ users: state.users.map(u => u.id === id ? { ...u, hourly_rate_cents: rateCents } : u) }));
        const { error } = await supabase.from('team_members').update({ hourly_rate_cents: rateCents }).eq('id', id);
        if (error) set({ users: previous });
    },

    deleteUser: async (id) => {
        const previous = get().users;
        set(state => ({ users: state.users.filter(u => u.id !== id) }));
        const { error } = await supabase.from('team_members').delete().eq('id', id);
        if (error) set({ users: previous });
    },

    // Knowledge Base: antes vivía solo en useState local de la página y
    // nunca tocaba Supabase. La RLS ya soporta dueño y miembro de equipo
    // activo (is_active_team_member) — un select('*') sin filtrar ya
    // devuelve la unión correcta según quién esté logueado.
    fetchArticles: async () => {
        const { data, error } = await supabase
            .from('knowledge_articles')
            .select('*')
            .order('updated_at', { ascending: false });
        if (!error && data) set({ articles: data as KnowledgeArticle[] });
    },

    addArticle: async (article) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
            .from('knowledge_articles')
            .insert({ ...article, user_id: user.id })
            .select()
            .single();

        if (!error && data) {
            set(state => ({ articles: [data as KnowledgeArticle, ...state.articles] }));
        }
    },

    updateArticle: async (id, updates) => {
        const previous = get().articles;
        set(state => ({
            articles: state.articles.map(a => a.id === id ? { ...a, ...updates, updated_at: new Date().toISOString() } : a),
        }));

        const { error } = await supabase
            .from('knowledge_articles')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', id);

        if (error) set({ articles: previous });
    },

    deleteArticle: async (id) => {
        const previous = get().articles;
        set(state => ({ articles: state.articles.filter(a => a.id !== id) }));

        const { error } = await supabase.from('knowledge_articles').delete().eq('id', id);
        if (error) set({ articles: previous });
    },
});