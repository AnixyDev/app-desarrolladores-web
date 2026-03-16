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
  loginWithGoogle: (payload: { email: string; name?: string; picture?: string }) => void;
  consumeCredits: (amount: number) => Promise<boolean>;
  updateProfile: (profileData: Partial<Profile>) => Promise<void>;
  refreshProfile: () => Promise<void>;
  initializeAuth: () => () => void;
  resetStore: () => void;
}

let isInitializing = false;
let refreshLock = false;
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

            // Carga inicial de datos
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

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (session) {
                await get().refreshProfile();

                // 3.2 Sincronización Realtime del Perfil (Créditos, Plan, etc)
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

    // 3.3 Manejo Seguro de Créditos
    consumeCredits: async (amount) => {
        const { profile, refreshProfile } = get();
        if (profile.ai_credits < amount) return false;

        // Intentar usar RPC para una operación atómica en la base de datos
        // Si no tienes la función 'consume_user_credits' en Supabase, usa el update normal corregido:
        const { data, error } = await supabase
            .from('profiles')
            .update({ ai_credits: profile.ai_credits - amount })
            .eq('id', profile.id)
            .select()
            .single();

        if (error) {
            console.error("Error al consumir créditos:", error);
            await refreshProfile(); // Re-sincronizar en caso de error
            return false;
        }

        // Actualizamos estado local inmediatamente
        set(state => ({
            profile: { ...state.profile, ai_credits: data.ai_credits }
        }));

        return true;
    },

    updateProfile: async (profileData) => {
        const { profile } = get();
        if (!profile.id) return;

        // Protección de campos sensibles
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
