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
      <div className="flex items-center gap-3 px-5 py-4 rounded-xl bg-green-500/8 border border-green-500/20">
        <div className="w-8 h-8 rounded-full bg-green-500/15 flex items-center justify-center">
          <CheckCircle2 className="w-4 h-4 text-green-600" />
        </div>
        <div>
          <span className="text-sm font-semibold text-green-700">모든 항목이 정상입니다</span>
          <p className="text-xs text-green-600/70">처리할 알림이 없습니다</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3">
      <div className="flex items-center gap-2 mb-2 px-1">
        <span className="inline-block w-2 h-2 rounded-full bg-destructive animate-pulse" />
        <span className="text-xs font-semibold text-destructive uppercase tracking-wider">주의 필요</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {activeItems.map((item, idx) => (
          <button
            key={idx}
            onClick={item.onClick}
            className="group flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-background border border-border shadow-sm transition-all duration-150 hover:shadow-md hover:border-primary/30 active:scale-[0.98]"
          >
            <span className="text-muted-foreground group-hover:text-foreground transition-colors">{item.icon}</span>
            <span className="text-sm font-medium text-foreground">{item.label}</span>
            <Badge variant="destructive" className="ml-0.5 h-5 min-w-[22px] flex items-center justify-center text-xs font-bold rounded-full">
              {item.count}
            </Badge>
          </button>
        ))}
      </div>
    </div>
  );
}

export type { AttentionItem };
