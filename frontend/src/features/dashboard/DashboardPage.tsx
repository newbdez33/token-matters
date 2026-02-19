import { useEffect } from 'react';
import { useDataStore } from '@/stores/useDataStore';
import { useFilterStore } from '@/stores/useFilterStore';
import { formatCost, formatTokens, formatNumber, formatDate } from '@/utils/format';
import { TrendBarChart } from '@/components/charts/TrendBarChart';
import { ProviderBreakdownTable } from '@/components/charts/ProviderBreakdownTable';
import { LoadingSkeleton, LoadingBlock } from '@/components/shared/LoadingSkeleton';
import { ErrorMessage } from '@/components/shared/ErrorMessage';

export function DashboardPage() {
  const { latest, isLoading, error, initialize } = useDataStore();
  const { trendRange, setTrendRange } = useFilterStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (isLoading && !latest) {
    return (
      <div className="space-y-8">
        <LoadingBlock />
        <LoadingSkeleton lines={5} />
        <LoadingSkeleton lines={4} />
      </div>
    );
  }

  if (error) {
    return <ErrorMessage message={error} onRetry={initialize} />;
  }

  if (!latest) return null;

  const period = trendRange === '7d' ? latest.last7Days : latest.last30Days;
  const trendData = period.dailyTrend;
  const totalCost = period.totals.cost.totalUSD;
  const providers = period.byProvider;
  const today = latest.today;

  return (
    <div className="space-y-8">
      {/* Monthly Total */}
      <section>
        <h2 className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
          {trendRange === '7d' ? 'Last 7 Days' : 'Last 30 Days'} Total
        </h2>
        <div className="flex items-baseline gap-3">
          <p className="text-4xl font-light font-mono tabular-nums tracking-tight">
            {period.totals.totalTokens.toLocaleString()}
          </p>
          <span className="text-xs text-muted-foreground">tokens</span>
          <span className="text-sm text-muted-foreground font-mono tabular-nums">
            {formatCost(totalCost)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {formatDate(period.dateRange.start)} – {formatDate(period.dateRange.end)}
        </p>
      </section>

      <hr className="border-border" />

      {/* By Product */}
      <section>
        <h2 className="text-xs text-muted-foreground uppercase tracking-wider mb-4">
          By Product
        </h2>
        <ProviderBreakdownTable providers={providers} />
      </section>

      <hr className="border-border" />

      {/* Daily Trend */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs text-muted-foreground uppercase tracking-wider">
            Daily Trend
          </h2>
          <div className="flex gap-1">
            {(['7d', '30d'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setTrendRange(range)}
                className={`px-2 py-0.5 text-xs border transition-colors ${
                  trendRange === range
                    ? 'bg-foreground text-background'
                    : 'bg-background text-muted-foreground hover:text-foreground'
                }`}
              >
                {range}
              </button>
            ))}
          </div>
        </div>
        <TrendBarChart data={trendData} />
      </section>

      <hr className="border-border" />

      {/* Today */}
      <section>
        <h2 className="text-xs text-muted-foreground uppercase tracking-wider mb-4">
          Today
        </h2>
        {today ? (
          <div className="grid grid-cols-3 gap-6">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Tokens</p>
              <p className="text-lg font-light font-mono tabular-nums">
                {formatTokens(today.totals.totalTokens)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Requests</p>
              <p className="text-lg font-light font-mono tabular-nums">
                {formatNumber(today.totals.requests)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Cost</p>
              <p className="text-lg font-light font-mono tabular-nums">
                {formatCost(today.totals.cost.totalUSD)}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No data for today yet.</p>
        )}
      </section>

      {/* Last Updated */}
      <p className="text-[10px] text-muted-foreground pt-4">
        Last updated: {formatDate(latest.lastUpdated, 'MMM D, YYYY HH:mm')}
      </p>
    </div>
  );
}
