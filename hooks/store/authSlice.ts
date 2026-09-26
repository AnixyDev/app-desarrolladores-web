import { StateCreator } from 'zustand';
import { AppState } from '../useAppStore';
import { Profile, GoogleJwtPayload } from '../../types';
import { supabase } from '../../lib/supabaseClient';
import { logger } from '../../lib/loggerService';
import { opcionesCaptcha, esErrorDeCaptcha, MENSAJE_CAPTCHA_FALLIDO } from '../../lib/captcha';
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
    // CAMBIO: faltaba signature_credits, que en types.ts es obligatorio.
    // tsc lo avisaba (TS2741) y el build pasaba igual porque Vite no hace
    // comprobacion estricta. Valor 0, igual que la columna en Supabase:
    // integer NOT NULL DEFAULT 0. Asi el perfil por defecto (el que se ve
    // mientras carga la sesion) no anuncia creditos de firma que no existen.
    signature_credits: 0,
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

// CAMBIO: traduce el error de Supabase a un mensaje útil para el usuario.
//
// Deliberadamente NO se vuelca el mensaje crudo del servidor: para credenciales
// incorrectas se mantiene un texto genérico a propósito, porque distinguir
// "ese email no existe" de "la contraseña no es esa" permitiría a un atacante
// averiguar qué cuentas están dadas de alta. Los casos que sí se detallan
// (email sin confirmar, cuenta suspendida, rate limit) no añaden información
// que la propia API no devuelva ya a quien la llame directamente.
//
// Para cualquier caso no contemplado se muestra el código de Supabase, que es
// lo que hace falta para diagnosticar. Antes ese dato solo iba a console.error,
// y desde que se eliminan los console.* en producción se perdía del todo.
export const RUTA_RESTABLECER = '/auth/reset-password';

/** ¿Hay que llevar al usuario al formulario de contraseña nueva? */
export const debeIrARestablecer = (rutaActual: string): boolean =>
    rutaActual.replace(/\/+$/, '') !== RUTA_RESTABLECER;

const mensajeDeErrorDeLogin = (error: any): string => {
    const codigo = error?.code ?? '';
    const estado = error?.status ?? 0;

    if (esErrorDeCaptcha(error)) return MENSAJE_CAPTCHA_FALLIDO;

    switch (codigo) {
        case 'invalid_credentials':
            return 'Credenciales incorrectas. Inténtalo de nuevo.';
        case 'email_not_confirmed':
            return 'Tu email todavía no está confirmado. Revisa tu bandeja de entrada.';
        case 'user_banned':
            return 'Esta cuenta está suspendida.';
        case 'over_request_rate_limit':
        case 'over_email_send_rate_limit':
            return 'Demasiados intentos. Espera unos minutos y vuelve a probar.';
    }

    if (estado === 429) return 'Demasiados intentos. Espera unos minutos y vuelve a probar.';
    if (!estado) return 'No se pudo conectar con el servidor. Comprueba tu conexión.';

    return `No se pudo iniciar sesión (código: ${codigo || estado}).`;
};

export interface AuthSlice {
  isAuthenticated: boolean;
  isProfileLoading: boolean;
  /**
   * Si los datos de trabajo (clientes, proyectos, ofertas) ya han llegado.
   *
   * Sin esto, las paginas de detalle no podian distinguir "todavia no han
   * llegado" de "no existe", y enseñaban un error rojo de "no encontrado"
   * mientras cargaban. Al refrescar la pagina de un proyecto, lo primero que
   * veia el usuario era ese error.
   */
  datosDeTrabajoCargados: boolean;
  profile: Profile;
  // CAMBIO: antes devolvía solo `boolean`, así que LoginPage no tenía forma de
  // saber POR QUÉ había fallado y mostraba siempre "Credenciales incorrectas",
  // incluso cuando la causa era otra (email sin confirmar, rate limit, servidor
  // caído). Ahora devuelve el motivo, igual que `register`.
  login: (email: string, password?: string, captchaToken?: string | null) => Promise<{ success: boolean; message?: string }>;
  loginWithGoogle: (payload: GoogleJwtPayload) => Promise<void>;
  logout: () => Promise<void>;
  register: (name: string, email: string, password?: string, captchaToken?: string | null) => Promise<{ success: boolean; message?: string }>;
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
    datosDeTrabajoCargados: false,
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
            logger.info("RefreshProfile ya en curso, reutilizando promesa existente");
            return refreshInFlight;
        }

        refreshInFlight = (async () => {
            try {
                logger.info("RefreshProfile iniciado");

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
                    logger.info("No hay sesion activa");
                    set({ isAuthenticated: false, profile: initialProfile, isProfileLoading: false });
                    return;
                }

                logger.info("Sesion encontrada");

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
                    logger.info("Perfil cargado correctamente");
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
        logger.info("InitializeAuth iniciado");
        set({ isProfileLoading: true });

        supabase.auth.onAuthStateChange((event, session) => {
            logger.info("AuthStateChange", { event });

            // Enlace de restablecer contraseña que ha aterrizado fuera de su
            // página (p. ej. en la portada, si Supabase no aceptó la dirección
            // de vuelta): la sesión de recuperación ya está creada, pero sin
            // este salto el usuario entraba en la aplicación y nunca veía el
            // formulario de contraseña nueva. Solo navegación, ninguna llamada
            // a Supabase, así que no hay riesgo con el lock de auth.
            if (event === 'PASSWORD_RECOVERY' && debeIrARestablecer(window.location.pathname)) {
                window.location.replace(RUTA_RESTABLECER);
                return;
            }

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
                    logger.info("Usuario autenticado detectado");

                    // FIX: Supabase puede emitir varios eventos (SIGNED_IN,
                    // INITIAL_SESSION, TOKEN_REFRESHED...) seguidos para la
                    // MISMA sesión ya resuelta — sobre todo justo después de
                    // un login por enlace mágico/OAuth con el token todavía
                    // en la URL. Antes, cada evento disparaba un refreshProfile()
                    // completo (nueva consulta a `profiles` + re-render), aunque
                    // el perfil de ese usuario ya estuviera cargado. Si el
                    // usuario no ha cambiado, no hace falta repetir la consulta.
                    const alreadyLoaded = get().isAuthenticated && get().profile.id === session.user.id;
                    if (!alreadyLoaded) {
                        await get().refreshProfile(session);
                    }

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
                        get().fetchTasks().catch(() => {});
                        get().fetchApplications().catch(() => {});
                        get().fetchSavedJobs().catch(() => {});
                        get().fetchUsers().catch(() => {});
                        get().fetchTeamMembership().catch(() => {});
                        get().fetchArticles().catch(() => {});
                        get().fetchFiscalRecords().catch(() => {});

                        // FIX: checkInvoiceStatuses() (avisos de vencimiento) y la
                        // nueva checkProjectProfitability() (avisos de presupuesto)
                        // necesitan que projects/invoices/timeEntries ya estén
                        // cargados para poder comprobar algo real — por eso se
                        // esperan explícitamente aquí, en vez de dispararlas en
                        // paralelo como el resto (que antes ni siquiera se llamaban).
                        // fetchClients y fetchJobs se esperan aqui, no sueltos: de
                        // ellos dependen las paginas de detalle para saber si un
                        // registro no existe o si simplemente no ha llegado aun.
                        Promise.all([
                            get().fetchClients(),
                            get().fetchProjects(),
                            get().fetchJobs(),
                            get().fetchFinanceData(),
                            get().fetchTimeEntries(),
                        ]).then(() => {
                            get().checkInvoiceStatuses();
                            get().checkProjectProfitability();
                        }).catch(() => {
                            // Si alguna falla, el indicador se levanta igual: mejor
                            // decir "no encontrado" que dejar un giro infinito.
                        }).finally(() => {
                            set({ datosDeTrabajoCargados: true });
                        });
                    }
                } else {
                    logger.info("Usuario desconectado");
                    backgroundDataFetchedForUser = null;
                    set({ isAuthenticated: false, profile: initialProfile, isProfileLoading: false, datosDeTrabajoCargados: false });
                }
            }, 0);
        });

        // No se hace una segunda llamada a getSession()/refreshProfile() aquí:
        // onAuthStateChange se encarga de todo el flujo inicial (INITIAL_SESSION).
        // Esto elimina la carrera que causaba el deadlock del lock interno de supabase-js.
    },

    // Login con email/password tradicional
    login: async (email, password, captchaToken) => {
        // CAMBIO: aquí se hacía `set({ isProfileLoading: true })`, y eso impedía
        // que el usuario viera NUNCA el motivo de un fallo de login.
        //
        // App.tsx devuelve <LoadingFallback /> mientras isProfileLoading es true,
        // así que al empezar el login se desmontaba el árbol de rutas entero —
        // LoginPage incluida. Al terminar, LoginPage se volvía a montar desde
        // cero y su estado `error` nacía otra vez en null: el mensaje se perdía
        // antes de poder pintarse. Comprobado midiendo el DOM durante el proceso:
        // a 400 ms y 900 ms el formulario no existía.
        //
        // No hace falta esa bandera aquí: LoginPage ya tiene su propio estado
        // `loading` para el botón, y en caso de éxito refreshProfile() y
        // onAuthStateChange se encargan de ella.
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password: password || '',
                options: opcionesCaptcha(captchaToken),
            });

            if (error) return { success: false, message: mensajeDeErrorDeLogin(error) };

            if (data.user) {
                await get().refreshProfile();
                return { success: true };
            }

            // Sin error pero tampoco usuario: no deberia ocurrir, pero si ocurre
            // es mejor decirlo que devolver un "credenciales incorrectas" falso.
            return { success: false, message: 'No se pudo iniciar sesión. Inténtalo de nuevo.' };
        } catch (error: any) {
            // Fallos de red o excepciones del SDK (AuthRetryableFetchError, etc.).
            return { success: false, message: mensajeDeErrorDeLogin(error) };
        }
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
    register: async (name, email, password, captchaToken) => {
        try {
            const { data, error } = await supabase.auth.signUp({
                email,
                password: password || '',
                options: { data: { full_name: name }, ...opcionesCaptcha(captchaToken) }
            });

            if (error) {
                return {
                    success: false,
                    message: esErrorDeCaptcha(error) ? MENSAJE_CAPTCHA_FALLIDO : error.message,
                };
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

    // CAMBIO IMPORTANTE: el descuento de créditos ya NO se hace desde aquí.
    //
    // Antes esta función llamaba a consume_credits_atomic desde el navegador, y
    // era el ÚNICO sitio donde se cobraba: la Edge Function ai-gemini ejecutaba
    // la acción sin mirar ni descontar créditos. Cualquiera que llamara a la
    // función directamente, saltándose la app, tenía IA ilimitada y gratis.
    //
    // Ahora cobra el servidor, dentro de ai-gemini y ANTES de gastar la cuota
    // de Gemini. Esta función solo refleja en pantalla el descuento que el
    // servidor ya ha hecho, para que el contador no se quede desfasado hasta la
    // siguiente recarga del perfil. Si alguna vez discrepan, manda el servidor.
    consumeCredits: async (amount) => {
        const { profile } = get();
        if (!profile.id) return false;

        set(state => ({
            profile: {
                ...state.profile,
                ai_credits: Math.max(0, (state.profile.ai_credits || 0) - amount),
            } as Profile
        }));
        return true;
    },
});
