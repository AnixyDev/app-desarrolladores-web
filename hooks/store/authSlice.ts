import { StateCreator } from 'zustand';
import { AppState } from '../useAppStore';
import { Profile } from '@/types';
import { supabase } from '@/lib/supabaseClient';

const initialProfile: Profile = {
    id: '',
    full_name: '',
    email: '',
    business_name: '',
    tax_id: '',
    avatar_url: '',
    plan: 'Free',
    role: 'Developer',
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
  // FIX: Added missing property loginWithGoogle required by RegisterPage.tsx
  loginWithGoogle: (payload: any) => void;
  // FIX: Added missing property consumeCredits required by many AI-driven pages
  consumeCredits: (amount: number) => Promise<boolean>;
  updateProfile: (profileData: Partial<Profile>) => Promise<void>;
  refreshProfile: () => Promise<void>;
  initializeAuth: () => () => void; // Devuelve función de cleanup
  resetStore: () => void;
}

let isInitializing = false;
let refreshLock = false;
let authBootstrapInFlight = false;

export const createAuthSlice: StateCreator<AppState, [], [], AuthSlice> = (set, get) => ({
    isAuthenticated: false,
    isProfileLoading: true, 
    profile: initialProfile,

    resetStore: () => {
        set({ 
            isAuthenticated: false, 
            profile: initialProfile, 
            isProfileLoading: false,
            clients: [],
            projects: [],
            tasks: [],
            invoices: [],
            expenses: [],
            recurringInvoices: [],
            recurringExpenses: [],
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
            
            if (fetchError) console.error("Error fetching profile:", fetchError);

            const activeProfile = profileData ? (profileData as Profile) : {
                ...initialProfile,
                id: session.user.id,
                email: session.user.email || '',
                full_name: session.user.user_metadata?.full_name || 'Usuario',
            };

            set({ 
                profile: activeProfile, 
                isAuthenticated: true,
                isProfileLoading: false 
            });

            // Carga de datos paralela optimizada
            await Promise.allSettled([
                get().fetchClients(),
                get().fetchProjects(),
                get().fetchFinanceData(),
                get().fetchTasks(),
                get().fetchTimeEntries()
            ]);

        } catch (error) {
            console.error("Critical Auth Sync Error:", error);
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
                if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
                    await get().refreshProfile();
                }
            } else {
                get().resetStore();
            }
        });

        return () => {
            window.clearTimeout(loadingSafetyTimeout);
            subscription.unsubscribe();
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
        window.location.href = '/auth/login';
    },

    register: async (name, email, password) => {
        const { data, error } = await supabase.auth.signUp({
            email,
            password: password || '',
            options: { data: { full_name: name } }
        });
        return !error && !!data.user;
    },

    // FIX: Implemented loginWithGoogle to sync state with Google JWT payload
    loginWithGoogle: (payload) => {
        set({
            isAuthenticated: true,
            isProfileLoading: false,
            profile: {
                ...get().profile,
                email: payload.email || '',
                full_name: payload.name || 'Usuario',
                avatar_url: payload.picture || '',
            }
        });
    },

    // FIX: Implemented consumeCredits to manage AI credit consumption locally and in Supabase
    consumeCredits: async (amount) => {
        const { profile } = get();
        if (profile.ai_credits < amount) return false;

        const newCredits = profile.ai_credits - amount;

        // Optimistic local state update
        set(state => ({
            profile: { ...state.profile, ai_credits: newCredits }
        }));

        if (profile.id) {
            try {
                await supabase
                    .from('profiles')
                    .update({ ai_credits: newCredits })
                    .eq('id', profile.id);
            } catch (error) {
                console.error("Error syncing credits with database:", error);
            }
        }
        return true;
    },

    updateProfile: async (profileData) => {
        const { profile } = get();
        if (!profile.id) return;

        // PROTECCIÓN DE COLUMNAS SENSIBLES: El RLS también bloquea esto, 
        // pero lo sanitizamos en el cliente para mejor UX.
        const { plan, ai_credits, role, stripe_customer_id, ...safeData } = profileData as any;

        const { error } = await supabase.from('profiles').update(safeData).eq('id', profile.id);
        if (!error) {
            set(state => ({ profile: { ...state.profile, ...safeData } as Profile }));
        } else {
            throw new Error(error.message);
        }
    },
});
