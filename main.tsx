import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import App from './App';
import './index.css';

// FIX: GoogleOAuthProvider fuera de StrictMode para evitar la doble
// inicialización de google.accounts.id.initialize() que causa el aviso
// "[GSI_LOGGER]: google.accounts.id.initialize() is called multiple times"
// StrictMode monta efectos dos veces en desarrollo, lo que dispara dos
// inicializaciones del SDK de Google y comportamiento impredecible.

const GOOGLE_CLIENT_ID = '457438236235-n2s8q6nvcjm32u0o3ut2lksd8po8gfqf.apps.googleusercontent.com';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>
  </GoogleOAuthProvider>
);
