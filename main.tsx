import React from "react";
import ReactDOM from "react-dom/client";
import { GoogleOAuthProvider } from "@react-oauth/google";
import App from "./App";
import "./index.css";

/**
 * ID de Cliente de Google obtenido de la Consola de Google Cloud.
 * Asegúrate de que https://devfreelancer.app esté en "Orígenes de JavaScript autorizados".
 */
const GOOGLE_CLIENT_ID = "457438236235-n2s8q6nvcjm32u0o3ut2lksd8po8gfqf.apps.googleusercontent.com"; 

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("No se pudo encontrar el elemento root. Verifica tu index.html");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <App />
    </GoogleOAuthProvider>
  </React.StrictMode>
);