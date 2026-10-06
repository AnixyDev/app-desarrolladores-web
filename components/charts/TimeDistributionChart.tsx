import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface TimeDistributionChartProps {
    data: { name: string; value: number }[];
}

// 8 colores distintos antes de repetir (con 6 proyectos, el 6.º repetía el del 1.º).
const COLORS = ['#f000b8', '#a21caf', '#7c3aed', '#4f46e5', '#2563eb', '#0891b2', '#0d9488', '#db2777'];

const horas = (h: number) => `${h.toLocaleString('es-ES', { maximumFractionDigits: 1 })} h`;

// La leyenda va fuera del gráfico, como lista: con 5 o más proyectos la de
// recharts ocupaba dos líneas y se montaba sobre el círculo (radio fijo), y
// cada nombre iba en el color de su porción, ilegible en los morados oscuros.
const TimeDistributionChart: React.FC<TimeDistributionChartProps> = ({ data }) => {
    const total = data.reduce((s, d) => s + d.value, 0);
    return (
        <div>
            <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                    <Pie
                        data={data}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius="90%"
                        stroke="#111827"
                        dataKey="value"
                        nameKey="name"
                        isAnimationActive={false}
                    >
                        {data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                    </Pie>
                    <Tooltip
                        contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                        itemStyle={{ color: '#f3f4f6' }}
                        formatter={(value: number) => horas(value)}
                    />
                </PieChart>
            </ResponsiveContainer>
            <ul className="mt-4 space-y-2" aria-label="Horas por proyecto">
                {data.map((d, i) => (
                    <li key={d.name} className="flex items-center gap-3 text-sm">
                        <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: COLORS[i % COLORS.length] }} aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate text-gray-200" title={d.name}>{d.name}</span>
                        <span className="shrink-0 tabular-nums text-gray-400">
                            {horas(d.value)}{total > 0 && ` · ${Math.round((d.value / total) * 100)} %`}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default TimeDistributionChart;
