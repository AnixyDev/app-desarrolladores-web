import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface WeeklyHoursChartProps {
    data: { name: string; hours: number }[];
}

const WeeklyHoursChart: React.FC<WeeklyHoursChartProps> = ({ data }) => {
    return (
        <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#a0a0a0' }} />
                <YAxis tickFormatter={(value) => `${value}h`} tick={{ fill: '#a0a0a0' }} />
                <Tooltip
                    contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #2c2c2c' }}
                    cursor={{ fill: 'rgba(240, 0, 184, 0.1)' }}
                    formatter={(value: number) => [`${value.toFixed(2)} horas`, 'Horas registradas']}
                    labelStyle={{ color: '#ffffff' }}
                />
                <Bar dataKey="hours" fill="#f000b8" name="Horas" />
            </BarChart>
        </ResponsiveContainer>
    );
};

export default WeeklyHoursChart;