# 단어시험 QR 셀프 채점 시스템

기존 `vocab_generated_tests` 시험지 위에 **QR 인쇄 → 학생 답안 제출 → AI 채점 → 선생님 보정** 워크플로우를 얹습니다.

## 1. DB 변경

**`vocab_generated_tests`에 컬럼 추가**
- `grading_strictness` text default `'normal'` — `'strict'` (매운맛) / `'normal'` (보통맛) / `'lenient'` (순한맛). 선생님이 시험 생성 시 기본값 지정, 사후 변경 가능.

**새 테이블 `vocab_test_submissions`**
- `test_id` (→ vocab_generated_tests)
- `student_id` (→ students)
- `answers` jsonb — `[{n, prompt, answer, student_answer, is_correct, reason}]`
- `auto_score` int, `final_score` int, `total` int
- `strictness_used` text (제출 시점 기준 스냅샷)
- `submission_type` text — `'typing'` | `'photo'`
- `image_urls` text[]
- `status` text — `'graded'` | `'corrected'`
- `corrected_by`, `corrected_at`
- RLS: 본인 학생/담당 교사/관리자만 select·update, 토큰 기반 insert는 edge function이 service-role로 처리

**Storage 버킷 `vocab-submissions`** (private) + 정책

## 2. Edge Function `grade-vocab-submission`
- 입력: `{ token, student_id, submission_type, typed_answers? , image_urls? }`
- 토큰으로 시험 조회 → 정답·strictness 로딩
- `submission_type='photo'`이면 Lovable AI(`google/gemini-2.5-flash`) 멀티모달로 OCR해서 번호별 답안 추출
- AI 채점 프롬프트:
  - **매운맛**: 정답에 적힌 뜻이 여러 개(쉼표 구분)일 때 모두 포함되어야 정답
  - **보통맛**: 하나라도 일치하면 정답
  - **순한맛**: 유사·근접 의미도 정답으로 인정
- 각 문항별 `is_correct` + 짧은 `reason`(한국어) 반환
- DB에 submission 저장 후 결과 반환

## 3. 프론트 변경

**`VocabTestGenerator.tsx`**
- 시험 저장/생성 시 채점 강도(매운맛/보통맛/순한맛) 선택 UI 추가

**`VocabTestViewPage.tsx` (인쇄 시험지)**
- 우측 상단에 제출 페이지 QR 추가 (`/vocab-submit?token=...`)
- "이름" 칸 옆에 채점 강도 라벨 표기

**`/vocab-submit` 새 페이지 `VocabSubmitPage.tsx`**
1. 학생 PIN(4자리) 입력 → 본인 확인
2. 입력 방식 선택: **타이핑** / **답안 사진 업로드**
3. 타이핑: 번호별 input 자동 생성 / 사진: 다중 업로드(HomeworkImageUploader 재사용)
4. 제출 → `grade-vocab-submission` 호출
5. 즉시 결과 화면: 점수, **틀린 번호 + 학생 답안 + 정답 + 오답 사유**

**`VocabSubmissionsReview.tsx` (선생님용) — VocabTestGenerator의 새 탭 "제출 결과"**
- 시험별 제출 목록(학생/점수/시각)
- 행 클릭 시 상세 패널: 문항별 표(번호·정답·학생답·자동판정·사유)
- 각 행에 **정답으로 인정** / **오답으로 변경** 토글 → `final_score` 즉시 재계산 및 저장
- 시험 헤더에 strictness 변경 + 전체 재채점 버튼

## 기술 메모
- QR 라이브러리 `qrcode.react` 이미 설치됨
- AI는 Lovable AI Gateway 사용 (API 키 불필요)
- 사진 업로드 경로: ASCII-safe (`{student_id}/{test_id}/{ts}_{idx}.jpg`)
- 학생 본인 확인은 기존 `student_accounts.student_code` 패턴 재사용

## 변경/생성 파일
- 마이그레이션 (컬럼 추가 + 테이블 + 버킷 + RLS)
- `supabase/functions/grade-vocab-submission/index.ts` 생성
- `src/pages/VocabSubmitPage.tsx` 생성
- `src/components/vocab/VocabSubmissionsReview.tsx` 생성
- `src/components/vocab/VocabTestGenerator.tsx` 편집 (강도 선택 + 새 탭)
- `src/pages/VocabTestViewPage.tsx` 편집 (QR + 강도)
- `src/App.tsx` 편집 (라우트 추가)
