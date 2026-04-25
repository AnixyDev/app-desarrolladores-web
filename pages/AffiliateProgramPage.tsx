import React, { useMemo } from 'react';
import Card, { CardContent, CardHeader } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import { useAppStore } from '@/hooks/useAppStore';
import { useToast } from '@/hooks/useToast';
import { Share2, Copy, Users, DollarSign, CheckCircle } from '@/components/icons/Icon';
import { formatCurrency } from '@/lib/utils';

const AffiliateProgramPage = () => {
  const { profile, referrals } = useAppStore();
  const { addToast } = useToast();

  if (!profile) {
    return <div className="p-8 text-center text-gray-400">Cargando programa de afiliados...</div>;
  }

  const referralLink = `https://devfreelancer.app/register?ref=${profile.affiliate_code}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(referralLink);
    addToast('Enlace de referido copiado!', 'success');
  };

  const stats = useMemo(() => {
    return {
      totalReferrals: referrals.length,
      activeSubscriptions: referrals.filter(
        (r) => r.status === 'Subscribed'
      ).length,
      totalEarnings: referrals.reduce(
        (sum, r) => sum + r.commission_cents,
        0
      ),
    };
  }, [referrals]);

  const statusLabels: Record<string, string> = {
    Registered: 'Registrado',
    Subscribed: 'Suscripción activa',
  };

  const statusClasses: Record<string, string> = {
    Registered: 'bg-gray-800 text-gray-300 border-gray-700',
    Subscribed: 'bg-green-500/10 text-green-400 border-green-500/30',
  };

  const StatCard = ({
    icon: Icon,
    title,
    value,
  }: {
    icon: React.ElementType;
    title: string;
    value: string | number;
  }) => (
    <Card>
      <CardContent className="flex items-center p-4">
        <div className="p-3 rounded-full bg-primary-600/20 text-primary-400 mr-4">
          <Icon className="w-6 h-6" />
        </div>
        <div>
          <p className="text-sm text-gray-400">{title}</p>
          <p className="text-xl font-bold text-white">{value}</p>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Programa de Afiliados</h1>
        <p className="text-gray-400">Invita a otros freelancers y gana comisiones recurrentes</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          icon={Users}
          title="Total Referidos"
          value={stats.totalReferrals}
        />
        <StatCard
          icon={CheckCircle}
          title="Suscripciones Activas"
          value={stats.activeSubscriptions}
        />
        <StatCard
          icon={DollarSign}
          title="Ganancias Totales"
          value={formatCurrency(stats.totalEarnings)}
        />
      </div>

      <Card className="bg-primary-600/10 border-primary-500/20">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-2 text-center md:text-left">
              <h3 className="text-lg font-bold text-white flex items-center justify-center md:justify-start">
                <Share2 className="w-5 h-5 mr-2 text-primary-400" />
                Tu Enlace de Referido
              </h3>
              <p className="text-sm text-gray-400">Comparte este enlace y gana un 20% de comisión recurrente por cada suscripción</p>
            </div>
            <div className="flex w-full md:w-auto gap-2">
              <div className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm text-gray-300 font-mono truncate max-w-[300px]">
                {referralLink}
              </div>
              <Button onClick={handleCopyLink} className="shrink-0">
                <Copy className="w-4 h-4 mr-2" />
                Copiar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="text-lg font-bold text-white">Tus Referidos</h3>
        </CardHeader>
        <CardContent className="p-0">
          {referrals.length === 0 ? (
            <div className="p-12">
              <EmptyState
                title="Aún no tienes referidos"
                description="Empieza a compartir tu enlace para ver aquí a tus invitados y tus ganancias."
                icon={Users}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-400 text-sm">
                    <th className="px-6 py-4 font-medium">Fecha</th>
                    <th className="px-6 py-4 font-medium">Estado</th>
                    <th className="px-6 py-4 font-medium">Comisión Acumulada</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {referrals.map((r) => (
                    <tr key={r.id} className="text-sm text-gray-300 hover:bg-gray-800/50 transition-colors">
                      <td className="px-6 py-4">{new Date(r.created_at).toLocaleDateString()}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold border ${statusClasses[r.status]}`}>
                          {statusLabels[r.status]}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-medium text-white">{formatCurrency(r.commission_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AffiliateProgramPage;
