'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatUsd } from '@/lib/utils';

export function SpendOverTime({
  data,
}: {
  data: { date: string; costUsd: number }[];
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-500">
        Nessun consumo registrato ancora.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#818cf8" stopOpacity={0.55} />
            <stop offset="100%" stopColor="#818cf8" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="rgba(148,163,184,0.12)"
          vertical={false}
        />
        <XAxis
          dataKey="date"
          tick={{ fill: '#64748b', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(d: string) => d.slice(5)}
          minTickGap={24}
        />
        <YAxis
          tick={{ fill: '#64748b', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={52}
          tickFormatter={(v: number) => formatUsd(v)}
        />
        <Tooltip
          contentStyle={{
            background: 'rgba(15,23,42,0.95)',
            border: '1px solid rgba(148,163,184,0.2)',
            borderRadius: 12,
            color: '#e2e8f0',
            fontSize: 12,
          }}
          formatter={(v: number) => [formatUsd(v), 'Costo']}
        />
        <Area
          type="monotone"
          dataKey="costUsd"
          stroke="#a5b4fc"
          strokeWidth={2}
          fill="url(#spendFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
