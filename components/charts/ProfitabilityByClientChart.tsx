import React, { useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

import { formatCurrency } from '@/lib/utils';

interface ProfitabilityData {
  name: string;
  profit: number;
}

interface ChartProps {
  data: ProfitabilityData[];
}

/**
 * Hook simple para detectar móvil
 */
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  );

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  return isMobile;
}

const ProfitabilityByClientChart: React.FC<ChartProps> = ({ data }) => {
  const isMobile = useIsMobile();

  // Altura dinámica: en móvil más alto para que quepan las filas
  const chartHeight = isMobile
    ? Math.max(240, data.length * 48)
    : 300;

  return (
    <div className="w-full overflow-x-hidden">
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{
            top: 8,
            right: 16,
            left: 8,
            bottom: 8
          }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#2c2c2c"
            horizontal={false}
          />

          <XAxis
            type="number"
            tickFormatter={(value) =>
              formatCurrency(value).replace('€', '')
            }
            tick={{ fill: '#a0a0a0', fontSize: 12 }}
          />

          <YAxis
            type="category"
            dataKey="name"
            tick={{ fill: '#a0a0a0', fontSize: 12 }}
            width={isMobile ? 70 : 140}
            tickFormatter={(value: string) =>
              isMobile && value.length > 10
                ? value.slice(0, 10) + '…'
                : value
            }
          />

          <Tooltip
            contentStyle={{
              backgroundColor: '#1a1a1a',
              border: '1px solid #2c2c2c'
            }}
            cursor={{ fill: 'rgba(255,255,255,0.08)' }}
            formatter={(value: number) => formatCurrency(value)}
            labelFormatter={(label: string) => label}
          />

          <Bar
            dataKey="profit"
            name="Beneficio neto"
            fill="#f000b8"
            barSize={isMobile ? 18 : 22}
            radius={[4, 4, 4, 4]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default ProfitabilityByClientChart;
