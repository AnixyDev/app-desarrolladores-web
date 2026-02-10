import React, { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { useAppStore } from "./hooks/useAppStore";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
import AppLayout from "@/components/layout/AppLayout";

// Pages
import LandingPage from "@/pages/LandingPage";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/auth/RegisterPage";
import DashboardPage from "@/pages/DashboardPage";
// ... (manten tus otras importaciones de páginas igual)
import PrivacyPolicyPage from "@/pages/PrivacyPolicyPage";
import TermsOfService from "@/pages/TermsOfService";

/* ---------------- Guard ---------------- */

const ProtectedRoute: React.FC = () => {
  const { isAuthenticated, isProfileLoading } = useAppStore();

  // ⚠️ CAMBIO CLAVE: Solo bloqueamos si el usuario intenta entrar a zona protegida
  // y aún estamos cargando su perfil.
  if (isProfileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-gray-400">
        <div className="animate-pulse italic">Cargando sistema...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth/login" replace />;
  }

  return <Outlet />;
};

/* ---------------- App ---------------- */

const App: React.FC = () => {
  const initializeAuth = useAppStore((state) => state.initializeAuth);

  useEffect(() => {
    if (supabaseConfigError) return;
    const cleanup = initializeAuth();
    return () => { cleanup?.(); };
  }, [initializeAuth]);

  return (
    <BrowserRouter>
      <Routes>
        {/* RUTAS PÚBLICAS (Siempre accesibles) */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/auth/login" element={<LoginPage />} />
        <Route path="/auth/register" element={<RegisterPage />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/terms" element={<TermsOfService />} />

        {/* RUTAS PROTEGIDAS */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            {/* ... añade aquí el resto de tus rutas internas como /clients, /projects, etc. */}
          </Route>
        </Route>

        {/* Redirecciones de conveniencia */}
        <Route path="/login" element={<Navigate to="/auth/login" replace />} />
        <Route path="/register" element={<Navigate to="/auth/register" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;