import React, { lazy, Suspense, useState, useEffect } from 'react';
import { useAppStore } from '../hooks/useAppStore';
import Card, { CardContent, CardHeader } from '../components/ui/Card';
import Skeleton, { CardSkeleton } from '../components/ui/Skeleton';
import { formatCurrency } from '../lib/utils';
import { Link } from 'react-router-dom';
import { DollarSignIcon, ClockIcon, BriefcaseIcon, FileTextIcon } from '../components/icons/Icon';

const IncomeExpenseChart = lazy(() => import('../components/charts/IncomeExpenseChart'));

const StatCard: React.FC<{ icon: React.ElementType; title: string; value: string | number; link?: string; isLoading?: boolean }> = ({ icon: Icon, title, value, link, isLoading }) => {
    const content = (
        <CardContent className="flex items-center p-4">
            <div className="p-3 rounded-full bg-primary-600/20 text-primary-400 mr-4">
                <Icon className="w-6 h-6" />
            </div>
            <div className="flex-1">
                <p className="text-sm text-gray-400">{title}</p>
                {isLoading ? (
                    <Skeleton variant="text" className="w-20 h-8 mt-1" />
                ) : (
                    <p className="text-2xl font-bold text-white">{value}</p>
                )}
            </div>
        </CardContent>
    );

    if (link) {
        return <Link to={link} className="block hover:translate-y-[-2px] transition-transform duration-200"><Card>{content}</Card></Link>;
    }
    return <Card>{content}</Card>;
};

const DashboardPage: React.FC = () => {
    const { invoices, expenses, projects, tasks, timeEntries, profile, getClientById, monthlyGoalCents } = useAppStore();
    const [isInitialLoading, setIsInitialLoading] = useState(true);

    useEffect(() => {
        // Simulación de carga inicial para mostrar skeletons premium
        const timer = setTimeout(() => setIsInitialLoading(false), 800);
        return () => clearTimeout(timer);
    }, []);

    const stats = {
        pendingInvoices: invoices.filter(i => !i.paid).reduce((sum, i) => sum + i.total_cents, 0),
        activeProjects: projects.filter(p => p.status === 'in-progress').length,
        hoursThisWeek: timeEntries.filter(t => new Date(t.start_time) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)).reduce((sum, t) => sum + t.duration_seconds, 0) / 3600,
        monthlyIncome: invoices.filter(i => i.paid && i.payment_date && new Date(i.payment_date).getMonth() === new Date().getMonth()).reduce((sum, i) => sum + i.subtotal_cents, 0)
    };
    
    const goalProgress = monthlyGoalCents > 0 ? (stats.monthlyIncome / monthlyGoalCents) * 100 : 0;
    const activeProjectsList = projects.filter(p => p.status === 'in-progress').slice(0, 5);
    const pendingInvoicesList = invoices.filter(i => !i.paid).slice(0, 5);

    const getProjectProgress = (projectId: string) => {
        const projectTasks = tasks.filter(t => t.project_id === projectId);
        if (projectTasks.length === 0) return 0;
        const completed = projectTasks.filter(t => t.completed).length;
        return Math.round((completed / projectTasks.length) * 100);
    };

    return (
        <div className="space-y-8 max-w-7xl mx-auto">
            <header className="flex flex-col gap-2">
                {isInitialLoading ? (
                    <Skeleton variant="text" className="w-48 h-10" />
                ) : (
                    <h1 className="text-3xl font-extrabold text-white tracking-tight">Hola, {profile?.full_name?.split(' ')[0]} 👋</h1>
                )}
                <p className="text-gray-400">Aquí tienes un resumen de tu actividad y finanzas.</p>
            </header>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                <StatCard isLoading={isInitialLoading} icon={DollarSignIcon} title="Ingresos este Mes" value={formatCurrency(stats.monthlyIncome)} />
                <StatCard isLoading={isInitialLoading} icon={FileTextIcon} title="Pendiente de Cobro" value={formatCurrency(stats.pendingInvoices)} />
                <StatCard isLoading={isInitialLoading} icon={BriefcaseIcon} title="Proyectos Activos" value={stats.activeProjects} link="/projects" />
                <StatCard isLoading={isInitialLoading} icon={ClockIcon} title="Horas (7 días)" value={`${stats.hoursThisWeek.toFixed(1)}h`} link="/time-tracking" />
            </div>

            <Card className="overflow-hidden">
                <CardHeader className="bg-gray-900/50">
                    <h2 className="text-lg font-semibold text-white">Objetivo Mensual ({formatCurrency(monthlyGoalCents)})</h2>
                </CardHeader>
                <CardContent className="py-6">
                    {isInitialLoading ? (
                        <Skeleton variant="rect" className="h-6 w-full" />
                    ) : (
                        <div className="space-y-2">
                            <div className="w-full bg-gray-800 rounded-full h-4 relative">
                                <div className="bg-gradient-to-r from-primary-600 to-purple-600 h-4 rounded-full transition-all duration-1000 ease-out" style={{ width: `${Math.min(goalProgress, 100)}%` }}>
                                   <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white uppercase">{goalProgress.toFixed(0)}% completado</span>
                                </div>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                 <Card className="lg:col-span-2">
                    <CardHeader>
                        <h2 className="text-lg font-semibold text-white">Rendimiento Financiero</h2>
                    </CardHeader>
                    <CardContent>
                        {isInitialLoading ? (
                            <Skeleton variant="rect" className="h-[300px] w-full" />
                        ) : (
                            <Suspense fallback={<div className="h-[300px] flex items-center justify-center text-gray-400">Cargando gráfico...</div>}>
                                <IncomeExpenseChart invoices={invoices} expenses={expenses} />
                            </Suspense>
                        )}
                    </CardContent>
                </Card>

                <div className="space-y-6">
                    <Card>
                        <CardHeader className="flex justify-between items-center">
                            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                                <BriefcaseIcon className="w-5 h-5 text-purple-400"/> Proyectos
                            </h2>
                            <Link to="/projects" className="text-xs text-primary-400 hover:underline">Ver todos</Link>
                        </CardHeader>
                        <CardContent className="p-0">
                            <ul className="divide-y divide-gray-800">
                                {isInitialLoading ? (
                                    [1, 2, 3].map(i => (
                                        <li key={i} className="p-4 space-y-2">
                                            <Skeleton variant="text" className="w-1/2" />
                                            <Skeleton variant="rect" className="h-1 w-full" />
                                        </li>
                                    ))
                                ) : activeProjectsList.length > 0 ? activeProjectsList.map(project => {
                                    const progress = getProjectProgress(project.id);
                                    return (
                                        <li key={project.id} className="p-4 hover:bg-gray-800/30 transition-colors">
                                            <div className="flex justify-between items-center mb-2">
                                                <Link to={`/projects/${project.id}`} className="font-semibold text-white hover:text-primary-400 text-sm truncate max-w-[150px]">{project.name}</Link>
                                                <span className="text-[10px] text-gray-400 bg-gray-800 px-2 py-0.5 rounded-full border border-gray-700">{progress}%</span>
                                            </div>
                                            <div className="w-full bg-gray-800 rounded-full h-1">
                                                <div className="bg-primary-500 h-1 rounded-full transition-all duration-700" style={{ width: `${progress}%` }}></div>
                                            </div>
                                        </li>
                                    );
                                }) : <p className="p-8 text-gray-500 text-sm text-center">No hay proyectos activos.</p>}
                            </ul>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex justify-between items-center">
                            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                                <FileTextIcon className="w-5 h-5 text-yellow-400"/> Facturas
                            </h2>
                            <Link to="/invoices" className="text-xs text-primary-400 hover:underline">Gestionar</Link>
                        </CardHeader>
                        <CardContent className="p-0">
                             <ul className="divide-y divide-gray-800">
                                {isInitialLoading ? (
                                    [1, 2].map(i => (
                                        <li key={i} className="p-4 flex justify-between">
                                            <Skeleton variant="text" className="w-1/3" />
                                            <Skeleton variant="text" className="w-1/4" />
                                        </li>
                                    ))
                                ) : pendingInvoicesList.length > 0 ? pendingInvoicesList.map(invoice => (
                                    <li key={invoice.id} className="p-4 flex justify-between items-center hover:bg-gray-800/30 transition-colors">
                                        <div>
                                            <p className="font-mono text-xs text-white">{invoice.invoice_number}</p>
                                            <p className="text-[10px] text-gray-500">{getClientById(invoice.client_id)?.name}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-bold text-white text-sm">{formatCurrency(invoice.total_cents)}</p>
                                            <span className="text-[9px] uppercase tracking-tighter text-yellow-500 font-bold">Pendiente</span>
                                        </div>
                                    </li>
                                )) : <p className="p-8 text-gray-500 text-sm text-center">Sin deudas pendientes.</p>}
                            </ul>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default DashboardPage;