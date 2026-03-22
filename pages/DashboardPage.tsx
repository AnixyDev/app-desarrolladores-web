import React, { lazy, Suspense } from 'react';
import { useAppStore } from '../hooks/useAppStore';
import { Sparkles, TrendingUp, Users, Briefcase } from 'lucide-react';

// Carga diferida — los gráficos no bloquean el chunk principal
const IncomeExpenseChart = lazy(() => import('../components/charts/IncomeExpenseChart'));
const WeeklyHoursChart   = lazy(() => import('../components/charts/WeeklyHoursChart'));
const SmartInboxWidget   = lazy(() => import('../components/dashboard/SmartInboxWidget'));

// ── Subcomponente tipado (elimina el any del StatCard original) ───────────────
interface StatCardProps {
  title: string;
  value: string;
  icon: React.ElementType;
  trend?: string;
  color: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon: Icon, trend, color }) => (
  <div className="bg-gray-900/50 border border-gray-800 p-5 rounded-3xl hover:border-gray-700 transition-colors">
    <div className="flex justify-between items-start mb-4">
      <div className={`p-2 rounded-xl bg-gray-800 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      {trend && (
        <span className="text-xs font-medium text-green-400 bg-green-400/10 px-2 py-1 rounded-lg">
          {trend}
        </span>
      )}
    </div>
    <p className="text-gray-400 text-xs font-medium uppercase tracking-wider">{title}</p>
    <p className="text-2xl font-bold text-white mt-1">{value}</p>
  </div>
);

// ── Skeleton ligero mientras cargan los gráficos ──────────────────────────────
const ChartSkeleton: React.FC<{ height?: string }> = ({ height = 'h-[300px]' }) => (
  <div className={`${height} rounded-xl bg-gray-800/50 animate-pulse`} />
);

// ── Página principal ──────────────────────────────────────────────────────────
const DashboardPage: React.FC = () => {
  const { profile, invoices, expenses } = useAppStore();

  return (
    <div className="space-y-6">
      {/* Bienvenida */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">
            ¡Hola, {profile.full_name?.split(' ')[0] || 'Usuario'}! 👋
          </h1>
          <p className="text-gray-400 text-sm">Esto es lo que está pasando en tu negocio hoy.</p>
        </div>
        <div className="flex items-center gap-3 bg-primary-500/10 border border-primary-500/20 p-3 rounded-2xl">
          <Sparkles className="w-5 h-5 text-primary-400" />
          <span className="text-sm font-medium text-primary-100">
            {profile.ai_credits} créditos de IA disponibles
          </span>
        </div>
      </div>

      {/* Stats rápidas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Ingresos Mes"       value="2.450€" icon={TrendingUp} trend="+12%"  color="text-green-400"  />
        <StatCard title="Proyectos Activos"  value="5"      icon={Briefcase}               color="text-blue-400"   />
        <StatCard title="Clientes"           value="12"     icon={Users}                   color="text-purple-400" />
        <StatCard title="Horas esta semana"  value="32h"    icon={TrendingUp} trend="80%"  color="text-orange-400" />
      </div>

      {/* Gráfico principal + Inbox */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-gray-900/50 border border-gray-800 rounded-3xl p-6">
          <h3 className="text-lg font-semibold text-white mb-6">Rendimiento Financiero</h3>
          <div className="h-[300px]">
            <Suspense fallback={<ChartSkeleton />}>
              <IncomeExpenseChart invoices={invoices} expenses={expenses} />
            </Suspense>
          </div>
        </div>

        <div className="lg:col-span-1">
          <Suspense fallback={<ChartSkeleton height="h-64" />}>
            <SmartInboxWidget />
          </Suspense>
        </div>
      </div>

      {/* Fila inferior */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gray-900/50 border border-gray-800 rounded-3xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Distribución de Horas</h3>
          <Suspense fallback={<ChartSkeleton height="h-48" />}>
            <WeeklyHoursChart />
          </Suspense>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
