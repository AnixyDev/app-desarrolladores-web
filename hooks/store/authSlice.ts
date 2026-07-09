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

// Utilidad: evita que una llamada se quede colgada para siempre.
// Si supabase-js se queda esperando un lock interno (p.ej. tras invalidar
// sesiones/refresh tokens a mano), esto garantiza que la promesa se
// resuelva igualmente pasado el timeout, en vez de dejar la UI en bucle.
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`Timeout (${ms}ms) esperando: ${label}`));
        }, ms);

        promise
            .then((value) => {
                clearTimeout(timer);
                resolve(value);
            })
            .catch((err) => {
                clearTimeout(timer);
                reject(err);
            });
    });
}

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

// Guard módulo-level: evita ejecuciones concurrentes de refreshProfile.
// Si ya hay una llamada en curso, las siguientes reutilizan esa misma promesa
// en vez de disparar otro getSession() en paralelo (causa raíz del bucle infinito).
let refreshInFlight: Promise<void> | null = null;

export const createAuthSlice: StateCreator<AppState, [], [], AuthSlice> = (set, get) => ({
    isAuthenticated: false,
    isProfileLoading: true,
    profile: initialProfile,

    refreshProfile: async () => {
        if (refreshInFlight) {
            console.log("⏭️ RefreshProfile ya en curso, reutilizando promesa existente...");
            return refreshInFlight;
        }

        refreshInFlight = (async () => {
            try {
                console.log("🔄 RefreshProfile iniciado...");

                // 1. Verificar si hay sesión activa en Supabase (con timeout de seguridad)
                const { data: { session } } = await withTimeout(
                    supabase.auth.getSession(),
                    8000,
                    'supabase.auth.getSession()'
                );

                if (!session?.user) {
                    console.log("❌ No hay sesión activa");
                    set({ isAuthenticated: false, profile: initialProfile, isProfileLoading: false });
                    return;
                }

                console.log("✅ Sesión encontrada para:", session.user.email);

                // 2. Lectura fresca desde la base de datos
                const { data: profileData, error: fetchError } = await withTimeout(
                    supabase.from('profiles').select('*').eq('id', session.user.id).single(),
                    8000,
                    'supabase.from(profiles).select()'
                );

                if (fetchError || !profileData) {
                    console.warn("⚠️ Perfil no encontrado en DB, creando desde metadatos");

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
                    set({ profile: profileData as Profile, isAuthenticated: true });
                }
            } catch (error) {
                console.error("💥 RefreshProfile Error:", error);
                // Si falla o se agota el timeout, no dejamos la app colgada:
                // caemos a estado "no autenticado" para que el usuario pueda reintentar login.
                set({ isAuthenticated: false, profile: initialProfile });
            } finally {
                set({ isProfileLoading: false });
                refreshInFlight = null;
            }
        })();

        return refreshInFlight;
    },

    // Inicializar autenticación y manejar callbacks de OAuth.
    // IMPORTANTE: ya NO se llama a refreshProfile() dos veces en paralelo.
    // onAuthStateChange ya dispara un evento INITIAL_SESSION al arrancar,
    // así que el chequeo manual de getSession() solo decide el estado de "loading" inicial.
    initializeAuth: async () => {
        console.log("🚀 InitializeAuth iniciado...");
        set({ isProfileLoading: true });

        supabase.auth.onAuthStateChange(async (event, session) => {
            console.log("🔔 AuthStateChange event:", event);

            if (session?.user) {
                console.log("✅ Usuario autenticado detectado");
                await get().refreshProfile();

                // Cargar datos en segundo plano (no bloqueante), solo una vez por sesión real
                if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
                    get().fetchClients().catch(() => {});
                    get().fetchProjects().catch(() => {});
                }
            } else {
                console.log("❌ Usuario desconectado");
                set({ isAuthenticated: false, profile: initialProfile, isProfileLoading: false });
            }
        });

        // No se hace una segunda llamada a getSession()/refreshProfile() aquí:
        // onAuthStateChange se encarga de todo el flujo inicial (INITIAL_SESSION).
        // Esto elimina la carrera que causaba el deadlock del lock interno de supabase-js.
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

    // Ya no es necesario para Google OAuth: Supabase maneja el callback automáticamente
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

            if (cleanData.hourly_rate_cents !== undefined) {
                cleanData.hourly_rate_cents = Math.round(Number(cleanData.hourly_rate_cents));
            }

            const { error } = await supabase
                .from('profiles')
                .update(cleanData)
                .eq('id', profile.id);

            if (error) throw error;

            set(state => ({
                profile: { ...state.profile, ...cleanData } as Profile
            }));
        } catch (err) {
            console.error("Error updating profile:", err);
            throw err;
        }
    },

    upgradePlan: (plan) => get().updateProfile({ plan }),
    purchaseCredits: (amount) => get().updateProfile({ ai_credits: (get().profile.ai_credits || 0) + amount }),

    // Consumir créditos de IA de forma atómica.
    // Los nombres de parámetro deben coincidir EXACTAMENTE con la función RPC en Supabase:
    // consume_credits_atomic(user_id uuid, amount_to_consume integer) -> boolean
    consumeCredits: async (amount) => {
        const { profile } = get();
        if (!profile.id || (profile.ai_credits || 0) < amount) return false;

        const { data: success, error } = await supabase.rpc('consume_credits_atomic', {
            user_id: profile.id,
            amount_to_consume: amount
        });

        if (error) {
            console.error("Error consumiendo créditos:", error.message);
            return false;
        }

        if (success) {
            set(state => ({
                profile: { ...state.profile, ai_credits: (state.profile.ai_credits || 0) - amount } as Profile
            }));
            return true;
        }
        return false;
    },
});
