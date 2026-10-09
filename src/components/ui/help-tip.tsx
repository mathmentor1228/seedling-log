// PRINCIPAL-HOME-V2 디자인 패스: 카드마다 깔리던 회색 설명글을 물음표 하나로 모은다. 누르면 펼쳐지고 다시 누르면 접힌다.
import { useState, type ReactNode } from 'react';
import { HelpCircle } from 'lucide-react';

export function HelpTip({ children, label = '도움말' }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="inline-flex items-start">
      <button type="button" aria-label={label} aria-expanded={open} onClick={() => setOpen(v => !v)}
        className={`inline-flex items-center justify-center w-5 h-5 rounded-full border text-muted-foreground hover:text-foreground hover:bg-muted ${open ? 'bg-muted text-foreground' : ''}`}>
        <HelpCircle className="w-3.5 h-3.5" />
      </button>
      {open && (
        <span className="ml-2 text-[11px] leading-snug text-muted-foreground max-w-prose">{children}</span>
      )}
    </span>
  );
}
