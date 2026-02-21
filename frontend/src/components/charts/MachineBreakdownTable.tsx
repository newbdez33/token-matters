import type { MachineSummary } from '@/types/summary';
import { Link } from 'react-router-dom';

interface MachineBreakdownTableProps {
  machines: MachineSummary[];
}

export function MachineBreakdownTable({ machines }: MachineBreakdownTableProps) {
  const sorted = [...machines].sort((a, b) => b.totalTokens - a.totalTokens);

  return (
    <div>
      {/* Desktop header */}
      <div className="hidden sm:grid grid-cols-[1fr_auto_auto] gap-x-6 text-xs text-muted-foreground uppercase tracking-wider pb-3 border-b">
        <span>Machine</span>
        <span className="text-right">Tokens</span>
        <span className="text-right">Requests</span>
      </div>
      {sorted.map((m) => (
        <Link
          key={m.machine}
          to={`/machines/${m.machine}`}
          className="block sm:grid sm:grid-cols-[1fr_auto_auto] sm:gap-x-6 sm:items-center sm:h-10 border-b py-2 sm:py-0 text-sm no-underline text-foreground hover:bg-muted/50 transition-colors"
        >
          <span className="font-mono text-xs">{m.machine}</span>
          {/* Mobile inline */}
          <span className="flex sm:hidden items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span className="font-mono tabular-nums">{m.totalTokens.toLocaleString()} tokens</span>
            <span className="font-mono tabular-nums">{m.requests.toLocaleString()} req</span>
          </span>
          {/* Desktop columns */}
          <span className="hidden sm:inline text-right font-mono tabular-nums">
            {m.totalTokens.toLocaleString()}
          </span>
          <span className="hidden sm:inline text-right font-mono tabular-nums text-muted-foreground">
            {m.requests.toLocaleString()}
          </span>
        </Link>
      ))}
    </div>
  );
}
