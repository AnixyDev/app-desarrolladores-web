// pages/ReportsPage.tsx
import React, { useState, useMemo, lazy, Suspense } from 'react';

import { useAppStore } from '@/hooks/useAppStore';
import { useToast } from '@/hooks/useToast';

import Card, { CardContent, CardHeader } from '@/components/ui/Card';
import Button from '@/components/ui/Button';

import {
  DownloadIcon,
  DollarSignIcon,
  TrendingUpIcon,
  Users as UsersIcon,
  ClockIcon,
  SparklesIcon,
  RefreshCwIcon,
  ArrowUpCircleIcon,
  AlertTriangleIcon,
} from '@/components/icons/Icon';

import { formatCurrency } from '@/lib/utils';
import { analyzeProfitability, AI_CREDIT_COSTS } from '@/services/geminiService';

const ProfitabilityByClientChart = lazy(
  () => import('@/components/charts/ProfitabilityByClientChart')
);
const BuyCreditsModal = lazy(
  () => import('@/components/modals/BuyCreditsModal')
);

interface FinancialAnalysis {
  summary: string;
  topPerformers: string[];
  areasForImprovement: string[];
}

const StatCard: React.FC<{
  icon: React.ElementType;
  title: string;
  value: string | number;
  color?: string;
}> = ({ icon: Icon, title, value, color = 'text-white' }) => (
  <Card>
    <CardContent className="p-4 flex items-center">
      <div className="p-3 rounded-full bg-primary-600/20 text-primary-400 mr-4">
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-sm text-gray-400">{String(title)}</p>
        <p className={`text-2xl font-bold ${color}`}>{String(value)}</p>
      </div>
    </CardContent>
  </Card>
);

const ReportsPage: React.FC = () => {
  const {
    invoices,
    expenses,
    clients,
    projects,
    timeEntries,
    profile,
    consumeCredits,
  } = useAppStore();

  const { addToast } = useToast();

  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const [startDate, setStartDate] = useState(
    firstDayOfMonth.toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState(
    today.toISOString().split('T')[0]
  );

  const [analysis, setAnalysis] = useState<FinancialAnalysis | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isBuyCreditsModalOpen, setIsBuyCreditsModalOpen] = useState(false);

  const filteredData = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    return {
      invoices: invoices.filter(i => {
        const d = new Date(i.issue_date);
        return d >= start && d <= end;
      }),
      expenses: expenses.filter(e => {
        const d = new Date(e.date);
        return d >= start && d <= end;
      }),
      timeEntries: timeEntries.filter(t => {
        const d = new Date(t.start_time);
        return d >= start && d <= end;
      }),
    };
  }, [invoices, expenses, timeEntries, startDate, endDate]);

  const reportKpis = useMemo(() => {
    const paidInvoices = filteredData.invoices.filter(i => i.paid);

    const totalIncome = paidInvoices.reduce(
      (sum, inv) => sum + inv.total_cents,
      0
    );
    const totalExpenses = filteredData.expenses.reduce(
      (sum, exp) => sum + exp.amount_cents,
      0
    );

    const clientProfitability = clients
      .map(client => {
        const clientInvoices = paidInvoices.filter(
          i => i.client_id === client.id
        );
        const income = clientInvoices.reduce(
          (sum, i) => sum + i.subtotal_cents,
          0
        );

        const projectIds = projects
          .filter(p => p.client_id === client.id)
          .map(p => p.id);

        const expenses = filteredData.expenses
          .filter(e => e.project_id && projectIds.includes(e.project_id))
          .reduce((sum, e) => sum + e.amount_cents, 0);

        return {
          name: client.name,
          income,
          expenses,
          profit: income - expenses,
        };
      })
      .filter(c => c.income !== 0 || c.expenses !== 0)
      .sort((a, b) => b.profit - a.profit);

    const totalHours =
      filteredData.timeEntries.reduce(
        (sum, e) => sum + e.duration_seconds,
        0
      ) / 3600;

    return {
      totalIncome,
      totalExpenses,
      netProfit: totalIncome - totalExpenses,
      clientProfitability,
      totalHours,
    };
  }, [filteredData, clients, projects]);

  const handleAiAnalysis = async () => {
    if (!profile) return;

    if (profile.ai_credits < AI_CREDIT_COSTS.analyzeProfitability) {
      setIsBuyCreditsModalOpen(true);
      return;
    }

    setIsAiLoading(true);
    setAnalysis(null);

    try {
      const payload = {
        periodo: `${startDate} a ${endDate}`,
        ingresos: reportKpis.totalIncome,
        gastos: reportKpis.totalExpenses,
        beneficio: reportKpis.netProfit,
        clientes: reportKpis.clientProfitability,
      };

      const result = await analyzeProfitability(payload);

      setAnalysis({
        summary: String(result.summary ?? 'Análisis no disponible'),
        topPerformers: result.topPerformers ?? [],
        areasForImprovement: result.areasForImprovement ?? [],
      });

      consumeCredits(AI_CREDIT_COSTS.analyzeProfitability);
      addToast('Análisis de rentabilidad completado.', 'success');
    } catch (err) {
      addToast(String((err as Error).message), 'error');
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={startDate}
          onChange={e => setStartDate(e.target.value)}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded"
        />
        <input
          type="date"
          value={endDate}
          onChange={e => setEndDate(e.target.value)}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded"
        />

        <Button onClick={handleAiAnalysis} disabled={isAiLoading}>
          {isAiLoading ? (
            <RefreshCwIcon className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <SparklesIcon className="w-4 h-4 mr-2" />
          )}
          Analizar con IA
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard
          icon={DollarSignIcon}
          title="Ingresos"
          value={formatCurrency(reportKpis.totalIncome)}
        />
        <StatCard
          icon={TrendingUpIcon}
          title="Gastos"
          value={formatCurrency(reportKpis.totalExpenses)}
          color="text-red-400"
        />
        <StatCard
          icon={DollarSignIcon}
          title="Beneficio"
          value={formatCurrency(reportKpis.netProfit)}
          color="text-green-400"
        />
        <StatCard
          icon={ClockIcon}
          title="Horas"
          value={`${reportKpis.totalHours.toFixed(2)}h`}
        />
      </div>

      {analysis && (
        <Card>
          <CardHeader>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <SparklesIcon className="w-5 h-5" />
              Diagnóstico IA
            </h2>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>{String(analysis.summary)}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <h2 className="flex items-center gap-2">
            <UsersIcon className="w-5 h-5" />
            Rentabilidad por Cliente
          </h2>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<div>Cargando gráfico…</div>}>
            <ProfitabilityByClientChart
              data={reportKpis.clientProfitability}
            />
          </Suspense>
        </CardContent>
      </Card>

      <Suspense fallback={null}>
        {isBuyCreditsModalOpen && (
          <BuyCreditsModal
            isOpen
            onClose={() => setIsBuyCreditsModalOpen(false)}
          />
        )}
      </Suspense>
    </div>
  );
};

export default ReportsPage;
