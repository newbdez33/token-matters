import type { DataQuality } from '@/types/summary';
import { cn } from '@/lib/utils';
import { Check, AlertTriangle, HelpCircle } from 'lucide-react';

const CONFIG: Record<DataQuality, { label: string; title: string; icon: typeof Check }> = {
  exact: {
    label: 'Exact',
    title: 'Data is precise — sourced from billing or usage API',
    icon: Check,
  },
  estimated: {
    label: 'Est.',
    title: 'Data is estimated — derived from logs or heuristics',
    icon: HelpCircle,
  },
  partial: {
    label: 'Partial',
    title: 'Data is incomplete — some records may be missing',
    icon: AlertTriangle,
  },
};

interface DataQualityBadgeProps {
  quality: DataQuality;
  className?: string;
}

export function DataQualityBadge({ quality, className }: DataQualityBadgeProps) {
  const { label, title, icon: Icon } = CONFIG[quality];

  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] uppercase tracking-wider border cursor-help',
        quality === 'exact' && 'bg-secondary text-secondary-foreground',
        quality === 'estimated' && 'bg-muted text-muted-foreground border-dashed',
        quality === 'partial' && 'bg-muted text-muted-foreground border-dotted',
        className,
      )}
    >
      <Icon className="w-2.5 h-2.5" />
      {label}
    </span>
  );
}
