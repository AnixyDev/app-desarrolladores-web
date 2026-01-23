import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { Invoice } from '../../types';

interface ChartProps {
  invoices: Invoice[];
}

const formatCurrency = (value: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value / 100);

const processChartData = (invoices: Invoice[]) => {
    const dataByMonth: { [key: string]: { name: string; ingresos: number } } = {};
    const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

    invoices.forEach(invoice => {
        if (invoice.paid && invoice.payment_date) {
            const date = new Date(invoice.payment_date);
            const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
            if (!dataByMonth[monthKey]) {
                dataByMonth[monthKey] = { name: monthNames[date.getMonth()], ingresos: 0 };
            }
            dataByMonth[monthKey].ingresos += invoice.total_cents;
        }
    });

    return Object.values(dataByMonth).sort((a,b) => {
        const aIndex = monthNames.indexOf(a.name.split(' ')[0]);
        const bIndex = monthNames.indexOf(b.name.split(' ')[0]);
        return aIndex - bIndex;
    });
};

const ClientIncomeChart: React.FC<ChartProps> = ({ invoices }) => {
  const data = processChartData(invoices);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" vertical={false} />
        <XAxis dataKey="name" tick={{ fill: '#a0a0a0' }} />
        <YAxis tickFormatter={(value) => `€${Number(value) / 100}`} tick={{ fill: '#a0a0a0' }}/>
        <Tooltip
            contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #2c2c2c' }}
            cursor={{ fill: 'rgba(240, 0, 184, 0.1)' }}
            formatter={(value: number) => formatCurrency(value)} 
        />
        <Legend wrapperStyle={{ color: '#a0a0a0' }}/>
        <Bar dataKey="ingresos" fill="#f000b8" name="Ingresos" />
      </BarChart>
    </ResponsiveContainer>
  );
};

export default ClientIncomeChart;