import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { Invoice, Expense } from '@/types';

interface ChartProps {
  invoices: Invoice[];
  expenses: Expense[];
}

const formatCurrency = (value: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value / 100);

const processChartData = (invoices: Invoice[] = [], expenses: Expense[] = []) => {
    const dataByMonth: { [key: string]: { name: string; ingresos: number; gastos: number } } = {};
    const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

    // FIX: Usamos el operador opcional o inicializamos como array vacío para evitar el error .forEach
    (invoices || []).forEach(invoice => {
        if (invoice.paid && invoice.payment_date) {
            const date = new Date(invoice.payment_date);
            const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
            if (!dataByMonth[monthKey]) {
                dataByMonth[monthKey] = { name: monthNames[date.getMonth()], ingresos: 0, gastos: 0 };
            }
            dataByMonth[monthKey].ingresos += invoice.total_cents;
        }
    });

    (expenses || []).forEach(expense => {
        const date = new Date(expense.date);
        const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
        if (!dataByMonth[monthKey]) {
            dataByMonth[monthKey] = { name: monthNames[date.getMonth()], ingresos: 0, gastos: 0 };
        }
        dataByMonth[monthKey].gastos += expense.amount_cents;
    });

    return Object.values(dataByMonth).sort((a,b) => monthNames.indexOf(a.name) - monthNames.indexOf(b.name));
};


const IncomeExpenseChart: React.FC<ChartProps> = ({ invoices, expenses }) => {
  // Si no hay datos, mostramos un estado de carga amigable en lugar de romper la app
  if (!invoices && !expenses) {
    return (
      <div className="h-[300px] w-full flex items-center justify-center text-gray-500 bg-gray-900/50 rounded-xl border border-gray-800">
        <p className="animate-pulse">Cargando estadísticas financieras...</p>
      </div>
    );
  }

  const data = processChartData(invoices, expenses);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" vertical={false} />
        <XAxis dataKey="name" tick={{ fill: '#a0a0a0' }} />
        <YAxis tickFormatter={(value) => `€${Number(value) / 100}`} tick={{ fill: '#a0a0a0' }}/>
        <Tooltip
            contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #2c2c2c' }}
            cursor={{ fill: 'rgba(255, 255, 255, 0.1)' }}
            formatter={(value: number) => formatCurrency(value)} 
        />
        <Legend wrapperStyle={{ color: '#a0a0a0' }}/>
        <Bar dataKey="ingresos" fill="#f000b8" name="Ingresos" radius={[4, 4, 0, 0]} />
        <Bar dataKey="gastos" fill="#ef4444" name="Gastos" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
};

export default IncomeExpenseChart;