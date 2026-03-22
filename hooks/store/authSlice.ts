import { StateCreator } from 'zustand';
import { AppState } from '../useAppStore';
import { Profile, PlanType, UserRole } from '@/types';
import { supabase } from '@/lib/supabaseClient';
import { RealtimeChannel } from '@supabase/supabase-js';

const initialProfile: Profile = {
    id: '',
    full_name: '',
    email: '',
    business_name: '',
    tax_id: '',
    avatar_url: '',
    plan: 'Free' as PlanType,
    role: 'Developer' as UserRole,
    ai_credits: 10,
    hourly_rate_cents: 0,
    pdf_color: '#d9009f',
    bio: '',
    skills: [],
    portfolio_url: '',
    payment_reminders_enabled: false,
    reminder_template_upcoming: '',
    reminder_template_overdue: '',
    affiliate_code: '',
    stripe_account_id: '',
    stripe_onboarding_complete: false,
};

export interface AuthSlice {
  isAuthenticated: boolean;
  isProfileLoading: boolean;
  profile: Profile;
  login: (email: string, password?: string) => Promise<boolean>;
  logout: () => Promise<void>;
  register: (name: string, email: string, password?: string) => Promise<boolean>;
  loginWithGoogle: (token: string) => Promise<boolean>;
  consumeCredits: (amount: number) => Promise<boolean>;
  updateProfile: (profileData: Partial<Profile>) => Promise<void>;
  refreshProfile: () => Promise<void>;
  initializeAuth: () => () => void;
  resetStore: () => void;
}

// Flags de módulo — previenen arranques y refresco de perfil concurrentes
let isInitializing = false;
let refreshLock = false;
let profileChannel: RealtimeChannel | null = null; // canal Realtime

export const createAuthSlice: StateCreator<AppState, [], [], AuthSlice> = (set, get) => ({
    isAuthenticated: false,
    isProfileLoading: true,
    profile: initialProfile,

    resetStore: () => {
        if (profileChannel) {
            supabase.removeChannel(profileChannel);
            profileChannel = null;
        }
        set({
            isAuthenticated: false,
            profile: initialProfile,
            isProfileLoading: false,
            clients: [],
            projects: [],
            invoices: [],
            expenses: [],
            budgets: [],
            proposals: [],
            contracts: [],
            notifications: [],
        });
    },

    refreshProfile: async () => {
        if (refreshLock) return;
        refreshLock = true;

        try {
            const { data: { session } } = await supabase.auth.getSession();

            if (!session?.user) {
                get().resetStore();
                return;
            }

            let { data: profileData, error: fetchError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', session.user.id)
                .maybeSingle();

            if (fetchError) throw fetchError;

            // Usuarios nuevos (OAuth): el trigger puede tardar unos ms en crear
            // la fila en profiles. Reintentamos hasta 3 veces con 800ms entre intentos.
            if (!profileData) {
                for (let i = 0; i < 3; i++) {
                    await new Promise(r => setTimeout(r, 800));
                    const retry = await supabase
                        .from('profiles')
                        .select('*')
                        .eq('id', session.user.id)
                        .maybeSingle();
                    if (retry.data) { profileData = retry.data; break; }
                }
            }

            const activeProfile: Profile = {
                ...initialProfile,
                ...(profileData || {}),
                id: session.user.id,
                email: session.user.email || profileData?.email || '',
                full_name:
                    profileData?.full_name ||
                    session.user.user_metadata?.full_name ||
                    'Usuario',
            };

            set({
                profile: activeProfile,
                isAuthenticated: true,
                isProfileLoading: false,
            });

            await Promise.allSettled([
                get().fetchClients?.(),
                get().fetchProjects?.(),
                get().fetchFinanceData?.(),
                get().fetchNotifications?.(),
            ]);

        } catch (error) {
            console.error('Auth Sync Error:', error);
            set({ isProfileLoading: false, isAuthenticated: false });
        } finally {
            refreshLock = false;
        }
    },

    initializeAuth: () => {
        // Idempotente: si ya hay una suscripción activa, no crear otra
        if (isInitializing) return () => {};
        isInitializing = true;

        // onAuthStateChange es la única fuente de verdad.
        // Supabase emite INITIAL_SESSION al suscribirse con la sesión actual
        // (o null si no hay sesión), eliminando la necesidad de llamar
        // manualmente a getSession() y evitando la carrera de locks.
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                if (event === 'SIGNED_OUT' || !session) {
                    get().resetStore();
                    return;
                }

                // SIGNED_IN, TOKEN_REFRESHED, INITIAL_SESSION, USER_UPDATED
                await get().refreshProfile();

                // Canal Realtime para sincronizar cambios de perfil en tiempo real
                if (profileChannel) supabase.removeChannel(profileChannel);
                profileChannel = supabase
                    .channel(`public:profiles:id=eq.${session.user.id}`)
                    .on(
                        'postgres_changes',
                        {
                            event: 'UPDATE',
                            schema: 'public',
                            table: 'profiles',
                            filter: `id=eq.${session.user.id}`,
                        },
                        (payload) => {
                            set(state => ({
                                profile: { ...state.profile, ...payload.new },
                            }));
                        }
                    )
                    .subscribe();
            }
        );

        // Timeout de seguridad — si INITIAL_SESSION no llega en 8s, liberamos
        const loadingSafetyTimeout = window.setTimeout(() => {
            if (get().isProfileLoading) {
                console.warn('Auth bootstrap timeout — liberando estado de carga.');
                set({ isProfileLoading: false });
            }
        }, 8000);

        return () => {
            window.clearTimeout(loadingSafetyTimeout);
            subscription.unsubscribe();
            if (profileChannel) supabase.removeChannel(profileChannel);
            isInitializing = false;
        };
    },

    login: async (email, password) => {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password: password || '',
        });
        return !error && !!data.user;
    },

    logout: async () => {
        await supabase.auth.signOut();
        get().resetStore();
    },

    register: async (name, email, password) => {
        const { data, error } = await supabase.auth.signUp({
            email,
            password: password || '',
            options: { data: { full_name: name } },
        });
        return !error && !!data.user;
    },

    loginWithGoogle: async (token: string) => {
        const { data, error } = await supabase.auth.signInWithIdToken({
            provider: 'google',
            token,
        });

        if (error) {
            console.error('Error login Google:', error.message);
            return false;
        }

        await get().refreshProfile();
        return !!data.user;
    },

    consumeCredits: async (amount) => {
        const { profile, refreshProfile } = get();
        if (profile.ai_credits < amount) return false;

        const { data, error } = await supabase
            .from('profiles')
            .update({ ai_credits: profile.ai_credits - amount })
            .eq('id', profile.id)
            .select()
            .single();

        if (error) {
            console.error('Error al consumir créditos:', error);
            await refreshProfile();
            return false;
        }

        set(state => ({
            profile: { ...state.profile, ai_credits: data.ai_credits },
        }));

        return true;
    },

    updateProfile: async (profileData) => {
        const { profile } = get();
        if (!profile.id) return;

        // Excluimos campos que no deben actualizarse directamente desde el cliente
        const {
            id, email, plan, ai_credits, role,
            stripe_account_id, affiliate_code,
            ...safeData
        } = profileData as Profile;

        const { error } = await supabase
            .from('profiles')
            .update(safeData)
            .eq('id', profile.id);

        if (error) throw error;

        set(state => ({
            profile: { ...state.profile, ...safeData },
        }));
    },
});
