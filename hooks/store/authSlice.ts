import { StateCreator } from 'zustand';
import { AppState } from '../useAppStore';
import { Profile, UserRole } from '@/types';
import { supabase } from '@/lib/supabaseClient';
import { RealtimeChannel } from '@supabase/supabase-js';

const initialProfile: Profile = {
    id: '',
    full_name: '',
    email: '',
    business_name: '',
    tax_id: '',
    avatar_url: '',
    plan: 'Free' as any,
    role: 'Developer' as Profile['role'], // 🔧 antes: 'as UserRole' (tipo no relacionado)
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
        console.log('[DIAG] refreshProfile: entrada, refreshLock =', refreshLock);
        if (refreshLock) { console.log('[DIAG] refreshProfile: bloqueado por lock, saliendo'); return; }
        refreshLock = true;
        
        try {
            console.log('[DIAG] refreshProfile: pidiendo sesión...');
            const { data: { session } } = await supabase.auth.getSession();
            console.log('[DIAG] refreshProfile: sesión obtenida =', !!session?.user, session?.user?.id);
            
            if (!session?.user) {
                console.log('[DIAG] refreshProfile: sin sesión, reset store');
                get().resetStore();
                return;
            }

            console.log('[DIAG] refreshProfile: pidiendo perfil...');
            let { data: profileData, error: fetchError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', session.user.id)
                .maybeSingle();
            console.log('[DIAG] refreshProfile: perfil obtenido, error =', fetchError, 'data =', !!profileData);

            if (fetchError) throw fetchError;

            if (!profileData) {
                console.log('[DIAG] refreshProfile: sin perfil, reintentando...');
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

            console.log('[DIAG] refreshProfile: seteando isAuthenticated=true, isProfileLoading=false');
            set({ 
                profile: activeProfile, 
                isAuthenticated: true, 
                isProfileLoading: false 
            });

            console.log('[DIAG] refreshProfile: cargando datos secuenciales...');
            if (get().fetchClients) await get().fetchClients();
            console.log('[DIAG] refreshProfile: fetchClients OK');
            if (get().fetchProjects) await get().fetchProjects();
            console.log('[DIAG] refreshProfile: fetchProjects OK');
            if (get().fetchTasks) await get().fetchTasks();
            console.log('[DIAG] refreshProfile: fetchTasks OK');
            if (get().fetchTimeEntries) await get().fetchTimeEntries();
            console.log('[DIAG] refreshProfile: fetchTimeEntries OK');
            if (get().fetchFinanceData) await get().fetchFinanceData();
            console.log('[DIAG] refreshProfile: fetchFinanceData OK');
            if (get().fetchNotifications) await get().fetchNotifications();
            console.log('[DIAG] refreshProfile: fetchNotifications OK — TERMINADO');

        } catch (error) {
            console.error('[DIAG] refreshProfile: EXCEPCIÓN', error);
            set({ isProfileLoading: false, isAuthenticated: false });
        } finally {
            refreshLock = false;
            console.log('[DIAG] refreshProfile: finally, lock liberado');
        }
    },

    initializeAuth: () => {
        console.log('[DIAG] initializeAuth: llamado, isInitializing =', isInitializing);
        if (isInitializing) { console.log('[DIAG] initializeAuth: ya inicializando, saliendo'); return () => {}; }
        isInitializing = true;

        const bootstrapAuth = async () => {
            console.log('[DIAG] bootstrapAuth: entrada, authBootstrapInFlight =', authBootstrapInFlight);
            if (authBootstrapInFlight) { console.log('[DIAG] bootstrapAuth: ya en curso, saliendo'); return; }
            authBootstrapInFlight = true;
            
            try {
                const params = new URLSearchParams(window.location.search);
                const authCode = params.get('code');
                console.log('[DIAG] bootstrapAuth: authCode =', authCode);
                
                if (authCode) {
                    console.log('[DIAG] bootstrapAuth: canjeando code por sesión...');
                    await supabase.auth.exchangeCodeForSession(authCode);
                    const cleanUrl = window.location.origin + window.location.pathname;
                    window.history.replaceState({}, document.title, cleanUrl);
                    console.log('[DIAG] bootstrapAuth: code canjeado, URL limpiada');
                }

                console.log('[DIAG] bootstrapAuth: pidiendo sesión...');
                const { data: { session } } = await supabase.auth.getSession();
                console.log('[DIAG] bootstrapAuth: sesión =', !!session?.user);
                if (session?.user) {
                    console.log('[DIAG] bootstrapAuth: llamando a refreshProfile()...');
                    await get().refreshProfile();
                    console.log('[DIAG] bootstrapAuth: refreshProfile() terminó');
                } else {
                    console.log('[DIAG] bootstrapAuth: sin sesión, isProfileLoading=false');
                    set({ isProfileLoading: false });
                }
            } catch (error) {
                console.error('[DIAG] bootstrapAuth: EXCEPCIÓN', error);
                set({ isProfileLoading: false });
            } finally {
                authBootstrapInFlight = false;
                console.log('[DIAG] bootstrapAuth: finally');
            }
        };

        void bootstrapAuth();

        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                console.log('[DIAG] onAuthStateChange evento =', event);
                if (event === 'SIGNED_IN' && session) {
                    await get().refreshProfile();
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
        // 🔧 SIN await get().refreshProfile() aquí — signInWithIdToken() dispara
        // el evento SIGNED_IN, y onAuthStateChange ya llama a refreshProfile() una vez.
        // Llamarlo también aquí duplicaba la ejecución (condición de carrera).
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
        
        const { id, email, plan, ai_credits, role, ...safeData } = profileData as any;
        
        const { error } = await supabase.from('profiles').update(safeData).eq('id', profile.id);
        if (error) throw error;
        
        set(state => ({ profile: { ...state.profile, ...safeData } }));
    },
});