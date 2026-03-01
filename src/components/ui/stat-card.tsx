import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
  iconColor?: 'primary' | 'success' | 'warning' | 'destructive' | 'muted';
}

const accentMap = {
  primary: {
    icon: 'bg-primary/10 text-primary',
    border: 'border-t-primary/60',
  },
  success: {
    icon: 'bg-green-500/10 text-green-600',
    border: 'border-t-green-500/60',
  },
  warning: {
    icon: 'bg-amber-500/10 text-amber-600',
    border: 'border-t-amber-500/60',
  },
  destructive: {
    icon: 'bg-red-500/10 text-red-600',
    border: 'border-t-red-500/60',
  },
  muted: {
    icon: 'bg-muted text-muted-foreground',
    border: 'border-t-muted-foreground/30',
  },
};

export function StatCard({ title, value, subtitle, icon, trend, className, iconColor = 'primary' }: StatCardProps) {
  const accent = accentMap[iconColor];

  return (
    <div className={cn(
      'relative bg-card rounded-xl border border-border border-t-[3px] p-4 sm:p-5 shadow-sm transition-all duration-200 hover:shadow-md',
      accent.border,
      className
    )}>
      <div className="flex items-start justify-between gap-2">
        {icon && (
          <div className={cn(
            'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
            accent.icon
          )}>
            {icon}
          </div>
        )}
        <div className="flex-1 text-right">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-0.5">{title}</p>
          <p className="text-2xl font-bold text-foreground tracking-tight leading-none">{value}</p>
          {subtitle && (
            <p className="text-[11px] text-muted-foreground mt-1">{subtitle}</p>
          )}
          {trend && (
            <p className={cn(
              'text-xs font-semibold mt-1 flex items-center gap-0.5 justify-end',
              trend.isPositive ? 'text-green-600' : 'text-red-600'
            )}>
              {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
