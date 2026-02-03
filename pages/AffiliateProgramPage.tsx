import React, { useMemo } from 'react';
import Card, { CardContent, CardHeader } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import { useAppStore } from '@/hooks/useAppStore';
import { useToast } from '@/hooks/useToast';
import {
  Share2Icon,
  CopyIcon,
  Users as UsersIcon,
  DollarSignIcon,
  CheckCircleIcon,
} from '@/components/icons/Icon';
import { formatCurrency } from '@/lib/utils';

const AffiliateProgramPage = () => {
  const { profile, referrals } = useAppStore();
  const { addToast } = useToast();

  if (!profile) {
    return <div>Cargando programa de afiliados…</div>;
  }

  const referralLink = `https://devfreelancer.app/register?ref=${profile.affiliate_code}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(referralLink);
    addToast('¡Enlace de referido copiado!', 'success');
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
          <p className="text-2xl font-bold text-white">{value}</p>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h1 className="text-2xl font-semibold text-white flex items-center gap-2">
          <Share2Icon /> Programa de Afiliados
        </h1>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-white">
            Tu Enlace de Referido Único
          </h2>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row items-center gap-4">
          <input
            type="text"
            readOnly
            value={referralLink}
            className="flex-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-gray-300"
          />
          <Button onClick={handleCopyLink}>
            <CopyIcon className="w-4 h-4 mr-2" /> Copiar Enlace
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          icon={UsersIcon}
          title="Referidos Totales"
          value={stats.totalReferrals}
        />
        <StatCard
          icon={CheckCircleIcon}
          title="Suscripciones Activas"
          value={stats.activeSubscriptions}
        />
        <StatCard
          icon={DollarSignIcon}
          title="Ganancias Totales"
          value={formatCurrency(stats.totalEarnings)}
        />
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-white">Tus Referidos</h2>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            {referrals.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={UsersIcon}
                  title="Aún no tienes referidos"
                  message="Comparte tu enlace para empezar a ganar comisiones."
                />
              </div>
            ) : (
              <table className="w-full text-left">
                <thead className="border-b border-gray-800">
                  <tr>
                    <th className="p-4">Nombre</th>
                    <th className="p-4">Fecha de registro</th>
                    <th className="p-4">Estado</th>
                    <th className="p-4 text-right">Comisión</th>
                  </tr>
                </thead>
                <tbody>
                  {referrals.map((referral) => (
                    <tr
                      key={referral.id}
                      className="border-b border-gray-800 hover:bg-gray-800/50"
                    >
                      <td className="p-4 font-semibold text-white">
                        {referral.name}
                      </td>
                      <td className="p-4 text-gray-300">
                        {referral.join_date}
                      </td>
                      <td className="p-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${
                            statusClasses[referral.status]
                          }`}
                        >
                          {statusLabels[referral.status]}
                        </span>
                      </td>
                      <td className="p-4 text-right text-white">
                        {formatCurrency(referral.commission_cents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AffiliateProgramPage;
