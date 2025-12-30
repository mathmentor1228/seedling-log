import { cn } from '@/lib/utils';

interface ScoreBadgeProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
}

export function ScoreBadge({ score, size = 'md' }: ScoreBadgeProps) {
  const sizeClasses = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-10 h-10 text-base',
  };

  const colorClasses: Record<number, string> = {
    1: 'bg-score-1/15 text-score-1 border-score-1/30',
    2: 'bg-score-2/15 text-score-2 border-score-2/30',
    3: 'bg-score-3/15 text-score-3 border-score-3/30',
    4: 'bg-score-4/15 text-score-4 border-score-4/30',
    5: 'bg-score-5/15 text-score-5 border-score-5/30',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full font-semibold border',
        sizeClasses[size],
        colorClasses[score] || colorClasses[3]
      )}
    >
      {score}
    </span>
  );
}
