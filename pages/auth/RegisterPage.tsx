
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthCard from '../../components/auth/AuthCard';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { useAppStore } from '../../hooks/useAppStore';
import { GoogleLogin, CredentialResponse } from '@react-oauth/google';
import { GoogleJwtPayload } from '../../types';
import { AlertTriangleIcon } from '../../components/icons/Icon';
import { jwtDecode } from '../../lib/utils';


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

    const handleGoogleSuccess = (credentialResponse: CredentialResponse) => {
        setShowGoogleConfigError(false);
        if (credentialResponse.credential) {
            const decoded: GoogleJwtPayload | null = jwtDecode(credentialResponse.credential);
            if (decoded) {
                loginWithGoogle(decoded); 
                navigate('/');
            } else {
                setError('No se pudo verificar la información de Google.');
            }
        }
    };

    const handleGoogleError = () => {
        setError('');
        setShowGoogleConfigError(true);
        console.error('Register Failed');
    };

    return (
        <AuthCard>
            <h2 className="text-2xl font-bold text-center text-white mb-6">Crear Cuenta</h2>
            
            {showGoogleConfigError && (
                 <div className="bg-red-900/50 border border-red-500/50 text-red-300 p-4 rounded-lg mb-6 text-sm">
                    <div className="flex items-start">
                        <AlertTriangleIcon className="w-5 h-5 mr-3 shrink-0" />
                        <div>
                            <h3 className="font-bold mb-1">Error de Configuración (origin_mismatch)</h3>
                            <p className="mb-2">Este error ocurre porque la URL de esta aplicación no está autorizada en tu Google Cloud Console.</p>
                            <p className="font-semibold">Solución:</p>
                            <ol className="list-decimal list-inside space-y-1 mt-1">
                                <li>Copia esta URL de origen: <br/><code className="bg-gray-800 text-white p-1 rounded text-xs select-all">{window.location.origin}</code></li>
                                <li>Añádela a "Orígenes de JavaScript autorizados" en tu configuración de cliente de OAuth.</li>
                            </ol>
                            <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="inline-block mt-3 px-3 py-1 bg-red-600 text-white font-semibold rounded hover:bg-red-700">
                                Ir a Google Cloud Console
                            </a>
                        </div>
                    </div>
                </div>
            )}

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

            <div className='flex justify-center'>
                 <GoogleLogin
                    onSuccess={handleGoogleSuccess}
                    onError={handleGoogleError}
                    theme="filled_black"
                    text="signup_with"
                    shape="pill"
                />
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
