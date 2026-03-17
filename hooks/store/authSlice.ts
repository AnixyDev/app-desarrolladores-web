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
  // CORREGIDO: Ahora acepta el string del token y devuelve una Promesa
  loginWithGoogle: (token: string) => Promise<boolean>; 
  consumeCredits: (amount: number) => Promise<boolean>;
  updateProfile: (profileData: Partial<Profile>) => Promise<void>;
  refreshProfile: () => Promise<void>;
  initializeAuth: () => () => void;
  resetStore: () => void;
}

let isInitializing = false;
let refreshLock = false;
<<<<<<< HEAD
let authBootstrapInFlight = false;
=======
let profileChannel: RealtimeChannel | null = null;
>>>>>>> main

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
            notifications: []
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

            const { data: profileData, error: fetchError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', session.user.id)
                .maybeSingle();
            
            if (fetchError) throw fetchError;

            const activeProfile: Profile = {
                ...initialProfile,
                ...(profileData || {}),
                id: session.user.id,
                email: session.user.email || profileData?.email || '',
                full_name: profileData?.full_name || session.user.user_metadata?.full_name || 'Usuario',
            };

            set({ 
                profile: activeProfile, 
                isAuthenticated: true,
                isProfileLoading: false 
            });

            await Promise.allSettled([
                get().fetchClients?.(),
                get().fetchProjects?.(),
                get().fetchFinanceData?.(),
                get().fetchNotifications?.()
            ]);

        } catch (error) {
            console.error("Auth Sync Error:", error);
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
                const params = new URLSearchParams(window.location.search);
                const authCode = params.get('code');

                // En OAuth con PKCE, intercambiamos explícitamente el code por sesión
                // para evitar quedarnos en loading si detectSessionInUrl falla.
                if (authCode) {
                    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(authCode);
                    if (exchangeError) {
                        console.error('Error exchanging OAuth code for session:', exchangeError);
                    }
                    const cleanUrl = `${window.location.origin}${window.location.pathname}${window.location.hash}`;
                    window.history.replaceState({}, document.title, cleanUrl);
                }

                const { data: { session } } = await supabase.auth.getSession();
                if (session?.user) {
                    await get().refreshProfile();
                } else {
                    get().resetStore();
                }
            } catch (error) {
                console.error('Error during auth bootstrap:', error);
                set({ isAuthenticated: false, isProfileLoading: false });
            } finally {
                authBootstrapInFlight = false;
            }
        };

        // Evita quedarse en "Cargando..." si el evento INITIAL_SESSION no llega por cualquier motivo.
        void bootstrapAuth();

        const loadingSafetyTimeout = window.setTimeout(() => {
            const { isProfileLoading } = get();
            if (isProfileLoading) {
                console.warn('Auth bootstrap timeout reached; releasing loading state.');
                set({ isProfileLoading: false });
            }
        }, 7000);

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (session) {
                await get().refreshProfile();

                if (profileChannel) supabase.removeChannel(profileChannel);
                
                profileChannel = supabase
                    .channel(`public:profiles:id=eq.${session.user.id}`)
                    .on('postgres_changes', 
                        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${session.user.id}` },
                        (payload) => {
                            set(state => ({
                                profile: { ...state.profile, ...payload.new }
                            }));
                        }
                    )
                    .subscribe();

            } else {
                get().resetStore();
            }
        });

        return () => {
            window.clearTimeout(loadingSafetyTimeout);
            subscription.unsubscribe();
            if (profileChannel) supabase.removeChannel(profileChannel);
            isInitializing = false;
        };
    },

    login: async (email, password) => {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password: password || '' });
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
            options: { data: { full_name: name } }
        });
        return !error && !!data.user;
    },

<<<<<<< HEAD
    // FIX: Implemented loginWithGoogle to sync state with Google JWT payload
    // hooks/store/authSlice.ts
loginWithGoogle: async (token: string) => {
    // 1. Iniciamos sesión en Supabase con el token de Google
    const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: token,
    });

    if (error) {
        console.error("Error login Google:", error.message);
        return false;
    }
    
    // 2. IMPORTANTE: Una vez logueado, llamamos a refreshProfile 
    // para traer los datos de las tablas 'clients', 'projects', etc.
    await get().refreshProfile(); 
    return !!data.user;
},
=======
    // IMPLEMENTACIÓN CORREGIDA PARA GOOGLE AUTH REAL
    loginWithGoogle: async (token: string) => {
        const { data, error } = await supabase.auth.signInWithIdToken({
            provider: 'google',
            token: token,
        });

        if (error) {
            console.error("Error login Google:", error.message);
            return false;
        }
        
        await get().refreshProfile();
        return !!data.user;
    },
>>>>>>> main

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
            console.error("Error al consumir créditos:", error);
            await refreshProfile();
            return false;
        }

        set(state => ({
            profile: { ...state.profile, ai_credits: data.ai_credits }
        }));

        return true;
    },

    updateProfile: async (profileData) => {
        const { profile } = get();
        if (!profile.id) return;

        const { 
            id, email, plan, ai_credits, role, 
            stripe_account_id, affiliate_code, ...safeData 
        } = profileData as any;

        const { error } = await supabase
            .from('profiles')
            .update(safeData)
            .eq('id', profile.id);

        if (error) throw error;
        
        set(state => ({ 
            profile: { ...state.profile, ...safeData } 
        }));
    },
});