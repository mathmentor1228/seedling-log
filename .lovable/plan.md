## 목표
내신자료실 메인을 "한 곳 업로드 → AI 자동 분류 → 실시간 반영" 허브로 재구성한다.

## 1. 새 통합 허브 (내신자료실 기본 화면)

기존 사이드바형 학교 선택 UI 위에 **신규 기본 화면(`UnifiedExamHub`)** 을 배치한다. 좌측 사이드바의 "전체일정" 항목을 누르면 이 허브가 뜬다(기본값). 학교를 선택하면 기존 학교별 상세 화면으로 이동.

허브 구성:
- **(상단) 드래그&드롭 업로드 카드** — PDF/이미지 다중 업로드
- **(중단) 통합 캘린더** — 탭 전환: `월별 캘린더 뷰` ↔ `다가오는 일정 타임라인`
- **(하단) 최근 업로드된 시험 시간표 / 시험 범위 카드** — 학교별 그룹화, 클릭 시 상세

## 2. AI 자동 분류 + 확인 모달 흐름

```text
파일 업로드
   ↓
storage(school-uploads 버킷)에 임시 저장
   ↓
edge function: analyze-school-document (이미 존재) 호출
   - 입력: 파일 URL
   - 출력: { school_name, doc_type, exam_type, subjects[], date_range, summary, items[] }
   ↓
"분류 확인 모달" 표시 (학교/유형/일정 수정 가능)
   ↓
확정 시 적절한 테이블에 INSERT:
   - 학사일정    → school_schedules (schedule_type='academic')
   - 시험 시간표 → school_schedules (schedule_type='exam') + school_files
   - 시험 범위   → school_exam_archives (+ 과목별 exam_subject_details)
```

`doc_type` 분류: `academic_calendar | exam_timetable | exam_scope | other`

## 3. 통합 캘린더 뷰 (탭)

### 탭 A — 월별 캘린더
- `react-day-picker` 기반 월 단위 그리드
- 모든 학교의 `school_schedules` + `academy_events`(category=exam) 표시
- 학교별 색상(해시 기반 자동 배정) + 학교 필터 체크박스(전체/개별)
- 날짜 클릭 시 그날의 모든 이벤트 팝오버

### 탭 B — 타임라인 리스트
- 오늘 이후 일정을 가까운 순으로 카드 나열
- D-Day 뱃지, 학교 뱃지, 유형 뱃지
- 학교 필터 select

## 4. 시험 범위 추가 코멘트 + 자료 URL

`school_exam_archives` 테이블에 컬럼 추가:
- `teacher_notes` (jsonb, default `[]`) — 담당 선생님별 코멘트 배열 `[{teacher_id, subject, note, urls[], created_at}]`

기존 `ArchiveTab`/시험범위 카드에 "내 코멘트/자료 추가" 섹션 추가. 본인 코멘트는 수정/삭제, 타인 것은 읽기.

## 5. 시험 시간표 알람

`school_schedules.schedule_type='exam'` 행 추가 시 자동으로 D-3, D-1 알림이 dashboard `ExamDdayBanner`에 잡히도록(이미 동작). 추가로 `teacher_notifications`에 D-7/D-1 INSERT 트리거 생성.

## 변경 파일

- 신규: `src/components/exam-archive/UnifiedExamHub.tsx` (메인 허브)
- 신규: `src/components/exam-archive/UploadDropzone.tsx` (드래그&드롭 + AI 호출)
- 신규: `src/components/exam-archive/ClassifyConfirmModal.tsx` (분류 확인)
- 신규: `src/components/exam-archive/UnifiedCalendarView.tsx` (월/타임라인 탭)
- 신규: `src/components/exam-archive/TeacherExamNotes.tsx` (시험범위 코멘트)
- 수정: `src/components/exam-archive/SchoolExamArchiveNew.tsx`
   - 학교 미선택(또는 "전체일정" 선택) 시 `UnifiedExamHub` 렌더
- 수정: `src/components/exam-archive/SchoolSidebar.tsx`
   - 최상단에 "📥 통합 업로드 허브" 항목
- 수정: edge function `analyze-school-document/index.ts`
   - 응답 스키마 표준화: doc_type 분류 + 학교명/일정/범위 구조화
- DB 마이그레이션:
   - `school_exam_archives.teacher_notes jsonb default '[]'`
   - 시험일정 알림 트리거(선택, 사용자 확인 후)

## 비고
- 기존 학교별 탭/기능은 그대로 유지 — 허브는 추가 진입점
- 업로드 시 학교/유형 추출 실패하면 모달에서 수동 선택 가능
