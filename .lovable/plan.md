## 목표
시험 일정(`school_schedules` exam)이 등록되면 **D-14 시점**에 시스템이 자동으로 "직전특강(시험 전날 수업)" 후보를 만들고, 담당 선생님이 빈 슬롯 중 하나를 골라 확정·공지하면 내신특강과 학생/학부모 화면에 그대로 반영되는 **고정 프로세스**.

## 핵심 로직

### 1) 누가/어떤 과목/어느 학생인지 결정
이미 있는 데이터로 자동 매핑됨 (추가 입력 불필요):
- 학교: `school_schedules.school_name`
- 학년: 시험 일정의 grade (없으면 그 학교 학생의 전체 grade) 
- 학생: `students.school_name` + `students.grade_year` 일치 + 재원중
- 담당쌤: `student_subject_teachers`(과목별 매핑). 매핑 없는 과목은 자동지정(1명) 규칙 적용. 그래도 비면 관리자 알림.

→ `(school, grade, subject, teacher_id)` 4튜플 단위로 묶음 (선생님이 다르면 분리).

### 2) D-14 자동 트리거
신규 cron `auto-generate-prep-lectures` (매일 06:00 KST):
- `school_schedules` schedule_type='exam' 중 14일 이내 시험 조회
- 위 4튜플 단위로 `prep_lecture_proposals` 후보 row 생성 (이미 있으면 skip)
- 시험 '전날' 날짜를 target_date로 저장

### 3) 빈 슬롯 제안 (수동 선택)
선생님 대시보드에 "직전특강 제안" 위젯:
- 카드별: 시험명 / 학교+학년+과목 / 대상학생 N명 / 시험전날 날짜
- 그 선생님의 그날 `class_schedules` + `exam_prep_sessions` + `study_sessions` + `routine_schedules`로 점유 시간 계산
- 09:00~22:00 30분 단위에서 빈 구간만 시간대 chip으로 표시
- 강의실(`classrooms`)도 함께 빈 곳 제안
- 선생님이 시간/강의실/소요시간 선택 → "확정" + (옵션) "학생·학부모 공지" 체크박스

### 4) 확정 시
- `exam_prep_courses` (subject_type='직전특강', is_finals=true)에 INSERT
- 대상 학생 전원 `exam_prep_enrollments`에 INSERT (status='confirmed')
- `exam_prep_sessions` + `exam_prep_time_slots` 생성 (시험 전날, 선택시간)
- 공지 체크 시 → 학생 PWA(StudentExamPrepSchedule)·학부모 포털에 즉시 노출 + `parent_notifications`·`teacher_notifications` 발송
- `prep_lecture_proposals.status='confirmed'`

### 5) 매핑 누락 시 UX
- 후보 생성 시 담당쌤이 없는 과목은 별도 "담당쌤 지정 필요" 알림 카드로 분리 → 관리자가 `StudentSubjectTeacherMapping`으로 보낸 뒤 다시 매핑

## DB 변경

```sql
CREATE TABLE prep_lecture_proposals (
  id uuid PK,
  school_schedule_id uuid REFERENCES school_schedules,
  school_name text,
  grade_year int,
  subject text,
  teacher_id uuid REFERENCES profiles,
  student_ids uuid[],
  exam_date date,
  target_date date,            -- 시험 전날
  status text DEFAULT 'pending', -- pending|confirmed|dismissed|needs_teacher
  confirmed_course_id uuid REFERENCES exam_prep_courses,
  selected_start_time time,
  selected_end_time time,
  selected_classroom_id uuid,
  notify_students bool DEFAULT true,
  created_at, updated_at
);
-- UNIQUE(school_schedule_id, subject, teacher_id)
```

GRANT + RLS: teacher는 본인 teacher_id row만 RW, admin/principal 전체.

## 신규/수정 파일

**Edge functions (신규)**
- `supabase/functions/auto-generate-prep-lectures/index.ts` — cron 진입점, D-14 시험 → 후보 생성
- `supabase/functions/confirm-prep-lecture/index.ts` — 확정 + exam_prep_courses 생성 + 공지

**Frontend (신규)**
- `src/components/exam-prep/PrepLectureProposalsWidget.tsx` — 선생님 대시보드 위젯 (카드 + 빈 슬롯 chip + 확정 다이얼로그)
- `src/components/exam-prep/PrepLectureConfirmDialog.tsx` — 시간/강의실/공지여부 선택

**Frontend (수정)**
- `src/pages/TeacherDashboard.tsx` & `src/components/dashboard/...` — 위젯 마운트
- `src/components/ExamPrepScheduleManager.tsx` — 직전특강 코스 필터/표기 (배지 "직전특강")
- `src/components/exam-prep/FinalPrepOverview.tsx` — 직전특강도 자동 노출 (이미 exam_prep_courses 기반이므로 동작)
- `src/components/student/StudentExamPrepSchedule.tsx` — 직전특강 배지

**Cron**
- pg_cron으로 매일 06:00 KST `auto-generate-prep-lectures` 호출

## 흐름
```text
school_schedules (exam) 등록
        │
   매일 06:00 cron
        ▼
auto-generate-prep-lectures
  └─ 14일 이내 시험 × (학교,학년,과목,담당쌤) 4튜플
  └─ prep_lecture_proposals INSERT (전날 날짜)
        ▼
선생님 대시보드 위젯에 카드 표시
  └─ 빈 슬롯 chip (정규수업/내신특강 등 충돌 제외)
  └─ 선생님: 시간 선택 + 공지 체크 + 확정
        ▼
confirm-prep-lecture
  ├─ exam_prep_courses + sessions + time_slots 생성
  ├─ 대상학생 enrollments 자동 등록
  └─ 공지 체크 시 학생/학부모 알림
        ▼
StudentExamPrepSchedule / 학부모 포털에 노출
```

## 비고
- 추가로 명시 입력해야 할 건 없음 — `student_subject_teachers` 매핑만 정확하면 자동.
- 매핑 비어있는 과목(수학 등 후보 多)은 미리 알림으로 채워달라고 유도.
