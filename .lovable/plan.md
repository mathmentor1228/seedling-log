
# 수업일지 입력 부담 감소 시스템

목표: 매일 학생별로 똑같은 내용을 반복 타이핑하는 부담을 없애고, 주간리포트 품질은 오히려 더 좋게 만든다.

## 1. 반 단위 일괄입력 화면 (A)

새 페이지/탭: **"오늘 수업 한번에 기록"** (선생님 대시보드 + Lessons 탭 진입)

- 좌측: 오늘 내 수업 슬롯 리스트 (시간 + 반 + 과목 + 학생 N명)
- 슬롯 클릭 → 우측에 한 장의 "수업 카드" 펼침
  - **공통란(한 번만 입력, 모든 학생에 적용)**
    - 진도/단원 (curriculum_map에서 자동 제안)
    - 수업 내용 (lesson_range)
    - 과제 부여 내용
  - **학생별 빠른 입력 (행당 3초)**
    - 학생 이름 | 이해도 1-5 (탭/슬라이더) | 숙제 상태 (✅/△/✗) | 짧은 코멘트 (선택)
- 한 번에 저장 → 학생 N명 lesson_records가 동일한 공통란 + 개별 평가로 생성

기존 `NewLessonEntryDialog` 일괄 생성 + `BatchLessonModal`을 합쳐 **"공통란 + 학생별 평가" 단일 화면**으로 재구성. 빈 레코드 생성 후 다시 채우는 2-스텝 흐름 제거.

## 2. 이전 회차 자동 채움 (B)

수업 카드 열릴 때 자동 prefill:
- **진도**: 같은 (teacher_id, class_id 또는 student set, subject)의 가장 최근 lesson_record의 `lesson_range` + curriculum_map의 다음 단원 제안
- **과제 부여**: 직전 회차의 과제 그대로 + "오늘 같은 과제 연장" 토글
- **이해도**: 학생별 최근 평균을 회색 placeholder로 표시 (덮어쓰기 전까지 저장 안됨)
- **숙제 상태**: `homework_submissions`/`homework_assignments`에 이미 제출 데이터가 있으면 자동 매핑 (기존 sync hook 재활용)

"이전 회차 그대로" 버튼 한 번이면 공통란이 통째로 채워짐.

## 3. 일일 필수항목 최소화 + 주간 필수 free-text (D)

`lesson_records` 폼을 두 레벨로 분리:

- **일일 필수 (매 회차)**: 이해도, 숙제 상태, 진도 (공통란에서 1회 입력)
- **주간 필수 (학생당 주 1회)**: "이번 주 핵심 코멘트" free-text 한 단락
  - 일요일 23:59 마감 알림
  - 미작성 학생 리스트가 선생님 대시보드 상단에 위젯으로 노출 (PrepLectureProposalsWidget 옆)
- **AI 주간 종합**: `generate-weekly-reports` 함수가 다음을 입력으로 받음
  - 한 주의 일일 lesson_records (이해도/숙제/진도)
  - 주간 필수 코멘트 한 단락
  - 시험/숙제 평가 결과
  → 학부모 리포트 본문 자동 작성, 선생님은 검수/수정만

## 4. 음성 메모 모드 (C, 선택 기능)

선생님이 본인 계정에서 옵션 ON 가능 (개인 설정):
- 수업 카드 우상단 🎙 버튼
- 1-2분 녹음 → ElevenLabs Scribe(`scribe_v2`)로 STT → Lovable AI(`google/gemini-2.5-flash`)가 학생별 초안 생성
  - 출력: `{학생ID: {이해도, 짧은 코멘트, 숙제 상태}}` JSON
- 선생님이 수업 카드에서 검수/수정 후 저장

ElevenLabs는 standard connector로 연결, 키는 서버에만. 음성 파일은 처리 후 즉시 폐기 (저장 안함).

## 5. 학부모 주간리포트 보장 장치

- 주간 필수 코멘트 미작성이면 AI 리포트 생성 차단 + 알림
- AI는 일일 데이터 + 주간 코멘트 모두 인용. 일일 데이터만으로는 절대 학부모 발송 불가
- 기존 `weekly_reports` 흐름/검수 단계 유지 — 자동 발송 아님

---

## 기술 변경 요약

**DB 마이그레이션**
- `lesson_records`에 컬럼 추가:
  - `weekly_summary` (text, nullable) — 주간 필수 코멘트
  - `weekly_summary_week` (date) — 해당 주 월요일
  - `is_common_entry` (boolean, default false) — 일괄 입력 출처 표시
- 인덱스: `(teacher_id, student_id, weekly_summary_week)`

**프론트엔드**
- 신규: `src/components/lessons/UnifiedLessonCard.tsx` — 공통란+학생별 평가 단일 화면
- 신규: `src/components/lessons/WeeklySummaryWidget.tsx` — 미작성 학생 리스트 (대시보드)
- 신규: `src/components/lessons/VoiceMemoCapture.tsx` — 녹음/STT/AI 초안 UI (옵션 ON시 표시)
- 신규: `src/pages/UnifiedLessonEntryPage.tsx` (또는 Lessons 탭 추가)
- 수정: `NewLessonEntryDialog`, `BatchLessonModal` — 신규 화면으로 라우팅
- 수정: `TeacherDashboard.tsx` — WeeklySummaryWidget 추가

**Edge Functions**
- 신규: `transcribe-lesson-memo` (ElevenLabs Scribe STT)
- 신규: `draft-lesson-from-memo` (Lovable AI로 학생별 초안 생성)
- 수정: `generate-weekly-reports` — `weekly_summary` 입력 추가, 미작성시 차단

**Connectors**
- ElevenLabs 연결 (음성 메모 옵션에만 필요)

---

## 단계별 진행

이 작업은 크니까 두 단계로 나눠서 작업할게요:

**1단계 (먼저 실행)** — A + B + D
- 일괄입력 화면, 이전 회차 자동채움, 주간 필수 코멘트, AI 주간 종합 보강

**2단계 (1단계 검증 후)** — C 음성 메모
- ElevenLabs 연결, 녹음/STT/초안 생성 흐름 추가
- 선생님 개인 설정에서 ON/OFF

승인하시면 1단계부터 바로 시작합니다.
