import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useDataStore } from '@/stores/useDataStore';
import { formatCost, formatTokens, formatNumber, formatDate } from '@/utils/format';
import { TrendBarChart } from '@/components/charts/TrendBarChart';
import { LoadingSkeleton, LoadingBlock } from '@/components/shared/LoadingSkeleton';
import { ErrorMessage } from '@/components/shared/ErrorMessage';
import type { MachineAllTime } from '@/types/summary';

export function MachinePage() {
  const { id } = useParams<{ id: string }>();
  const { fetchMachine } = useDataStore();
  const [data, setData] = useState<MachineAllTime | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    fetchMachine(id)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setIsLoading(false));
  }, [id, fetchMachine]);

  if (isLoading) {
    return (
      <div className="space-y-8">
        <LoadingBlock />
        <LoadingSkeleton lines={4} />
      </div>
    );
  }

  if (error) {
    return <ErrorMessage message={error} />;
  }

  if (!data) return null;

  const { totals, dailyTrend, dateRange } = data;

  return (
    <div className="space-y-8">
      <div>
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground no-underline mb-4"
        >
          <ArrowLeft className="h-3 w-3" />
          Dashboard
        </Link>
        <h1 className="text-2xl font-light tracking-tight">{data.machine}</h1>
        <p className="text-xs text-muted-foreground mt-1">
          {formatDate(dateRange.start)} – {formatDate(dateRange.end)}
        </p>
      </div>

      <hr className="border-border" />

      {/* Totals */}
      <section>
        <h2 className="text-xs text-muted-foreground uppercase tracking-wider mb-4">
          Totals
        </h2>
        <div className="flex flex-wrap items-baseline gap-2 sm:gap-3 mb-3">
          <p className="text-2xl sm:text-3xl font-light font-mono tabular-nums tracking-tight">
            {totals.totalTokens.toLocaleString()}
          </p>
          <span className="text-xs text-muted-foreground">tokens</span>
          <span className="text-sm text-muted-foreground font-mono tabular-nums">
            {formatCost(totals.cost.totalUSD)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {formatNumber(totals.requests)} requests
        </p>
      </section>

      <hr className="border-border" />

      {/* Trend */}
      <section>
        <h2 className="text-xs text-muted-foreground uppercase tracking-wider mb-4">
          Daily Trend
        </h2>
        <TrendBarChart data={dailyTrend} dataKey="totalTokens" />
      </section>

      <hr className="border-border" />

      {/* Token Breakdown */}
      <section>
        <h2 className="text-xs text-muted-foreground uppercase tracking-wider mb-4">
          Token Breakdown
        </h2>
        <div className="space-y-3">
          {[
            { label: 'Input', value: totals.inputTokens },
            { label: 'Output', value: totals.outputTokens },
            { label: 'Cache Creation', value: totals.cacheCreationTokens },
            { label: 'Cache Read', value: totals.cacheReadTokens },
          ].map((item) => {
            const pct = totals.totalTokens > 0
              ? (item.value / totals.totalTokens) * 100
              : 0;
            return (
              <div key={item.label} className="flex items-center gap-2 sm:gap-4">
                <span className="text-xs sm:text-sm w-20 sm:w-32 shrink-0 text-muted-foreground">{item.label}</span>
                <div className="flex-1 h-2 bg-muted">
                  <div
                    className="h-full bg-foreground opacity-60"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs sm:text-sm font-mono tabular-nums w-16 sm:w-20 text-right shrink-0">
                  {formatTokens(item.value)}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
