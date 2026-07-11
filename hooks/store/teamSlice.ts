import { StateCreator } from 'zustand';
import { UserData, Referral, KnowledgeArticle, TeamMembership } from '@/types';
import { AppState } from '../useAppStore';
import { supabase } from '@/lib/supabaseClient';

export interface TeamSlice {
  users: UserData[];
  referrals: Referral[];
  articles: KnowledgeArticle[];
  // NUEVO: si el usuario logueado fue invitado al equipo de otro freelancer,
  // aquí queda esa membresía (a qué equipo pertenece y con qué rol).
  teamMembership: TeamMembership | null;
  fetchUsers: () => Promise<void>;
  fetchTeamMembership: () => Promise<void>;
  inviteUser: (name: string, email: string, role: UserData['role']) => Promise<{ success: boolean; message?: string }>;
  updateUserRole: (id: string, role: UserData['role']) => Promise<void>;
  updateUserStatus: (id: string, status: UserData['status']) => Promise<void>;
  updateUserHourlyRate: (id: string, rateCents: number) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
}

export const createTeamSlice: StateCreator<AppState, [], [], TeamSlice> = (set, get) => ({
    users: [],
    referrals: [],
    articles: [],
    teamMembership: null,

    // NUEVO: vincula la cuenta del usuario logueado con cualquier invitación
    // de equipo pendiente que tenga su mismo email (la primera vez), o
    // recupera la membresía ya vinculada en logins siguientes. Sin esto,
    // un invitado que aceptaba el email y entraba a la app no tenía forma
    // de saber a qué equipo pertenecía — entraba a su propia cuenta vacía.
    fetchTeamMembership: async () => {
        const { data, error } = await supabase.rpc('link_team_membership');
        if (!error && data && data.length > 0) {
            const row = data[0];
            set({
                teamMembership: {
                    membershipId: row.membership_id,
                    role: row.role,
                    status: row.status,
                    ownerBusinessName: row.owner_business_name,
                    ownerFullName: row.owner_full_name,
                },
            });
        } else {
            set({ teamMembership: null });
        }
    },

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
            // La fila en team_members ya se guardó igualmente — el freelancer puede
            // ver el motivo (ej. "ya existe cuenta con ese email") y decidir qué hacer.
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
});