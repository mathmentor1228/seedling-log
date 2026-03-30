import { cn } from '@/lib/utils';

interface DashboardSkeletonProps {
  variant?: 'stats' | 'card' | 'list' | 'chart';
  count?: number;
  className?: string;
}

function SkeletonBox({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={cn('rounded-lg skeleton-shimmer', className)} style={style} />;
}

export function DashboardSkeleton({ variant = 'card', count = 1, className }: DashboardSkeletonProps) {
  if (variant === 'stats') {
    return (
      <div className={cn('grid grid-cols-2 lg:grid-cols-4 gap-4', className)}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-3">
            <SkeletonBox className="h-3 w-16" />
            <SkeletonBox className="h-8 w-20" />
            <SkeletonBox className="h-2 w-24" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'chart') {
    return (
      <div className={cn('rounded-xl border border-border bg-card p-5', className)}>
        <SkeletonBox className="h-4 w-28 mb-4" />
        <div className="flex items-end gap-2 h-[240px]">
          {Array.from({ length: 9 }).map((_, i) => (
            <SkeletonBox key={i} className="flex-1" style={{ height: `${30 + Math.random() * 60}%` }} />
          ))}
        </div>
      </div>
    );
  }

  if (variant === 'list') {
    return (
      <div className={cn('space-y-2', className)}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-3 flex items-center gap-3">
            <SkeletonBox className="w-8 h-8 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <SkeletonBox className="h-3 w-3/4" />
              <SkeletonBox className="h-2 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-5 space-y-3">
          <SkeletonBox className="h-4 w-32" />
          <SkeletonBox className="h-20 w-full" />
        </div>
      ))}
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <SkeletonBox className="h-3 w-16" />
      <SkeletonBox className="h-8 w-20" />
      <SkeletonBox className="h-2 w-24" />
    </div>
  );
}
