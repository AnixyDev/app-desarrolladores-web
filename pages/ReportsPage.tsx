import React, { useState, useMemo, lazy, Suspense } from 'react';
import { useAppStore } from '../hooks/useAppStore';
import Card, { CardContent, CardHeader } from '../components/ui/Card';
import Button from '../components/ui/Button';
import { formatCurrency } from '../lib/utils';
import { DownloadIcon, DollarSignIcon, TrendingUpIcon, Users as UsersIcon, ClockIcon, SparklesIcon, RefreshCwIcon, ArrowUpCircleIcon, AlertTriangleIcon } from '../components/icons/Icon';
import { analyzeProfitability, AI_CREDIT_COSTS } from '../services/geminiService';
import { useToast } from '../hooks/useToast';

const ProfitabilityByClientChart = lazy(() => import('../components/charts/ProfitabilityByClientChart'));
const BuyCreditsModal = lazy(() => import('../components/modals/BuyCreditsModal'));

interface FinancialAnalysis {
    summary: string;
    topPerformers: string[];
    areasForImprovement: string[];
}

const ReportsPage: React.FC = () => {
  const { invoices, expenses, clients, projects, timeEntries, profile, consumeCredits } = useAppStore();
  const { addToast } = useToast();
  
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const [startDate, setStartDate] = useState(firstDayOfMonth.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);
  const [analysis, setAnalysis] = useState<FinancialAnalysis | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isBuyCreditsModalOpen, setIsBuyCreditsModalOpen] = useState(false);

  const filteredData = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const filteredInvoices = invoices.filter(i => {
      const issueDate = new Date(i.issue_date);
      return issueDate >= start && issueDate <= end;
    });

    const filteredExpenses = expenses.filter(e => {
      const expenseDate = new Date(e.date);
      return expenseDate >= start && expenseDate <= end;
    });
    
    const filteredTimeEntries = timeEntries.filter(t => {
       const entryDate = new Date(t.start_time);
       return entryDate >= start && entryDate <= end;
    });

    return { filteredInvoices, filteredExpenses, filteredTimeEntries };
  }, [invoices, expenses, timeEntries, startDate, endDate]);

  const reportKpis = useMemo(() => {
    const paidInvoices = filteredData.filteredInvoices.filter(i => i.paid);
    const totalIncome = paidInvoices.reduce((sum, inv) => sum + inv.total_cents, 0);
    const totalExpenses = filteredData.filteredExpenses.reduce((sum, exp) => sum + exp.amount_cents, 0);
    const netProfit = totalIncome - totalExpenses;
    
    const clientProfitability = clients.map(client => {
        const clientInvoices = paidInvoices.filter(i => i.client_id === client.id);
        const clientIncome = clientInvoices.reduce((sum, i) => sum + i.subtotal_cents, 0);
        
        const clientProjectIds = projects.filter(p => p.client_id === client.id).map(p => p.id);
        const clientExpenses = filteredData.filteredExpenses
            .filter(e => e.project_id && clientProjectIds.includes(e.project_id))
            .reduce((sum, e) => sum + e.amount_cents, 0);

        return { 
            name: client.name, 
            income: clientIncome,
            expenses: clientExpenses,
            profit: clientIncome - clientExpenses 
        };
    }).filter(c => c.profit !== 0 || c.expenses > 0).sort((a, b) => b.profit - a.profit);

    const totalHoursTracked = filteredData.filteredTimeEntries.reduce((sum, entry) => sum + entry.duration_seconds, 0) / 3600;

    return {
        totalIncome,
        totalExpenses,
        netProfit,
        clientProfitability,
        totalHoursTracked,
    };
  }, [filteredData, clients, projects]);
  
  const handleExportPdf = async () => {
    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');
    
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(`Reporte Financiero (${startDate} a ${endDate})`, 14, 22);
    doc.setFontSize(12);
    doc.text(`Preparado para: ${profile.full_name}`, 14, 32);

    autoTable(doc, {
        startY: 40,
        head: [['Métrica', 'Valor']],
        body: [
            ['Ingresos Totales (Pagado)', formatCurrency(reportKpis.totalIncome)],
            ['Gastos Totales', formatCurrency(reportKpis.totalExpenses)],
            ['Beneficio Neto', formatCurrency(reportKpis.netProfit)],
            ['Horas Registradas', `${reportKpis.totalHoursTracked.toFixed(2)}h`],
        ],
    });
    
     autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 10,
        head: [['Cliente', 'Ingresos', 'Gastos', 'Beneficio Neto']],
        body: reportKpis.clientProfitability.map(c => [
            c.name, 
            formatCurrency(c.income),
            formatCurrency(c.expenses),
            formatCurrency(c.profit)
        ]),
    });

    doc.save(`Reporte_DevFreelancer_${startDate}_${endDate}.pdf`);
  };
  
   const handleAiAnalysis = async () => {
        if (profile.ai_credits < AI_CREDIT_COSTS.analyzeProfitability) {
            setIsBuyCreditsModalOpen(true);
            return;
        }
        setIsAiLoading(true);
        setAnalysis(null);
        try {
            const aiPayload = {
                periodo: `${startDate} a ${endDate}`,
                resumen_global: {
                    ingresos_totales: formatCurrency(reportKpis.totalIncome),
                    gastos_totales: formatCurrency(reportKpis.totalExpenses),
                    beneficio_neto: formatCurrency(reportKpis.netProfit)
                },
                rentabilidad_por_cliente: reportKpis.clientProfitability.map(c => ({
                    cliente: c.name,
                    ingresos_facturados: formatCurrency(c.income),
                    gastos_asociados_proyecto: formatCurrency(c.expenses),
                    beneficio: formatCurrency(c.profit),
                    margen_beneficio: c.income > 0 ? ((c.income - c.expenses) / c.income * 100).toFixed(1) + '%' : '0%'
                }))
            };

            const result = await analyzeProfitability(aiPayload);
            if (result) {
                setAnalysis(result);
                consumeCredits(AI_CREDIT_COSTS.analyzeProfitability);
                addToast("Análisis de rentabilidad completado.", "success");
            }
        } catch (error: any) {
            addToast(String(error?.message || "Error en análisis de IA"), 'error');
        } finally {
            setIsAiLoading(false);
        }
    };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h1 className="text-2xl font-semibold text-white">Reportes</h1>
          <div className="flex items-center gap-2 flex-wrap">
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-white" />
              <span className="text-gray-400">a</span>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-white" />
              <Button onClick={handleAiAnalysis} disabled={isAiLoading} className="bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-700 hover:to-fuchsia-700 border-none">
                  {isAiLoading ? <RefreshCwIcon className="w-4 h-4 mr-2 animate-spin"/> : <SparklesIcon className="w-4 h-4 mr-2" />}
                  {isAiLoading ? 'Analizando...' : 'Analizar Rentabilidad con IA'}
              </Button>
              <Button onClick={handleExportPdf} variant="secondary"><DownloadIcon className="w-4 h-4 mr-2" /> Exportar PDF</Button>
          </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard icon={DollarSignIcon} title="Ingresos Totales" value={formatCurrency(reportKpis.totalIncome)} />
          <StatCard icon={TrendingUpIcon} title="Gastos Totales" value={formatCurrency(reportKpis.totalExpenses)} color="text-red-400" />
          <StatCard icon={DollarSignIcon} title="Beneficio Neto" value={formatCurrency(reportKpis.netProfit)} color="text-green-400" />
          <StatCard icon={ClockIcon} title="Horas Registradas" value={`${reportKpis.totalHoursTracked.toFixed(2)}h`} />
      </div>

      {analysis && (
            <Card className="border-fuchsia-600/50 shadow-lg shadow-fuchsia-900/20 bg-gray-900">
                <CardHeader className="bg-gradient-to-r from-gray-900 to-gray-800 border-b border-gray-700">
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                        <div className="p-1.5 bg-fuchsia-600 rounded-full"><SparklesIcon className="w-4 h-4 text-white" /></div>
                        Diagnóstico de IA
                    </h2>
                </CardHeader>
                <CardContent className="space-y-6 pt-6">
                    <div>
                        <h3 className="font-semibold text-primary-400 mb-2 uppercase text-xs tracking-wider">Resumen Ejecutivo</h3>
                        <p className="text-gray-300 leading-relaxed bg-gray-800/50 p-4 rounded-lg border border-gray-700">{String(analysis.summary)}</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-green-900/10 border border-green-900/30 p-4 rounded-lg">
                            <h3 className="font-bold text-green-400 mb-3 flex items-center">
                                <ArrowUpCircleIcon className="w-5 h-5 mr-2"/> Top Rendimiento
                            </h3>
                            <ul className="space-y-2">
                                {analysis.topPerformers.map((item, i) => (
                                    <li key={i} className="flex items-start text-sm text-gray-300">
                                        <span className="text-green-500 mr-2">•</span>{String(item)}
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div className="bg-yellow-900/10 border border-yellow-900/30 p-4 rounded-lg">
                            <h3 className="font-bold text-yellow-400 mb-3 flex items-center">
                                <AlertTriangleIcon className="w-5 h-5 mr-2"/> Acciones Recomendadas
                            </h3>
                            <ul className="space-y-2">
                                {analysis.areasForImprovement.map((item, i) => (
                                    <li key={i} className="flex items-start text-sm text-gray-300">
                                        <span className="text-yellow-500 mr-2">•</span>{String(item)}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </CardContent>
            </Card>
      )}

      <Card>
        <CardHeader><h2 className="text-lg font-semibold text-white flex items-center gap-2"><UsersIcon className="w-5 h-5"/> Rentabilidad por Cliente</h2></CardHeader>
        <CardContent>
            {reportKpis.clientProfitability.length > 0 ? (
                <Suspense fallback={<div className="h-[300px] flex items-center justify-center text-gray-400">Cargando gráfico...</div>}>
                    <ProfitabilityByClientChart data={reportKpis.clientProfitability} />
                </Suspense>
            ) : (
                <p className="text-gray-400 text-center py-8">Sin datos suficientes.</p>
            )}
        </CardContent>
      </Card>
      
      <Suspense fallback={null}>
          {isBuyCreditsModalOpen && <BuyCreditsModal isOpen={isBuyCreditsModalOpen} onClose={() => setIsBuyCreditsModalOpen(false)} />}
      </Suspense>
    </div>
  );
};

const StatCard = ({ icon: Icon, title, value, color = 'text-white' }: { icon: React.ElementType, title: string, value: string | number, color?: string }) => (
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

export default ReportsPage;