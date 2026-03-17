import React from 'react';
import { useAppStore } from '../hooks/useAppStore';
import IncomeExpenseChart from '../components/charts/IncomeExpenseChart';
import WeeklyHoursChart from '../components/charts/WeeklyHoursChart';
import SmartInboxWidget from '../components/dashboard/SmartInboxWidget';
import { Sparkles, TrendingUp, Users, Briefcase } from 'lucide-react';

const DashboardPage: React.FC = () => {
  // Extraemos invoices y expenses para pasárselos al gráfico
  const { profile, invoices, expenses } = useAppStore();

  return (
    <div className="space-y-6">
      {/* Header de Bienvenida */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">¡Hola, {profile.full_name?.split(' ')[0] || 'Usuario'}! 👋</h1>
          <p className="text-gray-400 text-sm">Esto es lo que está pasando en tu negocio hoy.</p>
        </div>
        <div className="flex items-center gap-3 bg-primary-500/10 border border-primary-500/20 p-3 rounded-2xl">
          <Sparkles className="w-5 h-5 text-primary-400" />
          <span className="text-sm font-medium text-primary-100">
            {profile.ai_credits} créditos de IA disponibles
          </span>
        </div>
      </div>

      {/* Grid de Stats Rápidas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Ingresos Mes" value="2.450€" icon={TrendingUp} trend="+12%" color="text-green-400" />
        <StatCard title="Proyectos Activos" value="5" icon={Briefcase} color="text-blue-400" />
        <StatCard title="Clientes" value="12" icon={Users} color="text-purple-400" />
        <StatCard title="Horas esta semana" value="32h" icon={TrendingUp} trend="80%" color="text-orange-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gráfico Principal */}
        <div className="lg:col-span-2 bg-gray-900/50 border border-gray-800 rounded-3xl p-6">
          <h3 className="text-lg font-semibold text-white mb-6">Rendimiento Financiero</h3>
          <div className="h-[300px]">
             {/* PASAMOS LAS PROPS REALES AQUÍ */}
             <IncomeExpenseChart invoices={invoices} expenses={expenses} />
          </div>
        </div>

        {/* Widget de Smart Inbox */}
        <div className="lg:col-span-1">
          <SmartInboxWidget />
        </div>
      </div>

      {/* Fila Inferior */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
         <div className="bg-gray-900/50 border border-gray-800 rounded-3xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Distribución de Horas</h3>
            <WeeklyHoursChart />
         </div>
      </div>
    </div>
  );
};

const StatCard = ({ title, value, icon: Icon, trend, color }: any) => (
  <div className="bg-gray-900/50 border border-gray-800 p-5 rounded-3xl hover:border-gray-700 transition-colors">
    <div className="flex justify-between items-start mb-4">
      <div className={`p-2 rounded-xl bg-gray-800 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      {trend && <span className="text-xs font-medium text-green-400 bg-green-400/10 px-2 py-1 rounded-lg">{trend}</span>}
    </div>
    <p className="text-gray-400 text-xs font-medium uppercase tracking-wider">{title}</p>
    <p className="text-2xl font-bold text-white mt-1">{value}</p>
  </div>
);

export default DashboardPage;