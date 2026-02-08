import { AlertTriangle, Clock, CheckSquare, FileEdit, UserCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface AttentionItem {
  icon: React.ReactNode;
  label: string;
  count: number;
  color: string;
  onClick?: () => void;
}

interface AttentionSummaryBarProps {
  items: AttentionItem[];
}

export function AttentionSummaryBar({ items }: AttentionSummaryBarProps) {
  const activeItems = items.filter(i => i.count > 0);
  
  if (activeItems.length === 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
          모든 항목이 정상입니다
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {activeItems.map((item, idx) => (
        <button
          key={idx}
          onClick={item.onClick}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all hover:scale-[1.02] active:scale-[0.98] ${item.color}`}
        >
          {item.icon}
          <span className="text-sm font-medium">{item.label}</span>
          <Badge variant="secondary" className="ml-0.5 h-5 min-w-[20px] flex items-center justify-center text-xs font-bold">
            {item.count}
          </Badge>
        </button>
      ))}
    </div>
  );
}

export type { AttentionItem };
