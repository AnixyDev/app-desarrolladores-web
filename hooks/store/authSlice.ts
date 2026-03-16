import { StateCreator } from 'zustand';
import { AppState } from '../useAppStore';
import { Profile, PlanType, UserRole } from '@/types'; // Asegúrate de tener estos tipos
import { supabase } from '@/lib/supabaseClient';

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
  loginWithGoogle: (payload: { email: string; name?: string; picture?: string }) => void;
  consumeCredits: (amount: number) => Promise<boolean>;
  updateProfile: (profileData: Partial<Profile>) => Promise<void>;
  refreshProfile: () => Promise<void>;
  initializeAuth: () => () => void;
  resetStore: () => void;
}

let isInitializing = false;
let refreshLock = false;

export const createAuthSlice: StateCreator<AppState, [], [], AuthSlice> = (set, get) => ({
    isAuthenticated: false,
    isProfileLoading: true, 
    profile: initialProfile,

    resetStore: () => {
        set({ 
            isAuthenticated: false, 
            profile: initialProfile, 
            isProfileLoading: false,
            // Limpiamos todos los arreglos de los otros slices para evitar fugas de datos entre sesiones
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

            // Mapeo seguro de datos: Prioridad DB > Metadata > Initial
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

            // Carga paralela de datos de la app
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

        // El listener de Supabase es la fuente de verdad
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (session) {
                await get().refreshProfile();
            } else {
                get().resetStore();
            }
        });

        return () => {
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
        // Nota: El redireccionamiento lo maneja App.tsx gracias al cambio de estado
    },

    register: async (name, email, password) => {
        const { data, error } = await supabase.auth.signUp({
            email,
            password: password || '',
            options: { data: { full_name: name } }
        });
        return !error && !!data.user;
    },

    loginWithGoogle: (payload) => {
        set(state => ({
            isAuthenticated: true,
            isProfileLoading: false,
            profile: {
                ...state.profile,
                email: payload.email,
                full_name: payload.name || state.profile.full_name,
                avatar_url: payload.picture || state.profile.avatar_url,
            }
        }));
    },

    consumeCredits: async (amount) => {
        const { profile } = get();
        if (profile.ai_credits < amount) return false;

        const newCredits = profile.ai_credits - amount;

        // Update optimista
        set(state => ({
            profile: { ...state.profile, ai_credits: newCredits }
        }));

        const { error } = await supabase
            .from('profiles')
            .update({ ai_credits: newCredits })
            .eq('id', profile.id);

        if (error) {
            console.error("Error syncing credits:", error);
            // Revertir si falla
            await get().refreshProfile();
            return false;
        }
        return true;
    },

    updateProfile: async (profileData) => {
        const { profile } = get();
        if (!profile.id) return;

        // Sanitización Pro: Evitamos que el usuario edite campos sensibles manualmente
        // mediante el objeto de actualización, incluso si TypeScript lo permitiera.
        const { 
            id, email, plan, ai_credits, role, 
            stripe_account_id, affiliate_code, ...safeData 
        } = profileData as any;

        const { error } = await supabase
            .from('profiles')
            .update(safeData)
            .eq('id', profile.id);

        if (error) throw error;
        
        // Sincronizamos el estado local solo con los datos permitidos
        set(state => ({ 
            profile: { ...state.profile, ...safeData } 
        }));
    },
});
