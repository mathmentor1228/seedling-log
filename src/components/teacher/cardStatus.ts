// TEACHER-TODAY-V1 : 반 카드 상태 표시 매핑 (순수 함수, 읽기 전용 데이터 기반)
// 판정 근거는 useTodayClasses가 실제 조회한 studentCount / recordedCount / submittedCount 뿐이다.
// timestamps(마지막 저장)나 수정 이력은 현재 조회 결과에 없으므로 표시하지 않는다.

export type CardDisplayState = 'empty_class' | 'not_started' | 'in_progress' | 'done';

export interface CardDisplayMeta {
  state: CardDisplayState;
  label: string;
  cta: string;
  chip: string;
  ctaVariant: 'default' | 'outline' | 'secondary';
}

export interface CardCounts {
  studentCount: number;
  recordedCount: number;
  submittedCount: number;
}

export function getCardDisplay(c: CardCounts): CardDisplayMeta {
  if (c.studentCount === 0) {
    return {
      state: 'empty_class',
      label: '수업 없음',
      cta: '내용 보기',
      chip: 'bg-muted text-muted-foreground border-border',
      ctaVariant: 'outline',
    };
  }
  if (c.submittedCount >= c.studentCount) {
    return {
      state: 'done',
      label: '마감 완료',
      cta: '완료 내용 보기',
      chip: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
      ctaVariant: 'outline',
    };
  }
  if (c.recordedCount > 0 || c.submittedCount > 0) {
    return {
      state: 'in_progress',
      label: '작성 중',
      cta: '이어서 작성',
      chip: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
      ctaVariant: 'default',
    };
  }
  return {
    state: 'not_started',
    label: '미작성',
    cta: '작성 시작',
    chip: 'bg-muted text-muted-foreground border-border',
    ctaVariant: 'default',
  };
}
