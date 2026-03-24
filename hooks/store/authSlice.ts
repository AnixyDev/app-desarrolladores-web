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

let isInitializing = false;
let refreshLock = false;
let authBootstrapInFlight = false;
let profileChannel: RealtimeChannel | null = null;

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
            // 1. Obtenemos sesión de forma atómica para evitar colisiones de "Lock"
            const { data: { session } } = await supabase.auth.getSession();
            
            if (!session?.user) {
                get().resetStore();
                return;
            }

            // 2. Intentamos obtener el perfil
            let { data: profileData, error: fetchError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', session.user.id)
                .maybeSingle();

            if (fetchError) throw fetchError;

            // Reintento rápido si el perfil acaba de ser creado (OAuth)
            if (!profileData) {
                for (let i = 0; i < 3; i++) {
                    await new Promise(r => setTimeout(r, 1000));
                    const retry = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
                    if (retry.data) { profileData = retry.data; break; }
                }
            }

            const activeProfile: Profile = {
                ...initialProfile,
                ...(profileData || {}),
                id: session.user.id,
                email: session.user.email || profileData?.email || '',
                full_name: profileData?.full_name || session.user.user_metadata?.full_name || 'Usuario',
            };

            // 3. Establecemos estado de autenticación primario
            set({ 
                profile: activeProfile, 
                isAuthenticated: true, 
                isProfileLoading: false 
            });

            // 4. CARGA SECUENCIAL: Evita saturar el canal de Auth y soluciona el error de consola
            // Cargamos uno por uno para que no choquen las peticiones de token
            if (get().fetchClients) await get().fetchClients();
            if (get().fetchProjects) await get().fetchProjects();
            if (get().fetchFinanceData) await get().fetchFinanceData();
            if (get().fetchNotifications) await get().fetchNotifications();

        } catch (error) {
            console.error('Auth Sync Error:', error);
            set({ isProfileLoading: false, isAuthenticated: false });
        } finally {
            refreshLock = false;
        }
    },

    initializeAuth: () => {
        if (isInitializing) return () => {};
        isInitializing = true;

        const bootstrapAuth = async () => {
            if (authBootstrapInFlight) return;
            authBootstrapInFlight = true;
            
            try {
                // Manejo de códigos OAuth/Google
                const params = new URLSearchParams(window.location.search);
                const authCode = params.get('code');
                
                if (authCode) {
                    await supabase.auth.exchangeCodeForSession(authCode);
                    const cleanUrl = window.location.origin + window.location.pathname;
                    window.history.replaceState({}, document.title, cleanUrl);
                }

                const { data: { session } } = await supabase.auth.getSession();
                if (session?.user) {
                    await get().refreshProfile();
                } else {
                    set({ isProfileLoading: false });
                }
            } catch (error) {
                console.error('Error during auth bootstrap:', error);
                set({ isProfileLoading: false });
            } finally {
                authBootstrapInFlight = false;
            }
        };

        void bootstrapAuth();

        // Escucha de cambios de estado (Login/Logout)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                if (event === 'SIGNED_IN' && session) {
                    await get().refreshProfile();
                    
                    // Suscripción Realtime al perfil para cambios de créditos/plan
                    if (profileChannel) supabase.removeChannel(profileChannel);
                    profileChannel = supabase
                        .channel(`profile-updates-${session.user.id}`)
                        .on('postgres_changes', {
                            event: 'UPDATE',
                            schema: 'public',
                            table: 'profiles',
                            filter: `id=eq.${session.user.id}`,
                        }, (payload) => {
                            set(state => ({ profile: { ...state.profile, ...payload.new } }));
                        })
                        .subscribe();
                } else if (event === 'SIGNED_OUT') {
                    get().resetStore();
                }
            }
        );

        return () => {
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
        const { profile } = get();
        if (profile.ai_credits < amount) return false;
        
        const { data, error } = await supabase
            .from('profiles')
            .update({ ai_credits: profile.ai_credits - amount })
            .eq('id', profile.id)
            .select()
            .single();

        if (error) {
            console.error('Error al consumir créditos:', error);
            return false;
        }
        
        set(state => ({ profile: { ...state.profile, ai_credits: data.ai_credits } }));
        return true;
    },

    updateProfile: async (profileData) => {
        const { profile } = get();
        if (!profile.id) return;
        
        // Evitamos actualizar campos protegidos
        const { id, email, plan, ai_credits, role, ...safeData } = profileData as any;
        
        const { error } = await supabase.from('profiles').update(safeData).eq('id', profile.id);
        if (error) throw error;
        
        set(state => ({ profile: { ...state.profile, ...safeData } }));
    },
});