import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { DailyTrendEntry } from '@/types/summary';
import { formatCost, formatDateShort } from '@/utils/format';

interface TrendBarChartProps {
  data: DailyTrendEntry[];
  dataKey?: 'cost' | 'totalTokens';
}

function CustomTooltip(props: { active?: boolean; payload?: ReadonlyArray<{ value?: number }>; label?: string | number }) {
  const { active, payload, label } = props;
  if (!active || !payload?.length) return null;
  return (
    <div className="border bg-background px-3 py-2 text-xs">
      <p className="text-muted-foreground mb-1">{label}</p>
      <p className="font-mono tabular-nums">{formatCost(payload[0].value as number)}</p>
    </div>
  );
}

export function TrendBarChart({ data, dataKey = 'cost' }: TrendBarChartProps) {
  const chartData = data.map((d) => ({
    ...d,
    label: formatDateShort(d.date),
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <XAxis
          dataKey="label"
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
          interval="preserveStartEnd"
        />
        <YAxis hide />
        <Tooltip content={(props) => <CustomTooltip {...props} />} cursor={{ fill: 'hsl(var(--muted))' }} />
        <Bar
          dataKey={dataKey}
          fill="hsl(var(--foreground))"
          opacity={0.7}
          radius={0}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
