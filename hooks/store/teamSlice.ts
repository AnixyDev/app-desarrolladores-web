import { StateCreator } from 'zustand';
import { UserData, Referral, KnowledgeArticle } from '@/types';
import { AppState } from '../useAppStore';
import { supabase } from '@/lib/supabaseClient';

export interface TeamSlice {
  users: UserData[];
  referrals: Referral[];
  articles: KnowledgeArticle[];
  fetchUsers: () => Promise<void>;
  inviteUser: (name: string, email: string, role: UserData['role']) => Promise<void>;
  updateUserRole: (id: string, role: UserData['role']) => Promise<void>;
  updateUserStatus: (id: string, status: UserData['status']) => Promise<void>;
  updateUserHourlyRate: (id: string, rateCents: number) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
}

export const createTeamSlice: StateCreator<AppState, [], [], TeamSlice> = (set, get) => ({
    users: [],
    referrals: [],
    articles: [],

    // FIX: no existía. La tabla team_members existía en Supabase desde hace
    // tiempo, pero nada la leía nunca — "users" solo vivía en memoria.
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

    // FIX (actualizado): se descubrió que el proyecto SÍ tiene Resend
    // configurado como SMTP personalizado de Supabase Auth (usado hoy por
    // el magic link del Portal de Cliente). Así que en vez de abrir un
    // borrador de correo manual, ahora se llama a la edge function
    // invite-team-member, que usa supabase.auth.admin.inviteUserByEmail()
    // — esto SÍ envía un email real en segundo plano, por el mismo canal
    // de Resend que ya está probado y funcionando.
    inviteUser: async (name, email, role) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

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

        if (!error && data) {
            set(state => ({ users: [...state.users, data as unknown as UserData] }));

            const { error: fnError } = await supabase.functions.invoke('invite-team-member', {
                body: { email, name, role },
            });

            if (fnError) {
                console.error('No se pudo enviar el email de invitación:', fnError);
                // La fila en team_members ya se guardó igualmente; el freelancer
                // puede reintentar o avisar manualmente si el email falla.
            }
        }
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
});