import React from 'react';
import Card, { CardContent, CardHeader } from '../components/ui/Card';
import Button from '../components/ui/Button';
import { useAppStore } from '../hooks/useAppStore';
import { useToast } from '../hooks/useToast';
import { Share2Icon, CopyIcon, Users as UsersIcon, DollarSignIcon, CheckCircleIcon } from '../components/icons/Icon';
import { formatCurrency } from '../lib/utils';

const AffiliateProgramPage: React.FC = () => {
    const { profile, referrals } = useAppStore();
    const { addToast } = useToast();

    if (!profile) {
        // Handle case where profile might not be loaded yet
        return <div>Loading affiliate data...</div>;
    }

    const referralLink = `https://devfreelancer.app/register?ref=${profile.affiliate_code}`;

    const handleCopyLink = () => {
        navigator.clipboard.writeText(referralLink);
        addToast('¡Enlace de referido copiado!', 'success');
    };

    const stats = {
        totalReferrals: referrals.length,
        activeSubscriptions: referrals.filter(r => r.status === 'Subscribed').length,
        totalEarnings: referrals.reduce((sum, r) => sum + r.commission_cents, 0),
    };

    const StatCard = ({ icon: Icon, title, value }: { icon: React.ElementType, title: string, value: string | number }) => (
        <Card>
            <CardContent className="flex items-center p-4">
                <div className="p-3 rounded-full bg-primary-600/20 text-primary-400 mr-4">
                    <Icon className="w-6 h-6" />
                </div>
                <div>
                    <p className="text-sm text-gray-400">{title}</p>
                    <p className="text-2xl font-bold text-white">{value}</p>
                </div>
            </CardContent>
        </Card>
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h1 className="text-2xl font-semibold text-white flex items-center gap-2"><Share2Icon/> Programa de Afiliados</h1>
            </div>

            <Card>
                <CardHeader>
                    <h2 className="text-lg font-semibold text-white">Tu Enlace de Referido Único</h2>
                </CardHeader>
                <CardContent className="flex flex-col sm:flex-row items-center gap-4">
                    <input type="text" readOnly value={referralLink} className="flex-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-gray-300" />
                    <Button onClick={handleCopyLink}><CopyIcon className="w-4 h-4 mr-2"/> Copiar Enlace</Button>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard icon={UsersIcon} title="Referidos Totales" value={stats.totalReferrals} />
                <StatCard icon={CheckCircleIcon} title="Suscripciones Activas" value={stats.activeSubscriptions} />
                <StatCard icon={DollarSignIcon} title="Ganancias Totales" value={formatCurrency(stats.totalEarnings)} />
            </div>

            <Card>
                <CardHeader>
                    <h2 className="text-lg font-semibold text-white">Tus Referidos</h2>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="border-b border-gray-800">
                                <tr>
                                    <th className="p-4">Nombre</th>
                                    <th className="p-4">Fecha de Registro</th>
                                    <th className="p-4">Estado</th>
                                    <th className="p-4 text-right">Comisión</th>
                                </tr>
                            </thead>
                            <tbody>
                                {referrals.map(referral => (
                                    <tr key={referral.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                                        <td className="p-4 text-white font-semibold">{referral.name}</td>
                                        <td className="p-4 text-gray-300">{referral.join_date}</td>
                                        <td className="p-4">
                                            <span className={`px-2 py-1 text-xs rounded-full ${referral.status === 'Subscribed' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>
                                                {referral.status === 'Subscribed' ? 'Suscrito' : 'Registrado'}
                                            </span>
                                        </td>
                                        <td className="p-4 text-right font-semibold text-green-400">{formatCurrency(referral.commission_cents)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader><h2 className="text-lg font-semibold">Términos del Programa</h2></CardHeader>
                <CardContent className="text-sm text-gray-400 space-y-2">
                    <p>Recibes un 20% de comisión recurrente por cada pago de los usuarios que se suscriban a un plan de pago a través de tu enlace.</p>
                    <p>Las comisiones se pagan mensualmente a través de Stripe Connect una vez que alcanzas un mínimo de 50€.</p>
                </CardContent>
            </Card>
        </div>
    );
};

export default AffiliateProgramPage;