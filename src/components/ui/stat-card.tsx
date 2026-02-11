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
}

export function StatCard({ title, value, subtitle, icon, trend, className }: StatCardProps) {
  return (
    <div className={cn('stat-card animate-fade-in', className)}>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
          <p className="text-3xl font-bold text-foreground">{value}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
          {trend && (
            <p className={cn(
              'text-sm font-medium mt-1',
              trend.isPositive ? 'text-success' : 'text-destructive'
            )}>
              {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
            </p>
          )}
        </div>
        {icon && (
          <div className="w-11 h-11 bg-primary/10 rounded-xl flex items-center justify-center text-primary shrink-0">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
