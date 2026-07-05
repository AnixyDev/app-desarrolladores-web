import React, { useState } from 'react';
import Card, { CardContent, CardHeader } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { supabase } from '@/lib/supabaseClient';

const PortalLoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // Tras click en el enlace del email, vuelve al portal (no al login de la app principal)
        emailRedirectTo: `${window.location.origin}/portal`,
      },
    });

    if (error) {
      setError('No se pudo enviar el enlace. Inténtalo de nuevo.');
    } else {
      setSent(true);
    }
    setLoading(false);
  };

  return (
    <div className="flex justify-center items-center pt-16 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <h2 className="text-xl font-bold text-center text-white">Acceso al Portal</h2>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="text-center space-y-3">
              <p className="text-gray-300">
                Te hemos enviado un enlace de acceso a <strong>{email}</strong>.
              </p>
              <p className="text-sm text-gray-500">
                Ábrelo desde este mismo dispositivo para entrar automáticamente.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <Input
                label="Email"
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              {error && <p className="text-sm text-red-400">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Enviando...' : 'Enviar enlace de acceso'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PortalLoginPage;