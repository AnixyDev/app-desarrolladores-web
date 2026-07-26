import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthCard from '../../components/auth/AuthCard';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import PasswordStrengthMeter from '../../components/auth/PasswordStrengthMeter';
import { useAppStore } from '../../hooks/useAppStore';
import { supabase } from '../../lib/supabaseClient';
import { UserIcon, MailIcon, LockIcon, EyeIcon, EyeOffIcon, AlertTriangleIcon, CheckCircleIcon } from '../../components/icons/Icon';
import { GoogleIcon } from '../../components/icons/GoogleIcon';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const RegisterPage: React.FC = () => {
    const register = useAppStore(state => state.register);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [emailTouched, setEmailTouched] = useState(false);
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [infoMessage, setInfoMessage] = useState('');
    const [loading, setLoading] = useState(false);

    const emailInvalid = emailTouched && email.length > 0 && !EMAIL_REGEX.test(email);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setInfoMessage('');
        setEmailTouched(true);
        if (!EMAIL_REGEX.test(email)) return;

        setLoading(true);
        try {
            const result = await register(name, email, password);
            if (result.success) {
                // FIX: no navegamos directo a "/" en silencio. Si el proyecto tiene
                // confirmación de email activada (lo habitual), signUp() no crea
                // sesión todavía — hay que avisar de que revise su correo, si no
                // parece que "no ha pasado nada" tras crear la cuenta.
                setError('');
                setInfoMessage('Cuenta creada. Revisa tu email para confirmar la cuenta antes de iniciar sesión.');
            } else {
                setError(result.message || 'No se pudo crear la cuenta. Inténtalo de nuevo.');
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
            <div className="mb-6 text-center">
                <h2 className="text-2xl font-black italic tracking-tight text-white">Crear cuenta</h2>
                <p className="mt-1 text-sm text-gray-400">Empieza a gestionar tu negocio freelance</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                 <Input
                    id="register-name"
                    label="Nombre Completo"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    icon={<UserIcon className="h-4 w-4" />}
                    autoComplete="name"
                    autoFocus
                    required
                />
                <div>
                    <Input
                        id="register-email"
                        label="Email"
                        type="email"
                        placeholder="tu@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onBlur={() => setEmailTouched(true)}
                        icon={<MailIcon className="h-4 w-4" />}
                        autoComplete="email"
                        required
                    />
                    {emailInvalid && <p className="mt-1 text-xs text-red-400">Introduce un email válido.</p>}
                </div>
                <div>
                    <Input
                        id="register-password"
                        label="Contraseña"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        icon={<LockIcon className="h-4 w-4" />}
                        autoComplete="new-password"
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
                {error && (
                    <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-400">
                        <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}
                {infoMessage && (
                    <div role="status" className="flex items-start gap-2 rounded-lg border border-green-500/40 bg-green-500/10 p-3 text-sm text-green-400">
                        <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{infoMessage}</span>
                    </div>
                )}
                <Button type="submit" className="w-full py-3 mt-2" disabled={loading} isLoading={loading}>
                    {loading ? 'Creando cuenta...' : 'Crear Cuenta'}
                </Button>
            </form>

            <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-800" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                    <span className="px-2 bg-gray-900 text-gray-500 font-medium">O regístrate con</span>
                </div>
            </div>

            {/* FIX: Botón simple en vez del componente GoogleLogin problemático */}
            <Button
                type="button"
                variant="secondary"
                className="w-full flex items-center justify-center gap-2 bg-white text-black hover:bg-gray-200 border-none"
                onClick={handleGoogleRegister}
            >
                <GoogleIcon className="w-[18px] h-[18px]" />
                Continuar con Google
            </Button>

            <p className="mt-8 text-center text-sm text-gray-500">
                ¿Ya tienes cuenta?{' '}
                <Link to="/auth/login" className="font-medium text-primary-400 hover:text-primary-300">
                    Inicia sesión
                </Link>
            </p>
        </AuthCard>
    );
};

export default RegisterPage;