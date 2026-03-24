import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthCard from '@/components/auth/AuthCard';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { useAppStore } from '@/hooks/useAppStore';
import { GoogleLogin, CredentialResponse } from '@react-oauth/google';
import { AlertTriangleIcon } from '@/components/icons/Icon';

/**
 * Sub-componente para manejar el error de configuración de Google
 * Se mantiene dentro o fuera según preferencia de organización.
 */
const GoogleConfigAlert: React.FC<{ origin: string }> = ({ origin }) => (
  <div className="bg-red-900/50 border border-red-500/50 text-red-300 p-4 rounded-lg mb-6 text-sm animate-in fade-in duration-300">
    <div className="flex items-start">
      <AlertTriangleIcon className="w-5 h-5 mr-3 shrink-0" />
      <div>
        <h3 className="font-bold mb-1">Error de Configuración (origin_mismatch)</h3>
        <p className="mb-2">
          La URL de esta aplicación no está autorizada en tu Google Cloud Console.
        </p>
        <p className="font-semibold">Solución:</p>
        <ol className="list-decimal list-inside space-y-1 mt-1">
          <li>
            Copia esta URL:{' '}
            <code className="bg-gray-800 text-white p-1 rounded text-xs select-all">
              {origin}
            </code>
          </li>
          <li>Añádela a "Orígenes de JavaScript autorizados" en tu OAuth client.</li>
        </ol>
        <a
          href="https://console.cloud.google.com/apis/credentials"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-3 px-3 py-1 bg-red-600 text-white font-semibold rounded hover:bg-red-700 transition-colors"
        >
          Ir a Google Cloud Console
        </a>
      </div>
    </div>
  </div>
);

const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const register = useAppStore(state => state.register);
  const loginWithGoogle = useAppStore(state => state.loginWithGoogle);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showGoogleConfigError, setShowGoogleConfigError] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setShowGoogleConfigError(false);

    // Validación básica de seguridad antes de la petición
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setLoading(true);
    try {
      const success = await register(name, email, password);
      if (success) {
        navigate('/');
      } else {
        setError('No se pudo crear la cuenta. Verifica tus datos o intenta con otro email.');
      }
    } catch (err: any) {
      setError(err?.message || 'Ocurrió un error inesperado durante el registro.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse: CredentialResponse) => {
    setShowGoogleConfigError(false);
    setError('');
    
    if (!credentialResponse.credential) {
      setError('No se pudo obtener el token de Google.');
      return;
    }

    setLoading(true);
    try {
      const success = await loginWithGoogle(credentialResponse.credential);
      if (success) {
        navigate('/');
      } else {
        setError('No se pudo vincular la cuenta de Google.');
      }
    } catch (err: any) {
      setError(err?.message || 'Error al conectar con los servicios de Google.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleError = () => {
    setError('');
    setShowGoogleConfigError(true);
    console.error('Google register failed: Check Authorized JavaScript Origins');
  };

  return (
    <AuthCard>
      <h2 className="text-2xl font-bold text-center text-white mb-6">Crear Cuenta</h2>

      {showGoogleConfigError && (
        <GoogleConfigAlert origin={window.location.origin} />
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Input
          label="Nombre Completo"
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          required
          autoComplete="name"
          disabled={loading}
        />
        <Input
          label="Email"
          type="email"
          placeholder="tu@email.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          autoComplete="email"
          disabled={loading}
        />
        <Input
          label="Contraseña"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          autoComplete="new-password"
          disabled={loading}
        />

        {error && (
          <p className="text-red-500 text-sm text-center font-medium animate-pulse">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Procesando...' : 'Crear Cuenta'}
        </Button>
      </form>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-700" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-2 bg-gray-900 text-gray-500">O regístrate con</span>
        </div>
      </div>

      <div className="flex justify-center">
        <GoogleLogin
          onSuccess={handleGoogleSuccess}
          onError={handleGoogleError}
          theme="filled_black"
          text="signup_with"
          shape="pill"
          disabled={loading}
        />
      </div>

      <p className="mt-6 text-center text-sm text-gray-400">
        ¿Ya tienes cuenta?{' '}
        <Link to="/login" className="font-medium text-primary-400 hover:text-primary-300 transition-colors">
          Inicia sesión
        </Link>
      </p>
    </AuthCard>
  );
};

export default RegisterPage;
