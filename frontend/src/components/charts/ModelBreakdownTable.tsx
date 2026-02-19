import type { ModelSummary } from '@/types/summary';
import { getProviderConfig } from '@/config/providers';

interface ModelBreakdownTableProps {
  models: ModelSummary[];
}

export function ModelBreakdownTable({ models }: ModelBreakdownTableProps) {
  const sorted = [...models].sort((a, b) => b.totalTokens - a.totalTokens);

  return (
    <div>
      {/* Desktop header */}
      <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto] gap-x-6 text-xs text-muted-foreground uppercase tracking-wider pb-3 border-b">
        <span>Model</span>
        <span className="text-right">Provider</span>
        <span className="text-right">Tokens</span>
        <span className="text-right">Requests</span>
      </div>
      {sorted.map((m) => {
        const config = getProviderConfig(m.provider);
        return (
          <div
            key={`${m.provider}-${m.model}`}
            className="block sm:grid sm:grid-cols-[1fr_auto_auto_auto] sm:gap-x-6 sm:items-center sm:h-10 border-b py-2 sm:py-0 text-sm"
          >
            <span className="font-mono text-xs">{m.model}</span>
            {/* Mobile inline */}
            <span className="flex sm:hidden items-center gap-3 mt-1 text-xs text-muted-foreground">
              <span>{config.name}</span>
              <span className="font-mono tabular-nums">{m.totalTokens.toLocaleString()} tokens</span>
              <span className="font-mono tabular-nums">{m.requests.toLocaleString()} req</span>
            </span>
            {/* Desktop columns */}
            <span className="hidden sm:inline text-right text-xs text-muted-foreground">
              {config.name}
            </span>
            <span className="hidden sm:inline text-right font-mono tabular-nums">
              {m.totalTokens.toLocaleString()}
            </span>
            <span className="hidden sm:inline text-right font-mono tabular-nums text-muted-foreground">
              {m.requests.toLocaleString()}
            </span>
          </div>
        );
      })}
    </div>
  );
}
