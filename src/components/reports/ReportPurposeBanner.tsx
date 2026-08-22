// REPORT-STATUS-CLARITY-V1: /reports 와 /reports/status 목적 구분 배너
import { Link } from 'react-router-dom';
import { ArrowRight, FileBarChart, ClipboardCheck } from 'lucide-react';

interface Props {
  /** 현재 화면 */
  current: 'manage' | 'status';
  /** 현재 주차 (링크에 전달) */
  weekStart?: string;
}

export function ReportPurposeBanner({ current, weekStart }: Props) {
  const q = weekStart ? `?week=${weekStart}` : '';
  const isManage = current === 'manage';

  return (
    <div className="rounded-lg border bg-muted/40 p-3 flex flex-col sm:flex-row sm:items-center gap-2 min-w-0">
      <div className="flex items-start gap-2 min-w-0 flex-1">
        {isManage ? (
          <FileBarChart className="w-4 h-4 mt-0.5 text-primary shrink-0" />
        ) : (
          <ClipboardCheck className="w-4 h-4 mt-0.5 text-primary shrink-0" />
        )}
        <p className="text-xs sm:text-sm text-foreground break-words min-w-0">
          {isManage
            ? '이 화면은 주차별 리포트를 생성·수정·검수하고 학부모 공개 여부를 관리하는 작업 화면입니다.'
            : '이 화면은 이미 만들어진 리포트의 내용과 상태를 확인하는 조회 화면입니다. 여기서는 생성·수정하지 않습니다.'}
        </p>
      </div>
      <Link
        to={isManage ? `/reports/status${q}` : `/reports${q}`}
        className="text-xs sm:text-sm font-medium text-primary inline-flex items-center gap-1 shrink-0 hover:underline"
      >
        {isManage ? '리포트 내용 확인하기' : '리포트 생성·검수하러 가기'}
        <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}
