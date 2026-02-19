import { useState } from 'react';
import { useThemeStore } from '@/stores/useThemeStore';
import { useDataStore } from '@/stores/useDataStore';
import { clearCache, getCacheStats } from '@/services/cache';
import { formatDate } from '@/utils/format';
import pricing from '@/config/pricing.json';

export function SettingsPage() {
  const { theme, setTheme } = useThemeStore();
  const { meta, latest } = useDataStore();
  const [cacheCleared, setCacheCleared] = useState(false);
  const [cacheStats, setCacheStats] = useState<{ count: number; oldestAccess: number | null } | null>(null);

  async function handleClearCache() {
    await clearCache();
    setCacheCleared(true);
    setTimeout(() => setCacheCleared(false), 2000);
  }

  async function handleLoadCacheStats() {
    const stats = await getCacheStats();
    setCacheStats(stats);
  }

  function handleExportData() {
    if (!latest) return;
    const blob = new Blob([JSON.stringify(latest, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `token-matters-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const providers = pricing.providers as Record<string, {
    type: string;
    models?: Record<string, Record<string, number | string>>;
    subscription?: { plan: string; monthlyCost: number; currency: string };
  }>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-light tracking-tight">Settings</h1>
      </div>

      <hr className="border-border" />

      {/* Theme */}
      <section className="space-y-3">
        <h2 className="text-xs text-muted-foreground uppercase tracking-wider">Theme</h2>
        <div className="flex gap-1">
          {(['light', 'dark', 'system'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={`px-3 py-1.5 text-sm border capitalize transition-colors ${
                theme === t
                  ? 'bg-foreground text-background'
                  : 'bg-background text-muted-foreground hover:text-foreground'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </section>

      <hr className="border-border" />

      {/* Cache */}
      <section className="space-y-3">
        <h2 className="text-xs text-muted-foreground uppercase tracking-wider">Cache</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={handleClearCache}
            className="px-3 py-1.5 text-sm border bg-background text-foreground hover:bg-muted transition-colors"
          >
            Clear Cache
          </button>
          <button
            onClick={handleLoadCacheStats}
            className="px-3 py-1.5 text-sm border bg-background text-muted-foreground hover:text-foreground transition-colors"
          >
            Cache Stats
          </button>
          {cacheCleared && (
            <span className="text-xs text-muted-foreground">Cleared.</span>
          )}
        </div>
        {cacheStats && (
          <p className="text-xs text-muted-foreground">
            {cacheStats.count} entries
            {cacheStats.oldestAccess && (
              <> &middot; oldest access: {new Date(cacheStats.oldestAccess).toLocaleDateString()}</>
            )}
          </p>
        )}
      </section>

      <hr className="border-border" />

      {/* Export */}
      <section className="space-y-3">
        <h2 className="text-xs text-muted-foreground uppercase tracking-wider">
          Data Export
        </h2>
        <button
          onClick={handleExportData}
          disabled={!latest}
          className="px-3 py-1.5 text-sm border bg-background text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Export Latest as JSON
        </button>
      </section>

      <hr className="border-border" />

      {/* Data Info */}
      <section className="space-y-2">
        <h2 className="text-xs text-muted-foreground uppercase tracking-wider">
          Data Info
        </h2>
        {meta && (
          <div className="text-xs text-muted-foreground space-y-1">
            <p>Last updated: {formatDate(meta.lastUpdated, 'MMM D, YYYY HH:mm')}</p>
            <p>Date range: {formatDate(meta.dateRange.start)} – {formatDate(meta.dateRange.end)}</p>
            <p>Providers: {meta.providers.join(', ')}</p>
            <p>Machines: {meta.machines.join(', ')}</p>
            <p>Daily files: {meta.dailyFiles.length} &middot; Weekly: {meta.weeklyFiles.length} &middot; Monthly: {meta.monthlyFiles.length}</p>
          </div>
        )}
      </section>

      <hr className="border-border" />

      {/* Pricing */}
      <section className="space-y-4">
        <h2 className="text-xs text-muted-foreground uppercase tracking-wider">
          Pricing
        </h2>
        {Object.entries(providers).map(([id, provider]) => (
          <div key={id} className="space-y-2">
            <h3 className="text-sm font-medium">{id}</h3>
            <p className="text-xs text-muted-foreground capitalize">{provider.type} billing</p>

            {provider.type === 'token' && provider.models && (
              <div className="overflow-x-auto">
                <table className="text-xs w-full">
                  <thead>
                    <tr className="text-muted-foreground text-left">
                      <th className="py-1 pr-4 font-normal">Model</th>
                      {Object.values(provider.models).some((m) => 'inputPerMTok' in m) && (
                        <>
                          <th className="py-1 px-2 font-normal text-right">Input/MTok</th>
                          <th className="py-1 px-2 font-normal text-right">Output/MTok</th>
                          <th className="py-1 px-2 font-normal text-right">Cache Create</th>
                          <th className="py-1 px-2 font-normal text-right">Cache Read</th>
                        </>
                      )}
                      {Object.values(provider.models).some((m) => 'totalPerKTok' in m) && (
                        <th className="py-1 px-2 font-normal text-right">Total/KTok</th>
                      )}
                      <th className="py-1 pl-2 font-normal text-right">Currency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(provider.models).map(([model, rates]) => (
                      <tr key={model} className="border-t border-border">
                        <td className="py-1 pr-4 font-mono">{model}</td>
                        {'inputPerMTok' in rates && (
                          <>
                            <td className="py-1 px-2 text-right font-mono tabular-nums">${String(rates.inputPerMTok)}</td>
                            <td className="py-1 px-2 text-right font-mono tabular-nums">${String(rates.outputPerMTok)}</td>
                            <td className="py-1 px-2 text-right font-mono tabular-nums">${String(rates.cacheCreationPerMTok)}</td>
                            <td className="py-1 px-2 text-right font-mono tabular-nums">${String(rates.cacheReadPerMTok)}</td>
                          </>
                        )}
                        {'totalPerKTok' in rates && (
                          <td className="py-1 px-2 text-right font-mono tabular-nums">{String(rates.totalPerKTok)}</td>
                        )}
                        <td className="py-1 pl-2 text-right text-muted-foreground">{String(rates.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {provider.type === 'subscription' && provider.subscription && (
              <p className="text-xs font-mono tabular-nums">
                {provider.subscription.plan} — {provider.subscription.currency === 'USD' ? '$' : '¥'}
                {provider.subscription.monthlyCost}/mo
              </p>
            )}
          </div>
        ))}

        <div className="pt-2">
          <h3 className="text-xs text-muted-foreground mb-1">Exchange Rates</h3>
          {Object.entries(pricing.exchangeRates).map(([pair, rate]) => (
            <p key={pair} className="text-xs font-mono tabular-nums">
              {pair}: {rate}
            </p>
          ))}
        </div>
      </section>
    </div>
  );
}
