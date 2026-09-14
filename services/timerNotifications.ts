// services/timerNotifications.ts
//
// Ítem 7 del roadmap de monetización: "App/PWA con fichaje de tiempo por
// notificación". Cuando arranca el cronómetro, se muestra una notificación
// persistente (requireInteraction) con un botón "Detener" — así se puede
// parar el fichaje sin tener que volver a abrir la app y buscar el botón.
//
// El toque en "Detener" lo gestiona el Service Worker (public/sw.js), que
// avisa a esta página (o abre una si no hay ninguna) para que llame de
// verdad a stopTimer() del store — el Service Worker no tiene acceso al
// store de Zustand ni a la sesión de Supabase, así que necesita que la
// propia app haga el trabajo real.
import type { ActiveTimer } from '@/hooks/store/projectSlice';

const NOTIFICATION_TAG = 'devfreelancer-active-timer';

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

export async function notifyTimerStarted(timer: ActiveTimer): Promise<void> {
  if (!('Notification' in window)) return;

  // No interrumpimos con un permiso a mitad de fichar — si no está
  // concedido ya, simplemente no se muestra notificación esta vez. El
  // permiso se pide explícitamente desde Ajustes/Time Tracking (ver
  // requestTimerNotificationPermission), nunca de sorpresa.
  if (Notification.permission !== 'granted') return;

  const registration = await getRegistration();
  if (!registration) return;

  try {
    await registration.showNotification('Cronómetro en marcha', {
      body: timer.description || 'Fichaje activo',
      tag: NOTIFICATION_TAG,
      requireInteraction: true,
      silent: true,
      icon: '/apple-touch-icon.png',
      badge: '/favicon-32x32.png',
      // @ts-ignore — 'actions' existe en ServiceWorkerRegistration.showNotification
      // pero el tipado de lib.dom.d.ts de TS todavía no lo incluye en NotificationOptions.
      actions: [{ action: 'stop-timer', title: 'Detener' }],
      data: { taskId: timer.taskId, startedAt: timer.startedAt },
    } as NotificationOptions);
  } catch {
    // Notificaciones no soportadas/bloqueadas en este navegador concreto —
    // el cronómetro sigue funcionando igual, solo sin el aviso.
  }
}

export async function notifyTimerStopped(): Promise<void> {
  const registration = await getRegistration();
  if (!registration) return;
  try {
    const notifications = await registration.getNotifications({ tag: NOTIFICATION_TAG });
    notifications.forEach(n => n.close());
  } catch {
    // noop
  }
}

// Se llama desde Ajustes/Time Tracking con un gesto explícito del usuario
// (botón "Activar avisos de fichaje"), nunca automáticamente al cargar la
// app — pedir permiso de notificaciones sin que el usuario lo haya pedido
// es la forma más segura de que lo rechace para siempre.
export async function requestTimerNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  return Notification.requestPermission();
}

export function isTimerNotificationSupported(): boolean {
  return 'Notification' in window && 'serviceWorker' in navigator;
}
