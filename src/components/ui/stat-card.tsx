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
    border: 'border-l-primary/70',
  },
  success: {
    icon: 'bg-success/10 text-success',
    border: 'border-l-success/70',
  },
  warning: {
    icon: 'bg-warning/10 text-warning',
    border: 'border-l-warning/70',
  },
  destructive: {
    icon: 'bg-destructive/10 text-destructive',
    border: 'border-l-destructive/70',
  },
  muted: {
    icon: 'bg-muted text-muted-foreground',
    border: 'border-l-muted-foreground/30',
  },
};

export function StatCard({ title, value, subtitle, icon, trend, className, iconColor = 'primary' }: StatCardProps) {
  const accent = accentMap[iconColor];

  return (
    <div className={cn(
      'relative bg-card rounded-2xl border border-border border-l-[3px] p-5 shadow-card transition-all duration-200 hover:shadow-card-hover',
      accent.border,
      className
    )}>
      <div className="flex items-start justify-between gap-3">
        {icon && (
          <div className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
            accent.icon
          )}>
            {icon}
          </div>
        )}
        <div className="flex-1 text-right">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-1">{title}</p>
          <p className="text-2xl font-bold text-foreground tracking-tight leading-none">{value}</p>
          {subtitle && (
            <p className="text-[11px] text-muted-foreground mt-1.5">{subtitle}</p>
          )}
          {trend && (
            <p className={cn(
              'text-xs font-semibold mt-1.5 flex items-center gap-0.5 justify-end',
              trend.isPositive ? 'text-success' : 'text-destructive'
            )}>
              {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
