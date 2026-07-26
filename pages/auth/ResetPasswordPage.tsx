import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthCard from '@/components/auth/AuthCard';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import PasswordStrengthMeter from '@/components/auth/PasswordStrengthMeter';
import { supabase } from '@/lib/supabaseClient';
import { LockIcon, EyeIcon, EyeOffIcon, AlertTriangleIcon, CheckCircleIcon } from '@/components/icons/Icon';

const ResetPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  // Supabase procesa el token de recuperación de la URL de forma asíncrona
  // (detectSessionInUrl: true). Hasta que no confirmamos que hay sesión, no
  // dejamos enviar el formulario, para no mostrar un error confuso antes de tiempo.
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionMissing, setSessionMissing] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setSessionReady(true);
      } else {
        setSessionMissing(true);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) {
        setSessionReady(true);
        setSessionMissing(false);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSuccess(true);
      setTimeout(() => navigate('/'), 1800);
    } catch (err) {
      console.error(err);
      setError('No se pudo actualizar la contraseña. El enlace puede haber caducado.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <AuthCard>
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
            <CheckCircleIcon className="h-6 w-6 text-green-400" />
          </div>
          <h1 className="text-2xl font-black italic tracking-tight text-white">Contraseña actualizada</h1>
          <p className="mt-2 text-sm text-gray-400">Te llevamos a tu panel...</p>
        </div>
      </AuthCard>
    );
  }

  if (sessionMissing) {
    return (
      <AuthCard>
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
            <AlertTriangleIcon className="h-6 w-6 text-red-400" />
          </div>
          <h1 className="text-2xl font-black italic tracking-tight text-white">Enlace no válido</h1>
          <p className="mt-2 text-sm text-gray-400">
            Este enlace de recuperación ha caducado o ya se usó. Pide uno nuevo.
          </p>
        </div>
        <Link
          to="/auth/forgot-password"
          className="mt-8 block text-center text-sm font-medium text-primary-400 hover:text-primary-300"
        >
          Pedir un nuevo enlace
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-black italic tracking-tight text-white">Elige una nueva contraseña</h1>
        <p className="mt-1 text-sm text-gray-400">Mínimo 8 caracteres.</p>
      </div>

      {error && (
        <div role="alert" className="mb-6 flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-400">
          <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <Input
            id="reset-password"
            label="Nueva contraseña"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            autoFocus
            disabled={!sessionReady}
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
          <PasswordStrengthMeter password={password} />
        </div>

        <Input
          id="reset-password-confirm"
          label="Confirmar contraseña"
          type={showPassword ? 'text' : 'password'}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete="new-password"
          disabled={!sessionReady}
          icon={<LockIcon className="h-4 w-4" />}
          required
        />

        <Button type="submit" className="w-full py-3 mt-2" disabled={loading || !sessionReady} isLoading={loading}>
          {loading ? 'Guardando...' : 'Guardar contraseña'}
        </Button>
      </form>
    </AuthCard>
  );
};

export default ResetPasswordPage;