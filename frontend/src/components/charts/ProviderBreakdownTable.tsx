import type { ProviderSummary } from '@/types/summary';
import { getProviderConfig } from '@/config/providers';
import { formatCost, formatTokens } from '@/utils/format';
import { DataQualityBadge } from '@/components/shared/DataQualityBadge';
import { Link } from 'react-router-dom';

interface ProviderBreakdownTableProps {
  providers: ProviderSummary[];
}

export function ProviderBreakdownTable({ providers }: ProviderBreakdownTableProps) {
  return (
    <div>
      {/* Desktop header */}
      <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto] gap-x-6 text-xs text-muted-foreground uppercase tracking-wider pb-3 border-b">
        <span>Product</span>
        <span className="text-right">Cost</span>
        <span className="text-right">Tokens</span>
        <span className="text-right">Quality</span>
      </div>
      {providers.map((p) => {
        const config = getProviderConfig(p.provider);
        return (
          <Link
            key={p.provider}
            to={`/providers/${p.provider}`}
            className="block sm:grid sm:grid-cols-[1fr_auto_auto_auto] sm:gap-x-6 sm:items-center sm:h-12 border-b py-3 sm:py-0 text-sm no-underline text-foreground hover:bg-muted/50 transition-colors"
          >
            {/* Product name row */}
            <span className="flex items-center gap-2">
              {config.logo ? (
                <img src={config.logo} alt="" className="w-4 h-4 shrink-0 dark:invert" />
              ) : (
                <span
                  className="inline-block w-2 h-2 shrink-0"
                  style={{ backgroundColor: config.color }}
                />
              )}
              {config.name}
              <span className="sm:hidden ml-auto">
                <DataQualityBadge quality={p.dataQuality} />
              </span>
            </span>
            {/* Mobile: cost + tokens inline */}
            <span className="flex sm:hidden items-center gap-3 mt-1 pl-6 text-xs text-muted-foreground">
              <span className="font-mono tabular-nums text-foreground">
                {formatCost(p.cost, p.currency)}
              </span>
              <span className="font-mono tabular-nums">
                {formatTokens(p.totalTokens)} tokens
              </span>
            </span>
            {/* Desktop columns */}
            <span className="hidden sm:inline text-right font-mono tabular-nums">
              {formatCost(p.cost, p.currency)}
            </span>
            <span className="hidden sm:inline text-right font-mono tabular-nums text-muted-foreground">
              {formatTokens(p.totalTokens)}
            </span>
            <span className="hidden sm:inline text-right">
              <DataQualityBadge quality={p.dataQuality} />
            </span>
          </Link>
        );
      })}
    </div>
  );
}
