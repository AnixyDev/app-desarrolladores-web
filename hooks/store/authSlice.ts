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
    // Resetear todos los flags para permitir re-inicialización
    isInitializing = false;
    authBootstrapInFlight = false;
    refreshLock = false;
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
                full_name: profileData?.full_name || session.user.user_metadata?.full_name || 'Usuario',
            };
            set({ profile: activeProfile, isAuthenticated: true, isProfileLoading: false });
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
        if (isInitializing) return () => {};
        isInitializing = true;

        const bootstrapAuth = async () => {
            if (authBootstrapInFlight) return;
            authBootstrapInFlight = true;
            try {
                const params = new URLSearchParams(window.location.search);
                const authCode = params.get('code');
                if (authCode) {
                    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(authCode);
                    if (exchangeError) console.error('Error exchanging OAuth code:', exchangeError);
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

        void bootstrapAuth();

        const loadingSafetyTimeout = window.setTimeout(() => {
            if (get().isProfileLoading) {
                console.warn('Auth bootstrap timeout — liberando estado de carga.');
                set({ isProfileLoading: false });
            }
        }, 12000);

        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                if (event === 'SIGNED_OUT' || !session) {
                    get().resetStore();
                    return;
                }
                await get().refreshProfile();
                if (profileChannel) supabase.removeChannel(profileChannel);
                profileChannel = supabase
                    .channel(`public:profiles:id=eq.${session.user.id}`)
                    .on('postgres_changes', {
                        event: 'UPDATE',
                        schema: 'public',
                        table: 'profiles',
                        filter: `id=eq.${session.user.id}`,
                    }, (payload) => {
                        set(state => ({ profile: { ...state.profile, ...payload.new } }));
                    })
                    .subscribe();
            }
        );

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
        isInitializing = false;
        authBootstrapInFlight = false;
        refreshLock = false;
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
        set(state => ({ profile: { ...state.profile, ai_credits: data.ai_credits } }));
        return true;
    },

    updateProfile: async (profileData) => {
        const { profile } = get();
        if (!profile.id) return;
        const { id, email, plan, ai_credits, role, stripe_account_id, affiliate_code, ...safeData } = profileData as Profile;
        const { error } = await supabase.from('profiles').update(safeData).eq('id', profile.id);
        if (error) throw error;
        set(state => ({ profile: { ...state.profile, ...safeData } }));
    },
});
