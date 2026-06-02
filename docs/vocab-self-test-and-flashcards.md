# 단어 학습 (셀프 테스트 · 암기카드) 프로세스 & 적용 방식

> 학생 PWA(`/student`)의 단어 학습 모듈 전체 동작 정리 문서. 신규 옵션 추가 시 이 문서의 흐름을 기준으로 확장한다.

---

## 1. 진입 및 데이터 로딩

- **진입점**: `src/pages/student/StudentVocab.tsx`
- 학생 로그인 후 `studentApi.getVocabCards()` 호출 → Edge Function `supabase/functions/student-data/index.ts` 의 `getVocabCards` 핸들러가 다음을 반환.
  - `sets`: 학생에게 배정된 `VocabSetInfo[]` (set_id, set_title, folder_name, required_rounds, words[])
  - `completions`: 과거 학습 완료 기록 (`vocab_completions`)
  - `test_level`, `test_time_limit`: 선생님이 기본값으로 설정한 난이도/제한시간
  - `active_test_assignment`: 현재 선생님이 배정한 강제 테스트 (있으면 자동으로 `studyType='test'` 로 진입)
- 단어 데이터 구조:
  ```ts
  interface VocabWord {
    english: string;
    meaning: string;
    english_definition?: string | null; // 영영 사전 정의 (있으면 영영 모드 활성)
  }
  ```

---

## 2. 학습 모드 선택 (`studyType`)

| 값 | 라벨 | 설명 | 컴포넌트 |
|---|---|---|---|
| `flashcard` | 카드 | 암기카드 (앞면/뒷면 플립) | `StudentVocab` 내부 카드뷰 |
| `test` | 테스트 | 선생님 배정 또는 학생 자발 테스트 | `VocabSelfTest` (배정 모드) |
| `listening` | 듣기 | TTS 듣고 스펠/뜻 입력 | `VocabSelfTest` (mode='listening') |
| `eng_eng_mc` | 영영 객관식 | 영영 정의 → 단어 매칭 (객관식) | `EnglishEnglishTest` |
| `eng_eng_typing` | 영영 주관식 | 영영 정의 → 단어 타이핑 | `EnglishEnglishTest` |
| `self_test` | 셀프 테스트 | 학생이 옵션을 직접 정해 응시 | `VocabSelfTest` (modePool) |

> 영영 모드는 `english_definition` 이 1개라도 존재하는 단어셋이 선택돼야 노출됨 (`hasEngDefinitions`).

---

## 3. 암기카드 (Flashcards)

### 동작 흐름
1. 단어셋 다중 선택 → `selectedSetIds`
2. `mode` 선택: `eng_to_kor` (영→한) / `kor_to_eng` (한→영)
3. `startFlashcards()` 호출 → 단어 Fisher–Yates 셔플 → `cards` 세팅
4. 카드뷰:
   - 앞면: 모드에 따라 영어 또는 한국어 표시 + TTS(`speakEnglish`) 버튼
   - 클릭 → `flipped` 토글, 뒷면에서 정답 확인
   - 학생이 직접 `correct` / `wrong` 마킹 (`markResult`) → 자동 다음 카드
   - 좌/우 화살표로 자유 이동, `Shuffle` 로 재배치 가능
5. 마지막 카드까지 마킹 완료 → `submitCompletion()` → `vocab_completions` insert
   - 저장 필드: `word_set_ids, correct_count, wrong_count, total_count, mode, completed_at`
   - 토스트: "학습 기록 저장 완료! ✅"

### 사용 데이터
- 입력: `vocab_sets.words` (선생님이 배정 + 단어 입력)
- 출력: `vocab_completions` (학생별/셋별 학습 누적)
- 대시보드(`VocabDashboard`)에서 `required_rounds` 대비 진행률 계산에 사용

---

## 4. 셀프 테스트 (Self Test)

학생 주도형 진단 테스트. 무제한 재응시 가능하며 결과는 담당 선생님에게 자동 보고된다.

### 4.1 설정 옵션 (`StudentVocab.tsx` L453-521)
- **단어 수** (`selfTestWordCount`): 5–200, 기본 20
- **난이도** (`selfTestLevel`):
  - Lv.1: 3지선다, 문항당 4초
  - Lv.2: 5지선다, 문항당 4초 (기본)
  - Lv.3: 주관식, 문항당 6초
- **출제 방식 (복수 선택 → 랜덤 혼합)**:
  - `selfModeEK` 영→한
  - `selfModeKE` 한→영(스펠)
  - `selfModeListen` 듣기→뜻
- 최소 1개 출제 방식은 필수. 0개이면 시작 버튼 비활성화.

### 4.2 응시 흐름 (`VocabSelfTest.tsx`)
1. `startFlashcards()` 에서 `cards = shuffle(words).slice(0, selfTestWordCount)`
2. `VocabSelfTest` 마운트 → `modePool` 이 2개 이상이면 문항마다 랜덤 모드 선택
3. 문항당 타이머(레벨에 따른 시간) 시작 → 정답/오답/시간초과 자동 판정
4. 채점 규칙:
   - `normalize()`: 공백/괄호/기호/대소문자 제거
   - `stripPosTag()`: `v.`, `n.`, `명사` 등 품사 태그 제거
   - 한국어는 콤마/슬래시로 분리된 복수 뜻 중 하나만 맞아도 `correct`
   - 주관식 영어는 Levenshtein 거리 1 이내 → `partial` (오타 허용)
5. 종료 시 메타 데이터 콜백:
   ```ts
   { startedAt, finishedAt, durationSeconds }
   ```

### 4.3 결과 저장
- `studentApi.submitVocabCompletion(...)` → Edge `student-data` 의 `submitVocabCompletion`
- `vocab_completions` insert 필드:
  - `is_self_test: true`
  - `test_source: 'self'`
  - `mode`: `<modes>_self_test` (예: `mixed_self_test`, `eng_to_kor_self_test`)
  - `self_test_options`: `{ word_count, level, modes: [...] }`
  - `started_at`, `finished_at`, `duration_seconds`, `expected_seconds`
  - `notified_teacher_id`: 학생의 영어 담당 선생님 ID 자동 매핑
- 토스트: "셀프 테스트 기록 저장 완료! ✅"

### 4.4 선생님 측 노출
- `src/components/vocab/VocabSelfTestResults.tsx` 단어시험관리 → 결과 분석 → 셀프 테스트 탭
  - 필터: `is_self_test=true`
  - 표시: 학생명, 소요시간/기준시간, 정답률, level, modes, 보정 여부
  - 선생님이 점수 보정 시 `teacher_corrected_at`, `teacher_correction_note`, `original_correct_count/wrong_count` 기록

---

## 5. 선생님 배정 테스트 (참조용)

셀프 테스트와 동일 컴포넌트(`VocabSelfTest`)를 재사용하지만 진입 경로가 다르다.

- 배정: `VocabTestAssignManager` → `vocab_test_assignments` insert
- 학생 로그인 시 `active_test_assignment` 로 내려옴 → 자동 `studyType='test'` 진입
- 학생은 단어셋/모드 변경 불가 (`word_set_ids`, `test_direction` 고정)
- 난이도/제한시간은 선생님 기본값 사용, 학생 변경 가능 (필요 시 잠금 가능)
- `is_self_test: false`, `test_source: 'assigned'` 로 저장

---

## 6. 데이터 모델 요약

```text
vocab_sets (단어셋)
  ├─ id, title, folder_name, required_rounds
  └─ words: [{ english, meaning, english_definition? }]

student_vocab_assignments (학생↔셋 배정)
  └─ student_id, set_id, assigned_by, assigned_at

vocab_test_assignments (선생님 강제 테스트)
  └─ student_id, word_set_ids[], test_direction, level, time_limit, active

vocab_completions (학습/테스트 결과 통합)
  ├─ student_id, word_set_ids[], mode, correct/wrong/total_count
  ├─ is_self_test, test_source ('self' | 'assigned')
  ├─ self_test_options (jsonb)
  ├─ started_at, finished_at, duration_seconds, expected_seconds
  ├─ notified_teacher_id
  └─ teacher_corrected_at, teacher_correction_note, original_*
```

---

## 7. 핵심 파일 매핑

| 영역 | 파일 |
|---|---|
| 학생 진입/모드 분기 | `src/pages/student/StudentVocab.tsx` |
| 셀프/배정 테스트 엔진 | `src/components/student/VocabSelfTest.tsx` |
| 영영 테스트 | `src/components/student/EnglishEnglishTest.tsx` |
| 학생 API | `src/lib/studentApi.ts` |
| 백엔드 핸들러 | `supabase/functions/student-data/index.ts` (`getVocabCards`, `submitVocabCompletion`) |
| 선생님 셀프결과 | `src/components/vocab/VocabSelfTestResults.tsx` |
| 선생님 배정 | `src/components/vocab/VocabTestAssignManager.tsx` |
| 단어 입력/관리 | `src/components/vocab/VocabTestGenerator.tsx`, `VocabScheduleGenerator.tsx` |
| PDF→단어 파싱 | `supabase/functions/parse-vocab-pdf/index.ts` |
| QR 시험지 채점 | `supabase/functions/grade-vocab-submission/index.ts` |

---

## 8. 신규 옵션 추가 시 체크리스트

새 옵션(예: "약점단어 자동 출제", "AI 예문 모드", "스피드런" 등)을 추가할 때 따라야 할 표준 절차.

### 8.1 UI
1. `StudentVocab.tsx` 의 `studyType` 유니온 타입에 새 값 추가
2. 학습 방법 그리드(L391–451)에 버튼 1개 추가
3. 전용 설정이 필요하면 `self_test` 카드(L454-521) 패턴으로 별도 설정 카드 추가
4. `startFlashcards()` 분기 + 시작 버튼 라벨/디스에이블 조건 갱신

### 8.2 응시 컴포넌트
- 셀프테스트 변형이면 `VocabSelfTest` 에 `mode` 추가 또는 `modePool` 확장
- 완전히 다른 UX이면 `src/components/student/Vocab<NewMode>.tsx` 신규 생성 후
  `StudentVocab.tsx` 의 `testMode` 분기에서 마운트

### 8.3 데이터/저장
- 기존 `vocab_completions` 로 충분한지 판단 (보통 충분).
  - `mode` 문자열 컨벤션: `<scheme>_self_test` 또는 `<scheme>_assigned`
  - 추가 메타데이터는 `self_test_options` jsonb 에 키 확장 (마이그레이션 불필요)
- 새 통계 축이 필요하면 컬럼 추가 마이그레이션. **반드시 GRANT 포함.**

### 8.4 선생님 대시보드 반영
- `VocabSelfTestResults.tsx` 필터/표시 컬럼에 새 옵션 라벨 노출
- 필요 시 `VocabDashboard.tsx` 의 카운트/필터에 mode 매칭 규칙 추가

### 8.5 분석/리포트
- 주간 리포트(`generate-weekly-reports`) 가 mode 문자열을 사용 중. 새 mode 추가 시 라벨 매핑 업데이트
- 학생 PWA 의 자기 학습 이력(있다면) UI 라벨 확인

---

## 9. 정책 & 제약

- 셀프테스트는 **무제한 재응시** 가능, 모든 시도가 `vocab_completions` 에 누적 저장됨
- 점수 보정은 선생님만 가능, 원본값은 `original_*` 컬럼에 보존
- TTS 는 `ttsUtils.speakEnglish` 사용 (브라우저 SpeechSynthesis)
- 채점 정책(strictness)은 QR 시험지(`grade-vocab-submission`)에만 적용, 학생 PWA 셀프테스트는 위 4.2 의 normalize 규칙으로 자체 판정
- 모든 storage 경로는 ASCII 안전 (timestamp+UUID) — 단어 데이터에는 storage 사용 없음

---

이 문서를 기준선으로, 추가하고자 하는 "또 다른 옵션"의 컨셉을 알려주시면 8장 체크리스트에 맞춰 바로 설계/구현해 드리겠습니다.
