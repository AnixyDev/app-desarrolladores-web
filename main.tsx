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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
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
