
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import Card, { CardContent, CardHeader } from '../components/ui/Card';
// FIX: Added missing import for Button component
import Button from '../components/ui/Button';
import { formatCurrency } from '../lib/utils';
import { 
    DollarSignIcon, 
    Users as UsersIcon, 
    SparklesIcon, 
    TrendingUpIcon, 
    CreditCard, 
    ActivityIcon,
    RefreshCwIcon,
    AlertTriangleIcon 
} from '../components/icons/Icon';
import Skeleton from '../components/ui/Skeleton';

interface Transaction {
    id: string;
    user_email: string;
    plan_name: string;
    amount_cents: number;
    created_at: string;
}

interface PlatformStats {
    totalRevenueCents: number;
    totalUsers: number;
    totalAiCreditsUsed: number;
    transactionCount: number;
}

const STRIPE_FIXED_FEE_CENTS = 25;
const STRIPE_PERCENT_FEE = 0.015;
const MONTHLY_INFRA_COST_CENTS = 82; 

const AdminDashboard: React.FC = () => {
    const [stats, setStats] = useState<PlatformStats | null>(null);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            // 1. Obtener Transacciones reales de la tabla de pagos
            const { data: transData, error: transError } = await supabase
                .from('platform_payments')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(10);
            
            if (transError) throw transError;

            // 2. Obtener Usuarios Totales
            const { count: userCount, error: userError } = await supabase
                .from('profiles')
                .select('*', { count: 'exact', head: true });
            
            if (userError) throw userError;

            // 3. Obtener Uso de IA Global
            const { data: aiData, error: aiError } = await supabase
                .from('profiles')
                .select('ai_credits');
            
            // Simulación: asumiendo créditos iniciales de 10 por usuario, calculamos el gasto aproximado
            const totalUsersForAi = userCount || 0;
            const currentAiCredits = aiData?.reduce((sum, p) => sum + (p.ai_credits || 0), 0) || 0;
            const totalAiUsed = (totalUsersForAi * 10) - currentAiCredits;

            // 4. Calcular Ingresos Totales de platform_payments
            const { data: revenueData } = await supabase
                .from('platform_payments')
                .select('amount_cents');
            
            const totalRevenue = revenueData?.reduce((sum, r) => sum + r.amount_cents, 0) || 0;

            setStats({
                totalRevenueCents: totalRevenue,
                totalUsers: userCount || 0,
                totalAiCreditsUsed: Math.max(0, totalAiUsed),
                transactionCount: revenueData?.length || 0
            });
            setTransactions(transData as Transaction[] || []);

        } catch (err: any) {
            console.error("Error fetching admin stats:", err);
            setError(err.message || "No se pudieron cargar las métricas de administración.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const netProfitCents = useMemo(() => {
        if (!stats) return 0;
        const stripeFees = (stats.transactionCount * STRIPE_FIXED_FEE_CENTS) + (stats.totalRevenueCents * STRIPE_PERCENT_FEE);
        return stats.totalRevenueCents - stripeFees - MONTHLY_INFRA_COST_CENTS;
    }, [stats]);

    const StatCard = ({ title, value, icon: Icon, color, subvalue }: any) => (
        <Card className="border-gray-800 bg-gray-900/50">
            <CardContent className="p-6">
                <div className="flex justify-between items-start">
                    <div>
                        <p className="text-xs font-black text-gray-500 uppercase tracking-widest mb-1">{title}</p>
                        <p className="text-2xl font-black text-white">{value}</p>
                        {subvalue && <p className="text-[10px] text-gray-400 mt-1">{subvalue}</p>}
                    </div>
                    <div className={`p-3 rounded-2xl ${color}`}>
                        <Icon className="w-5 h-5 text-white" />
                    </div>
                </div>
            </CardContent>
        </Card>
    );

    if (error) return (
        <div className="flex flex-col items-center justify-center py-20 text-center">
            <AlertTriangleIcon className="w-16 h-16 text-red-500 mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">Error de Acceso</h2>
            <p className="text-gray-400 max-w-md mb-6">{error}</p>
            <Button onClick={fetchData} variant="secondary">Reintentar</Button>
        </div>
    );

    return (
        <div className="space-y-8 max-w-7xl mx-auto pb-20">
            <header className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-black text-white tracking-tighter">Panel de Control Admin</h1>
                    <p className="text-gray-400 text-sm">Monitorización de ingresos y actividad global</p>
                </div>
                <button 
                    onClick={fetchData} 
                    className="p-3 bg-gray-900 border border-gray-800 rounded-xl hover:bg-gray-800 transition-colors"
                >
                    <RefreshCwIcon className={`w-5 h-5 text-primary-400 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {loading ? (
                    [1, 2, 3, 4].map(i => <Skeleton key={i} variant="rect" className="h-32 w-full rounded-2xl" />)
                ) : (
                    <>
                        <StatCard 
                            title="Ingresos Brutos" 
                            value={formatCurrency(stats?.totalRevenueCents || 0)} 
                            icon={DollarSignIcon} 
                            color="bg-primary-600 shadow-lg shadow-primary-500/20"
                        />
                        <StatCard 
                            title="Beneficio Neto Est." 
                            value={formatCurrency(netProfitCents)} 
                            icon={TrendingUpIcon} 
                            color="bg-green-600 shadow-lg shadow-green-500/20"
                            subvalue="Tras Stripe y Costes"
                        />
                        <StatCard 
                            title="Usuarios Totales" 
                            value={stats?.totalUsers} 
                            icon={UsersIcon} 
                            color="bg-blue-600 shadow-lg shadow-blue-500/20"
                        />
                        <StatCard 
                            title="Uso de IA" 
                            value={`${stats?.totalAiCreditsUsed} cred.`} 
                            icon={SparklesIcon} 
                            color="bg-purple-600 shadow-lg shadow-purple-500/20"
                        />
                    </>
                )}
            </div>

            <Card className="bg-gray-900 border-gray-800">
                <CardHeader className="flex justify-between items-center border-b border-gray-800">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <CreditCard className="w-5 h-5 text-primary-400" /> Transacciones Recientes
                    </h2>
                    <span className="text-xs font-bold text-gray-500 uppercase">Últimos Pagos en Directo</span>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-950/50 text-[10px] uppercase font-black text-gray-500 tracking-widest">
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
                                [1,2,3].map(i => (
                                    <tr key={i}><td colSpan={5} className="p-4"><Skeleton variant="text" className="w-full h-8" /></td></tr>
                                ))
                            ) : transactions.length > 0 ? transactions.map((t) => (
                                <tr key={t.id} className="hover:bg-white/[0.02] transition-colors">
                                    <td className="p-4 text-sm font-medium text-white">{t.user_email}</td>
                                    <td className="p-4">
                                        <span className="px-2 py-1 bg-gray-800 rounded-md text-[10px] font-bold text-gray-300 uppercase">
                                            {t.plan_name}
                                        </span>
                                    </td>
                                    <td className="p-4 text-sm font-black text-white">{formatCurrency(t.amount_cents)}</td>
                                    <td className="p-4 text-xs text-gray-500">{new Date(t.created_at).toLocaleDateString()}</td>
                                    <td className="p-4 text-right text-[10px] font-black uppercase text-green-400">
                                        <div className="flex items-center justify-end gap-1">
                                            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                                            Completado
                                        </div>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={5} className="p-16 text-center text-gray-500 text-sm italic">
                                        <div className="flex flex-col items-center">
                                            <ActivityIcon className="w-10 h-10 mb-2 opacity-20" />
                                            No hay transacciones registradas en la plataforma todavía.
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </CardContent>
            </Card>
        </div>
    );
};

export default AdminDashboard;
