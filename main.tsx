import React from "react";
import ReactDOM from "react-dom/client";
import { GoogleOAuthProvider } from "@react-oauth/google"; // 👈 Importamos el proveedor
import App from "./App";
import "./index.css";

// Reemplaza 'TU_CLIENT_ID_DE_GOOGLE' por tu ID real de la consola de Google
// Si usas variables de entorno: import.meta.env.VITE_GOOGLE_CLIENT_ID
const GOOGLE_CLIENT_ID = "457438236235-n2s8q6nvcjm32u0o3ut2lksd8po8gfqf.apps.googleusercontent.com"; 

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <App />
    </GoogleOAuthProvider>
  </React.StrictMode>
);
