import { StateCreator } from 'zustand';
import { AppState } from '../useAppStore';
import { Profile, GoogleJwtPayload } from '../../types';
import { supabase } from '../../lib/supabaseClient';
import type { Session } from '@supabase/supabase-js';

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
  register: (name: string, email: string, password?: string) => Promise<{ success: boolean; message?: string }>;
  updateProfile: (profileData: Partial<Profile>) => Promise<void>;
  refreshProfile: (knownSession?: Session | null) => Promise<void>;
  upgradePlan: (plan: 'Pro' | 'Teams') => void;
  purchaseCredits: (amount: number) => void;
  consumeCredits: (amount: number) => Promise<boolean>;
  initializeAuth: () => Promise<void>;
}

// Guard módulo-level: evita ejecuciones concurrentes de refreshProfile.
// Si ya hay una llamada en curso, las siguientes reutilizan esa misma promesa
// en vez de disparar otro getSession() en paralelo (causa raíz del bucle infinito).
let refreshInFlight: Promise<void> | null = null;

// Guard módulo-level: evita que fetchClients()/fetchProjects() se disparen más
// de una vez por sesión de login. onAuthStateChange puede emitir INITIAL_SESSION
// y SIGNED_IN casi simultáneamente en la carga inicial; sin este guard, cada
// evento dispara su propia carga en segundo plano y se amontonan llamadas
// concurrentes a Supabase (agravando la contención del Web Lock de auth).
let backgroundDataFetchedForUser: string | null = null;

export const createAuthSlice: StateCreator<AppState, [], [], AuthSlice> = (set, get) => ({
    isAuthenticated: false,
    isProfileLoading: true,
    profile: initialProfile,

    // FIX CRÍTICO: refreshProfile ahora acepta opcionalmente una sesión ya
    // conocida (knownSession). Cuando se llama desde dentro del callback de
    // onAuthStateChange, la sesión YA viene como argumento de ese callback,
    // así que se le pasa aquí directamente y NUNCA se vuelve a llamar a
    // supabase.auth.getSession() en ese caso.
    //
    // Por qué importa: llamar a getSession() DESDE DENTRO de onAuthStateChange
    // es un anti-patrón documentado de supabase-js — ese callback se dispara
    // durante la inicialización interna del cliente (_recoverAndRefresh /
    // _initialize), que ya tiene cogido el lock interno de auth. Una llamada
    // a getSession() en ese momento intenta coger el mismo lock y se queda
    // esperando a que termine la propia inicialización que la está esperando
    // a ella — un deadlock real, no un problema de red ni de timeout.
    // (Esto es lo que veíamos como "Timeout 8000ms esperando getSession()".)
    //
    // Solo cuando se llama a refreshProfile() de forma "suelta" (ej. tras un
    // login con email/password) se hace la llamada a getSession(), porque ahí
    // sí estamos fuera del callback y es seguro.
    refreshProfile: async (knownSession?: Session | null) => {
        if (refreshInFlight) {
            console.log("⏭️ RefreshProfile ya en curso, reutilizando promesa existente...");
            return refreshInFlight;
        }

        refreshInFlight = (async () => {
            try {
                console.log("🔄 RefreshProfile iniciado...");

                let session = knownSession;

                if (session === undefined) {
                    // Solo se llama a getSession() cuando NO nos han pasado ya
                    // la sesión (es decir, cuando no venimos de onAuthStateChange).
                    const result = await withTimeout(
                        supabase.auth.getSession(),
                        8000,
                        'supabase.auth.getSession()'
                    );
                    session = result.data.session;
                }

                if (!session?.user) {
                    console.log("❌ No hay sesión activa");
                    set({ isAuthenticated: false, profile: initialProfile, isProfileLoading: false });
                    return;
                }

                console.log("✅ Sesión encontrada para:", session.user.email);

                // 2. Lectura fresca desde la base de datos
                const { data: profileData, error: fetchError } = await withTimeout(
                    Promise.resolve(supabase.from('profiles').select('*').eq('id', session.user.id).single()),
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

        supabase.auth.onAuthStateChange((event, session) => {
            console.log("🔔 AuthStateChange event:", event);

            // FIX CRÍTICO: todo el trabajo async se difiere con setTimeout(0).
            // No basta con evitar getSession() dentro de este callback (ya lo
            // arreglamos pasando `session` directamente a refreshProfile) —
            // CUALQUIER llamada a Supabase hecha de forma síncrona aquí dentro
            // (incluida una simple `.from('profiles').select()`) puede quedar
            // bloqueada, porque este callback se dispara DURANTE la propia
            // inicialización interna del cliente (_recoverAndRefresh/_initialize),
            // que tiene cogido el lock de auth. setTimeout(fn, 0) saca la
            // ejecución de ese callback síncrono y la mueve al siguiente tick,
            // momento en el que _initialize() ya ha soltado el lock. Este es
            // el patrón recomendado oficialmente por la documentación de
            // supabase-js para onAuthStateChange.
            setTimeout(async () => {
                if (session?.user) {
                    console.log("✅ Usuario autenticado detectado");
                    await get().refreshProfile(session);

                    // Cargar datos en segundo plano, pero solo UNA vez por usuario/sesión.
                    // Evita que INITIAL_SESSION + SIGNED_IN disparen los fetch dos veces
                    // en paralelo, que era la causa de la contención del Web Lock.
                    //
                    // FIX: se añaden fetchFinanceData (invoices, budgets, proposals,
                    // contracts, expenses, recurring_*) y fetchTimeEntries/fetchTasks.
                    // Antes NADA los llamaba al arrancar la app — solo existían en
                    // memoria mientras durase la sesión del navegador en la que se
                    // creaban. Al recargar o volver a loguear, el store arrancaba
                    // vacío y parecía que los datos se habían borrado, cuando en
                    // realidad seguían intactos en la base de datos.
                    if (backgroundDataFetchedForUser !== session.user.id) {
                        backgroundDataFetchedForUser = session.user.id;
                        get().fetchClients().catch(() => {});
                        get().fetchTasks().catch(() => {});
                        get().fetchJobs().catch(() => {});
                        get().fetchApplications().catch(() => {});
                        get().fetchSavedJobs().catch(() => {});
                        get().fetchUsers().catch(() => {});
                        get().fetchTeamMembership().catch(() => {});
                        get().fetchArticles().catch(() => {});

                        // FIX: checkInvoiceStatuses() (avisos de vencimiento) y la
                        // nueva checkProjectProfitability() (avisos de presupuesto)
                        // necesitan que projects/invoices/timeEntries ya estén
                        // cargados para poder comprobar algo real — por eso se
                        // esperan explícitamente aquí, en vez de dispararlas en
                        // paralelo como el resto (que antes ni siquiera se llamaban).
                        Promise.all([
                            get().fetchProjects(),
                            get().fetchFinanceData(),
                            get().fetchTimeEntries(),
                        ]).then(() => {
                            get().checkInvoiceStatuses();
                            get().checkProjectProfitability();
                        }).catch(() => {});
                    }
                } else {
                    console.log("❌ Usuario desconectado");
                    backgroundDataFetchedForUser = null;
                    set({ isAuthenticated: false, profile: initialProfile, isProfileLoading: false });
                }
            }, 0);
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
            backgroundDataFetchedForUser = null;
            set({ isAuthenticated: false, profile: initialProfile, isProfileLoading: false });
            localStorage.clear();
            window.location.assign('/auth/login');
        }
    },

    // Registro con email/password
    // FIX: antes se devolvía solo `true`/`false`. Cuando el email ya tenía
    // cuenta (aunque fuera creada por Google), Supabase responde 200 sin
    // error (por seguridad, para no revelar qué emails existen) pero con
    // `data.user.identities` vacío. Sin comprobar eso, el código interpretaba
    // la respuesta como "cuenta creada" y navegaba a "/" sin avisar de nada,
    // pareciendo que el registro no había hecho nada en absoluto.
    register: async (name, email, password) => {
        try {
            const { data, error } = await supabase.auth.signUp({
                email,
                password: password || '',
                options: { data: { full_name: name } }
            });

            if (error) {
                return { success: false, message: error.message };
            }

            // Email ya registrado (con cualquier proveedor): Supabase devuelve
            // un usuario con identities: [] en vez de un error, por diseño.
            if (data.user && data.user.identities && data.user.identities.length === 0) {
                return {
                    success: false,
                    message: 'Ya existe una cuenta con este email. Prueba a iniciar sesión en su lugar.',
                };
            }

            return { success: true };
        } catch (error) {
            return { success: false, message: 'Ocurrió un error inesperado al crear la cuenta.' };
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