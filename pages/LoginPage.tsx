import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAppStore } from '@/hooks/useAppStore';
import AuthCard from '@/components/auth/AuthCard';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { supabase } from '@/lib/supabaseClient';
import { MailIcon, LockIcon, EyeIcon, EyeOffIcon, AlertTriangleIcon } from '@/components/icons/Icon';
import { GoogleIcon } from '@/components/icons/GoogleIcon';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// FIX: Se eliminó "import LoginPage from './pages/LoginPage'"
// Ese import causaba "Identifier 'LoginPage' has already been declared":
// el archivo se importaba a sí mismo, duplicando la variable.

// FIX: Se eliminó "import { GoogleLogin } from '@react-oauth/google'"
// Ya no usamos ese botón (con popup). Ahora usamos
// supabase.auth.signInWithOAuth(), con redirección real gestionada
// por Supabase, evitando errores de "Cross-Origin-Opener-Policy".

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { login } = useAppStore();
  const navigate = useNavigate();

  const emailInvalid = emailTouched && email.length > 0 && !EMAIL_REGEX.test(email);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailTouched(true);
    if (!EMAIL_REGEX.test(email)) return;

    setLoading(true);
    setError(null);

    try {
      const success = await login(email, password);
      if (success) {
        navigate('/');
      } else {
        setError('Credenciales incorrectas. Inténtalo de nuevo.');
      }
    } catch (err) {
      setError('Error al conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      setError('Error al iniciar sesión con Google');
      console.error(err.message);
    }
  };

  return (
    <AuthCard>
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-black italic tracking-tight text-white">
          Bienvenido de vuelta
        </h1>
        <p className="mt-1 text-sm text-gray-400">Ingresa tus credenciales para continuar</p>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-6 flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-400"
        >
          <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-4" noValidate>
        <div>
          <Input
            id="login-email"
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setEmailTouched(true)}
            placeholder="tu@email.com"
            autoComplete="email"
            autoFocus
            icon={<MailIcon className="h-4 w-4" />}
            required
          />
          {emailInvalid && <p className="mt-1 text-xs text-red-400">Introduce un email válido.</p>}
        </div>

        <Input
          id="login-password"
          label="Contraseña"
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete="current-password"
          icon={<LockIcon className="h-4 w-4" />}
          rightElement={
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="text-gray-500 hover:text-gray-300 focus:outline-none focus:text-primary-400"
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              tabIndex={-1}
            >
              {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
            </button>
          }
          required
        />

        <div className="text-right">
          <Link to="/auth/forgot-password" className="text-xs font-medium text-primary-400 hover:text-primary-300">
            ¿Olvidaste tu contraseña?
          </Link>
        </div>

        <Button type="submit" className="w-full py-3 mt-2" disabled={loading} isLoading={loading}>
          {loading ? 'Entrando...' : 'Entrar'}
        </Button>
      </form>

      <div className="mt-6">
        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-800"></div>
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-gray-900 px-2 text-gray-500 font-medium">O continúa con</span>
          </div>
        </div>

        <Button
          type="button"
          variant="secondary"
          onClick={handleGoogleLogin}
          className="w-full flex items-center justify-center gap-2 bg-white text-black hover:bg-gray-200 border-none"
        >
          <GoogleIcon className="w-[18px] h-[18px]" />
          Continuar con Google
        </Button>
      </div>

      <p className="text-center text-gray-500 text-sm mt-8">
        ¿No tienes cuenta?{' '}
        <Link to="/auth/register" className="text-primary-400 hover:text-primary-300 font-medium">
          Regístrate aquí
        </Link>
      </p>
    </AuthCard>
  );
};

export default LoginPage;