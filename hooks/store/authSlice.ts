import { StateCreator } from 'zustand';
import { AppState } from '../useAppStore';
import { Profile, GoogleJwtPayload } from '../../types';
import { supabase } from '../../lib/supabaseClient';

// Estado inicial del perfil (valores por defecto antes de cargar datos reales)
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
  loginWithGoogle: (payload: GoogleJwtPayload) => Promise<void>;
  logout: () => Promise<void>;
  register: (name: string, email: string, password?: string) => Promise<boolean>;
  updateProfile: (profileData: Partial<Profile>) => Promise<void>;
  refreshProfile: () => Promise<void>;
  upgradePlan: (plan: 'Pro' | 'Teams') => void;
  purchaseCredits: (amount: number) => void;
  consumeCredits: (amount: number) => Promise<boolean>;
  initializeAuth: () => Promise<void>;
}

export const createAuthSlice: StateCreator<AppState, [], [], AuthSlice> = (set, get) => ({
    isAuthenticated: false,
    isProfileLoading: true, 
    profile: initialProfile,
    
    // FIX CRÍTICO: Refrescar perfil REAL desde la base de datos
    refreshProfile: async () => {
        try {
            console.log("🔄 RefreshProfile iniciado...");
            
            // 1. Verificar si hay sesión activa en Supabase
            const { data: { session } } = await supabase.auth.getSession();
            
            if (!session?.user) {
                console.log("❌ No hay sesión activa");
                set({ isAuthenticated: false, profile: initialProfile, isProfileLoading: false });
                return;
            }

            console.log("✅ Sesión encontrada para:", session.user.email);

            // 2. CRÍTICO: Forzar lectura FRESCA desde la base de datos
            const { data: profileData, error: fetchError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', session.user.id)
                .single();
            
            if (fetchError || !profileData) {
                console.warn("⚠️ Perfil no encontrado en DB, creando desde metadatos");
                
                // Crear perfil fallback desde los metadatos de Google
                const fallbackProfile = {
                    ...initialProfile,
                    id: session.user.id,
                    email: session.user.email || '',
                    full_name: session.user.user_metadata?.full_name || 'Usuario',
                    plan: 'Free' as const
                };
                
                set({ profile: fallbackProfile, isAuthenticated: true });
            } else {
                console.log("✅ Perfil cargado correctamente:", profileData.email);
                // AQUÍ ESTÁ LA CLAVE: Sincronizar el plan pagado desde la DB
                set({ profile: profileData as Profile, isAuthenticated: true });
            }
        } catch (error) {
            console.error("💥 RefreshProfile Error:", error);
        } finally {
            set({ isProfileLoading: false });
        }
    },

    // FIX CRÍTICO: Inicializar autenticación y manejar callbacks de OAuth
    initializeAuth: async () => {
        console.log("🚀 InitializeAuth iniciado...");
        set({ isProfileLoading: true });

        // 1. Configurar listener para cambios de autenticación (login/logout)
        supabase.auth.onAuthStateChange(async (event, session) => {
            console.log("🔔 AuthStateChange event:", event);
            
            if (session?.user) {
                console.log("✅ Usuario autenticado detectado");
                await get().refreshProfile();
            } else {
                console.log("❌ Usuario desconectado");
                set({ isAuthenticated: false, profile: initialProfile, isProfileLoading: false });
            }
        });

        // 2. Verificar si ya hay sesión activa (usuario volviendo)
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session) {
            console.log("✅ Sesión existente encontrada");
            await get().refreshProfile();
            
            // Cargar datos en segundo plano (no bloqueante)
            get().fetchClients().catch(() => {});
            get().fetchProjects().catch(() => {});
        } else {
            console.log("ℹ️ No hay sesión previa");
            set({ isProfileLoading: false, isAuthenticated: false });
        }
    },

    // Login con email/password tradicional
    login: async (email, password) => {
        set({ isProfileLoading: true });
        try {
            const { data, error } = await supabase.auth.signInWithPassword({ 
                email, 
                password: password || '' 
            });
            
            if (error) throw error;
            
            if (data.user) {
                await get().refreshProfile();
                return true;
            }
        } catch (error: any) {
            console.error("Login Error:", error.message);
        } finally {
            set({ isProfileLoading: false });
        }
        return false;
    },

    // FIX: Este método ya no es necesario para Google OAuth
    // Supabase maneja el callback automáticamente
    loginWithGoogle: async () => {
        await get().refreshProfile();
    },

    // Cerrar sesión y limpiar estado local
    logout: async () => {
        try {
            await supabase.auth.signOut();
        } finally {
            set({ isAuthenticated: false, profile: initialProfile, isProfileLoading: false });
            localStorage.clear();
            window.location.hash = '/auth/login';
        }
    },

    // Registro con email/password
    register: async (name, email, password) => {
        try {
            const { data, error } = await supabase.auth.signUp({
                email,
                password: password || '',
                options: { data: { full_name: name } }
            });
            return !error && !!data.user;
        } catch (error) {
            return false;
        }
    },

    // Actualizar perfil en base de datos
    updateProfile: async (profileData) => {
        const { profile } = get();
        if (!profile.id) return;
        
        try {
            const cleanData = { ...profileData };
            
            // Convertir tarifa por hora a entero (si viene)
            if (cleanData.hourly_rate_cents !== undefined) {
                cleanData.hourly_rate_cents = Math.round(Number(cleanData.hourly_rate_cents));
            }

            const { error } = await supabase
                .from('profiles')
                .update(cleanData)
                .eq('id', profile.id);

            if (error) throw error;
            
            // Actualizar estado local
            set(state => ({ 
                profile: { ...state.profile, ...cleanData } as Profile 
            }));
        } catch (err) {
            console.error("Error updating profile:", err);
            throw err;
        }
    },

    // Métodos auxiliares
    upgradePlan: (plan) => get().updateProfile({ plan }),
    purchaseCredits: (amount) => get().updateProfile({ ai_credits: (get().profile.ai_credits || 0) + amount }),
    
    // Consumir créditos de IA de forma atómica
    consumeCredits: async (amount) => {
        const { profile } = get();
        if (!profile.id || (profile.ai_credits || 0) < amount) return false;

        const { data: success, error } = await supabase.rpc('consume_credits_atomic', { 
            user_id: profile.id, 
            amount_to_consume: amount 
        });

        if (!error && success) {
            set(state => ({ 
                profile: { ...state.profile, ai_credits: (state.profile.ai_credits || 0) - amount } as Profile 
            }));
            return true;
        }
        return false;
    },
});
