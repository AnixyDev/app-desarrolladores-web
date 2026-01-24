import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import Layout from './components/layout/Layout';
import { useAppStore } from './hooks/useAppStore';

const App = () => {
  const { isAuthenticated, isProfileLoading } = useAppStore();

  if (isProfileLoading) {
    return <div className="text-white p-8">Cargando…</div>;
  }

  return (
    <Routes>
      {/* PUBLIC */}
      <Route path="/auth/login" element={<LoginPage />} />
      <Route path="/auth/register" element={<RegisterPage />} />

      {/* PRIVATE */}
      <Route
        path="/*"
        element={
          isAuthenticated ? (
            <Layout />
          ) : (
            <Navigate to="/auth/login" replace />
          )
        }
      />
    </Routes>
  );
};

export default App;
