// ARCHIVE-NOTICE-V1
// 보관 분류 화면 상단에 표시되는 작은 안내 배너.
// 기능·데이터·저장 로직은 그대로이며, 표시만 추가한다.
import { Link } from 'react-router-dom';
import { Archive, ArrowRight } from 'lucide-react';

interface ArchiveNoticeProps {
  /** 대표(대체) 기능 경로 */
  to: string;
  /** 대표 기능 명칭 */
  label: string;
}

export function ArchiveNotice({ to, label }: ArchiveNoticeProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground">
      <Archive className="w-3 h-3 flex-shrink-0" />
      <span>보관 기능 · 현재 기본 업무 흐름에서는 사용하지 않음</span>
      <Link to={to} className="inline-flex items-center gap-1 text-primary">
        {label}으로 이동
        <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
  );
}
