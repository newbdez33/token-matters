import type { DataQuality } from '@/types/summary';
import { cn } from '@/lib/utils';

const LABELS: Record<DataQuality, string> = {
  exact: 'Exact',
  estimated: 'Est.',
  partial: 'Partial',
};

interface DataQualityBadgeProps {
  quality: DataQuality;
  className?: string;
}

export function DataQualityBadge({ quality, className }: DataQualityBadgeProps) {
  return (
    <span
      className={cn(
        'inline-block px-1.5 py-0.5 text-[10px] uppercase tracking-wider border',
        quality === 'exact' && 'bg-secondary text-secondary-foreground',
        quality === 'estimated' && 'bg-muted text-muted-foreground',
        quality === 'partial' && 'bg-muted text-muted-foreground border-dashed',
        className,
      )}
    >
      {LABELS[quality]}
    </span>
  );
}
