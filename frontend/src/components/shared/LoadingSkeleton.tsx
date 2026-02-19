import { cn } from '@/lib/utils';

interface LoadingSkeletonProps {
  className?: string;
  lines?: number;
}

export function LoadingSkeleton({ className, lines = 3 }: LoadingSkeletonProps) {
  return (
    <div className={cn('animate-pulse space-y-3', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'h-4 bg-muted',
            i === 0 && 'w-3/4',
            i === lines - 1 && 'w-1/2',
          )}
        />
      ))}
    </div>
  );
}

export function LoadingBlock({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse', className)}>
      <div className="h-10 w-32 bg-muted mb-2" />
      <div className="h-4 w-48 bg-muted" />
    </div>
  );
}
