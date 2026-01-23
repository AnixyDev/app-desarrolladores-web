import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCurrency } from '../../lib/utils.ts';

interface ProfitabilityData {
  name: string;
  profit: number;
}

interface ChartProps {
  data: ProfitabilityData[];
}

const ProfitabilityByClientChart: React.FC<ChartProps> = ({ data }) => {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" horizontal={false} />
        <XAxis type="number" tickFormatter={(value) => formatCurrency(value).replace('€', '')} tick={{ fill: '#a0a0a0' }} />
        <YAxis type="category" dataKey="name" tick={{ fill: '#a0a0a0' }} width={120} />
        <Tooltip
            contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #2c2c2c' }}
            cursor={{ fill: 'rgba(255, 255, 255, 0.1)' }}
            formatter={(value: number) => formatCurrency(value)}
        />
        <Bar dataKey="profit" name="Beneficio Neto" fill="#f000b8" />
      </BarChart>
    </ResponsiveContainer>
  );
};

export default ProfitabilityByClientChart;