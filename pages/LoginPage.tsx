import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAppStore } from '@/hooks/useAppStore';
import { Logo } from '@/components/icons/Logo';
import Button from '@/components/ui/Button';
// 1. Añadimos el import necesario
import { GoogleLogin } from '@react-oauth/google';

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // 2. Extraemos la función de login con Google del store (asumiendo que se llama loginWithGoogle)
  const { login, loginWithGoogle } = useAppStore(); 
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    try {
      const success = await login(email, password);
      if (success) {
        navigate('/'); // O a /dashboard, según tu ruta principal
      } else {
        setError('Credenciales incorrectas. Inténtalo de nuevo.');
      }
    } catch (err) {
      setError('Error al conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-gray-900 border border-gray-800 p-8 rounded-2xl shadow-2xl">
        <div className="flex flex-col items-center mb-8">
          <Logo className="h-12 w-12 text-primary-500 mb-4" />
          <h1 className="text-2xl font-bold text-white italic">BIENVENIDO A DEVFREELANCER</h1>
          <p className="text-gray-400 text-sm">Ingresa tus credenciales para continuar</p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-3 rounded-lg text-sm mb-6 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Email</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-primary-500 outline-none transition-all"
              placeholder="tu@email.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Contraseña</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-primary-500 outline-none transition-all"
              placeholder="••••••••"
              required
            />
          </div>
          <Button type="submit" className="w-full py-3 mt-2" disabled={loading}>
            {loading ? 'Cargando...' : 'Entrar'}
          </Button>
        </form>

        {/* 3. SECCIÓN DE GOOGLE */}
        <div className="mt-6">
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-800"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-gray-900 px-2 text-gray-500 font-medium">O continúa con</span>
            </div>
          </div>

          <div className="flex justify-center w-full">
            <GoogleLogin
              onSuccess={async (credentialResponse) => {
                const success = await loginWithGoogle(credentialResponse.credential || '');
                if (success) navigate('/');
              }}
              onError={() => {
                setError('Error al iniciar sesión con Google');
              }}
              theme="filled_black"
              width="320"
              text="continue_with"
              shape="pill"
            />
          </div>
        </div>

        <p className="text-center text-gray-500 text-sm mt-8">
          ¿No tienes cuenta?{' '}
          <Link to="/register" className="text-primary-400 hover:text-primary-300 font-medium">
            Regístrate aquí
          </Link>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
