import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useDataStore } from '@/stores/useDataStore';
import { getProviderConfig } from '@/config/providers';
import { formatCost, formatTokens, formatNumber, formatDate } from '@/utils/format';
import { TrendBarChart } from '@/components/charts/TrendBarChart';
import { LoadingSkeleton, LoadingBlock } from '@/components/shared/LoadingSkeleton';
import { ErrorMessage } from '@/components/shared/ErrorMessage';
import type { ProviderAllTime } from '@/types/summary';

export function ProviderPage() {
  const { id } = useParams<{ id: string }>();
  const { fetchProvider } = useDataStore();
  const [data, setData] = useState<ProviderAllTime | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    fetchProvider(id)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setIsLoading(false));
  }, [id, fetchProvider]);

  const config = getProviderConfig(id ?? '');

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
        <h1 className="text-2xl font-light tracking-tight">{config.name}</h1>
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Cost</p>
            <p className="text-lg font-light font-mono tabular-nums">
              {formatCost(totals.cost.totalUSD)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Total Tokens</p>
            <p className="text-lg font-light font-mono tabular-nums">
              {formatTokens(totals.totalTokens)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Requests</p>
            <p className="text-lg font-light font-mono tabular-nums">
              {formatNumber(totals.requests)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Billing</p>
            <p className="text-sm">{config.billingMode}</p>
          </div>
        </div>
      </section>

      <hr className="border-border" />

      {/* Trend */}
      <section>
        <h2 className="text-xs text-muted-foreground uppercase tracking-wider mb-4">
          Daily Trend
        </h2>
        <TrendBarChart data={dailyTrend} />
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
              <div key={item.label} className="flex items-center gap-4">
                <span className="text-sm w-32 text-muted-foreground">{item.label}</span>
                <div className="flex-1 h-2 bg-muted">
                  <div
                    className="h-full bg-foreground opacity-60"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-sm font-mono tabular-nums w-20 text-right">
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
