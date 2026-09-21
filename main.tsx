import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

// IMPORTANTE: React.StrictMode se elimina intencionalmente.
// StrictMode monta y desmonta efectos dos veces en desarrollo,
// lo que provoca dos llamadas concurrentes a supabase.auth que
// compiten por el mismo Web Lock ("devfl-auth-token"), causando:
//   AbortError: Lock broken by another request with the 'steal' option.
// Este comportamiento rompe el flujo de autenticación con Google OAuth.

// FIX: Se elimina GoogleOAuthProvider porque ya NO se usa la librería
// @react-oauth/google. Todo el login con Google ahora pasa por
// supabase.auth.signInWithOAuth(), que hace una redirección real
// gestionada por Supabase, sin necesidad de este proveedor.
// Mantenerlo activo cargaba un script de Google en segundo plano
// que generaba errores de "Cross-Origin-Opener-Policy" en consola.

// CAMBIO (rendimiento): index.html pinta un héroe estático dentro de #root
// para que el navegador muestre contenido sin esperar al JavaScript (FCP/LCP).
// createRoot() NO borra el contenido previo del contenedor: lo añade al final.
// Sin este vaciado se verían el héroe estático y el real, uno encima de otro.
// Se hace en el mismo tick que el render, así que no hay parpadeo.
const container = document.getElementById('root')!;
container.innerHTML = '';

ReactDOM.createRoot(container).render(
  // CAMBIO: se activa v7_relativeSplatPath, que silencia este aviso de consola:
  //   "⚠️ React Router Future Flag Warning: Relative route resolution within
  //    Splat routes is changing in v7."
  //
  // Es seguro en este proyecto: el flag solo cambia cómo se resuelven las rutas
  // RELATIVAS dentro de una ruta splat, y aquí la única splat es
  // <Route path="*" element={<Navigate to="/" replace />} /> en App.tsx, que
  // apunta a una ruta ABSOLUTA y no tiene rutas hijas. Tampoco hay ninguna
  // navegación relativa ("..") en todo el código. O sea: no cambia nada hoy,
  // y deja el terreno preparado para subir a react-router-dom v7.
  <BrowserRouter future={{ v7_relativeSplatPath: true }}>
    <App />
  </BrowserRouter>
);

// NUEVO: registro del Service Worker (ver public/sw.js) — necesario tanto
// para que el navegador ofrezca "Instalar app" (PWA) como para que
// funcione el botón "Detener" de la notificación del cronómetro (ítem 7
// del roadmap). Se registra al arrancar, no al iniciar un fichaje, para
// que esté listo (`navigator.serviceWorker.ready`) desde el primer uso.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.error('No se pudo registrar el Service Worker:', err);
    });
  });
}
