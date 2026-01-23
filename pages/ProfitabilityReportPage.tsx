// pages/ProfitabilityReportPage.tsx
import React, { useMemo, useState, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';

import { useAppStore } from '../hooks/useAppStore';
import { useToast } from '../hooks/useToast';

import Card, { CardContent, CardHeader } from '../components/ui/Card';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';

import {
  ArrowUpCircleIcon,
  ArrowDownCircleIcon,
  DollarSignIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  BriefcaseIcon,
  SparklesIcon,
  RefreshCwIcon,
} from '../components/icons/Icon';

import { formatCurrency } from '../lib/utils';
import { analyzeProfitability, AI_CREDIT_COSTS } from '../services/geminiService';

const BuyCreditsModal = lazy(() => import('../components/modals/BuyCreditsModal'));

interface ProfitabilityData {
  projectId: string;
  projectName: string;
  clientName: string;
  totalIncome: number;
  totalCosts: number;
  netProfit: number;
  margin: number;
  totalHours: number;
  effectiveHourlyRate: number;
}

interface FinancialAnalysis {
  summary: string;
  topPerformers: string[];
  areasForImprovement: string[];
}

const StatCard: React.FC<{
  icon: React.ElementType;
  title: string;
  value: string;
  project?: string;
  color: string;
}> = ({ icon: Icon, title, value, project, color }) => (
  <Card>
    <CardContent className="p-4">
      <div className="flex items-center">
        <div className={`p-3 rounded-full bg-gray-800 ${color} mr-4`}>
          <Icon className="w-6 h-6" />
        </div>
        <div>
          <p className="text-sm text-gray-400">{title}</p>
          <p className="text-2xl font-bold text-white">{value}</p>
          {project && <p className="text-xs text-gray-500 truncate">{project}</p>}
        </div>
      </div>
    </CardContent>
  </Card>
);

const SortableHeader: React.FC<{
  label: string;
  sortKey: keyof ProfitabilityData;
  sortConfig: { key: keyof ProfitabilityData; direction: string } | null;
  requestSort: (key: keyof ProfitabilityData) => void;
}> = ({ label, sortKey, sortConfig, requestSort }) => {
  const isSorted = sortConfig?.key === sortKey;
  return (
    <th
      className="p-4 cursor-pointer hover:bg-gray-800"
      onClick={() => requestSort(sortKey)}
    >
      <div className="flex items-center gap-2">
        {label}
        {isSorted ? (
          sortConfig?.direction === 'ascending' ? (
            <ChevronUpIcon className="w-4 h-4" />
          ) : (
            <ChevronDownIcon className="w-4 h-4" />
          )
        ) : (
          <div className="w-4 h-4" />
        )}
      </div>
    </th>
  );
};

const ProfitabilityReportPage: React.FC = () => {
  const {
    projects,
    clients,
    invoices,
    expenses,
    timeEntries,
    profile,
    consumeCredits,
  } = useAppStore();

  const { addToast } = useToast();

  const [sortConfig, setSortConfig] = useState<{
    key: keyof ProfitabilityData;
    direction: 'ascending' | 'descending';
  }>({ key: 'netProfit', direction: 'descending' });

  const [analysis, setAnalysis] = useState<FinancialAnalysis | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isBuyCreditsModalOpen, setIsBuyCreditsModalOpen] = useState(false);

  const profitabilityData: ProfitabilityData[] = useMemo(() => {
    if (!profile) return [];

    return projects.map(project => {
      const projectInvoices = invoices.filter(
        i => i.project_id === project.id && i.paid
      );
      const totalIncome = projectInvoices.reduce(
        (sum, i) => sum + i.subtotal_cents,
        0
      );

      const projectExpenses = expenses.filter(
        e => e.project_id === project.id
      );
      const expenseCosts = projectExpenses.reduce(
        (sum, e) => sum + e.amount_cents,
        0
      );

      const projectTimeEntries = timeEntries.filter(
        t => t.project_id === project.id
      );
      const totalSeconds = projectTimeEntries.reduce(
        (sum, t) => sum + t.duration_seconds,
        0
      );

      const totalHours = totalSeconds / 3600;
      const timeCosts = totalHours * profile.hourly_rate_cents;

      const totalCosts = expenseCosts + timeCosts;
      const netProfit = totalIncome - totalCosts;
      const margin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0;
      const effectiveHourlyRate =
        totalHours > 0 ? netProfit / totalHours : 0;

      return {
        projectId: project.id,
        projectName: project.name,
        clientName:
          clients.find(c => c.id === project.client_id)?.name || 'N/A',
        totalIncome,
        totalCosts,
        netProfit,
        margin,
        totalHours,
        effectiveHourlyRate,
      };
    });
  }, [projects, clients, invoices, expenses, timeEntries, profile]);

  const handleAiAnalysis = async () => {
    if (!profile) return;

    if (profile.ai_credits < AI_CREDIT_COSTS.analyzeProfitability) {
      setIsBuyCreditsModalOpen(true);
      return;
    }

    setIsAiLoading(true);
    setAnalysis(null);

    try {
      const dataToAnalyze = profitabilityData.map(({ projectId, ...rest }) => rest);
      const result = await analyzeProfitability({ projects: dataToAnalyze });

      setAnalysis({
        summary: String(result.summary ?? 'Análisis no disponible'),
        topPerformers: result.topPerformers ?? [],
        areasForImprovement: result.areasForImprovement ?? [],
      });

      consumeCredits(AI_CREDIT_COSTS.analyzeProfitability);
      addToast('Análisis de rentabilidad completado.', 'success');
    } catch (error) {
      addToast(String((error as Error).message), 'error');
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold text-white">
          Panel de Rentabilidad por Proyecto
        </h1>
        <Button onClick={handleAiAnalysis} disabled={isAiLoading}>
          {isAiLoading ? (
            <RefreshCwIcon className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <SparklesIcon className="w-4 h-4 mr-2" />
          )}
          {isAiLoading ? 'Analizando…' : 'Analizar con IA'}
        </Button>
      </div>

      {profitabilityData.length === 0 && (
        <EmptyState
          icon={BriefcaseIcon}
          title="No hay datos para analizar"
          message="Registra proyectos, horas y facturas pagadas."
        />
      )}

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

export default ProfitabilityReportPage;
