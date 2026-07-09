import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthCard from '../../components/auth/AuthCard';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { useAppStore } from '../../hooks/useAppStore';
import { supabase } from '../../lib/supabaseClient';

const RegisterPage: React.FC = () => {
    const navigate = useNavigate();
    const register = useAppStore(state => state.register);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const success = await register(name, email, password);
            if (success) {
                navigate('/');
            } else {
                setError('No se pudo crear la cuenta. Inténtalo de nuevo.');
            }
        } catch (err) {
            setError('Ocurrió un error durante el registro.');
        } finally {
            setLoading(false);
        }
    };

    // FIX: Usamos el MISMO método que LoginPage.tsx (supabase.auth.signInWithOAuth)
    // en lugar de la librería @react-oauth/google, que no crea sesión real en Supabase.
    const handleGoogleRegister = async () => {
        try {
            setError('');
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

    return (
        <AuthCard>
            <h2 className="text-2xl font-bold text-center text-white mb-6">Crear Cuenta</h2>

            <form onSubmit={handleSubmit} className="space-y-6">
                 <Input 
                    label="Nombre Completo" 
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                />
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
                    {loading ? 'Creando cuenta...' : 'Crear Cuenta'}
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

            {/* FIX: Botón simple en vez del componente GoogleLogin problemático */}
            <div className='flex justify-center'>
                <Button 
                    type="button"
                    variant="secondary"
                    className="w-full flex items-center justify-center gap-2 bg-white text-black hover:bg-gray-200 border-none"
                    onClick={handleGoogleRegister}
                >
                    <img src="https://www.google.com/favicon.ico" alt="Google" className="w-4 h-4" />
                    Continuar con Google
                </Button>
            </div>

            <p className="mt-6 text-center text-sm text-gray-400">
                ¿Ya tienes cuenta?{' '}
                <Link to="/auth/login" className="font-medium text-primary-400 hover:text-primary-300">
                    Inicia sesión
                </Link>
            </p>
        </AuthCard>
    );
};

export default RegisterPage;
