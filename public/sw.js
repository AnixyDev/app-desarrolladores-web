// public/sw.js
//
// Service Worker de DevFreelancer. Dos responsabilidades, deliberadamente
// mínimas:
// 1. Hacer la app instalable como PWA (junto a manifest.json).
// 2. Gestionar el toque en el botón "Detener" de la notificación del
//    cronómetro (ítem 7 del roadmap) — ver services/timerNotifications.ts.
//
// A propósito NO cachea nada de la app (sin estrategia offline todavía):
// eso es un proyecto aparte con muchas más implicaciones (datos
// desactualizados, sincronización...) que esta función no necesita para
// funcionar. Si en el futuro se añade caché offline, hazlo en un fetch
// handler separado, sin tocar la lógica de notificationclick de abajo.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('notificationclick', (event) => {
  const isStopAction = event.action === 'stop-timer';
  event.notification.close();

  if (!isStopAction) return;

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

      if (allClients.length > 0) {
        // Ya hay una pestaña/ventana abierta de la app: le pedimos a ELLA
        // que pare el cronómetro de verdad (tiene el store de Zustand y la
        // sesión de Supabase — el Service Worker no tiene ninguna de las
        // dos). Se enfoca de paso, para que el usuario vea el resultado.
        const client = allClients[0];
        client.postMessage({ type: 'STOP_ACTIVE_TIMER' });
        if ('focus' in client) client.focus();
      } else {
        // No hay ninguna pestaña abierta: abrimos una con un parámetro que
        // la propia app lee al arrancar para parar el cronómetro
        // automáticamente (ver App.tsx) — el cronómetro en sí ya
        // sobrevivió el cierre porque se persiste en localStorage.
        await self.clients.openWindow('/my-timesheet?stopTimer=1');
      }
    })()
  );
});
