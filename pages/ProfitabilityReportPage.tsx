// pages/ProfitabilityReportPage.tsx
import React, { useState, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';

import { useAppStore } from '@/hooks/useAppStore';
import { useToast } from '@/hooks/useToast';
import { useProfitability, SortKey, ProfitabilityData } from '@/hooks/useProfitability';

import Card, { CardContent, CardHeader } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';

import {
  ArrowUpCircleIcon, ArrowDownCircleIcon, DollarSignIcon,
  ChevronDownIcon, ChevronUpIcon, BriefcaseIcon,
  SparklesIcon, RefreshCwIcon,
} from '@/components/icons/Icon';

import { formatCurrency } from '@/lib/utils';
import { analyzeProfitability, AI_CREDIT_COSTS } from '@/services/geminiService';

const BuyCreditsModal = lazy(() => import('@/components/modals/BuyCreditsModal'));

// ── Subcomponentes locales ─────────────────────────────────────────────────

interface StatCardProps {
  icon: React.ElementType;
  title: string;
  value: string;
  project?: string;
  color: string;
}

const StatCard: React.FC<StatCardProps> = ({ icon: Icon, title, value, project, color }) => (
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

interface SortableHeaderProps {
  label: string;
  sortKey: SortKey;
  sortConfig: { key: SortKey; direction: string } | null;
  requestSort: (key: SortKey) => void;
}

const SortableHeader: React.FC<SortableHeaderProps> = ({ label, sortKey, sortConfig, requestSort }) => {
  const isSorted = sortConfig?.key === sortKey;
  return (
    <th className="p-4 cursor-pointer hover:bg-gray-800 whitespace-nowrap" onClick={() => requestSort(sortKey)}>
      <div className="flex items-center gap-2">
        {label}
        {isSorted && (
          sortConfig?.direction === 'ascending'
            ? <ChevronUpIcon className="w-4 h-4 text-primary-400" />
            : <ChevronDownIcon className="w-4 h-4 text-primary-400" />
        )}
      </div>
    </th>
  );
};

// ── Página principal ────────────────────────────────────────────────────────

interface FinancialAnalysis {
  summary: string;
  topPerformers: string[];
  areasForImprovement: string[];
}

const ProfitabilityReportPage: React.FC = () => {
  const { consumeCredits } = useAppStore();
  const { addToast } = useToast();
  const { profitabilityData, sortedData, sortConfig, requestSort, summary } = useProfitability();

  const [analysis, setAnalysis] = useState<FinancialAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isBuyCreditsOpen, setIsBuyCreditsOpen] = useState(false);

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    try {
      consumeCredits(AI_CREDIT_COSTS.analyzeProfitability);
      const data = await analyzeProfitability(profitabilityData) as unknown as FinancialAnalysis;
      setAnalysis(data);
    } catch {
      addToast('Error al analizar la rentabilidad. Intenta nuevamente.', 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const sortHeaders: { label: string; key: SortKey }[] = [
    { label: 'Proyecto', key: 'projectName' },
    { label: 'Cliente', key: 'clientName' },
    { label: 'Ingresos', key: 'totalIncome' },
    { label: 'Costes', key: 'totalCosts' },
    { label: 'Beneficio neto', key: 'netProfit' },
    { label: 'Margen', key: 'margin' },
    { label: 'Horas', key: 'totalHours' },
    { label: 'Tarifa efectiva', key: 'effectiveHourlyRate' },
  ];

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h1 className="text-2xl font-semibold text-white">Rentabilidad</h1>
        <Button onClick={handleAnalyze} disabled={isAnalyzing}>
          {isAnalyzing
            ? <RefreshCwIcon className="w-4 h-4 animate-spin mr-2" />
            : <SparklesIcon className="w-4 h-4 mr-2" />
          }
          Analizar con IA
        </Button>
      </div>

      {/* Tarjetas de resumen */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard
            icon={ArrowUpCircleIcon}
            title="Proyecto más rentable"
            value={formatCurrency(summary.topProject.netProfit)}
            project={summary.topProject.projectName}
            color="text-green-400"
          />
          <StatCard
            icon={ArrowDownCircleIcon}
            title="Proyecto menos rentable"
            value={formatCurrency(summary.lowestProject.netProfit)}
            project={summary.lowestProject.projectName}
            color="text-red-400"
          />
          <StatCard
            icon={DollarSignIcon}
            title="Margen promedio"
            value={`${summary.avgMargin.toFixed(1)}%`}
            color="text-primary-400"
          />
        </div>
      )}

      {/* Tabla de rentabilidad */}
      {profitabilityData.length === 0 ? (
        <EmptyState
          icon={BriefcaseIcon}
          title="No hay datos de rentabilidad"
          message="Crea proyectos, facturas y gastos para ver el reporte."
          action={{ text: 'Crear proyecto', onClick: () => {} }}
        />
      ) : (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-white">Rentabilidad por proyecto</h2>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-800">
                  <tr>
                    {sortHeaders.map(h => (
                      <SortableHeader
                        key={h.key}
                        label={h.label}
                        sortKey={h.key}
                        sortConfig={sortConfig}
                        requestSort={requestSort}
                      />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedData.map(data => (
                    <tr key={data.projectId} className="border-b border-gray-800 hover:bg-gray-800/50">
                      <td className="p-4 font-semibold text-white">
                        <Link to={`/projects/${data.projectId}`} className="hover:text-primary-400">
                          {data.projectName}
                        </Link>
                      </td>
                      <td className="p-4 text-gray-400">{data.clientName}</td>
                      <td className="p-4 text-gray-300">{formatCurrency(data.totalIncome)}</td>
                      <td className="p-4 text-gray-300">{formatCurrency(data.totalCosts)}</td>
                      <td className={`p-4 font-medium ${data.netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {formatCurrency(data.netProfit)}
                      </td>
                      <td className="p-4 text-gray-300">{data.margin.toFixed(1)}%</td>
                      <td className="p-4 text-gray-300">{data.totalHours.toFixed(1)}h</td>
                      <td className="p-4 text-gray-300">{formatCurrency(data.effectiveHourlyRate)}/h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Análisis IA */}
      {analysis && (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-white">Análisis de rentabilidad</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-gray-300">{analysis.summary}</p>
            <div>
              <h3 className="text-sm font-semibold text-white mb-2">Proyectos más rentables</h3>
              <ul className="list-disc list-inside text-gray-300 space-y-1">
                {analysis.topPerformers.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white mb-2">Áreas de mejora</h3>
              <ul className="list-disc list-inside text-gray-300 space-y-1">
                {analysis.areasForImprovement.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      <Suspense fallback={null}>
        {isBuyCreditsOpen && (
          <BuyCreditsModal isOpen onClose={() => setIsBuyCreditsOpen(false)} />
        )}
      </Suspense>
    </div>
  );
};

export default ProfitabilityReportPage;
