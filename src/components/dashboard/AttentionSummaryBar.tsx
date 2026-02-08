import { Badge } from '@/components/ui/badge';
import { CheckCircle2 } from 'lucide-react';

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
      <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-success/8 border border-success/20">
        <CheckCircle2 className="w-5 h-5 text-success" />
        <span className="text-sm font-medium text-success">
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
          className={`group flex items-center gap-2 px-3.5 py-2.5 rounded-xl border transition-all duration-200 hover:scale-[1.02] hover:shadow-sm active:scale-[0.98] ${item.color}`}
        >
          <span className="opacity-80 group-hover:opacity-100 transition-opacity">{item.icon}</span>
          <span className="text-sm font-medium">{item.label}</span>
          <Badge variant="secondary" className="ml-0.5 h-5 min-w-[22px] flex items-center justify-center text-xs font-bold rounded-full">
            {item.count}
          </Badge>
        </button>
      ))}
    </div>
  );
}

export type { AttentionItem };
