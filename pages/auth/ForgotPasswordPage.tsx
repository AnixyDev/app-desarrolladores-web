import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthCard from '@/components/auth/AuthCard';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { supabase, getURL } from '@/lib/supabaseClient';
import { MailIcon, AlertTriangleIcon, CheckCircleIcon } from '@/components/icons/Icon';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const emailInvalid = touched && !EMAIL_REGEX.test(email);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!EMAIL_REGEX.test(email)) return;

    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${getURL()}/auth/reset-password`,
      });
      if (error) throw error;
      // Por seguridad, no revelamos si el email existe o no en el sistema:
      // mostramos el mismo mensaje de éxito exista o no la cuenta.
      setSent(true);
    } catch (err) {
      console.error(err);
      setError('No se pudo enviar el email. Inténtalo de nuevo en unos minutos.');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthCard>
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
            <CheckCircleIcon className="h-6 w-6 text-green-400" />
          </div>
          <h1 className="text-2xl font-black italic tracking-tight text-white">Revisa tu email</h1>
          <p className="mt-2 text-sm text-gray-400">
            Si existe una cuenta con <span className="text-gray-300">{email}</span>, te hemos enviado un enlace para restablecer tu contraseña.
          </p>
        </div>
        <Link
          to="/auth/login"
          className="mt-8 block text-center text-sm font-medium text-primary-400 hover:text-primary-300"
        >
          Volver a iniciar sesión
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-black italic tracking-tight text-white">¿Olvidaste tu contraseña?</h1>
        <p className="mt-1 text-sm text-gray-400">
          Escribe tu email y te mandamos un enlace para restablecerla.
        </p>
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
            id="forgot-email"
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="tu@email.com"
            autoComplete="email"
            autoFocus
            icon={<MailIcon className="h-4 w-4" />}
            required
          />
          {emailInvalid && (
            <p className="mt-1 text-xs text-red-400">Introduce un email válido.</p>
          )}
        </div>

        <Button type="submit" className="w-full py-3 mt-2" disabled={loading} isLoading={loading}>
          {loading ? 'Enviando...' : 'Enviar enlace'}
        </Button>
      </form>

      <Link
        to="/auth/login"
        className="mt-8 block text-center text-sm font-medium text-primary-400 hover:text-primary-300"
      >
        Volver a iniciar sesión
      </Link>
    </AuthCard>
  );
};

export default ForgotPasswordPage;