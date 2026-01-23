
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthCard from '../../components/auth/AuthCard';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { useAppStore } from '../../hooks/useAppStore';
import { supabase } from '../../lib/supabaseClient';

const LoginPage: React.FC = () => {
    const navigate = useNavigate();
    const login = useAppStore(state => state.login);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleGoogleLogin = async () => {
        try {
            setError('');
            // En producción y previsualización, la redirección debe ir a la raíz del origen actual
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: window.location.origin, 
                },
            });
            if (error) throw error;
        } catch (err: any) {
            setError('Error al conectar con Google');
            console.error(err.message);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const success = await login(email, password);
            if (success) {
                navigate('/');
            } else {
                setError('Email no encontrado o contraseña incorrecta.');
            }
        } catch (err) {
            setError('Ocurrió un error al iniciar sesión.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthCard>
            <h2 className="text-2xl font-bold text-center text-white mb-6">Iniciar Sesión</h2>
            
            <form onSubmit={handleSubmit} className="space-y-6">
                <Input 
                    label="Email" 
                    type="email" 
                    placeholder="tu@email.com" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                />
                <Input 
                    label="Contraseña" 
                    type="password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                />
                {error && <p className="text-red-500 text-sm text-center">{error}</p>}
                <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? 'Iniciando...' : 'Entrar'}
                </Button>
            </form>

            <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-700" />
                </div>
                <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-gray-900 text-gray-500">O continúa con</span>
                </div>
            </div>

            <div className='flex justify-center'>
                 <Button 
                    type="button"
                    variant="secondary"
                    className="w-full flex items-center justify-center gap-2 bg-white text-black hover:bg-gray-200 border-none"
                    onClick={handleGoogleLogin}
                >
                    <img src="https://www.google.com/favicon.ico" alt="Google" className="w-4 h-4" />
                    Continuar con Google
                </Button>
            </div>

            <p className="mt-6 text-center text-sm text-gray-400">
                ¿No tienes cuenta?{' '}
                <Link to="/auth/register" className="font-medium text-primary-400 hover:text-primary-300">
                    Regístrate
                </Link>
            </p>
        </AuthCard>
    );
};

export default LoginPage;
