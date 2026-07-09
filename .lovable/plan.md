## 문제 확인

수업일지가 3가지 경로로 생성/수정되는데, 서로 조율이 없어서 **같은 학생·같은 과목·같은 날짜에 여러 레코드가 중복 생성**되고 있어요.

DB 조사 결과 (2026-07-01 이후):
- 학생 A (수학, 07-09): **4건 중복** (같은 teacher)
- 학생 B (수학, 07-09): **2건 중복**

### 3가지 경로 현황

| 경로 | 파일 | 기존 레코드 병합 로직 |
|---|---|---|
| ① 수업계획 → 오늘 수업 저장 | `TodaySession.tsx` (line 787) | ✅ (teacher, student, subject, date) 조회 후 있으면 update |
| ② 수업일지 직접 작성 | `LessonRecordForm.tsx` (line 1482) | ❌ 무조건 insert |
| ③ 테스트 일괄 입력 | `BatchTestInputModal.tsx` (line 117) | ✅ 있으면 update, 없으면 skip (신규 생성 X) |

②번이 중복의 주범입니다. 그리고 DB에 unique constraint가 없어서 어느 경로든 실수하면 중복이 쌓입니다.

---

## 수정 방향

### 1. DB 레벨 — 중복 원천 차단 (마이그레이션)

- `lesson_records`에 **부분 unique index** 추가
  - 키: `(student_id, subject, lesson_date)` (teacher_id는 제외 — 같은 과목에서 담임 바뀌어도 하나의 일지)
  - 기존 중복 데이터는 자동 병합 함수로 정리 (제출됨 우선 → 최신 updated_at 우선으로 하나 남기고 나머지는 관련 자식 레코드 이관 후 삭제)

### 2. 코드 레벨 — 항상 "먼저 조회 후 upsert" 헬퍼로 통일

`src/lib/lessonRecordUpsert.ts` 신규 파일:
- `findOrCreateLessonRecord({ student_id, subject, lesson_date, defaults })` — 있으면 id 반환, 없으면 defaults로 생성
- `upsertLessonRecord(payload, mergeStrategy)` — 있으면 지정 필드만 병합 update, 없으면 insert

이 헬퍼로 3경로 모두 교체:
- `TodaySession.tsx` (line 787-818): 기존 로직을 헬퍼로 대체 (동작 동일)
- `LessonRecordForm.tsx` (line 1481-1485): insert 전에 항상 조회. 이미 있으면 그 id를 currentDraftId처럼 사용해 update
- `BatchTestInputModal.tsx`: 이미 조회 로직 있으니 헬퍼로 교체하고 "없으면 skip" 대신 "없으면 최소 정보로 생성 후 테스트 필드 update"로 개선

### 3. 병합 전략 (경합 시 어떤 필드가 이기나)

각 경로가 채우는 필드가 겹치지 않도록 명확한 오너십:

- `lesson_range`, `next_lesson_goal`, `homework_status`, `understanding_score`, `attendance_status` → **경로 ①(TodaySession) 우선**. 다른 경로에서는 비어있을 때만 채움.
- `test_name`, `test_content`, `test_result*`, `test_slot`, `english_pass_fail` → 경로 ③(테스트 일괄)이 항상 덮어씀
- `notes`, `lesson_types` → append/merge (배열은 union)
- `submitted`, `submitted_at` → true가 되면 유지 (덮어쓰기 금지)

---

## 기술 세부사항

### 마이그레이션 파일 1개

```sql
-- 1) 기존 중복 병합 함수 실행 (한 번만)
--    같은 (student_id, subject, lesson_date) 그룹당:
--    - submitted=true인 것 우선, 그 다음 updated_at 최신
--    - 살아남은 id로 homework_assignments.lesson_record_id, 
--      test_records, exam_reviews 등 FK 이관
--    - 나머지 삭제
-- 2) 부분 unique index
CREATE UNIQUE INDEX lesson_records_unique_per_day
  ON public.lesson_records (student_id, subject, lesson_date);
```

### 헬퍼 시그니처

```ts
export async function upsertLessonRecord(
  key: { student_id: string; subject: string; lesson_date: string },
  payload: Partial<LessonRecordRow>,
  strategy: 'today-session' | 'form' | 'batch-test'
): Promise<{ id: string; created: boolean }>;
```

`strategy`별로 어떤 필드를 덮어쓰고 어떤 필드를 보존할지 내부에서 결정.

### 리스크 및 완화

- 기존 중복 병합 시 자식 FK 이관 실패 가능 → 트랜잭션으로 롤백
- ②경로(LessonRecordForm)에서 이미 열려있는 "수정" 화면에 다른 경로가 동시에 저장하면 stale update 발생 가능 → `updated_at` 체크 옵션은 이번 범위에서 제외 (드문 케이스)
- 병합 후 lesson_record_id를 참조하던 `homework_assignments`가 삭제 대상 id를 가리키면 안 되므로, **자식 FK 업데이트 → 부모 DELETE** 순서 준수

---

## 변경 파일

- `supabase/migrations/<new>.sql` 신규 (중복 정리 + unique index)
- `src/lib/lessonRecordUpsert.ts` 신규
- `src/components/plan/TodaySession.tsx` 수정 (헬퍼 사용)
- `src/components/lessons/LessonRecordForm.tsx` 수정 (헬퍼 사용)
- `src/components/BatchTestInputModal.tsx` 수정 (헬퍼 사용)
