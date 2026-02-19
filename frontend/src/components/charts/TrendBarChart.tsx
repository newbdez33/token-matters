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
  comparisonData?: DailyTrendEntry[];
}

function CustomTooltip(props: {
  active?: boolean;
  payload?: ReadonlyArray<{ dataKey?: string; value?: number }>;
  label?: string | number;
  dataKey: string;
}) {
  const { active, payload, label, dataKey } = props;
  if (!active || !payload?.length) return null;

  const primary = payload.find((p) => p.dataKey === dataKey);
  const comparison = payload.find((p) => p.dataKey === `comparison_${dataKey}`);

  function formatValue(v: number) {
    if (dataKey === 'totalTokens') return `${v.toLocaleString()} tokens`;
    return formatCost(v);
  }

  return (
    <div className="border bg-background px-3 py-2 text-xs">
      <p className="text-muted-foreground mb-1">{label}</p>
      {primary && (
        <p className="font-mono tabular-nums">{formatValue(primary.value as number)}</p>
      )}
      {comparison && (
        <p className="font-mono tabular-nums text-muted-foreground">
          vs {formatValue(comparison.value as number)}
        </p>
      )}
    </div>
  );
}

export function TrendBarChart({ data, dataKey = 'cost', comparisonData }: TrendBarChartProps) {
  const chartData = data.map((d, i) => {
    const entry: Record<string, unknown> = {
      ...d,
      label: formatDateShort(d.date),
    };
    if (comparisonData?.[i]) {
      entry[`comparison_${dataKey}`] = comparisonData[i][dataKey as keyof DailyTrendEntry];
    }
    return entry;
  });

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
        <Tooltip
          content={(props) => <CustomTooltip {...props} dataKey={dataKey} />}
          cursor={{ fill: 'hsl(var(--muted))' }}
        />
        {comparisonData && (
          <Bar
            dataKey={`comparison_${dataKey}`}
            fill="hsl(var(--muted-foreground))"
            opacity={0.25}
            radius={0}
          />
        )}
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
