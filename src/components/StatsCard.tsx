import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  trend?: string;
  color?: 'primary' | 'warning' | 'success' | 'muted';
  className?: string;
  action?: ReactNode;
}

export function StatsCard({ title, value, icon, trend, color = 'primary', className, action }: StatsCardProps) {
  const colorClasses = {
    primary: 'bg-primary/10 text-primary',
    warning: 'bg-yellow-500/10 text-yellow-600',
    success: 'bg-green-500/10 text-green-600',
    muted: 'bg-muted text-muted-foreground',
  };
  return (
    <div className={cn(
      "bg-card rounded-xl p-4 shadow-card border border-border",
      "hover:shadow-lg transition-shadow duration-200",
      className
    )}>
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground mb-1">{title}</p>
          <div className="flex items-center gap-2">
            <p className="text-xl sm:text-2xl font-bold text-foreground whitespace-nowrap leading-tight">{value}</p>
            {action}
          </div>
          {trend && (
            <p className="text-xs text-success mt-1">{trend}</p>
          )}
        </div>
        <div className={cn("p-2.5 rounded-lg shrink-0", colorClasses[color])}>
          {icon}
        </div>
      </div>
    </div>
  );
}
