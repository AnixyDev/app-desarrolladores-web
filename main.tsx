import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { GoogleOAuthProvider } from "@react-oauth/google";
import App from "./App";
import "./index.css";

// ID de cliente de Google Cloud Console
const GOOGLE_CLIENT_ID = "457438236235-n2s8q6nvcjm32u0o3ut2lksd8po8gfqf.apps.googleusercontent.com";

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* El BrowserRouter debe envolverlo TODO para que funcionen las rutas */}
    <BrowserRouter>
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <App />
      </GoogleOAuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
