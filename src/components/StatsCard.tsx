import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  trend?: string;
  color?: 'primary' | 'warning' | 'success' | 'muted';
  className?: string;
}

export function StatsCard({ title, value, icon, trend, color = 'primary', className }: StatsCardProps) {
  const colorClasses = {
    primary: 'bg-primary/10 text-primary',
    warning: 'bg-yellow-500/10 text-yellow-600',
    success: 'bg-green-500/10 text-green-600',
    muted: 'bg-muted text-muted-foreground',
  };
  return (
    <div className={cn(
      "bg-card rounded-xl p-4 shadow-card border border-border",
      "hover:shadow-lg transition-all duration-200",
      className
    )}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground mb-1">{title}</p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
          {trend && (
            <p className="text-xs text-success mt-1">{trend}</p>
          )}
        </div>
        <div className={cn("p-2.5 rounded-lg", colorClasses[color])}>
          {icon}
        </div>
      </div>
    </div>
  );
}
