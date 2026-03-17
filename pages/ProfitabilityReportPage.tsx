// pages/ProfitabilityReportPage.tsx
import React, { useMemo, useState, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';

import { useAppStore } from '@/hooks/useAppStore';
import { useToast } from '@/hooks/useToast';

import Card, { CardContent, CardHeader } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';

import {
  ArrowUpCircleIcon,
  ArrowDownCircleIcon,
  DollarSignIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  BriefcaseIcon,
  SparklesIcon,
  RefreshCwIcon,
} from '@/components/icons/Icon';

import { formatCurrency } from '../lib/utils';
import { analyzeProfitability, AI_CREDIT_COSTS } from '@/services/geminiService';

const BuyCreditsModal = lazy(() => import('@/components/modals/BuyCreditsModal'));

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
        {isSorted &&
          (sortConfig?.direction === 'ascending' ? (
            <ChevronUpIcon className="w-4 h-4 text-primary-400" />
          ) : (
            <ChevronDownIcon className="w-4 h-4 text-primary-400" />
          ))}
      </div>
    </th>
  );
};

const ProfitabilityReportPage: React.FC = () => {
  const { projects, clients, invoices, timeEntries, expenses, consumeCredits } =
    useAppStore();
  const { addToast } = useToast();

  const [sortConfig, setSortConfig] = useState<{
    key: keyof ProfitabilityData;
    direction: string;
  } | null>(null);
  const [analysis, setAnalysis] = useState<FinancialAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const profitabilityData = useMemo(() => {
    return projects.map((project) => {
      const projectInvoices = invoices.filter((invoice) => invoice.project_id === project.id);
      const projectExpenses = expenses.filter((expense) => expense.project_id === project.id);
      const projectTimeEntries = timeEntries.filter((entry) => entry.project_id === project.id);

      const totalIncome = projectInvoices.reduce((sum, invoice) => sum + invoice.total_cents, 0);
      const totalCosts = projectExpenses.reduce((sum, expense) => sum + expense.amount_cents, 0);
      const totalHours = projectTimeEntries.reduce(
        (sum, entry) => sum + entry.duration_seconds / 3600,
        0
      );

      return {
        projectId: project.id,
        projectName: project.name,
        clientName: clients.find((client) => client.id === project.client_id)?.name || 'Cliente desconocido',
        totalIncome,
        totalCosts,
        netProfit: totalIncome - totalCosts,
        margin: totalIncome > 0 ? ((totalIncome - totalCosts) / totalIncome) * 100 : 0,
        totalHours,
        effectiveHourlyRate: totalHours > 0 ? totalIncome / totalHours : 0,
      };
    });
  }, [projects, clients, invoices, expenses, timeEntries]);

  const sortedData = useMemo(() => {
    if (!sortConfig) return profitabilityData;

    const sorted = [...profitabilityData].sort((a, b) => {
      if (a[sortConfig.key] < b[sortConfig.key]) {
        return sortConfig.direction === 'ascending' ? -1 : 1;
      }
      if (a[sortConfig.key] > b[sortConfig.key]) {
        return sortConfig.direction === 'ascending' ? 1 : -1;
      }
      return 0;
    });

    return sorted;
  }, [profitabilityData, sortConfig]);

  const requestSort = (key: keyof ProfitabilityData) => {
    let direction = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const topProfitProject = profitabilityData.reduce(
    (top, current) => (current.netProfit > top.netProfit ? current : top),
    profitabilityData[0]
  );

  const lowestProfitProject = profitabilityData.reduce(
    (lowest, current) => (current.netProfit < lowest.netProfit ? current : lowest),
    profitabilityData[0]
  );

  const handleAnalyze = async () => {
    setIsAnalyzing(true);

    try {
      consumeCredits(AI_CREDIT_COSTS.analyzeProfitability);
      const data = await analyzeProfitability(profitabilityData);
      setAnalysis(data);
    } catch (error) {
      addToast('Error al analizar la rentabilidad. Intenta nuevamente.', 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h1 className="text-2xl font-semibold text-white">Rentabilidad</h1>
        <Button onClick={handleAnalyze} disabled={isAnalyzing}>
          {isAnalyzing ? (
            <RefreshCwIcon className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <SparklesIcon className="w-4 h-4 mr-2" />
          )}
          Analizar con IA
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          icon={ArrowUpCircleIcon}
          title="Proyecto más rentable"
          value={formatCurrency(topProfitProject?.netProfit || 0)}
          project={topProfitProject?.projectName}
          color="text-green-400"
        />
        <StatCard
          icon={ArrowDownCircleIcon}
          title="Proyecto menos rentable"
          value={formatCurrency(lowestProfitProject?.netProfit || 0)}
          project={lowestProfitProject?.projectName}
          color="text-red-400"
        />
        <StatCard
          icon={DollarSignIcon}
          title="Margen promedio"
          value={`${(
            profitabilityData.reduce((sum, project) => sum + project.margin, 0) /
              (profitabilityData.length || 1)
          ).toFixed(1)}%`}
          color="text-primary-400"
        />
      </div>

      {profitabilityData.length === 0 ? (
        <EmptyState
          icon={BriefcaseIcon}
          title="No hay datos de rentabilidad"
          message="Crea proyectos, facturas y gastos para ver el reporte."
          action={{
            text: 'Crear proyecto',
            onClick: () => {},
          }}
        />
      ) : (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-white">
              Rentabilidad por proyecto
            </h2>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="border-b border-gray-800">
                  <tr>
                    <SortableHeader
                      label="Proyecto"
                      sortKey="projectName"
                      sortConfig={sortConfig}
                      requestSort={requestSort}
                    />
                    <SortableHeader
                      label="Cliente"
                      sortKey="clientName"
                      sortConfig={sortConfig}
                      requestSort={requestSort}
                    />
                    <SortableHeader
                      label="Ingresos"
                      sortKey="totalIncome"
                      sortConfig={sortConfig}
                      requestSort={requestSort}
                    />
                    <SortableHeader
                      label="Costes"
                      sortKey="totalCosts"
                      sortConfig={sortConfig}
                      requestSort={requestSort}
                    />
                    <SortableHeader
                      label="Beneficio neto"
                      sortKey="netProfit"
                      sortConfig={sortConfig}
                      requestSort={requestSort}
                    />
                    <SortableHeader
                      label="Margen"
                      sortKey="margin"
                      sortConfig={sortConfig}
                      requestSort={requestSort}
                    />
                    <SortableHeader
                      label="Horas"
                      sortKey="totalHours"
                      sortConfig={sortConfig}
                      requestSort={requestSort}
                    />
                    <SortableHeader
                      label="Tarifa efectiva"
                      sortKey="effectiveHourlyRate"
                      sortConfig={sortConfig}
                      requestSort={requestSort}
                    />
                  </tr>
                </thead>
                <tbody>
                  {sortedData.map((data) => (
                    <tr
                      key={data.projectId}
                      className="border-b border-gray-800 hover:bg-gray-800/50"
                    >
                      <td className="p-4 font-semibold text-white">
                        <Link
                          to={`/projects/${data.projectId}`}
                          className="hover:text-primary-400"
                        >
                          {data.projectName}
                        </Link>
                      </td>
                      <td className="p-4 text-gray-400">{data.clientName}</td>
                      <td className="p-4 text-gray-300">
                        {formatCurrency(data.totalIncome)}
                      </td>
                      <td className="p-4 text-gray-300">
                        {formatCurrency(data.totalCosts)}
                      </td>
                      <td className="p-4 text-gray-300">
                        {formatCurrency(data.netProfit)}
                      </td>
                      <td className="p-4 text-gray-300">
                        {data.margin.toFixed(1)}%
                      </td>
                      <td className="p-4 text-gray-300">
                        {data.totalHours.toFixed(1)}
                      </td>
                      <td className="p-4 text-gray-300">
                        {formatCurrency(data.effectiveHourlyRate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Suspense fallback={null}>
        {analysis && (
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-white">
                Análisis de rentabilidad
              </h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-gray-300">{analysis.summary}</p>
              <div>
                <h3 className="text-sm font-semibold text-white">
                  Proyectos más rentables
                </h3>
                <ul className="list-disc list-inside text-gray-300">
                  {analysis.topPerformers.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">
                  Áreas de mejora
                </h3>
                <ul className="list-disc list-inside text-gray-300">
                  {analysis.areasForImprovement.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        )}

        <BuyCreditsModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
        />
      </Suspense>
    </div>
  );
};

export default ProfitabilityReportPage;
