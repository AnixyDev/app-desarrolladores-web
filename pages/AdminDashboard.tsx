import { useState, useEffect, useMemo } from 'react';

import { supabase } from '@/lib/supabaseClient';
import Card, { CardContent, CardHeader } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Skeleton from '@/components/ui/Skeleton';

import { formatCurrency, formatearFecha } from '@/lib/utils';
import { useAppStore } from '@/hooks/useAppStore';
import ComisionesAfiliados from '@/components/admin/ComisionesAfiliados';
import { cargarMetricas, beneficioNeto30d, type MetricasAdmin } from '@/lib/adminMetricas';
import {
  DollarSignIcon,
  Users as UsersIcon,
  SparklesIcon,
  TrendingUpIcon,
  CreditCard,
  ActivityIcon,
  RefreshCwIcon,
  AlertTriangleIcon,
} from '@/components/icons/Icon';

interface Transaction {
  id: string;
  user_email: string;
  plan_name: string;
  amount_cents: number;
  created_at: string;
}

const PanelAdmin = () => {
  const [stats, setStats] = useState<MetricasAdmin | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: transData, error: transError } = await supabase
        .from('platform_payments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (transError) throw transError;

      // CAMBIO (27/09): antes estas cifras salían de consultas que, por la
      // RLS, solo veían el perfil de quien miraba, y los ingresos de una
      // tabla en la que nada escribía. Ahora vienen de admin_metricas()
      // (solo Admin) y stripe-webhook apunta cada cobro real.
      setStats(await cargarMetricas());

      setTransactions(transData ?? []);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'No se pudieron cargar las métricas de administración.';
      console.error('Error fetching admin stats:', err);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const netProfitCents = useMemo(() => (stats ? beneficioNeto30d(stats) : 0), [stats]);

  const StatCard = ({
    title,
    value,
    icon: Icon,
    color,
    subvalue,
  }: {
    title: string;
    value: string | number;
    icon: React.ElementType;
    color: string;
    subvalue?: string;
  }) => (
    <Card className="border-gray-800 bg-gray-900/50">
      <CardContent className="p-6">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-xs font-black text-gray-500 uppercase tracking-widest mb-1">
              {title}
            </p>
            <p className="text-2xl font-black text-white">{value}</p>
            {subvalue && (
              <p className="text-xs text-gray-400 mt-1">
                {subvalue}
              </p>
            )}
          </div>
          <div className={`p-3 rounded-2xl ${color}`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertTriangleIcon className="w-16 h-16 text-red-500 mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">
          Error de Acceso
        </h2>
        <p className="text-gray-400 max-w-md mb-6">{error}</p>
        <Button onClick={fetchData} variant="secondary">
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-20">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tighter">
            Panel de Control Admin
          </h1>
          <p className="text-gray-400 text-sm">
            Monitorización de ingresos y actividad global
          </p>
        </div>
        <button
          onClick={fetchData}
          aria-label="Actualizar datos"
          title="Actualizar datos"
          className="p-3 bg-gray-900 border border-gray-800 rounded-xl hover:bg-gray-800 transition-colors"
        >
          <RefreshCwIcon
            className={`w-5 h-5 text-primary-400 ${
              loading ? 'animate-spin' : ''
            }`}
          />
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {loading ? (
          [1, 2, 3, 4].map((i) => (
            <Skeleton
              key={i}
              variant="rect"
              className="h-32 w-full rounded-2xl"
            />
          ))
        ) : (
          <>
            <StatCard
              title="Ingresos (30 días)"
              value={formatCurrency(stats?.ingresos_30d_cents ?? 0)}
              icon={DollarSignIcon}
              color="bg-primary-600 shadow-lg shadow-primary-500/20"
              subvalue={`Total: ${formatCurrency(stats?.ingresos_total_cents ?? 0)} · ${stats?.cobros_total ?? 0} cobros`}
            />
            <StatCard
              title="Beneficio neto est."
              value={formatCurrency(netProfitCents)}
              icon={TrendingUpIcon}
              color="bg-green-600 shadow-lg shadow-green-500/20"
              subvalue="30 días, tras Stripe e infraestructura"
            />
            <StatCard
              title="Usuarios"
              value={stats?.usuarios_total ?? 0}
              icon={UsersIcon}
              color="bg-blue-600 shadow-lg shadow-blue-500/20"
              subvalue={`+${stats?.usuarios_nuevos_30d ?? 0} en los últimos 30 días`}
            />
            <StatCard
              title="Suscriptores de pago"
              value={(stats?.suscriptores_pro ?? 0) + (stats?.suscriptores_teams ?? 0)}
              icon={SparklesIcon}
              color="bg-purple-600 shadow-lg shadow-purple-500/20"
              subvalue={`Pro ${stats?.suscriptores_pro ?? 0} · Equipos ${stats?.suscriptores_teams ?? 0}`}
            />
          </>
        )}
      </div>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="flex justify-between items-center border-b border-gray-800">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-primary-400" /> Transacciones
            Recientes
          </h2>
          <span className="text-xs font-bold text-gray-500 uppercase">
            Últimos 10 cobros
          </span>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-950/50 text-xs uppercase font-black text-gray-500 tracking-widest">
              <tr>
                <th className="p-4">Usuario</th>
                <th className="p-4">Producto</th>
                <th className="p-4">Importe</th>
                <th className="p-4">Fecha</th>
                <th className="p-4 text-right">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {loading ? (
                [1, 2, 3].map((i) => (
                  <tr key={i}>
                    <td colSpan={5} className="p-4">
                      <Skeleton
                        variant="text"
                        className="w-full h-8"
                      />
                    </td>
                  </tr>
                ))
              ) : transactions.length > 0 ? (
                transactions.map((t) => (
                  <tr
                    key={t.id}
                    className="hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="p-4 text-sm font-medium text-white">
                      {t.user_email}
                    </td>
                    <td className="p-4">
                      <span className="px-2 py-1 bg-gray-800 rounded-md text-xs font-bold text-gray-300 uppercase">
                        {t.plan_name}
                      </span>
                    </td>
                    <td className="p-4 text-sm font-black text-white">
                      {formatCurrency(t.amount_cents)}
                    </td>
                    <td className="p-4 text-xs text-gray-500">
                      {formatearFecha(t.created_at)}
                    </td>
                    <td className="p-4 text-right text-xs font-black uppercase text-green-400">
                      <div className="flex items-center justify-end gap-1">
                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                        Completado
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={5}
                    className="p-16 text-center text-gray-500 text-sm italic"
                  >
                    <div className="flex flex-col items-center">
                      <ActivityIcon className="w-10 h-10 mb-2 opacity-20" />
                      Todavía no hay cobros registrados. Se apuntan solos a partir de ahora con cada pago en Stripe.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <ComisionesAfiliados />
    </div>
  );
};

/**
 * CAMBIO (27/09): la ruta /admin no comprobaba nada: cualquier cuenta podía
 * abrir el panel. Los datos ya estaban protegidos en la base de datos (cada
 * usuario solo veía lo suyo, y las funciones admin_* exigen el rol), pero la
 * pantalla se mostraba igual, con cifras vacías o engañosas. Ahora solo se
 * pinta para el rol Admin, que no se puede cambiar desde el navegador.
 */
const AdminDashboard = () => {
  const profile = useAppStore(s => s.profile);
  const isProfileLoading = useAppStore(s => s.isProfileLoading);

  if (isProfileLoading && !profile?.id) {
    return <div className="p-8 text-center text-gray-400">Cargando…</div>;
  }
  if ((profile?.role || '').toLowerCase() !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertTriangleIcon className="w-14 h-14 text-gray-500 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">Zona de administración</h2>
        <p className="text-gray-400 max-w-md">Esta página solo está disponible para la administración de DevFreelancer.</p>
      </div>
    );
  }
  return <PanelAdmin />;
};

export default AdminDashboard;
