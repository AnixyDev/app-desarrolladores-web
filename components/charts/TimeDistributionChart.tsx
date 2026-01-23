import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

interface TimeDistributionChartProps {
    data: { name: string; value: number }[];
}

const COLORS = ['#f000b8', '#a21caf', '#6b21a8', '#4c1d95', '#312e81'];

const TimeDistributionChart: React.FC<TimeDistributionChartProps> = ({ data }) => {
    return (
        <ResponsiveContainer width="100%" height={300}>
            <PieChart>
                <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={110}
                    fill="#8884d8"
                    dataKey="value"
                    nameKey="name"
                >
                    {data.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                </Pie>
                <Tooltip
                    contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #2c2c2c' }}
                    formatter={(value: number) => `${value.toFixed(2)} horas`}
                />
                <Legend wrapperStyle={{ color: '#a0a0a0' }} />
            </PieChart>
        </ResponsiveContainer>
    );
};

export default TimeDistributionChart;