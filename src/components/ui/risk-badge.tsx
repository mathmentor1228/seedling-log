import { cn } from '@/lib/utils';

interface RiskBadgeProps {
  level: 'low' | 'medium' | 'high';
}

export function RiskBadge({ level }: RiskBadgeProps) {
  const classes: Record<string, string> = {
    low: 'bg-risk-low/15 text-risk-low border-risk-low/30',
    medium: 'bg-risk-medium/15 text-risk-medium border-risk-medium/30',
    high: 'bg-risk-high/15 text-risk-high border-risk-high/30',
  };

  const labels: Record<string, string> = {
    low: 'Low Risk',
    medium: 'Medium Risk',
    high: 'High Risk',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
        classes[level]
      )}
    >
      {labels[level]}
    </span>
  );
}
