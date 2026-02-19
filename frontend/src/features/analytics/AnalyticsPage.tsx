import { useEffect, useState, useCallback } from 'react';
import { useDataStore } from '@/stores/useDataStore';
import { useFilterStore } from '@/stores/useFilterStore';
import { formatCost, formatDate, formatPercent } from '@/utils/format';
import { TrendBarChart } from '@/components/charts/TrendBarChart';
import { ProviderBreakdownTable } from '@/components/charts/ProviderBreakdownTable';
import { ModelBreakdownTable } from '@/components/charts/ModelBreakdownTable';
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton';
import { ErrorMessage } from '@/components/shared/ErrorMessage';
import type { DailyTrendEntry, ProviderSummary, TokenTotals, ModelSummary } from '@/types/summary';

type FileEntry = { key: string; label: string };

export function AnalyticsPage() {
  const { meta, initialize } = useDataStore();
  const { granularity, setGranularity } = useFilterStore();
  const { fetchDaily, fetchWeekly, fetchMonthly } = useDataStore();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [trend, setTrend] = useState<DailyTrendEntry[]>([]);
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [totals, setTotals] = useState<TokenTotals | null>(null);
  const [models, setModels] = useState<ModelSummary[]>([]);
  const [dateLabel, setDateLabel] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Comparison state
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [comparisonFile, setComparisonFile] = useState<string | null>(null);
  const [comparisonTrend, setComparisonTrend] = useState<DailyTrendEntry[]>([]);
  const [comparisonTotals, setComparisonTotals] = useState<TokenTotals | null>(null);

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
          setModels(data.byModel ?? []);
          setDateLabel(formatDate(data.date));
        } else if (granularity === 'weekly') {
          const data = await fetchWeekly(key);
          setTrend(data.dailyTrend);
          setProviders(data.byProvider);
          setTotals(data.totals);
          setModels([]);
          setDateLabel(`${formatDate(data.dateRange.start)} – ${formatDate(data.dateRange.end)}`);
        } else {
          const data = await fetchMonthly(key);
          setTrend(data.dailyTrend);
          setProviders(data.byProvider);
          setTotals(data.totals);
          setModels([]);
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

  const loadComparison = useCallback(
    async (key: string) => {
      setComparisonFile(key);
      try {
        if (granularity === 'daily') {
          const data = await fetchDaily(key);
          setComparisonTrend([{ date: data.date, totalTokens: data.totals.totalTokens, cost: data.totals.cost.totalUSD }]);
          setComparisonTotals(data.totals);
        } else if (granularity === 'weekly') {
          const data = await fetchWeekly(key);
          setComparisonTrend(data.dailyTrend);
          setComparisonTotals(data.totals);
        } else {
          const data = await fetchMonthly(key);
          setComparisonTrend(data.dailyTrend);
          setComparisonTotals(data.totals);
        }
      } catch {
        setComparisonTotals(null);
        setComparisonTrend([]);
      }
    },
    [granularity, fetchDaily, fetchWeekly, fetchMonthly],
  );

  function clearComparison() {
    setCompareEnabled(false);
    setComparisonFile(null);
    setComparisonTrend([]);
    setComparisonTotals(null);
  }

  function deltaPercent(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  }

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
                setModels([]);
                clearComparison();
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

        {selectedFile && (
          <button
            onClick={() => {
              if (compareEnabled) {
                clearComparison();
              } else {
                setCompareEnabled(true);
              }
            }}
            className={`px-3 py-1 text-xs border transition-colors ${
              compareEnabled
                ? 'bg-foreground text-background'
                : 'bg-background text-muted-foreground hover:text-foreground'
            }`}
          >
            Compare
          </button>
        )}

        {compareEnabled && files.length > 0 && (
          <select
            value={comparisonFile ?? ''}
            onChange={(e) => {
              if (e.target.value) loadComparison(e.target.value);
            }}
            className="border bg-background px-3 py-1 text-sm w-full sm:w-auto"
          >
            <option value="">Compare with...</option>
            {[...files].reverse().filter((f) => f.key !== selectedFile).map((f) => (
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
          {/* Stats — with optional comparison */}
          <section>
            <p className="text-xs text-muted-foreground mb-2">{dateLabel}</p>
            {comparisonTotals ? (
              <div className="grid grid-cols-2 gap-4">
                {/* Current period */}
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Current</p>
                  <p className="text-2xl font-light font-mono tabular-nums tracking-tight">
                    {totals.totalTokens.toLocaleString()}
                  </p>
                  <span className="text-xs text-muted-foreground">tokens</span>
                  <p className="text-sm text-muted-foreground font-mono tabular-nums">
                    {formatCost(totals.cost.totalUSD)}
                  </p>
                </div>
                {/* Comparison period */}
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Comparison</p>
                  <p className="text-2xl font-light font-mono tabular-nums tracking-tight text-muted-foreground">
                    {comparisonTotals.totalTokens.toLocaleString()}
                  </p>
                  <span className="text-xs text-muted-foreground">tokens</span>
                  <p className="text-sm text-muted-foreground font-mono tabular-nums">
                    {formatCost(comparisonTotals.cost.totalUSD)}
                  </p>
                </div>
                {/* Deltas */}
                <div className="col-span-2 flex gap-4 text-xs text-muted-foreground">
                  <span>
                    Tokens:{' '}
                    <span className="font-mono tabular-nums">
                      {formatPercent(deltaPercent(totals.totalTokens, comparisonTotals.totalTokens))}
                    </span>
                  </span>
                  <span>
                    Cost:{' '}
                    <span className="font-mono tabular-nums">
                      {formatPercent(deltaPercent(totals.cost.totalUSD, comparisonTotals.cost.totalUSD))}
                    </span>
                  </span>
                </div>
              </div>
            ) : (
              <>
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
              </>
            )}
          </section>

          {trend.length > 1 && (
            <>
              <hr className="border-border" />
              <section>
                <h2 className="text-xs text-muted-foreground uppercase tracking-wider mb-4">
                  Trend
                </h2>
                <TrendBarChart
                  data={trend}
                  dataKey="totalTokens"
                  comparisonData={comparisonTrend.length > 1 ? comparisonTrend : undefined}
                />
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

          {/* Model breakdown — daily only */}
          {granularity === 'daily' && models.length > 0 && (
            <>
              <hr className="border-border" />
              <section>
                <h2 className="text-xs text-muted-foreground uppercase tracking-wider mb-4">
                  By Model
                </h2>
                <ModelBreakdownTable models={models} />
              </section>
            </>
          )}
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
