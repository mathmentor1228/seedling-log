# 숙제 확인 로직 재정비

## 문제 요약

1. **일괄입력의 숙제 확인이 빈약함** — `BatchLessonModal`은 오늘 배정될 숙제(`lesson_record_id` = 오늘 draft)만 불러옴. 개별 일지처럼 "지난 수업의 숙제 내용 + 결과 옵션 7가지(완료/부분/미완/분실/성의부족/완료+성의부족/확인불가)"를 학생별로 보여주지 않음.

2. **'확인 버튼 안 눌러도 확인됨' 버그** — `BatchLessonModal.handleApply` (line 596-618)에서 '숙제상태' 필드만 체크해도 해당 학생·과목의 **이전 모든 unchecked homework_assignments**를 자동으로 `check_status='checked'`로 일괄 업데이트함. 또한 `handleBulkDraftSave` (line 697-698)는 activeFields에 'homework_status'가 없어도 항상 `payload.homework_status = mapResultToStatus('none_assigned')`로 덮어쓰기 → 이전 확인된 상태 파괴.

3. **동일 숙제 중복 INSERT** — `LessonRecordForm.handleSubmit` (line 1476-1491)와 `handleSaveDraft` (line 1412-1427)는 매 저장마다 `delete().eq('lesson_record_id')` 후 전부 재INSERT. lesson_record_id가 없는 동일 내용 carry-forward 숙제와 별개로, draft → submit 흐름에서 같은 lesson_record에 attach된 숙제 외에 다른 경로(예: BatchLessonModal에서도 동일 record에 add)에서 추가 INSERT 시 중복.  또한 **carry-forward** 로직(line 2051)은 `lesson_record_id` 없이 INSERT → 다음 수업에서 또 carry-forward되면 또 새 row.

4. **데일리숙제 자동생성** — 현재 `BatchLessonModal`의 새 숙제 항목 기본 `homework_type: 'daily'` (line 334), `addHomework`도 default `'daily'`. 사용자 정책: **기본은 'regular'(1회성)**, 데일리는 명시 옵트인할 때만.

## 변경 사항

### A. `src/components/lessons/BatchLessonModal.tsx`

**A1. 숙제 확인 자동화 제거 (auto-confirm 버그 차단)**
- `handleApply` (line 583-620): `activeFields.has('homework_status')`일 때 student/subject의 모든 unchecked를 자동 checked로 덮어쓰는 두 번째 update(line 607-618) **삭제**. lesson_record_id로 연결된 항목만 결과 기록(첫 번째 update만 유지)하되, `check_status='checked'`로 일괄 설정하지 말고 **per-item 결과**가 명시된 경우만 처리하도록 변경.
- `handleBulkDraftSave` (line 697-698): `if (activeFields.has('homework_status'))` 가드 추가 — 사용자가 명시적으로 변경한 경우에만 `homework_status` payload에 포함.

**A2. 학생별 지난숙제 표시 (per-student previous homework UI)**
- 학생 선택 후 step='edit' 진입 시 (currently in `searchDrafts`/handleNextStep 부분), 각 학생/과목에 대해 **lesson_date < today** & `check_status='unchecked'` & `content<>''` 인 `homework_assignments`를 별도 fetch → `prevUncheckedByDraft: Record<draftId, HomeworkAssignment[]>` 상태 추가.
- '숙제 상태' 섹션(FieldToggleBlock field="homework_status", line 1111-1149) UI 확장:
  - `usePerStudentHomework=true`일 때, 각 학생 블록에 **지난 숙제 내용 목록** + 항목별 결과 7-옵션 셀렉트(`HOMEWORK_STATUS_OPTIONS`) 표시.
  - 새 상태: `perStudentPrevHwResults: Record<draftId, Record<hwAssignmentId, result>>` 와 메모 `perStudentPrevHwNotes`.
  - 저장 시 항목별 `homework_assignments.update({check_status:'checked', result, notes, checked_at, checked_by})` 호출 — **버튼이 명시적으로 선택된 항목만**.

**A3. 신규 숙제 default `homework_type` → 'regular'**
- Line 334: `homework_type: 'daily'` → `'regular'`.
- Line 443 (load): fallback `'regular'` (기존 daily로 저장된 건 유지).
- Select dropdown(line 1311-1318, 1342-1349) 옵션 순서: regular(다음수업까지) 먼저, daily(데일리체크), weekly, long_term.

### B. `src/components/lessons/LessonRecordForm.tsx`

**B1. 중복 INSERT 방지 (idempotent upsert)**
- Line 1412-1427 (handleSaveDraft) & 1476-1491 (handleSubmit): `delete` 직전에 트랜잭션 없으니, **선 fetch 후 diff** 방식으로 변경하거나, 적어도 `delete` + `insert`를 `Promise.all` 묶지 않고 await 순서대로 유지. **추가**: insert payload에 `homework_type: 'regular'` 명시(현재 미지정으로 DB default 'regular' 의존). 더 중요: **carry-forward 시 동일 (student_id, subject, content, assigned_date) 중복 방지** — line 2051 INSERT 전에 동일 row 존재 여부 maybeSingle 체크.

**B2. 신규 숙제 항목에 명시적 type 옵션 UI (옵트인)**
- 현재 `newHomeworkItems` 타입은 `{ content: string }[]`만 — 'daily' 옵트인 토글이 없음. 각 항목 옆에 작은 토글/뱃지 "데일리 체크" 추가 → 켜진 경우만 `homework_type: 'daily'` 그 외 `'regular'`. State 타입을 `{ content: string; is_daily: boolean }[]`로 확장.
- handleSaveDraft/handleSubmit insert payload에 `homework_type: item.is_daily ? 'daily' : 'regular'` 명시.

### C. 데일리 자동 생성 안 함 (확인)
- 현재 코드베이스 grep 결과, lesson_record 저장이 daily homework를 자동 생성하는 트리거/엣지함수는 없음 (DailyHomeworkManager/Checklist는 사용자가 명시 페이지에서 생성). 추가 작업 없음.

## 비변경 (스코프 외)
- `homework_assignments` 스키마, RLS, trigger 변경 없음.
- 개별 일지의 '확인 저장' 버튼 동작 자체(handleSaveHomeworkCheckForItem)는 정상이라 유지.
- DailyHomeworkChecklist UI 변경 없음.

## 검증
- 빌드 통과 확인.
- 빠른 수동 시나리오 가이드:
  1. 일괄입력에서 '숙제상태'만 토글하지 않고 저장 → 이전 숙제가 자동확인되지 않음.
  2. 일괄입력에서 학생별 모드로 지난숙제 항목별 결과 선택 → 선택한 항목만 checked.
  3. 개별 일지에서 숙제 1건 입력 → 저장 2회 반복 → homework_assignments 1행만 존재.
  4. 신규 숙제에 '데일리 체크' 토글 OFF → `homework_type='regular'`로 저장.