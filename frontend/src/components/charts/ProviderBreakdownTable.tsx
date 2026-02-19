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
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-6 text-xs text-muted-foreground uppercase tracking-wider pb-3 border-b">
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
            className="grid grid-cols-[1fr_auto_auto_auto] gap-x-6 items-center h-12 border-b text-sm no-underline text-foreground hover:bg-muted/50 transition-colors"
          >
            <span className="flex items-center gap-2">
              <span
                className="inline-block w-2 h-2"
                style={{ backgroundColor: config.color }}
              />
              {config.name}
            </span>
            <span className="text-right font-mono tabular-nums">
              {formatCost(p.cost, p.currency)}
            </span>
            <span className="text-right font-mono tabular-nums text-muted-foreground">
              {formatTokens(p.totalTokens)}
            </span>
            <span className="text-right">
              <DataQualityBadge quality={p.dataQuality} />
            </span>
          </Link>
        );
      })}
    </div>
  );
}
