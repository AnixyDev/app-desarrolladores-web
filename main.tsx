import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import App from './App';
import './index.css';

// IMPORTANTE: React.StrictMode se elimina intencionalmente.
// StrictMode monta y desmonta efectos dos veces en desarrollo,
// lo que provoca dos llamadas concurrentes a supabase.auth que
// compiten por el mismo Web Lock ("devfl-auth-token"), causando:
//   AbortError: Lock broken by another request with the 'steal' option.
// Este comportamiento rompe el flujo de autenticación con Google OAuth.

const GOOGLE_CLIENT_ID = '457438236235-n2s8q6nvcjm32u0o3ut2lksd8po8gfqf.apps.googleusercontent.com';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </GoogleOAuthProvider>
);
