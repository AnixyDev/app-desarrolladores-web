import { StateCreator } from 'zustand';
import { UserData, Referral, KnowledgeArticle } from '@/types';
import { AppState } from '../useAppStore';
import { supabase } from '@/lib/supabaseClient';
import { sendEmail } from '@/services/emailService';

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

    // FIX: antes solo tocaba el estado local (id: `u-${Date.now()}`), sin
    // guardar nada en Supabase ni enviar ningún email — un refresh borraba
    // la invitación entera. Ahora persiste de verdad y abre un borrador de
    // email real con la invitación.
    //
    // Sobre el email: sendEmail() abre el cliente de correo del usuario con
    // el mensaje ya redactado (mismo mecanismo que "Enviar por Email" en
    // Facturas) — no manda el correo en segundo plano sin intervención.
    // Enviar una invitación 100% automática requeriría dar de alta un
    // proveedor de email transaccional (ej. Resend) con su propia API key,
    // que hoy no está configurado en el proyecto.
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

            const profile = get().profile;
            const inviterName = profile?.business_name || profile?.full_name || 'Tu equipo en DevFreelancer';
            sendEmail(
                email,
                `${inviterName} te ha invitado a unirte en DevFreelancer`,
                `Hola ${name},\n\n${inviterName} te ha invitado a unirte a su equipo en DevFreelancer con el rol de ${role}.\n\nPídele que te pase el enlace de acceso para completar tu alta.\n\nUn saludo.`
            );
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