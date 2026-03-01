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

const iconColorMap = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-green-500/10 text-green-600',
  warning: 'bg-amber-500/10 text-amber-600',
  destructive: 'bg-red-500/10 text-red-600',
  muted: 'bg-muted text-muted-foreground',
};

export function StatCard({ title, value, subtitle, icon, trend, className, iconColor = 'primary' }: StatCardProps) {
  return (
    <div className={cn(
      'relative overflow-hidden bg-card rounded-xl border border-border p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:border-primary/20',
      className
    )}>
      {/* Subtle decorative accent */}
      <div className={cn(
        'absolute top-0 right-0 w-20 h-20 rounded-full -translate-y-1/2 translate-x-1/2 opacity-[0.07]',
        iconColor === 'success' ? 'bg-green-500' :
        iconColor === 'warning' ? 'bg-amber-500' :
        iconColor === 'destructive' ? 'bg-red-500' :
        'bg-primary'
      )} />
      
      <div className="relative flex items-start justify-between">
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">{title}</p>
          <p className="text-2xl font-bold text-foreground tracking-tight">{value}</p>
          {subtitle && (
            <p className="text-[11px] text-muted-foreground">{subtitle}</p>
          )}
          {trend && (
            <p className={cn(
              'text-xs font-semibold mt-1 flex items-center gap-0.5',
              trend.isPositive ? 'text-green-600' : 'text-red-600'
            )}>
              {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
            </p>
          )}
        </div>
        {icon && (
          <div className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
            iconColorMap[iconColor]
          )}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
