import { Link, useLocation } from 'react-router-dom';
import { BookOpen, Calculator, ClipboardCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

const TAB_ITEMS = [
  { href: '/student/vocab', label: '단어시험', icon: BookOpen },
  { href: '/student/math-quiz', label: '수학질문', icon: Calculator },
  { href: '/student/exam-review', label: '시험리뷰', icon: ClipboardCheck },
];

export function StudentStudyTabs() {
  const location = useLocation();

  return (
    <div className="grid grid-cols-3 gap-2">
      {TAB_ITEMS.map((item) => {
        const active = location.pathname === item.href;
        return (
          <Link
            key={item.href}
            to={item.href}
            className={cn(
              'flex min-h-11 items-center justify-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors',
              active
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-card text-muted-foreground hover:text-foreground',
            )}
          >
            <item.icon className="h-4 w-4" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}