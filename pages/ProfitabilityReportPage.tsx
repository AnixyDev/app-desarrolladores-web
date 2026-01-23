// pages/ProfitabilityReportPage.tsx
import React, { useMemo, useState, lazy, Suspense } from 'react';
import { useAppStore } from '../hooks/useAppStore.tsx';
import Card, { CardContent, CardHeader } from '../components/ui/Card.tsx';
import { formatCurrency } from '../lib/utils.ts';
import { Link } from 'react-router-dom';
import { ArrowUpCircleIcon, ArrowDownCircleIcon, DollarSignIcon, TrendingUpIcon, ChevronDownIcon, ChevronUpIcon, BriefcaseIcon, SparklesIcon, RefreshCwIcon } from '../components/icons/Icon.tsx';
import EmptyState from '../components/ui/EmptyState.tsx';
import Button from '../components/ui/Button.tsx';
import { analyzeProfitability, AI_CREDIT_COSTS } from '../services/geminiService.ts';
import { useToast } from '../hooks/useToast.ts';

const BuyCreditsModal = lazy(() => import('../components/modals/BuyCreditsModal.tsx'));

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

const StatCard: React.FC<{ icon: React.ElementType; title: string; value: string; project?: string; color: string }> = ({ icon: Icon, title, value, project, color }) => (
    <Card>
        <CardContent className="p-4">
             <div className="flex items-center">
                 <div className={`p-3 rounded-full bg-gray-800 ${color} mr-4`}>
                     <Icon className="w-6 h-6" />
                 </div>
                <div>
                    <p className="text-sm text-gray-400">{title}</p>
                    <p className={`text-2xl font-bold text-white`}>{value}</p>
                    {project && <p className="text-xs text-gray-500 truncate">{project}</p>}
                </div>
            </div>
        </CardContent>
    </Card>
);

const SortableHeader: React.FC<{
    label: string;
    sortKey: keyof ProfitabilityData;
    sortConfig: { key: keyof ProfitabilityData; direction: string; } | null;
    requestSort: (key: keyof ProfitabilityData) => void;
}> = ({ label, sortKey, sortConfig, requestSort }) => {
    const isSorted = sortConfig?.key === sortKey;
    return (
        <th className="p-4 cursor-pointer hover:bg-gray-800" onClick={() => requestSort(sortKey)}>
            <div className="flex items-center gap-2">
                {label}
                {isSorted ? (sortConfig?.direction === 'ascending' ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />) : <div className="w-4 h-4" />}
            </div>
        </th>
    );
};


const ProfitabilityReportPage: React.FC = () => {
    const { projects, clients, invoices, expenses, timeEntries, profile, consumeCredits } = useAppStore();
    const { addToast } = useToast();
    const [sortConfig, setSortConfig] = useState<{ key: keyof ProfitabilityData; direction: 'ascending' | 'descending' }>({ key: 'netProfit', direction: 'descending' });
    const [analysis, setAnalysis] = useState<FinancialAnalysis | null>(null);
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [isBuyCreditsModalOpen, setIsBuyCreditsModalOpen] = useState(false);

    const profitabilityData: ProfitabilityData[] = useMemo(() => {
        if (!profile) return [];

        return projects.map(project => {
            const projectInvoices = invoices.filter(i => i.project_id === project.id && i.paid);
            const totalIncome = projectInvoices.reduce((sum, i) => sum + i.subtotal_cents, 0);

            const projectExpenses = expenses.filter(e => e.project_id === project.id);
            const expenseCosts = projectExpenses.reduce((sum, e) => sum + e.amount_cents, 0);

            const projectTimeEntries = timeEntries.filter(t => t.project_id === project.id);
            const totalSeconds = projectTimeEntries.reduce((sum, t) => sum + t.duration_seconds, 0);
            const totalHours = totalSeconds / 3600;
            const timeCosts = totalHours * profile.hourly_rate_cents;

            const totalCosts = expenseCosts + timeCosts;
            const netProfit = totalIncome - totalCosts;
            const margin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0;
            const effectiveHourlyRate = totalHours > 0 ? netProfit / totalHours : 0;

            return {
                projectId: project.id,
                projectName: project.name,
                clientName: clients.find(c => c.id === project.client_id)?.name || 'N/A',
                totalIncome,
                totalCosts,
                netProfit,
                margin,
                totalHours,
                effectiveHourlyRate,
            };
        });
    }, [projects, clients, invoices, expenses, timeEntries, profile]);

    const summaryStats = useMemo(() => {
        if (profitabilityData.length === 0) {
            return { mostProfitable: null, leastProfitable: null, avgEffectiveRate: 0 };
        }

        const sortedByProfit = [...profitabilityData].sort((a, b) => b.netProfit - a.netProfit);
        const mostProfitable = sortedByProfit[0] || null;
        const leastProfitable = sortedByProfit[sortedByProfit.length - 1] || null;

        const totalProfit = profitabilityData.reduce((sum, p) => sum + p.netProfit, 0);
        const totalHours = profitabilityData.reduce((sum, p) => sum + p.totalHours, 0);
        const avgEffectiveRate = totalHours > 0 ? totalProfit / totalHours : 0;

        return { mostProfitable, leastProfitable, avgEffectiveRate };
    }, [profitabilityData]);
    
    const sortedData = useMemo(() => {
        let sortableItems = [...profitabilityData];
        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                if (a[sortConfig.key] < b[sortConfig.key]) {
                    return sortConfig.direction === 'ascending' ? -1 : 1;
                }
                if (a[sortConfig.key] > b[sortConfig.key]) {
                    return sortConfig.direction === 'ascending' ? 1 : -1;
                }
                return 0;
            });
        }
        return sortableItems;
    }, [profitabilityData, sortConfig]);

    const requestSort = (key: keyof ProfitabilityData) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    const getMetricColor = (value: number, type: 'margin' | 'rate') => {
        if (type === 'margin') {
            if (value < 20) return 'text-red-400';
            if (value < 40) return 'text-yellow-400';
            return 'text-green-400';
        }
        // For effective rate
        const targetRate = (profile?.hourly_rate_cents ?? 0);
        if (value < targetRate * 0.75) return 'text-red-400';
        if (value < targetRate) return 'text-yellow-400';
        return 'text-green-400';
    };

    const handleAiAnalysis = async () => {
        if (profile.ai_credits < AI_CREDIT_COSTS.analyzeProfitability) {
            setIsBuyCreditsModalOpen(true);
            return;
        }
        setIsAiLoading(true);
        setAnalysis(null);
        try {
            // Filter out necessary data to reduce token usage and noise
            const dataToAnalyze = profitabilityData.map(({ projectId, ...rest }) => rest);
            const result = await analyzeProfitability({ projects: dataToAnalyze });
            if (result) {
                setAnalysis(result);
                consumeCredits(AI_CREDIT_COSTS.analyzeProfitability);
                addToast("Análisis de rentabilidad de proyectos completado.", "success");
            } else {
                addToast("No se pudo generar el análisis.", "error");
            }
        } catch (error) {
            addToast(String((error as Error).message), 'error');
        } finally {
            setIsAiLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-semibold text-white">Panel de Rentabilidad por Proyecto</h1>
                <Button onClick={handleAiAnalysis} disabled={isAiLoading || profitabilityData.length === 0}>
                    {isAiLoading ? <RefreshCwIcon className="w-4 h-4 mr-2 animate-spin"/> : <SparklesIcon className="w-4 h-4 mr-2" />}
                    {isAiLoading ? 'Analizando...' : 'Analizar Proyectos con IA'}
                </Button>
            </div>
            
            {profitabilityData.length === 0 ? (
                <EmptyState 
                    icon={BriefcaseIcon}
                    title="No hay datos para analizar"
                    message="Registra proyectos, horas y facturas pagadas para poder analizar la rentabilidad de tu trabajo."
                />
            ) : (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <StatCard 
                            icon={ArrowUpCircleIcon}
                            title="Proyecto Más Rentable"
                            value={formatCurrency(summaryStats.mostProfitable?.netProfit ?? 0)}
                            project={summaryStats.mostProfitable?.projectName}
                            color="text-green-400"
                        />
                        <StatCard 
                            icon={ArrowDownCircleIcon}
                            title="Proyecto Menos Rentable"
                            value={formatCurrency(summaryStats.leastProfitable?.netProfit ?? 0)}
                            project={summaryStats.leastProfitable?.projectName}
                            color="text-red-400"
                        />
                        <StatCard 
                            icon={DollarSignIcon}
                            title="Tarifa Media Efectiva"
                            value={`${formatCurrency(summaryStats.avgEffectiveRate)}/h`}
                            project={`Tarifa objetivo: ${formatCurrency(profile?.hourly_rate_cents ?? 0)}/h`}
                            color="text-primary-400"
                        />
                    </div>

                    {analysis && (
                        <Card>
                            <CardHeader><h2 className="text-lg font-semibold text-white flex items-center gap-2"><SparklesIcon className="w-5 h-5 text-purple-400"/> Insights de IA sobre Proyectos</h2></CardHeader>
                            <CardContent className="space-y-4">
                                <div>
                                    <h3 className="font-semibold text-primary-400 mb-2">Evaluación Estratégica</h3>
                                    <p className="text-gray-300">{String(analysis.summary)}</p>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <h3 className="font-semibold text-green-400 mb-2">Top Proyectos (Alto Rendimiento)</h3>
                                        <ul className="list-disc list-inside space-y-1 text-gray-300 text-sm">
                                            {/* FIX: Ensure all items are safely rendered as strings */}
                                            {analysis.topPerformers.map((item, i) => <li key={i}>{String(item)}</li>)}
                                        </ul>
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-yellow-400 mb-2">Áreas de Optimización</h3>
                                        <ul className="list-disc list-inside space-y-1 text-gray-300 text-sm">
                                            {/* FIX: Ensure all items are safely rendered as strings */}
                                            {analysis.areasForImprovement.map((item, i) => <li key={i}>{String(item)}</li>)}
                                        </ul>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    <Card>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead className="border-b border-gray-800 bg-gray-900/50">
                                        <tr>
                                            <th className="p-4">Proyecto</th>
                                            <th className="p-4">Cliente</th>
                                            <SortableHeader label="Ingresos" sortKey="totalIncome" sortConfig={sortConfig} requestSort={requestSort} />
                                            <SortableHeader label="Costes" sortKey="totalCosts" sortConfig={sortConfig} requestSort={requestSort} />
                                            <SortableHeader label="Beneficio Neto" sortKey="netProfit" sortConfig={sortConfig} requestSort={requestSort} />
                                            <SortableHeader label="Margen" sortKey="margin" sortConfig={sortConfig} requestSort={requestSort} />
                                            <SortableHeader label="Tarifa Efectiva" sortKey="effectiveHourlyRate" sortConfig={sortConfig} requestSort={requestSort} />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sortedData.map(p => (
                                            <tr key={p.projectId} className="border-b border-gray-800 hover:bg-gray-800/50">
                                                <td className="p-4 font-semibold text-white">
                                                    <Link to={`/projects/${p.projectId}`} className="hover:text-primary-400">{String(p.projectName)}</Link>
                                                </td>
                                                <td className="p-4 text-gray-400">{String(p.clientName)}</td>
                                                <td className="p-4 text-green-400">{formatCurrency(p.totalIncome)}</td>
                                                <td className="p-4 text-red-400">{formatCurrency(p.totalCosts)}</td>
                                                <td className="p-4 font-bold text-white">{formatCurrency(p.netProfit)}</td>
                                                <td className={`p-4 font-semibold ${getMetricColor(p.margin, 'margin')}`}>{p.margin.toFixed(1)}%</td>
                                                <td className={`p-4 font-semibold ${getMetricColor(p.effectiveHourlyRate, 'rate')}`}>{formatCurrency(p.effectiveHourlyRate)}/h</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                </>
            )}
            
            <Suspense fallback={null}>
                {isBuyCreditsModalOpen && <BuyCreditsModal isOpen={isBuyCreditsModalOpen} onClose={() => setIsBuyCreditsModalOpen(false)} />}
            </Suspense>
        </div>
    );
};

export default ProfitabilityReportPage;