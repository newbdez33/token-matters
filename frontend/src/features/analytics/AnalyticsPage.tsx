import { useEffect, useState, useCallback } from 'react';
import { useDataStore } from '@/stores/useDataStore';
import { useFilterStore } from '@/stores/useFilterStore';
import { formatCost, formatDate } from '@/utils/format';
import { TrendBarChart } from '@/components/charts/TrendBarChart';
import { ProviderBreakdownTable } from '@/components/charts/ProviderBreakdownTable';
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton';
import { ErrorMessage } from '@/components/shared/ErrorMessage';
import type { DailyTrendEntry, ProviderSummary, TokenTotals } from '@/types/summary';

type FileEntry = { key: string; label: string };

export function AnalyticsPage() {
  const { meta, initialize } = useDataStore();
  const { granularity, setGranularity } = useFilterStore();
  const { fetchDaily, fetchWeekly, fetchMonthly } = useDataStore();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [trend, setTrend] = useState<DailyTrendEntry[]>([]);
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [totals, setTotals] = useState<TokenTotals | null>(null);
  const [dateLabel, setDateLabel] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initialize();
  }, [initialize]);

  const files: FileEntry[] = (() => {
    if (!meta) return [];
    if (granularity === 'daily') {
      return meta.dailyFiles.map((f) => ({
        key: f.replace('.json', ''),
        label: f.replace('.json', ''),
      }));
    }
    if (granularity === 'weekly') {
      return meta.weeklyFiles.map((f) => ({
        key: f.replace('.json', ''),
        label: f.replace('.json', ''),
      }));
    }
    return meta.monthlyFiles.map((f) => ({
      key: f.replace('.json', ''),
      label: f.replace('.json', ''),
    }));
  })();

  const loadFile = useCallback(
    async (key: string) => {
      setIsLoading(true);
      setError(null);
      setSelectedFile(key);
      try {
        if (granularity === 'daily') {
          const data = await fetchDaily(key);
          setTrend([{ date: data.date, totalTokens: data.totals.totalTokens, cost: data.totals.cost.totalUSD }]);
          setProviders(data.byProvider);
          setTotals(data.totals);
          setDateLabel(formatDate(data.date));
        } else if (granularity === 'weekly') {
          const data = await fetchWeekly(key);
          setTrend(data.dailyTrend);
          setProviders(data.byProvider);
          setTotals(data.totals);
          setDateLabel(`${formatDate(data.dateRange.start)} – ${formatDate(data.dateRange.end)}`);
        } else {
          const data = await fetchMonthly(key);
          setTrend(data.dailyTrend);
          setProviders(data.byProvider);
          setTotals(data.totals);
          setDateLabel(`${formatDate(data.dateRange.start)} – ${formatDate(data.dateRange.end)}`);
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setIsLoading(false);
      }
    },
    [granularity, fetchDaily, fetchWeekly, fetchMonthly],
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-light tracking-tight">Analytics</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Browse historical data by day, week, or month
        </p>
      </div>

      <hr className="border-border" />

      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 sm:gap-4">
        <div className="flex gap-1">
          {(['daily', 'weekly', 'monthly'] as const).map((g) => (
            <button
              key={g}
              onClick={() => {
                setGranularity(g);
                setSelectedFile(null);
                setTotals(null);
              }}
              className={`px-3 py-1 text-xs border capitalize transition-colors ${
                granularity === g
                  ? 'bg-foreground text-background'
                  : 'bg-background text-muted-foreground hover:text-foreground'
              }`}
            >
              {g}
            </button>
          ))}
        </div>

        {files.length > 0 && (
          <select
            value={selectedFile ?? ''}
            onChange={(e) => {
              if (e.target.value) loadFile(e.target.value);
            }}
            className="border bg-background px-3 py-1 text-sm w-full sm:w-auto"
          >
            <option value="">Select {granularity} period...</option>
            {[...files].reverse().map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Content */}
      {isLoading && <LoadingSkeleton lines={5} />}
      {error && <ErrorMessage message={error} />}

      {totals && !isLoading && (
        <>
          <section>
            <p className="text-xs text-muted-foreground mb-2">{dateLabel}</p>
            <div className="flex flex-wrap items-baseline gap-2 sm:gap-3 mb-2">
              <p className="text-2xl sm:text-3xl font-light font-mono tabular-nums tracking-tight">
                {totals.totalTokens.toLocaleString()}
              </p>
              <span className="text-xs text-muted-foreground">tokens</span>
              <span className="text-sm text-muted-foreground font-mono tabular-nums">
                {formatCost(totals.cost.totalUSD)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {totals.requests.toLocaleString()} requests
            </p>
          </section>

          {trend.length > 1 && (
            <>
              <hr className="border-border" />
              <section>
                <h2 className="text-xs text-muted-foreground uppercase tracking-wider mb-4">
                  Trend
                </h2>
                <TrendBarChart data={trend} />
              </section>
            </>
          )}

          <hr className="border-border" />
          <section>
            <h2 className="text-xs text-muted-foreground uppercase tracking-wider mb-4">
              By Product
            </h2>
            <ProviderBreakdownTable providers={providers} />
          </section>
        </>
      )}

      {!totals && !isLoading && !error && (
        <p className="text-sm text-muted-foreground">
          Select a time period to view analytics.
        </p>
      )}
    </div>
  );
}
