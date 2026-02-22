import { useEffect } from 'react';
import { useDataStore } from '@/stores/useDataStore';
import { useFilterStore } from '@/stores/useFilterStore';
import { formatCost, formatNumber, formatDate } from '@/utils/format';
import { TrendBarChart } from '@/components/charts/TrendBarChart';
import { ProviderBreakdownTable } from '@/components/charts/ProviderBreakdownTable';
import { ModelBreakdownTable } from '@/components/charts/ModelBreakdownTable';
import { MachineBreakdownTable } from '@/components/charts/MachineBreakdownTable';
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
        <div className="flex flex-wrap items-baseline gap-2 sm:gap-3">
          <p className="text-3xl sm:text-4xl font-light font-mono tabular-nums tracking-tight">
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

      {/* By Machine */}
      {period.byMachine && period.byMachine.length > 0 && (
        <>
          <hr className="border-border" />
          <section>
            <h2 className="text-xs text-muted-foreground uppercase tracking-wider mb-4">
              By Machine
            </h2>
            <MachineBreakdownTable machines={period.byMachine} />
          </section>
        </>
      )}

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
        <TrendBarChart data={trendData} dataKey="totalTokens" />
      </section>

      <hr className="border-border" />

      {/* Latest Day */}
      {today && (
        <>
          <section>
            <h2 className="text-xs text-muted-foreground uppercase tracking-wider mb-4">
              {formatDate(today.date)}
            </h2>
            <div>
              <div className="flex flex-wrap items-baseline gap-2 sm:gap-3">
                <p className="text-2xl font-light font-mono tabular-nums tracking-tight">
                  {today.totals.totalTokens.toLocaleString()}
                </p>
                <span className="text-xs text-muted-foreground">tokens</span>
                <span className="text-sm text-muted-foreground font-mono tabular-nums">
                  {formatCost(today.totals.cost.totalUSD)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {formatNumber(today.totals.requests)} requests
              </p>
            </div>
          </section>

          {/* Machines */}
          {today.byMachine && today.byMachine.length > 0 && (
            <>
              <hr className="border-border" />
              <section>
                <h2 className="text-xs text-muted-foreground uppercase tracking-wider mb-4">
                  Machines · {formatDate(today.date)}
                </h2>
                <MachineBreakdownTable machines={today.byMachine} />
              </section>
            </>
          )}

          {/* Models */}
          {today.byModel && today.byModel.length > 0 && (
            <>
              <hr className="border-border" />
              <section>
                <h2 className="text-xs text-muted-foreground uppercase tracking-wider mb-4">
                  Models · {formatDate(today.date)}
                </h2>
                <ModelBreakdownTable models={today.byModel} />
              </section>
            </>
          )}
        </>
      )}

      {/* Last Updated */}
      <p className="text-[10px] text-muted-foreground pt-4">
        Last updated: {formatDate(latest.lastUpdated, 'MMM D, YYYY HH:mm')} JST
      </p>
    </div>
  );
}
