import { StateCreator } from 'zustand';
import { UserData, Referral, KnowledgeArticle } from '../../types';
import { AppState } from '../useAppStore';

export interface TeamSlice {
  users: UserData[];
  referrals: Referral[];
  articles: KnowledgeArticle[];
  inviteUser: (name: string, email: string, role: UserData['role']) => void;
  updateUserRole: (id: string, role: UserData['role']) => void;
  updateUserStatus: (id: string, status: UserData['status']) => void;
  updateUserHourlyRate: (id: string, rateCents: number) => void;
  deleteUser: (id: string) => void;
}

export const createTeamSlice: StateCreator<AppState, [], [], TeamSlice> = (set) => ({
    users: [],
    referrals: [],
    articles: [],
    inviteUser: (name, email, role) => {
        const newUser: UserData = {
            id: `u-${Date.now()}`,
            name,
            email,
            role,
            status: 'Pendiente',
            invitedOn: new Date().toISOString().slice(0, 10),
            hourly_rate_cents: 5000,
        };
        set(state => ({ users: [...state.users, newUser] }));
    },
    updateUserRole: (id, role) => set(state => ({ users: state.users.map(u => u.id === id ? { ...u, role } : u) })),
    updateUserStatus: (id, status) => set(state => ({ users: state.users.map(u => u.id === id ? { ...u, status } : u) })),
    updateUserHourlyRate: (id, rateCents) => set(state => ({ users: state.users.map(u => u.id === id ? { ...u, hourly_rate_cents: rateCents } : u) })),
    deleteUser: (id) => set(state => ({ users: state.users.filter(u => u.id !== id) })),
});