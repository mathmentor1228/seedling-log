import { supabase } from '@/integrations/supabase/client';

/**
 * HW-RECONCILE-V1
 * 숙제 저장 공용 경로.
 * - 기존 행 ID를 유지한 채 배정 정보(content/homework_type/assigned_date/lesson_record_id)만 갱신
 * - 새 항목만 INSERT
 * - 화면에서 제거된 항목 중 제출/검사 이력이 전혀 없는 unchecked 행만 삭제
 * - 보호 대상(제출·검사·확인 이력 보유)이 삭제 대상에 포함되면 저장 자체를 중단
 *
 * 원자적 처리는 DB RPC `reconcile_lesson_homework`에서 수행한다.
 */

export const PROTECTED_HOMEWORK_MESSAGE =
  '이미 제출 또는 확인된 숙제는 이 화면에서 삭제할 수 없습니다. 숙제 취소 기능을 이용하세요.';

export interface HomeworkItemInput {
  /** 기존 homework_assignments.id (신규 항목이면 undefined) */
  id?: string | null;
  content: string;
  homework_type?: string | null;
}

export interface ReconcileParams {
  lessonRecordId: string;
  studentId: string;
  subject: string;
  assignedDate: string;
  items: HomeworkItemInput[];
}

export interface ReconcileResult {
  updated: number;
  inserted: number;
  deleted: number;
}

/** 저장 화면에서 기존 숙제를 불러올 때 사용하는 표준 select 컬럼 */
export const HOMEWORK_LOAD_COLUMNS =
  'id, content, homework_type, check_status, submitted_at, checked_at';

export async function reconcileLessonHomework({
  lessonRecordId,
  studentId,
  subject,
  assignedDate,
  items,
}: ReconcileParams): Promise<ReconcileResult> {
  const payload = items
    .filter((i) => (i.content || '').trim().length > 0)
    .map((i) => ({
      id: i.id || null,
      content: (i.content || '').trim(),
      homework_type: i.homework_type || 'regular',
    }));

  const { data, error } = await supabase.rpc('reconcile_lesson_homework', {
    _lesson_record_id: lessonRecordId,
    _student_id: studentId,
    _subject: subject as any,
    _assigned_date: assignedDate,
    _items: payload as any,
  });

  if (error) {
    if ((error.message || '').includes('PROTECTED_HOMEWORK_DELETE_BLOCKED')) {
      throw new Error(PROTECTED_HOMEWORK_MESSAGE);
    }
    if ((error.message || '').includes('FORBIDDEN')) {
      throw new Error('이 학생의 숙제를 수정할 권한이 없습니다.');
    }
    throw new Error(`숙제 저장 실패: ${error.message}`);
  }

  const result = (data as any) || {};
  return {
    updated: Number(result.updated ?? 0),
    inserted: Number(result.inserted ?? 0),
    deleted: Number(result.deleted ?? 0),
  };
}
