

import React from 'react';
import Card, { CardContent, CardHeader } from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';

const PortalLoginPage: React.FC = () => {
    return (
        <div className="flex justify-center items-center pt-16">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <h2 className="text-xl font-bold text-center text-white">Acceso al Portal</h2>
                </CardHeader>
                <CardContent>
                    <form className="space-y-6">
                        <Input label="Email" type="email" placeholder="tu@email.com" />
                        <Input label="Contraseña o Código de Acceso" type="password" />
                        <Button type="submit" className="w-full">Entrar</Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
};

export default PortalLoginPage;