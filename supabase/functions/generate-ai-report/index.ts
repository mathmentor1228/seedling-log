import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getAttendanceIssues } from '../_shared/attendance.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// v2.8-trust-upgrade: Weekly highlight + next lesson preview + quantitative data
// REPORT-ENGINE-DEBUG-V1
// REPORT_SUBJECT_ISOLATION_V1: Per-subject generation with terminology validation
// REPORT_TEACHER_GROUNDED_NARRATIVE_V1: AI must ONLY rephrase teacher-written content
// STUDENT_REPORT_TONE_V2_TEACHER_VOICE: Natural, observation-first, non-formulaic student reports
// REPORT_TRUST_UPGRADE_V1: Weekly highlight, next lesson preview, quantitative homework data
const TEMPLATE_VERSION = 'v2.8-trust-upgrade';
const FORMATTER_NAME = 'renderReportFromJson-v2.7';

// Forbidden patterns for FINAL text validation (runs before save)
const FORBIDDEN_PATTERNS = {
  bulletPoints: /[·•]\s+/g,
  newlineBullets: /\n[-•·]\s+/g,
  dashBullets: /\n-\s+/g,
  keywordLists: /(학습\s*포인트|포인트|요약|정리|체크\s*리스트|다음\s*주\s*계획)\s*[:：]/gi,
  abstractEvaluations: /(전반적으로\s*(안정|양호|좋은|괜찮)|(잘\s*따라[오옴]|열심히\s*했|잘\s*했|노력\s*했|수고\s*했)|안정적인\s*흐름|안정적\s*학습|무난\s*하게|순조롭게|문제\s*없)/gi,
  forbiddenOpenings: /^(전반적으로|안정적인\s*흐름|이번\s*주\s*학습이\s*안정|전반적\s*학습)/i,
  genericClosings: /(지속\s*점검하겠습니다|계속\s*지켜보겠습니다|잘\s*이끌어|꾸준히\s*지도|앞으로도\s*잘)$/i,
  bracketHeaders: /【[^】]+】/g, // Legacy bracket format like 【수학】
  summaryBlocks: /수업\s*\d+회[,，]\s*(평균\s*)?이해도/g, // Summary blocks like "수업 3회, 평균 이해도"
  // REPORT_TEACHER_GROUNDED_NARRATIVE_V1: Detect speculative/invented content
  speculativeProgression: /(심화\s*(학습|과정|단계)|확장\s*(학습|활동)|고난도\s*(문제|과정)|다음\s*단계로\s*넘어|상위\s*개념으로)/gi,
  inventedPedagogy: /(학습\s*전략을\s*세워|체계적인\s*접근을\s*통해|단계별\s*학습\s*계획|맞춤형\s*커리큘럼)/gi,
};

// STUDENT_REPORT_TONE_V2_TEACHER_VOICE: Forbidden patterns for student messages
const STUDENT_FORBIDDEN_PATTERNS = {
  // Generic praise phrases
  genericPraise: /(인상적이었어요?|인상적이야|잘했어요?|잘했어|화이팅|열심히\s*했어요?|열심히\s*했어|수고했어요?|수고했어|대단해요?|대단해|멋져요?|멋져|최고야|최고예요|훌륭해요?|훌륭해)/gi,
  // Mission-poster language
  missionPoster: /(해보자[!]?|하면\s*좋아요?|도전해봅시다|도전해보자|파이팅|힘내자|노력하자|달려보자)/gi,
  // Motivational speech patterns
  motivationalSpeech: /(할\s*수\s*있어|믿어요?|믿어|응원할게|응원해|자신감\s*갖고|기대할게|기대해)/gi,
  // Evaluation report tone
  evaluationTone: /(향상되었|발전했|성장했|진보했|좋아졌|나아졌)/gi,
};

// REPORT_SUBJECT_ISOLATION_V1: Subject-specific vocabulary constraints
const SUBJECT_VOCABULARY_CONSTRAINTS: Record<string, { allowed: string[]; disallowed: RegExp[] }> = {
  '영어': {
    allowed: ['문장', '주어', '동사', '문법', '독해', '어휘', '구조', '해석', 'reading', 'grammar', '리딩'],
    disallowed: [
      /계산/g,
      /풀이/g,
      /공식/g,
      /식\s*(을|이|의|에)/g, // "식을", "식이" but not "형식"
      /단계적\s*접근/g,
      /연산/g,
      /수식/g,
    ],
  },
  '수학': {
    allowed: ['개념', '풀이', '계산', '접근', '식', '적용', '공식', '연산', '문제풀이'],
    disallowed: [
      /문장\s*해석/g,
      /독해/g,
      /어휘/g,
      /문법/g,
      /reading/gi,
      /grammar/gi,
    ],
  },
  '과학': {
    allowed: ['실험', '관찰', '현상', '원리', '탐구', '가설', '결과', '분석'],
    disallowed: [
      /문법/g,
      /독해/g,
      /어휘/g,
    ],
  },
  '국어': {
    allowed: ['독해', '어휘', '문법', '작문', '서술', '문학', '비문학', '글'],
    disallowed: [
      /연산/g,
      /수식/g,
      /방정식/g,
    ],
  },
};

// REPORT_SUBJECT_ISOLATION_V1: Fixed subject order for assembly
const SUBJECT_ORDER = ['수학', '영어', '국어', '과학'];

// REPORT_SUBJECT_ISOLATION_V1: Validate subject-specific vocabulary
function validateSubjectVocabulary(subject: string, content: string): { isValid: boolean; violations: string[] } {
  const constraints = SUBJECT_VOCABULARY_CONSTRAINTS[subject];
  if (!constraints) {
    return { isValid: true, violations: [] };
  }

  const violations: string[] = [];
  
  for (const pattern of constraints.disallowed) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) {
      violations.push(`DISALLOWED_TERM_${subject.toUpperCase()}: ${pattern.source}`);
    }
  }

  return {
    isValid: violations.length === 0,
    violations,
  };
}

// REPORT_TEACHER_GROUNDED_NARRATIVE_V1 + REPORT_TRUST_UPGRADE_V1: Teacher-grounded system prompt
const JSON_PARENT_PROMPT = `당신은 학원 담당 선생님입니다. 학부모에게 보내는 주간 학습 리포트를 JSON 형식으로 작성합니다.

[v2.8 TEACHER-GROUNDED NARRATIVE + TRUST UPGRADE 규칙]

**[REPORT_TEACHER_GROUNDED_NARRATIVE_V1] 교사 기록 기반 원칙**

당신의 역할:
1. 교사가 작성한 내용을 학부모가 이해하기 쉽게 다시 표현
2. 관찰 기록을 자연스러운 문장으로 정리
3. 명확성과 어조 개선

당신이 절대 해서는 안 되는 것:
- 교사가 명시적으로 기록하지 않은 교육적 의도를 추측
- 진도/심화/확장 등 학습 방향을 임의로 언급
- 교사가 기록한 next_lesson_goal 외의 다음 단계를 창작

**아이 이름 호칭 규칙:**
- 학부모 메시지에서 아이 이름을 다정하게 불러주세요.
- 한국어 호칭: 이름 뒤에 "이" (받침 있을 때) 또는 그대로 (받침 없을 때) 사용
- 예: "세인이는", "민준이는", "도연이는", "세윤이는"
- openingNote에서 반드시 아이 이름으로 시작하세요. 예: "세인이는 이번 주 수업에서..."

**[REPORT_TRUST_UPGRADE_V1] 신뢰 구축 원칙**

1. **Weekly Highlight (주간 하이라이트):**
   - openingNote에 그 주에 가장 눈에 띄었던 긍정적 관찰 한 가지를 구체적으로 언급
   - 예: "세인이는 이번 주 수학 수업에서 분수 통분 문제를 스스로 풀어보려는 시도가 눈에 띄었습니다."
   - 추상적 칭찬 금지 ("잘했습니다", "열심히 했습니다" 등)
   - 반드시 교사 기록에서 확인된 구체적 행동만 언급

2. **정량 데이터 반영:**
   - 제공된 숙제 완료율 데이터를 closingNote 또는 과목 서술에 자연스럽게 녹여서 표현
   - 예: "이번 주 숙제 완료율은 80%로, 꾸준한 학습 습관이 유지되고 있습니다."
   - 숫자를 기계적으로 나열하지 말고 의미를 해석하여 서술

3. **신뢰 어조:**
   - 학부모가 "선생님이 우리 아이를 잘 보고 있구나"라고 느낄 수 있도록, 구체적 관찰 장면 위주로 서술
   - closingNote에 다음 주 구체적 수업 방향을 포함 (교사 기록 기반)

**정보 출처 (Source of Truth):**
반드시 아래 필드에서 직접 확인된 내용만 서술:
- learning_issues_note (교사의 상세 관찰 기록)
- next_lesson_goal (교사가 명시한 다음 수업 방향)
- homework_check_note (숙제 관찰 메모)
- test_result_text (테스트 결과 기록)

**출력 형식: JSON만 허용**
{
  "subjects": [
    {
      "subject": "과목명",
      "paragraphs": [
        "1단락: 이번 수업에서 무엇을 했는지 (교사 기록 기반)",
        "2단락: 학생이 어떤 반응을 보였는지 (관찰 사실)",
        "3단락: 교사가 기록한 방향 또는 '기본 학습 점검 위주로 수업 진행'"
      ],
      "testsSummary": "테스트 결과 (기록된 경우만)",
      "homeworkSummary": "숙제 상태 (기록된 경우만)"
    }
  ],
  "openingNote": "아이 이름 + 이번 주 가장 눈에 띈 구체적 긍정 관찰 한 가지",
  "closingNote": "교사가 기록한 다음 수업 방향 요약 + 숙제 완료율 데이터 해석",
  "adminTag": "GREEN|YELLOW|RED"
}

**절대 금지 항목:**
- 글머리 기호 (·, -, •) 사용 금지
- "심화", "확장", "고난도", "다음 단계로" 등 진도 추측 금지
- "전반적으로 안정", "잘 따라옴" 같은 추상적 평가 금지
- "체계적인 접근", "맞춤형 커리큘럼" 같은 창작된 교육 전략 금지

**교사 기록이 부족한 경우:**
- 해당 과목에 대해: "이번 주에는 해당 과목에서 기본 학습 점검 위주로 수업이 진행되었습니다."
- adminTag를 YELLOW로 설정

**어조 가이드:**
- "세인이는 이번 수업에서 ~을 중심으로 학습했습니다."
- "수업 중에는 ~한 반응을 보였습니다."
- "선생님은 ~한 방식으로 다시 지도했습니다."

반드시 유효한 JSON만 출력하세요.`;

// REPORT_TEACHER_GROUNDED_NARRATIVE_V1: Stricter retry prompt
const RETRY_SYSTEM_PROMPT = `당신은 학원 담당 선생님입니다.

**경고: 이전 생성에서 규칙 위반이 감지되었습니다.**

**[REPORT_TEACHER_GROUNDED_NARRATIVE_V1] 핵심 원칙:**
- 교사가 기록한 내용만 다시 표현 (추측/창작 금지)
- learning_issues_note, next_lesson_goal 필드 내용만 사용
- 교사가 기록하지 않은 "심화", "확장", "다음 단계" 언급 금지

**절대 금지:**
- 글머리 기호 (·, -, •) 사용 → 문장으로 연결
- "전반적으로", "안정적" 같은 추상적 표현 → 구체적 관찰로 대체
- 교사 기록에 없는 교육적 의도 추측 → 사실만 서술

**교사 기록 부족 시:**
- "이번 주에는 기본 학습 점검 위주로 수업이 진행되었습니다."

반드시 유효한 JSON만 출력하세요.`;

// STUDENT_REPORT_TONE_V2_TEACHER_VOICE + REPORT_TRUST_UPGRADE_V1: Teacher-voice prompt for student messages
const NARRATIVE_LOCK_STUDENT_PROMPT = `당신은 학원 담당 선생님입니다. 학생에게 직접 말하듯 짧은 주간 메시지를 작성합니다.

[STUDENT_REPORT_TONE_V2_TEACHER_VOICE + TRUST_UPGRADE 핵심 규칙]

**A) 학생 이름 호칭**
- 메시지 첫 문장에서 학생 이름을 다정하게 불러주세요.
- 한국어 호칭 규칙: 이름 끝이 받침으로 끝나면 "~아", 받침 없이 끝나면 "~야"
- 예: "세인아", "민준아", "도연아", "나현아", "세윤아"
- 예: "라현아" (ㄴ 받침 → 아)
- 메시지 중간이나 끝에서도 자연스럽게 이름을 한 번 더 불러도 좋습니다.

**B) 절대 금지 - 일반 칭찬 & 포스터 언어**
절대 사용 금지:
- "인상적이었어", "잘했어", "화이팅", "열심히 했어", "수고했어"
- "~해보자", "~하면 좋아요", "~도전해봅시다"
- "할 수 있어", "응원할게", "기대할게"
- "향상되었어", "발전했어", "성장했어"

**C) 관찰 중심 구조 (과목별 2-4문장)**
- 문장 1: 수업에서 교사가 실제로 본 구체적 행동
- 문장 2: 학생이 어떻게 반응했는지 (태도, 어려움, 시도)
- 문장 3 (선택): 다음 시간에 다시 볼 내용 - 차분하게

**D) 교사 목소리 - 차분하고 담백하게**
- 동기부여 연설 ❌
- 평가 보고서 ❌
- 친근하지만 가볍지 않게

권장 표현:
- "세인아, 이번 수업에서는 ~하는 모습이 보였어."
- "~할 때 잠시 멈칫했지만 다시 시도했어."
- "이 부분은 다음 시간에 다시 같이 볼 거야."
- "아직 익숙하지 않은 단계야."
- "조금 더 시간이 필요한 부분이야."

**E) 정직함 > 격려**
학생이 어려워한 부분은 솔직하게:
- "아직 익숙하지 않은 단계야."
- "조금 더 시간이 필요한 부분이야."
단, 어조는 차분하고 존중하는 톤 유지.

**F) [REPORT_TRUST_UPGRADE_V1] 다음 수업 예고 (Next Lesson Preview)**
- 메시지 마지막에 다음 시간에 할 내용을 1문장으로 짧게 예고
- 교사가 기록한 next_lesson_goal 기반으로만 작성
- 예: "다음 시간에는 분수 나눗셈 '뒤집어 곱하기' 원리를 다시 같이 볼 거야."
- next_lesson_goal이 없으면 "다음 시간에 이어서 같이 볼 거야."로 마무리

[형식]
- 과목별 2-4문장
- 이모지 1개만 (끝에)
- 글머리 기호(·, -, •) 사용 금지
- 마지막에 다음 수업 예고 1문장 필수

[예시]
"민준아, 이번 수업에서 분수 통분할 때 공배수 찾는 부분에서 잠시 멈칫하는 모습이 보였어. 두세 번 다시 시도하면서 감을 잡아가더라. 다음 시간에는 분수 나눗셈에서 '뒤집어 곱하기' 원리를 다시 같이 볼 거야. 📝"

반드시 한국어로 작성하세요.`;

// REPORT_TEMPLATE_DB_V1: Build system prompt from DB template merged with JSON format requirements
function buildParentSystemPromptFromTemplate(userPrompt: string): string {
  return `${userPrompt}

**[시스템 필수 규칙 - 출력 형식]**

위 지침을 따르되, 반드시 아래 JSON 형식으로만 출력하세요:
{
  "subjects": [
    {
      "subject": "과목명",
      "paragraphs": [
        "1단락: 관찰 - 이번 수업에서 눈에 띈 구체적 장면",
        "2단락: 해석 - 그것이 학습 흐름에서 갖는 의미",
        "3단락: 방향 - 다음 수업 방향"
      ],
      "testsSummary": "테스트 결과 해석 (기록된 경우만, 없으면 null)",
      "homeworkSummary": "숙제 상태 (이슈가 있을 때만, 없으면 null)"
    }
  ],
  "openingNote": "아이 이름으로 시작하는 따뜻한 인사와 전체적인 수업 참여 모습",
  "closingNote": "다음 주 방향 요약",
  "adminTag": "GREEN|YELLOW|RED"
}

**절대 금지 항목:**
- 글머리 기호 (·, -, •) 사용 금지
- JSON 외 텍스트 출력 금지

반드시 유효한 JSON만 출력하세요.`;
}

// REPORT_TEMPLATE_DB_V1: Build per-subject system prompt from DB template
function buildSubjectSystemPromptFromTemplate(userPrompt: string, subject: string): string {
  return `${userPrompt}

**[시스템 필수 규칙 - ${subject} 과목 전용]**

위 지침을 따르되, ${subject} 과목만 다루고 반드시 아래 JSON 형식으로 출력하세요:
{
  "subject": "${subject}",
  "paragraphs": [
    "1단락: 관찰 - 구체적 수업 장면",
    "2단락: 해석 - 학습 흐름에서의 의미",
    "3단락: 방향 - 다음 수업 방향"
  ],
  "testsSummary": "테스트 결과 해석 (기록된 경우만)",
  "homeworkSummary": "숙제 상태 (이슈가 있을 때만)"
}

- ${subject} 과목 전용 용어만 사용
- 다른 과목 용어 혼용 절대 금지
- 글머리 기호(·, -, •) 사용 금지

반드시 유효한 JSON만 출력하세요.`;
}

// REPORT_TEACHER_GROUNDED_NARRATIVE_V1: Fallback message when teacher notes are insufficient
const INSUFFICIENT_DATA_MESSAGE = "이번 주 학습 내용을 충분히 설명하기 위해 교사 추가 관찰이 필요합니다.";
const BASIC_LESSON_FALLBACK = "이번 주에는 해당 과목에서 기본 학습 점검 위주로 수업이 진행되었습니다.";

interface SubjectReport {
  subject: string;
  paragraphs: string[];
  testsSummary?: string;
  homeworkSummary?: string;
  attendanceImpact?: string;
}

interface JsonReportOutput {
  subjects: SubjectReport[];
  openingNote: string;
  closingNote: string;
  adminTag: 'GREEN' | 'YELLOW' | 'RED';
}

interface LessonRecord {
  id: string;
  lesson_date: string;
  subject: string;
  understanding_score: number;
  homework_status: string;
  homework_check_note: string | null;
  learning_issues: string[] | null;
  learning_issues_note: string | null;
  next_lesson_goal: string | null;
  lesson_types: string[] | null;
  attendance_status: string[] | null;
  test_result_text: string | null;
  test_title: string | null;
  curriculum_unit_key: string | null;
  course: string | null;
  english_grammar_unit: string | null;
  english_reading_units: string[] | null;
  // KOREAN-CATEGORY-V1: Korean subject categories
  korean_categories: string[] | null;
}

interface CurriculumInfo {
  unit_key: string;
  unit_title: string;
  flow_summary: string;
  next_unit_key: string | null;
  next_summary: string | null;
}

interface GenerateReportRequest {
  student_id: string;
  student_name: string;
  week_start: string;
  week_end: string;
  previous_week_lessons?: LessonRecord[];
  // When true, we force the stricter narrative-only system message even on the first attempt.
  strict_narrative?: boolean;
  // REPORT_SUBJECT_TEACHER_EXCLUDE_V1: 서버에서 구조적으로 전달되는 제외 대상
  // (교사 이름 문자열은 프롬프트에 노출하지 않고, 여기서 근거 자체를 제거한다)
  exclude_subjects?: string[];
  exclude_teacher_ids?: string[];
}

interface ValidationResult {
  isValid: boolean;
  violations: string[];
}

// FINAL TEXT VALIDATOR - runs on the string that will be saved to DB
// v2.6: Added teacher-grounded validation
function validateFinalReportText(content: string): ValidationResult {
  const violations: string[] = [];

  // Reset regex lastIndex to avoid issues with global flags
  Object.values(FORBIDDEN_PATTERNS).forEach(pattern => {
    if (pattern instanceof RegExp) {
      pattern.lastIndex = 0;
    }
  });

  // Check for bullet points (·, •)
  if (FORBIDDEN_PATTERNS.bulletPoints.test(content)) {
    violations.push('BULLET_POINTS_DETECTED');
  }

  // Check for newline bullets
  FORBIDDEN_PATTERNS.newlineBullets.lastIndex = 0;
  if (FORBIDDEN_PATTERNS.newlineBullets.test(content)) {
    violations.push('NEWLINE_BULLETS_DETECTED');
  }

  // Check for dash bullets ("\n- ")
  FORBIDDEN_PATTERNS.dashBullets.lastIndex = 0;
  if (FORBIDDEN_PATTERNS.dashBullets.test(content)) {
    violations.push('DASH_BULLETS_DETECTED');
  }

  // Check for keyword lists
  FORBIDDEN_PATTERNS.keywordLists.lastIndex = 0;
  if (FORBIDDEN_PATTERNS.keywordLists.test(content)) {
    violations.push('KEYWORD_LIST_DETECTED');
  }

  // Check for abstract evaluations
  FORBIDDEN_PATTERNS.abstractEvaluations.lastIndex = 0;
  if (FORBIDDEN_PATTERNS.abstractEvaluations.test(content)) {
    violations.push('ABSTRACT_EVALUATION_DETECTED');
  }

  // Check for forbidden openings (first 100 chars)
  const opening = content.slice(0, 100);
  if (FORBIDDEN_PATTERNS.forbiddenOpenings.test(opening)) {
    violations.push('FORBIDDEN_OPENING_DETECTED');
  }

  // Check for generic closings (last 150 chars)
  const closing = content.slice(-150);
  if (FORBIDDEN_PATTERNS.genericClosings.test(closing)) {
    violations.push('GENERIC_CLOSING_DETECTED');
  }

  // Check for legacy bracket headers 【...】
  FORBIDDEN_PATTERNS.bracketHeaders.lastIndex = 0;
  if (FORBIDDEN_PATTERNS.bracketHeaders.test(content)) {
    violations.push('BRACKET_HEADER_DETECTED');
  }

  // Check for summary blocks like "수업 3회, 평균 이해도"
  FORBIDDEN_PATTERNS.summaryBlocks.lastIndex = 0;
  if (FORBIDDEN_PATTERNS.summaryBlocks.test(content)) {
    violations.push('SUMMARY_BLOCK_DETECTED');
  }

  // Check if content starts with 【
  if (content.trim().startsWith('【')) {
    violations.push('STARTS_WITH_BRACKET');
  }

  // REPORT_TEACHER_GROUNDED_NARRATIVE_V1: Check for speculative progression terms
  FORBIDDEN_PATTERNS.speculativeProgression.lastIndex = 0;
  if (FORBIDDEN_PATTERNS.speculativeProgression.test(content)) {
    violations.push('SPECULATIVE_PROGRESSION_DETECTED');
  }

  // REPORT_TEACHER_GROUNDED_NARRATIVE_V1: Check for invented pedagogy
  FORBIDDEN_PATTERNS.inventedPedagogy.lastIndex = 0;
  if (FORBIDDEN_PATTERNS.inventedPedagogy.test(content)) {
    violations.push('INVENTED_PEDAGOGY_DETECTED');
  }

  return {
    isValid: violations.length === 0,
    violations,
  };
}

// STUDENT_REPORT_TONE_V2_TEACHER_VOICE: Validate student message content
function validateStudentMessage(content: string): ValidationResult {
  const violations: string[] = [];

  // Reset regex lastIndex
  Object.values(STUDENT_FORBIDDEN_PATTERNS).forEach(pattern => {
    if (pattern instanceof RegExp) {
      pattern.lastIndex = 0;
    }
  });

  // Check for generic praise
  STUDENT_FORBIDDEN_PATTERNS.genericPraise.lastIndex = 0;
  if (STUDENT_FORBIDDEN_PATTERNS.genericPraise.test(content)) {
    violations.push('GENERIC_PRAISE_DETECTED');
  }

  // Check for mission-poster language
  STUDENT_FORBIDDEN_PATTERNS.missionPoster.lastIndex = 0;
  if (STUDENT_FORBIDDEN_PATTERNS.missionPoster.test(content)) {
    violations.push('MISSION_POSTER_LANGUAGE_DETECTED');
  }

  // Check for motivational speech patterns
  STUDENT_FORBIDDEN_PATTERNS.motivationalSpeech.lastIndex = 0;
  if (STUDENT_FORBIDDEN_PATTERNS.motivationalSpeech.test(content)) {
    violations.push('MOTIVATIONAL_SPEECH_DETECTED');
  }

  // Check for evaluation report tone
  STUDENT_FORBIDDEN_PATTERNS.evaluationTone.lastIndex = 0;
  if (STUDENT_FORBIDDEN_PATTERNS.evaluationTone.test(content)) {
    violations.push('EVALUATION_TONE_DETECTED');
  }

  // Also check basic forbidden patterns (bullets, etc.)
  FORBIDDEN_PATTERNS.bulletPoints.lastIndex = 0;
  if (FORBIDDEN_PATTERNS.bulletPoints.test(content)) {
    violations.push('BULLET_POINTS_DETECTED');
  }

  FORBIDDEN_PATTERNS.newlineBullets.lastIndex = 0;
  if (FORBIDDEN_PATTERNS.newlineBullets.test(content)) {
    violations.push('NEWLINE_BULLETS_DETECTED');
  }

  return {
    isValid: violations.length === 0,
    violations,
  };
}

// Parse JSON from AI response, handling markdown code blocks
function parseJsonResponse(content: string): JsonReportOutput | null {
  try {
    // Remove markdown code blocks if present
    let jsonStr = content.trim();
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.slice(7);
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.slice(3);
    }
    if (jsonStr.endsWith('```')) {
      jsonStr = jsonStr.slice(0, -3);
    }
    jsonStr = jsonStr.trim();

    const parsed = JSON.parse(jsonStr);
    
    // Validate required fields
    if (!parsed.subjects || !Array.isArray(parsed.subjects)) {
      console.error('[generate-ai-report] Invalid JSON: missing subjects array');
      return null;
    }
    
    if (!parsed.openingNote || !parsed.closingNote) {
      console.error('[generate-ai-report] Invalid JSON: missing openingNote or closingNote');
      return null;
    }

    // Validate each subject has paragraphs array
    for (const subject of parsed.subjects) {
      if (!subject.paragraphs || !Array.isArray(subject.paragraphs) || subject.paragraphs.length !== 3) {
        console.error(`[generate-ai-report] Invalid JSON: subject ${subject.subject} missing 3 paragraphs`);
        return null;
      }
    }

    return parsed as JsonReportOutput;
  } catch (e) {
    console.error('[generate-ai-report] JSON parse error:', e);
    return null;
  }
}

// v2.3 Narrative renderer - NO bullets, NO brackets, pure paragraphs
function renderReportFromJson(json: JsonReportOutput, studentName: string): string {
  let report = '';

  // Opening note as first paragraph
  report += json.openingNote + '\n\n';

  // Each subject section - use ■ instead of 【】
  for (const subject of json.subjects) {
    report += `■ ${subject.subject}\n\n`;
    
    // Add 3 paragraphs as continuous narrative text
    for (const paragraph of subject.paragraphs) {
      report += paragraph + '\n\n';
    }

    // Add optional summaries as embedded sentences (not bullets)
    if (subject.testsSummary) {
      report += subject.testsSummary + '\n\n';
    }
    if (subject.homeworkSummary) {
      report += subject.homeworkSummary + '\n\n';
    }
    if (subject.attendanceImpact) {
      report += subject.attendanceImpact + '\n\n';
    }
  }

  // Closing note as final paragraph
  report += json.closingNote;

  return report.trim();
}

// Generate parent report with JSON output and validation
async function generateParentReportWithRetry(
  apiKey: string,
  userPrompt: string,
  maxRetries: number = 2,
  forceStrictNarrative: boolean = false
): Promise<{ content: string; jsonOutput: JsonReportOutput | null; isValid: boolean; violations: string[]; attempts: number; adminTag: string }> {
  let attempts = 0;
  let lastContent = '';
  let lastViolations: string[] = [];
  let lastJson: JsonReportOutput | null = null;

  while (attempts < maxRetries) {
    attempts++;
    const isRetry = attempts > 1;
    const systemPrompt = (attempts === 1 && forceStrictNarrative)
      ? (RETRY_SYSTEM_PROMPT + "\n\nNo bullets. No bracket headings. Only narrative paragraphs.")
      : (isRetry ? RETRY_SYSTEM_PROMPT : JSON_PARENT_PROMPT);

    console.log(`[generate-ai-report] Parent report attempt ${attempts}/${maxRetries}, isRetry=${isRetry}`);

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { 
            role: 'user', 
            content: isRetry 
              ? userPrompt + `\n\n[재생성 요청] 이전 생성에서 다음 규칙 위반이 감지되었습니다: ${lastViolations.join(', ')}.\n\n**경고:** 글머리 기호(·, -, •)와 키워드: 형식, 추상적 평가("전반적으로 안정", "잘 따라옴" 등)를 절대 사용하지 마세요. 반드시 완전한 문장으로만 서술하세요.`
              : userPrompt
          },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        throw new Error('RATE_LIMIT');
      }
      if (aiResponse.status === 402) {
        throw new Error('PAYMENT_REQUIRED');
      }
      const errorText = await aiResponse.text();
      console.error('[generate-ai-report] AI gateway error:', aiResponse.status, errorText);
      throw new Error(`AI gateway error: ${aiResponse.status}`);
    }

    const aiResult = await aiResponse.json();
    lastContent = aiResult.choices?.[0]?.message?.content || '';

    console.log(`[generate-ai-report] Raw AI response length: ${lastContent.length}`);

    // Parse JSON
    lastJson = parseJsonResponse(lastContent);
    
    if (!lastJson) {
      console.error(`[generate-ai-report] Attempt ${attempts} failed to parse JSON`);
      lastViolations = ['JSON_PARSE_FAILED'];
      continue;
    }

    // Render to final text
    const renderedText = renderReportFromJson(lastJson, '');
    
    // Validate rendered text
    const validation = validateFinalReportText(renderedText);
    lastViolations = validation.violations;

    console.log(`[generate-ai-report] Attempt ${attempts} validation:`, validation.isValid ? 'PASSED' : `FAILED (${lastViolations.join(', ')})`);
    console.log(`[generate-ai-report] Attempt ${attempts} adminTag: ${lastJson.adminTag}`);

    if (validation.isValid) {
      return {
        content: renderedText,
        jsonOutput: lastJson,
        isValid: true,
        violations: [],
        attempts,
        adminTag: lastJson.adminTag || 'GREEN',
      };
    }
  }

  // All retries exhausted
  console.warn(`[generate-ai-report] All ${maxRetries} attempts failed validation. Violations: ${lastViolations.join(', ')}`);
  
  // If we have JSON but validation failed, still render it but mark as RED
  let finalContent = '';
  if (lastJson) {
    finalContent = renderReportFromJson(lastJson, '');
  }

  return {
    content: finalContent,
    jsonOutput: lastJson,
    isValid: false,
    violations: lastViolations,
    attempts,
    adminTag: 'RED',
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const reqBody = await req.json() as GenerateReportRequest;
    const { student_id, student_name, week_start, week_end } = reqBody;
    const strictNarrative = reqBody.strict_narrative === true;

    // REPORT_SUBJECT_TEACHER_EXCLUDE_V1
    // 담당 선생님이 직접 멘트를 작성하는 과목(교사 링크 기준)은 입력 근거와 출력에서 모두 제외한다.
    // 같은 학생의 다른 교사·다른 과목 근거는 그대로 유지한다.
    const excludedSubjects = new Set((reqBody.exclude_subjects || []).filter(Boolean));
    const excludedTeacherIds = new Set((reqBody.exclude_teacher_ids || []).filter(Boolean));
    const isExcludedRecord = (row: any): boolean => {
      if (!row) return false;
      if (row.subject && excludedSubjects.has(row.subject)) return true;
      if (row.teacher_id && excludedTeacherIds.has(row.teacher_id)) return true;
      return false;
    };
    const dropExcluded = <T,>(rows: T[] | null | undefined): T[] =>
      (rows || []).filter((r) => !isExcludedRecord(r as any));
    console.log(`[REPORT_SUBJECT_TEACHER_EXCLUDE_V1] excluded_subjects=${excludedSubjects.size} excluded_teachers=${excludedTeacherIds.size}`);

    // REPORT_TEMPLATE_DB_V1: Fetch active templates from report_templates table
    const { data: activeTemplates, error: templateError } = await supabase
      .from('report_templates')
      .select('template_name, prompt_text, version')
      .eq('is_active', true);

    if (templateError) {
      console.error('[generate-ai-report] Failed to fetch templates:', templateError.message);
    }

    const dbParentTemplate = activeTemplates?.find(t => t.template_name === 'parent');
    const dbStudentTemplate = activeTemplates?.find(t => t.template_name === 'student');

    // Build the actual system prompts: merge user's custom prompt with JSON format requirements
    const parentSystemPrompt = dbParentTemplate
      ? buildParentSystemPromptFromTemplate(dbParentTemplate.prompt_text)
      : JSON_PARENT_PROMPT;
    
    const studentSystemPrompt = dbStudentTemplate
      ? dbStudentTemplate.prompt_text
      : NARRATIVE_LOCK_STUDENT_PROMPT;

    const usedParentVersion = dbParentTemplate?.version || 'hardcoded';
    const usedStudentVersion = dbStudentTemplate?.version || 'hardcoded';

    console.log(`[REPORT_GEN_DEBUG_V2.4] templateVersion=${TEMPLATE_VERSION} formatter=${FORMATTER_NAME}`);
    console.log(`[REPORT_TEMPLATE_DB_V1] parent_template=${usedParentVersion} student_template=${usedStudentVersion}`);
    console.log(`[generate-ai-report] Generating for ${student_name} (${student_id}), week: ${week_start} to ${week_end}`);

    // DATA_DEBUG: Fetch ALL lesson records first (no filters except student + date range)
    const { data: allLessonsRawUnfiltered, error: allLessonsError } = await supabase
      .from('lesson_records')
      .select('id, student_id, lesson_date, subject, submitted, submitted_at, teacher_id')
      .eq('student_id', student_id)
      .gte('lesson_date', week_start)
      .lte('lesson_date', week_end);

    const allLessonsRaw = dropExcluded(allLessonsRawUnfiltered as any[]);

    // Debug counters
    const totalFetched = allLessonsRaw?.length || 0;
    const submittedCount = allLessonsRaw?.filter(l => l.submitted === true)?.length || 0;
    const draftCount = allLessonsRaw?.filter(l => l.submitted === false || l.submitted === null)?.length || 0;
    const hasSubmittedAt = allLessonsRaw?.filter(l => l.submitted_at !== null)?.length || 0;
    
    // Per-subject breakdown
    const subjectCounts: Record<string, { total: number; submitted: number }> = {};
    allLessonsRaw?.forEach(l => {
      if (!subjectCounts[l.subject]) {
        subjectCounts[l.subject] = { total: 0, submitted: 0 };
      }
      subjectCounts[l.subject].total++;
      if (l.submitted === true) {
        subjectCounts[l.subject].submitted++;
      }
    });

    console.log(`[DATA_DEBUG] student=${student_id.slice(0, 8)} week=${week_start}~${week_end} fetched=${totalFetched} submitted=${submittedCount} draft=${draftCount} hasSubmittedAt=${hasSubmittedAt} subjects=${JSON.stringify(subjectCounts)}`);

    if (allLessonsError) {
      console.error(`[DATA_DEBUG] Error fetching lessons: ${allLessonsError.message}`);
    }

    // Now fetch the full lesson records for submitted only
    const { data: currentWeekLessonsRaw, error: lessonsError } = await supabase
      .from('lesson_records')
      .select('*')
      .eq('student_id', student_id)
      .gte('lesson_date', week_start)
      .lte('lesson_date', week_end)
      .eq('submitted', true)
      .order('lesson_date', { ascending: true });

    if (lessonsError) {
      throw new Error(`Failed to fetch lesson records: ${lessonsError.message}`);
    }

    const currentWeekLessons = dropExcluded(currentWeekLessonsRaw as any[]);

    console.log(`[DATA_DEBUG] Final submitted lessons for AI: ${currentWeekLessons?.length || 0}`);

    // VERBATIM-COMMENT-INTEGRATE-V1: 원문 노출 대상 선생님(이재진·영어)의 주간 코멘트는
    // 해당 과목 문단을 원문 그대로 구성하도록 프롬프트에 최우선 규칙으로 주입한다.
    // (weekly_summary는 미제출 레코드에 붙을 수 있어 submitted 필터 없이 별도 조회)
    const VERBATIM_COMMENT_TEACHER_IDS = [
      '916c5055-2a8c-46d8-b84c-fd280d7f541f', // 이재진(영어)
    ];
    const { data: verbatimRows } = await supabase
      .from('lesson_records')
      .select('subject, teacher_display_name, weekly_summary, weekly_summary_week, lesson_date')
      .eq('student_id', student_id)
      .in('teacher_id', VERBATIM_COMMENT_TEACHER_IDS)
      .not('weekly_summary', 'is', null)
      .or(`weekly_summary_week.eq.${week_start},and(lesson_date.gte.${week_start},lesson_date.lte.${week_end})`);
    const verbatimComments: Record<string, { teacher: string; text: string }> = {};
    for (const r of dropExcluded(verbatimRows as any[])) {
      if (!verbatimComments[r.subject]) {
        verbatimComments[r.subject] = { teacher: r.teacher_display_name || '담당 선생님', text: r.weekly_summary };
      }
    }
    console.log(`[VERBATIM-COMMENT-INTEGRATE-V1] subjects=${Object.keys(verbatimComments).join(',') || 'none'}`);

    if (!currentWeekLessons || currentWeekLessons.length === 0) {
      console.log(`[generate-ai-report] No submitted lessons found. DATA_DEBUG: fetched=${totalFetched} submitted=${submittedCount} draft=${draftCount}`);
      return new Response(
        JSON.stringify({
          success: true,
          parent_message: null,
          student_message: null,
          draft_status: 'no_lessons',
          template_version: TEMPLATE_VERSION,
          _debug: {
            data_debug: `fetched=${totalFetched} submitted=${submittedCount} draft=${draftCount} subjects=${JSON.stringify(subjectCounts)}`,
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if we have sufficient narrative data
    const hasSufficientNarrativeData = currentWeekLessons.some(l => 
      (l.learning_issues_note && l.learning_issues_note.trim().length > 20) || 
      (l.next_lesson_goal && l.next_lesson_goal.trim().length > 10)
    );

    // Fetch previous week's lessons for context
    const prevWeekStart = new Date(week_start);
    prevWeekStart.setDate(prevWeekStart.getDate() - 14);
    const prevWeekEnd = new Date(week_start);
    prevWeekEnd.setDate(prevWeekEnd.getDate() - 1);

    const { data: previousLessonsRaw } = await supabase
      .from('lesson_records')
      .select('*')
      .eq('student_id', student_id)
      .gte('lesson_date', prevWeekStart.toISOString().split('T')[0])
      .lte('lesson_date', prevWeekEnd.toISOString().split('T')[0])
      .eq('submitted', true)
      .order('lesson_date', { ascending: false });

    const previousLessons = dropExcluded(previousLessonsRaw as any[]);

    // Fetch curriculum info for context
    const curriculumKeys = currentWeekLessons
      .filter(l => l.curriculum_unit_key)
      .map(l => l.curriculum_unit_key!);

    let curriculumInfo: CurriculumInfo[] = [];
    if (curriculumKeys.length > 0) {
      const { data: curriculum } = await supabase
        .from('curriculum_map')
        .select('unit_key, unit_title, flow_summary, next_unit_key, next_summary')
        .in('unit_key', curriculumKeys);
      curriculumInfo = curriculum || [];
    }

    // HW-MERGE-V1: also pull homework_assignments checked by teachers
    // (teachers often mark HW completion via DailyHomeworkChecklist, not via lesson_records.homework_status)
    const { data: hwAssignmentsRaw } = await supabase
      .from('homework_assignments')
      .select('subject, result, check_status, assigned_date, checked_at')
      .eq('student_id', student_id)
      .lte('assigned_date', week_end);

    const hwAssignments = dropExcluded(hwAssignmentsRaw as any[]);

    const mapHwResult = (r: string | null): 'completed' | 'partial' | 'not_done' | null => {
      if (!r) return null;
      if (r === 'completed' || r === 'low_effort_completed') return 'completed';
      if (r === 'partial') return 'partial';
      if (r === 'not_done' || r === 'low_effort' || r === 'lost') return 'not_done';
      return null; // unable_to_verify -> exclude
    };

    let hwAssignCompleted = 0, hwAssignPartial = 0, hwAssignNotDone = 0, hwAssignTotal = 0;
    const hwAssignBySubject: Record<string, { completed: number; partial: number; notDone: number; total: number }> = {};
    for (const a of hwAssignments || []) {
      if (a.check_status !== 'checked') continue;
      const checkedDate = a.checked_at ? String(a.checked_at).slice(0, 10) : null;
      const countedInWeek = (a.assigned_date >= week_start && a.assigned_date <= week_end) || (!!checkedDate && checkedDate >= week_start && checkedDate <= week_end);
      if (!countedInWeek) continue;
      const norm = mapHwResult(a.result);
      if (!norm) continue;
      hwAssignTotal++;
      if (norm === 'completed') hwAssignCompleted++;
      else if (norm === 'partial') hwAssignPartial++;
      else if (norm === 'not_done') hwAssignNotDone++;
      const s = a.subject || '기타';
      if (!hwAssignBySubject[s]) hwAssignBySubject[s] = { completed: 0, partial: 0, notDone: 0, total: 0 };
      hwAssignBySubject[s].total++;
      if (norm === 'completed') hwAssignBySubject[s].completed++;
      else if (norm === 'partial') hwAssignBySubject[s].partial++;
      else if (norm === 'not_done') hwAssignBySubject[s].notDone++;
    }
    const precomputedHwStats = {
      completed: hwAssignCompleted,
      partial: hwAssignPartial,
      notDone: hwAssignNotDone,
      total: hwAssignTotal,
      bySubject: hwAssignBySubject,
    };
    console.log(`[HW-MERGE-V1] fetched=${hwAssignments?.length || 0} checkedUsable=${hwAssignTotal} completed=${hwAssignCompleted} partial=${hwAssignPartial} notDone=${hwAssignNotDone}`);

    // Organize data by subject
    const subjectData: Record<string, {
      lessons: LessonRecord[];
      curriculum: CurriculumInfo[];
      previousLessons: LessonRecord[];
    }> = {};

    for (const lesson of currentWeekLessons) {
      const subject = lesson.subject;
      if (!subjectData[subject]) {
        subjectData[subject] = { lessons: [], curriculum: [], previousLessons: [] };
      }
      subjectData[subject].lessons.push(lesson);
      
      if (lesson.curriculum_unit_key) {
        const currInfo = curriculumInfo.find(c => c.unit_key === lesson.curriculum_unit_key);
        if (currInfo && !subjectData[subject].curriculum.some(c => c.unit_key === currInfo.unit_key)) {
          subjectData[subject].curriculum.push(currInfo);
        }
      }
    }

    // Add previous lessons by subject
    if (previousLessons) {
      for (const lesson of previousLessons) {
        if (subjectData[lesson.subject]) {
          subjectData[lesson.subject].previousLessons.push(lesson);
        }
      }
    }

    // Build the user prompt with structured data
    const userPrompt = buildJsonUserPrompt(student_name, week_start, week_end, subjectData, verbatimComments);

    console.log('[generate-ai-report] Calling AI gateway for JSON parent report with validation...');

    // Handle insufficient data case
    if (!hasSufficientNarrativeData) {
      console.log('[generate-ai-report] Insufficient narrative data - marking as RED');
      
      const parentHeader = formatParentHeader(student_name, week_start, week_end);
      const debugInfo = `[REPORT_ENGINE_DEBUG] source=edge_function templateVersion=${TEMPLATE_VERSION} formatter=${FORMATTER_NAME} validator=fail retries=0`;
      const debugMarker = `[REPORT_GEN_DEBUG_V2.4] templateVersion=${TEMPLATE_VERSION} retries=0 validator=fail tag=RED`;
      
      // Generate fallback student message
      const studentMessageContent = await generateStudentMessage(
        LOVABLE_API_KEY,
        studentSystemPrompt,
        student_name,
        week_start,
        week_end,
        subjectData
      );
      
      // Embed debug header in saved report text (admin can see it)
      const parentMessageWithDebug = parentHeader + '\n\n' + debugInfo + '\n\n' + INSUFFICIENT_DATA_MESSAGE;
      
      return new Response(
        JSON.stringify({
          success: true,
          parent_message: parentMessageWithDebug,
          student_message: studentMessageContent,
          draft_status: 'needs_input',
          risk_level: 'high',
          lesson_count: currentWeekLessons.length,
          subjects: Object.keys(subjectData),
          template_version: TEMPLATE_VERSION,
          debug_info: `[REPORT_ENGINE_DEBUG] marker=REPORT-DEBUG-DETAIL-V1 source=edge_function templateVersion=${TEMPLATE_VERSION} renderer=narrative validator=fail retries=0 tag=RED subjectsIncluded=[${Object.keys(subjectData).join(',')}] reason=insufficient_data`,
          _debug: {
            debug_marker: `[REPORT_GEN_DEBUG_V2.4] templateVersion=${TEMPLATE_VERSION} renderer=narrative retries=0 validator=fail tag=RED subjects=[${Object.keys(subjectData).join(',')}]`,
            marker: 'REPORT-DEBUG-DETAIL-V1',
            template_version: TEMPLATE_VERSION,
            renderer: 'narrative',
            formatter: FORMATTER_NAME,
            validator: 'fail',
            validation_passed: false,
            validation_attempts: 0,
            violations: ['INSUFFICIENT_NARRATIVE_DATA'],
            has_sufficient_data: false,
            admin_tag: 'RED',
            subjects_included: Object.keys(subjectData),
            reason: 'insufficient_data',
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // REPORT_SUBJECT_ISOLATION_V1: Generate subjects in isolation with vocabulary constraints
    console.log('[generate-ai-report] SUBJECT_ISOLATION: Starting per-subject generation');
    
    const isolatedResult = await generateIsolatedSubjectsReport(
      LOVABLE_API_KEY,
      student_name,
      week_start,
      week_end,
      subjectData,
      dbParentTemplate?.prompt_text
    );

    // Generate opening and closing notes separately
    const openingClosingResult = await generateOpeningClosingNotes(
      LOVABLE_API_KEY,
      student_name,
      week_start,
      week_end,
      subjectData,
      dbParentTemplate?.prompt_text,
      precomputedHwStats
    );

    // Assemble final report from isolated subjects
    let parentMessageContent = '';
    
    // Add opening note
    if (openingClosingResult.openingNote) {
      parentMessageContent += openingClosingResult.openingNote + '\n\n';
    }
    
    // Add each subject in order (subjects already sorted by SUBJECT_ORDER in generateIsolatedSubjectsReport)
    for (const subjectReport of isolatedResult.subjects) {
      parentMessageContent += `■ ${subjectReport.subject}\n\n`;
      
      for (const paragraph of subjectReport.paragraphs) {
        parentMessageContent += paragraph + '\n\n';
      }
      
      if (subjectReport.testsSummary) {
        parentMessageContent += subjectReport.testsSummary + '\n\n';
      }
      if (subjectReport.homeworkSummary) {
        parentMessageContent += subjectReport.homeworkSummary + '\n\n';
      }
      if (subjectReport.attendanceImpact) {
        parentMessageContent += subjectReport.attendanceImpact + '\n\n';
      }
    }
    
    // Add closing note
    if (openingClosingResult.closingNote) {
      parentMessageContent += openingClosingResult.closingNote;
    }
    
    parentMessageContent = parentMessageContent.trim();

    // Determine quality based on results
    let draftStatus = 'ready';
    let riskLevel: string | null = null;
    let adminTag: 'GREEN' | 'YELLOW' | 'RED' = 'GREEN';

    if (!isolatedResult.allValid || isolatedResult.totalViolations.length > 0) {
      adminTag = 'YELLOW';
      draftStatus = 'needs_review';
      riskLevel = 'medium';
    }

    if (isolatedResult.subjects.length === 0) {
      // If we had lessons but AI generation failed, use YELLOW with fallback instead of RED
      if (hasSufficientNarrativeData && Object.keys(subjectData).length > 0) {
        adminTag = 'YELLOW';
        draftStatus = 'needs_review';
        riskLevel = 'medium';
        // Build minimal fallback from teacher notes
        const fallbackParts: string[] = [];
        for (const [subj, data] of Object.entries(subjectData)) {
          fallbackParts.push(`■ ${subj}`);
          const notes = data.lessons
            .filter(l => l.learning_issues_note && l.learning_issues_note.trim().length > 5)
            .map(l => l.learning_issues_note!.trim());
          if (notes.length > 0) {
            fallbackParts.push(notes.join(' '));
          } else {
            fallbackParts.push(BASIC_LESSON_FALLBACK);
          }
          fallbackParts.push('');
        }
        parentMessageContent = fallbackParts.join('\n').trim();
      } else {
        adminTag = 'RED';
        draftStatus = 'needs_input';
        riskLevel = 'high';
        parentMessageContent = INSUFFICIENT_DATA_MESSAGE;
      }
    }

    // Generate student message
    const studentMessageContent = await generateStudentMessage(
      LOVABLE_API_KEY,
      studentSystemPrompt,
      student_name,
      week_start,
      week_end,
      subjectData
    );

    // REPORT-DEBUG-DETAIL-V1: Format final messages with explicit debug fields
    const parentHeader = formatParentHeader(student_name, week_start, week_end);
    const subjectsIncluded = isolatedResult.subjects.map(s => s.subject);
    const renderer = 'subject-isolated-v2.5';
    const validatorStatus = isolatedResult.allValid ? 'pass' : 'fail';
    const totalAttempts = Object.values(isolatedResult.subjectAttempts).reduce((a, b) => a + b, 0);
    
    // REPORT_SUBJECT_ISOLATION_V1: Include per-subject attempt counts
    const subjectAttemptsStr = Object.entries(isolatedResult.subjectAttempts)
      .map(([s, a]) => `${s}:${a}`)
      .join(',');
    
    // Explicit debug info with all diagnostic fields
    const debugInfo = [
      `[REPORT_ENGINE_DEBUG]`,
      `marker=REPORT_SUBJECT_ISOLATION_V1`,
      `source=edge_function`,
      `templateVersion=${TEMPLATE_VERSION}`,
      `renderer=${renderer}`,
      `validator=${validatorStatus}`,
      `subjectAttempts=${subjectAttemptsStr}`,
      `tag=${adminTag}`,
      `subjectsIncluded=[${subjectsIncluded.join(',')}]`,
      isolatedResult.totalViolations.length > 0 ? `violations=${isolatedResult.totalViolations.slice(0, 3).join(';')}` : null,
    ].filter(Boolean).join(' ');
    
    const debugMarker = `[REPORT_GEN_DEBUG_V2.5] templateVersion=${TEMPLATE_VERSION} renderer=${renderer} subjectAttempts=${subjectAttemptsStr} validator=${validatorStatus} tag=${adminTag} subjects=[${subjectsIncluded.join(',')}]`;
    
    // Embed debug header in saved report text (at the start, after header)
    const parentMessageWithDebug = parentHeader + '\n\n' + debugInfo + '\n\n' + parentMessageContent;
    
    console.log(`[generate-ai-report] REPORT_SUBJECT_ISOLATION_V1: student=${student_name} subjects=${subjectsIncluded.join(',')} validator=${validatorStatus} tag=${adminTag} attempts=${subjectAttemptsStr}`);
    
    return new Response(
      JSON.stringify({
        success: true,
        parent_message: parentMessageWithDebug,
        student_message: studentMessageContent,
        draft_status: draftStatus,
        risk_level: riskLevel,
        lesson_count: currentWeekLessons.length,
        subjects: subjectsIncluded,
        template_version: TEMPLATE_VERSION,
        debug_info: debugInfo,
        admin_tag: adminTag,
        _debug: {
          debug_marker: debugMarker,
          marker: 'REPORT_SUBJECT_ISOLATION_V1',
          template_version: TEMPLATE_VERSION,
          renderer: renderer,
          formatter: FORMATTER_NAME,
          validator: validatorStatus,
          validation_passed: isolatedResult.allValid,
          subject_attempts: isolatedResult.subjectAttempts,
          total_violations: isolatedResult.totalViolations,
          has_sufficient_data: hasSufficientNarrativeData,
          admin_tag: adminTag,
          subjects_included: subjectsIncluded,
          subject_order: SUBJECT_ORDER,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[generate-ai-report] Error:', errorMessage);
    
    if (errorMessage === 'RATE_LIMIT') {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (errorMessage === 'PAYMENT_REQUIRED') {
      return new Response(
        JSON.stringify({ error: 'Payment required. Please add credits to your workspace.' }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function formatParentHeader(studentName: string, weekStart: string, weekEnd: string): string {
  const startDate = new Date(weekStart);
  const endDate = new Date(weekEnd);
  const startMonth = startDate.getMonth() + 1;
  const startDay = startDate.getDate();
  const endMonth = endDate.getMonth() + 1;
  const endDay = endDate.getDate();
  
  return `[더멘토] ${studentName} 주간 학습 리포트 (${startMonth}/${startDay}~${endMonth}/${endDay})`;
}

// v2.2 JSON-focused user prompt builder
function buildJsonUserPrompt(
  studentName: string,
  weekStart: string,
  weekEnd: string,
  subjectData: Record<string, { lessons: LessonRecord[]; curriculum: CurriculumInfo[]; previousLessons: LessonRecord[] }>,
  verbatimComments: Record<string, { teacher: string; text: string }> = {}
): string {
  const subjects = Object.keys(subjectData);
  
  let prompt = `학생: ${studentName}
기간: ${weekStart} ~ ${weekEnd}
과목: ${subjects.join(', ')}

[중요] 아래 데이터를 바탕으로 JSON 형식으로만 응답하세요.
각 과목별 paragraphs는 정확히 3개의 완전한 문장이어야 합니다.
글머리 기호(·, -, •), 키워드: 형식, 추상적 평가 사용 금지.

=== 이번 주 수업 데이터 ===\n\n`;

  for (const [subject, data] of Object.entries(subjectData)) {
    prompt += `[${subject}] 수업 ${data.lessons.length}회\n`;
    
    for (const lesson of data.lessons) {
      prompt += `날짜: ${lesson.lesson_date}\n`;
      prompt += `  이해도: ${lesson.understanding_score}/5\n`;
      
      const lessonTypes = lesson.lesson_types?.filter(t => t !== '정규') || [];
      if (lessonTypes.length > 0) {
        prompt += `  수업유형: ${lessonTypes.join(', ')}\n`;
      }
      
      if (lesson.attendance_status && lesson.attendance_status.length > 0) {
        const nonNormal = getAttendanceIssues(lesson.attendance_status);
        if (nonNormal.length > 0) {
          prompt += `  출결 특이사항: ${nonNormal.join(', ')}\n`;
        }
      }
      
      if (lesson.homework_status && lesson.homework_status !== 'none_assigned') {
        prompt += `  숙제상태: ${lesson.homework_status}\n`;
      }
      
      if (lesson.homework_check_note) {
        prompt += `  숙제 관찰: ${lesson.homework_check_note}\n`;
      }
      
      if (lesson.learning_issues && lesson.learning_issues.length > 0) {
        prompt += `  학습 관찰 포인트: ${lesson.learning_issues.join(', ')}\n`;
      }
      
      if (lesson.learning_issues_note) {
        prompt += `  [상세 관찰 기록]: ${lesson.learning_issues_note}\n`;
      }
      
      if (lesson.next_lesson_goal) {
        prompt += `  다음 수업 방향: ${lesson.next_lesson_goal}\n`;
      }
      
      if (lesson.test_result_text) {
        prompt += `  테스트: ${lesson.test_title || '테스트'} - ${lesson.test_result_text}\n`;
      }
      
      // KOREAN-CATEGORY-V1: Include Korean subject categories
      if (lesson.korean_categories && lesson.korean_categories.length > 0) {
        prompt += `  국어 학습 영역: ${lesson.korean_categories.join(', ')}\n`;
      }
    }

    // KOREAN-CATEGORY-V1: Aggregate unique Korean categories for the week
    if (subject === '국어') {
      const allKoreanCategories = new Set<string>();
      for (const lesson of data.lessons) {
        if (lesson.korean_categories) {
          for (const cat of lesson.korean_categories) {
            allKoreanCategories.add(cat);
          }
        }
      }
      if (allKoreanCategories.size > 0) {
        prompt += `\n  [이번 주 국어 학습 영역]: ${Array.from(allKoreanCategories).join(', ')}\n`;
        prompt += `  ※ 국어 리포트 시 자연스럽게 언급: "이번 주 국어는 {카테고리} 중심으로 학습했습니다."\n`;
      }
    }

    // Curriculum info
    if (data.curriculum.length > 0) {
      prompt += `\n  [교육과정 위치]\n`;
      for (const curr of data.curriculum) {
        prompt += `  단원: ${curr.unit_title} (${curr.unit_key})\n`;
        prompt += `  교육과정 흐름: ${curr.flow_summary}\n`;
        if (curr.next_summary) {
          prompt += `  다음 단계 예고: ${curr.next_summary}\n`;
        }
      }
    }

    // Previous week context
    if (data.previousLessons.length > 0) {
      prompt += `\n  [이전 주 맥락 참고]\n`;
      for (const prev of data.previousLessons.slice(0, 2)) {
        prompt += `  ${prev.lesson_date}: 이해도 ${prev.understanding_score}/5`;
        if (prev.learning_issues_note) {
          prompt += ` - ${prev.learning_issues_note.slice(0, 80)}`;
        }
        prompt += '\n';
      }
    }

    prompt += '\n';
  }

  // VERBATIM-COMMENT-INTEGRATE-V1: 담당 교사 원문 코멘트 — 해당 과목 문단을 이 원문으로 구성
  for (const [subject, vc] of Object.entries(verbatimComments)) {
    prompt += `
=== [최우선 규칙] ${subject} 과목 — ${vc.teacher} 선생님 주간 코멘트 원문 ===
"""
${vc.text}
"""
위 원문이 ${subject} 과목 평가의 본문이다. 반드시 지켜라:
1. ${subject} 과목의 paragraphs는 위 원문을 문단 단위로 나눠 그대로 담는다. 문장·표현·내용·평가를 바꾸거나 요약하거나 새 내용을 추가하지 않는다.
2. 허용되는 수정은 앞뒤 문단과의 연결이 매끄럽도록 하는 최소한의 접속 표현뿐이다.
3. "정확히 3문장" 규칙은 ${subject} 과목에는 적용하지 않는다 — 원문 전체를 빠짐없이 담는 것이 우선이다.
4. ${subject} 수업 데이터가 없더라도 subjects 배열에 ${subject}를 포함하고 위 원문으로 작성한다.
5. testsSummary·homeworkSummary는 평소처럼 데이터 기반으로 작성한다.
`;
  }

  prompt += `
=== JSON 출력 스키마 ===
{
  "subjects": [
    {
      "subject": "${subjects[0] || '과목명'}",
      "paragraphs": [
        "1단락: 학습 맥락 (이번 주 학습 내용과 교육과정 위치, 평가 없이 사실만)",
        "2단락: 관찰된 행동 (수업 중 학생의 구체적 반응과 행동)",
        "3단락: 교사 해석 및 방향 (행동의 원인 해석과 다음 주 지도 방향)"
      ],
      "testsSummary": "테스트 결과 해석 문장 (선택)",
      "homeworkSummary": "숙제 패턴 설명 (선택)",
      "attendanceImpact": "출결 영향 설명 (선택)"
    }
  ],
  "openingNote": "학생의 현재 학습 자세 구체적 묘사 (전반적으로/안정적 금지)",
  "closingNote": "다음 주 구체적 학습 계획 (지속 점검하겠습니다 금지)",
  "adminTag": "GREEN|YELLOW|RED"
}

반드시 유효한 JSON만 출력하세요.`;

  return prompt;
}

// REPORT_SUBJECT_ISOLATION_V1: Build subject-specific prompt
// When hasCustomPrompt=true, omit hardcoded narrative rules so DB prompt controls style
function buildSubjectIsolatedPrompt(
  subject: string,
  studentName: string,
  weekStart: string,
  weekEnd: string,
  subjectLessons: LessonRecord[],
  curriculum: CurriculumInfo[],
  previousLessons: LessonRecord[],
  hasCustomPrompt: boolean = false
): string {
  const constraints = SUBJECT_VOCABULARY_CONSTRAINTS[subject];
  const allowedTerms = constraints?.allowed?.join(', ') || '';
  const disallowedTermsDesc = subject === '영어' 
    ? '계산, 풀이, 공식, 식, 단계적 접근, 연산, 수식' 
    : subject === '수학' 
    ? '문장 해석, 독해, 어휘, 문법, reading, grammar'
    : '';

  let prompt = `학생: ${studentName}
기간: ${weekStart} ~ ${weekEnd}
과목: ${subject} (이 과목만 작성)

`;

  // Only add hardcoded narrative rules when NO custom DB prompt is set
  if (!hasCustomPrompt) {
    const hasTeacherNotes = subjectLessons.some(l => 
      (l.learning_issues_note && l.learning_issues_note.trim().length > 15) ||
      (l.next_lesson_goal && l.next_lesson_goal.trim().length > 10)
    );

    prompt += `[REPORT_TEACHER_GROUNDED_NARRATIVE_V1 - ${subject} 전용 지침]

**핵심 원칙: 교사가 작성한 내용만 다시 표현**

당신의 역할:
- 교사가 기록한 관찰 내용을 학부모가 이해하기 쉽게 정리
- 명확성과 어조 개선

절대 하지 말 것:
- 교사가 기록하지 않은 내용 추측/창작
- "심화", "확장", "고난도", "다음 단계로" 등 진도 추측
- "체계적인 접근", "맞춤형 커리큘럼" 같은 교육 전략 창작

**정보 출처 (이 필드들만 사용):**
- [상세 관찰 기록] = learning_issues_note
- [다음 수업 방향] = next_lesson_goal  
- [숙제 관찰] = homework_check_note
- [테스트] = test_result_text

${!hasTeacherNotes ? `**[주의] 이 과목에 상세 교사 기록이 부족합니다.**
3번째 단락은 반드시: "이번 주에는 기본 학습 점검 위주로 수업이 진행되었습니다."로 작성하세요.
` : ''}

[어조 가이드]
- "이번 수업에서는 ~을 중심으로 진행했습니다."
- "수업 중에는 ~한 반응을 보였습니다."
- "선생님은 ~한 방식으로 다시 지도했습니다."

`;
  }

  // Vocabulary constraints always apply
  if (allowedTerms) {
    prompt += `**사용 가능한 용어**: ${allowedTerms}\n`;
  }
  if (disallowedTermsDesc) {
    prompt += `**절대 사용 금지 용어 (다른 과목 용어)**: ${disallowedTermsDesc}\n`;
  }

  prompt += `
=== ${subject} 수업 데이터 (교사 기록) ===

[${subject}] 수업 ${subjectLessons.length}회
`;

  for (const lesson of subjectLessons) {
    prompt += `날짜: ${lesson.lesson_date}\n`;
    prompt += `  이해도: ${lesson.understanding_score}/5\n`;
    
    const lessonTypes = lesson.lesson_types?.filter(t => t !== '정규') || [];
    if (lessonTypes.length > 0) {
      prompt += `  수업유형: ${lessonTypes.join(', ')}\n`;
    }
    
    if (lesson.attendance_status && lesson.attendance_status.length > 0) {
      const nonNormal = getAttendanceIssues(lesson.attendance_status);
      if (nonNormal.length > 0) {
        prompt += `  출결 특이사항: ${nonNormal.join(', ')}\n`;
      }
    }
    
    if (lesson.homework_status && lesson.homework_status !== 'none_assigned') {
      prompt += `  숙제상태: ${lesson.homework_status}\n`;
    }
    
    if (lesson.homework_check_note) {
      prompt += `  숙제 관찰: ${lesson.homework_check_note}\n`;
    }
    
    if (lesson.learning_issues && lesson.learning_issues.length > 0) {
      prompt += `  학습 관찰 포인트: ${lesson.learning_issues.join(', ')}\n`;
    }
    
    if (lesson.learning_issues_note) {
      prompt += `  [상세 관찰 기록]: ${lesson.learning_issues_note}\n`;
    }
    
    if (lesson.next_lesson_goal) {
      prompt += `  다음 수업 방향: ${lesson.next_lesson_goal}\n`;
    }
    
    if (lesson.test_result_text) {
      prompt += `  테스트: ${lesson.test_title || '테스트'} - ${lesson.test_result_text}\n`;
    }
    
    // Korean categories
    if (subject === '국어' && lesson.korean_categories && lesson.korean_categories.length > 0) {
      prompt += `  국어 학습 영역: ${lesson.korean_categories.join(', ')}\n`;
    }
  }

  // Curriculum info
  if (curriculum.length > 0) {
    prompt += `\n[교육과정 위치]\n`;
    for (const curr of curriculum) {
      prompt += `  단원: ${curr.unit_title} (${curr.unit_key})\n`;
      prompt += `  교육과정 흐름: ${curr.flow_summary}\n`;
      if (curr.next_summary) {
        prompt += `  다음 단계 예고: ${curr.next_summary}\n`;
      }
    }
  }

  // Previous week context
  if (previousLessons.length > 0) {
    prompt += `\n[이전 주 맥락 참고]\n`;
    for (const prev of previousLessons.slice(0, 2)) {
      prompt += `  ${prev.lesson_date}: 이해도 ${prev.understanding_score}/5`;
      if (prev.learning_issues_note) {
        prompt += ` - ${prev.learning_issues_note.slice(0, 80)}`;
      }
      prompt += '\n';
    }
  }

  prompt += `

=== JSON 출력 스키마 (${subject}만) ===
{
  "subject": "${subject}",
  "paragraphs": [
    "1단락: 관찰 - 구체적 수업 장면",
    "2단락: 해석 - 학습 흐름에서의 의미",
    "3단락: 방향 - 다음 수업 방향"
  ],
  "testsSummary": "테스트 결과 (기록된 경우만)",
  "homeworkSummary": "숙제 상태 (기록된 경우만)"
}

- ${subject} 과목 전용 용어만 사용
- 다른 과목 용어 혼용 절대 금지
- 글머리 기호(·, -, •) 사용 금지

반드시 유효한 JSON만 출력하세요.`;

  return prompt;
}

// REPORT_SUBJECT_ISOLATION_V1: Generate single subject report with vocabulary validation
async function generateSingleSubjectReport(
  apiKey: string,
  subject: string,
  studentName: string,
  weekStart: string,
  weekEnd: string,
  subjectLessons: LessonRecord[],
  curriculum: CurriculumInfo[],
  previousLessons: LessonRecord[],
  maxRetries: number = 2,
  customParentPrompt?: string
): Promise<{ 
  subjectReport: SubjectReport | null; 
  isValid: boolean; 
  vocabViolations: string[]; 
  formatViolations: string[];
  attempts: number;
}> {
  const userPrompt = buildSubjectIsolatedPrompt(
    subject,
    studentName,
    weekStart,
    weekEnd,
    subjectLessons,
    curriculum,
    previousLessons,
    !!customParentPrompt
  );

  // REPORT_TEMPLATE_DB_V1: Use custom prompt from DB if available
  const systemPrompt = customParentPrompt
    ? buildSubjectSystemPromptFromTemplate(customParentPrompt, subject)
    : `당신은 학원 담당 선생님입니다. ${subject} 과목 학습 리포트를 JSON 형식으로 작성합니다.

[REPORT_TEACHER_GROUNDED_NARRATIVE_V1 규칙]

**핵심:** 교사가 기록한 내용만 다시 표현. 추측/창작 금지.

- 정보 출처: learning_issues_note, next_lesson_goal, homework_check_note, test_result_text
- ${subject} 과목 전용 용어만 사용
- 다른 과목 용어 혼용 절대 금지
- 글머리 기호(·, -, •) 사용 금지
- 추상적 평가 금지

**절대 금지 용어:** 심화, 확장, 고난도, 다음 단계로, 체계적인 접근, 맞춤형 커리큘럼

**교사 기록 부족 시 3단락:** "이번 주에는 기본 학습 점검 위주로 수업이 진행되었습니다."

반드시 유효한 JSON만 출력하세요.`;

  let attempts = 0;
  let lastVocabViolations: string[] = [];
  let lastFormatViolations: string[] = [];
  let lastSubjectReport: SubjectReport | null = null;

  while (attempts < maxRetries) {
    attempts++;
    const isRetry = attempts > 1;

    console.log(`[generate-ai-report] SUBJECT_ISOLATION: ${subject} attempt ${attempts}/${maxRetries}`);

    try {
      const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: systemPrompt },
            { 
              role: 'user', 
              content: isRetry 
                ? userPrompt + `\n\n[재생성 요청] 이전 생성에서 용어 위반 감지: ${lastVocabViolations.join(', ')}. ${subject} 과목 용어만 사용하세요.`
                : userPrompt
            },
          ],
          response_format: { type: 'json_object' },
        }),
      });

      if (!aiResponse.ok) {
        console.error(`[generate-ai-report] SUBJECT_ISOLATION ${subject}: AI error ${aiResponse.status}`);
        continue;
      }

      const aiResult = await aiResponse.json();
      const content = aiResult.choices?.[0]?.message?.content || '';

      // Parse JSON
      let jsonStr = content.trim();
      if (jsonStr.startsWith('```json')) jsonStr = jsonStr.slice(7);
      else if (jsonStr.startsWith('```')) jsonStr = jsonStr.slice(3);
      if (jsonStr.endsWith('```')) jsonStr = jsonStr.slice(0, -3);
      jsonStr = jsonStr.trim();

      try {
        const parsed = JSON.parse(jsonStr);
        
        if (!parsed.paragraphs || !Array.isArray(parsed.paragraphs) || parsed.paragraphs.length < 1) {
          console.error(`[generate-ai-report] SUBJECT_ISOLATION ${subject}: Invalid paragraphs (length=${parsed.paragraphs?.length})`);
          lastFormatViolations = ['INVALID_PARAGRAPHS'];
          continue;
        }
        // Normalize: trim to max 4 paragraphs, pad to min 2 if needed
        const normalizedParagraphs = parsed.paragraphs.slice(0, 4);

        lastSubjectReport = {
          subject: parsed.subject || subject,
          paragraphs: normalizedParagraphs,
          testsSummary: parsed.testsSummary,
          homeworkSummary: parsed.homeworkSummary,
          attendanceImpact: parsed.attendanceImpact,
        };

        // Validate vocabulary for this subject
        const fullText = normalizedParagraphs.join(' ') + ' ' + (parsed.testsSummary || '') + ' ' + (parsed.homeworkSummary || '');
        const vocabValidation = validateSubjectVocabulary(subject, fullText);
        lastVocabViolations = vocabValidation.violations;

        // Also check format
        const formatValidation = validateFinalReportText(fullText);
        lastFormatViolations = formatValidation.violations;

        if (vocabValidation.isValid && formatValidation.isValid) {
          console.log(`[generate-ai-report] SUBJECT_ISOLATION ${subject}: PASSED (attempt ${attempts})`);
          return {
            subjectReport: lastSubjectReport,
            isValid: true,
            vocabViolations: [],
            formatViolations: [],
            attempts,
          };
        }

        console.warn(`[generate-ai-report] SUBJECT_ISOLATION ${subject}: Violations detected - vocab: ${lastVocabViolations.join(',')} format: ${lastFormatViolations.join(',')}`);

      } catch (parseError) {
        console.error(`[generate-ai-report] SUBJECT_ISOLATION ${subject}: JSON parse error`);
        lastFormatViolations = ['JSON_PARSE_FAILED'];
      }

    } catch (fetchError) {
      console.error(`[generate-ai-report] SUBJECT_ISOLATION ${subject}: Fetch error`, fetchError);
    }
  }

  // Return last result even if invalid
  return {
    subjectReport: lastSubjectReport,
    isValid: false,
    vocabViolations: lastVocabViolations,
    formatViolations: lastFormatViolations,
    attempts,
  };
}

// REPORT_SUBJECT_ISOLATION_V1: Generate all subjects with isolation and assemble
async function generateIsolatedSubjectsReport(
  apiKey: string,
  studentName: string,
  weekStart: string,
  weekEnd: string,
  subjectData: Record<string, { lessons: LessonRecord[]; curriculum: CurriculumInfo[]; previousLessons: LessonRecord[] }>,
  customParentPrompt?: string
): Promise<{
  subjects: SubjectReport[];
  allValid: boolean;
  totalViolations: string[];
  subjectAttempts: Record<string, number>;
}> {
  const results: SubjectReport[] = [];
  const totalViolations: string[] = [];
  const subjectAttempts: Record<string, number> = {};
  let allValid = true;

  // Generate each subject in isolation, following SUBJECT_ORDER
  const subjectsToGenerate = SUBJECT_ORDER.filter(s => subjectData[s]);
  // Add any subjects not in the standard order
  for (const s of Object.keys(subjectData)) {
    if (!subjectsToGenerate.includes(s)) {
      subjectsToGenerate.push(s);
    }
  }

  console.log(`[generate-ai-report] SUBJECT_ISOLATION: Generating ${subjectsToGenerate.length} subjects in order: ${subjectsToGenerate.join(' → ')}`);

  for (const subject of subjectsToGenerate) {
    const data = subjectData[subject];
    if (!data) continue;

    const result = await generateSingleSubjectReport(
      apiKey,
      subject,
      studentName,
      weekStart,
      weekEnd,
      data.lessons,
      data.curriculum,
      data.previousLessons,
      2,
      customParentPrompt
    );

    subjectAttempts[subject] = result.attempts;

    if (result.subjectReport) {
      results.push(result.subjectReport);
    }

    if (!result.isValid) {
      allValid = false;
      totalViolations.push(...result.vocabViolations.map(v => `${subject}:${v}`));
      totalViolations.push(...result.formatViolations.map(v => `${subject}:${v}`));
    }
  }

  return {
    subjects: results,
    allValid,
    totalViolations,
    subjectAttempts,
  };
}

// REPORT_SUBJECT_ISOLATION_V1 + REPORT_TRUST_UPGRADE_V1: Generate opening and closing notes with trust data
async function generateOpeningClosingNotes(
  apiKey: string,
  studentName: string,
  weekStart: string,
  weekEnd: string,
  subjectData: Record<string, { lessons: LessonRecord[]; curriculum: CurriculumInfo[]; previousLessons: LessonRecord[] }>,
  customParentPrompt?: string,
  precomputedHwStats?: { completed: number; partial: number; notDone: number; total: number; bySubject?: Record<string, { completed: number; partial: number; notDone: number; total: number }> }
): Promise<{ openingNote: string; closingNote: string }> {
  const subjects = Object.keys(subjectData);
  const totalLessons = Object.values(subjectData).reduce((sum, d) => sum + d.lessons.length, 0);
  
  // REPORT_TEACHER_GROUNDED_NARRATIVE_V1: Collect teacher-written next_lesson_goals
  const teacherGoals: string[] = [];
  // REPORT_TRUST_UPGRADE_V1: Collect best observation for weekly highlight
  const positiveObservations: string[] = [];
  
  for (const [subj, data] of Object.entries(subjectData)) {
    for (const lesson of data.lessons) {
      if (lesson.next_lesson_goal && lesson.next_lesson_goal.trim().length > 5) {
        teacherGoals.push(`[${subj}] ${lesson.next_lesson_goal.trim()}`);
      }
      if (lesson.learning_issues_note && lesson.learning_issues_note.trim().length > 10) {
        positiveObservations.push(`[${subj} ${lesson.lesson_date}] ${lesson.learning_issues_note.trim()}`);
      }
    }
  }

  // REPORT_TRUST_UPGRADE_V1 + HW-MERGE-V1: Calculate homework completion stats
  // Combine lesson_records.homework_status AND homework_assignments (DailyHomeworkChecklist)
  let hwCompleted = 0, hwPartial = 0, hwNotDone = 0, hwTotal = 0;
  for (const data of Object.values(subjectData)) {
    for (const lesson of data.lessons) {
      if (lesson.homework_status && lesson.homework_status !== 'none_assigned' && lesson.homework_status !== 'none') {
        hwTotal++;
        if (lesson.homework_status === 'completed') hwCompleted++;
        else if (lesson.homework_status === 'partial') hwPartial++;
        else if (lesson.homework_status === 'not_done') hwNotDone++;
      }
    }
  }
  if (precomputedHwStats && precomputedHwStats.total > 0) {
    hwTotal += precomputedHwStats.total;
    hwCompleted += precomputedHwStats.completed;
    hwPartial += precomputedHwStats.partial;
    hwNotDone += precomputedHwStats.notDone;
  }
  const hwRate = hwTotal > 0 ? Math.round(((hwCompleted + hwPartial * 0.5) / hwTotal) * 100) : null;
  
  
  // REPORT_TEMPLATE_DB_V1: Use custom prompt for opening/closing if available
  const systemPrompt = customParentPrompt
    ? `${customParentPrompt}

**[시스템 필수 규칙 - 도입부와 마무리]**

위 지침의 어조와 원칙을 따르되, 주간 리포트의 도입부와 마무리만 JSON으로 작성하세요.

**아이 이름 호칭:**
- 도입부(openingNote)에서 반드시 아이 이름을 다정하게 불러주세요.
- 한국어 호칭: 이름 뒤에 "이" 사용 (예: "세인이는", "민준이는")

**[REPORT_TRUST_UPGRADE_V1] 주간 하이라이트 & 정량 데이터:**
- openingNote: 아이 이름 + 이번 주 가장 눈에 띈 구체적 관찰 장면 1개
- closingNote: 다음 주 수업 방향 + 숙제 완료율 데이터를 자연스럽게 녹여서 서술

반드시 유효한 JSON만 출력하세요.`
    : `당신은 학원 담당 선생님입니다. 주간 리포트의 도입부와 마무리를 JSON 형식으로 작성합니다.

[REPORT_TEACHER_GROUNDED_NARRATIVE_V1 + TRUST_UPGRADE 규칙]

**핵심:** 교사가 기록한 내용만 다시 표현. 추측/창작 금지.

**아이 이름 호칭:**
- 도입부(openingNote)에서 반드시 아이 이름을 다정하게 불러주세요.
- 한국어 호칭: 이름 뒤에 "이" 사용 (예: "세인이는", "민준이는", "도연이는")

**[REPORT_TRUST_UPGRADE_V1] 도입부 - Weekly Highlight:**
- 아이 이름으로 시작하고, 이번 주 관찰 기록 중 가장 구체적인 긍정 장면 하나를 언급
- "전반적으로 안정", "잘 따라옴" 같은 추상적 표현 금지
- 예: "세인이는 이번 주 수학 수업에서 분수 통분 문제를 직접 풀어보려는 시도가 있었습니다."

**[REPORT_TRUST_UPGRADE_V1] 마무리 - 정량 데이터 + 다음 방향:**
- 교사가 기록한 next_lesson_goal 내용 요약
- 숙제 완료율 정보를 한 문장으로 자연스럽게 포함
- 예: "이번 주 숙제 완료율은 75%였으며, 다음 주에는 ~을 중심으로 수업을 이어갈 예정입니다."

**금지:** 
- "전반적으로", "안정적"
- "지속 점검하겠습니다", "계속 지켜보겠습니다"
- "심화", "확장", "다음 단계로" 등 진도 추측
- 글머리 기호

반드시 유효한 JSON만 출력하세요.`;

  const userPrompt = `학생: ${studentName}
기간: ${weekStart} ~ ${weekEnd}
과목: ${subjects.join(', ')}
총 수업: ${totalLessons}회
${hwRate !== null ? `\n[이번 주 숙제 완료율]: ${hwRate}% (완료 ${hwCompleted}회 / 일부완료 ${hwPartial}회 / 미완료 ${hwNotDone}회, 총 ${hwTotal}회)` : '\n[이번 주 숙제]: 배정 없음'}
${positiveObservations.length > 0 ? `\n[이번 주 교사 관찰 기록 (하이라이트 소스)]:\n${positiveObservations.slice(0, 3).join('\n')}` : ''}
${teacherGoals.length > 0 ? `\n[교사가 기록한 다음 수업 방향]:\n${teacherGoals.slice(0, 3).join('\n')}` : '\n[교사가 기록한 다음 수업 방향]: 없음'}

{
  "openingNote": "아이 이름 + 이번 주 가장 눈에 띈 구체적 관찰 1개 (전반적으로/안정적 금지)",
  "closingNote": "${teacherGoals.length > 0 ? '다음 수업 방향 요약 + 숙제 완료율 자연스럽게 포함' : '다음 주도 학습을 이어가겠습니다'}"
}

JSON만 출력하세요.`;

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      console.error('[generate-ai-report] Opening/closing notes AI error:', response.status);
      return {
        openingNote: `${studentName}이는 이번 주 수업에 참여하며 학습을 이어갔습니다.`,
        closingNote: '다음 주도 꾸준히 학습을 이어가겠습니다.',
      };
    }

    const result = await response.json();
    let content = result.choices?.[0]?.message?.content || '';
    
    // Parse JSON
    if (content.startsWith('```json')) content = content.slice(7);
    else if (content.startsWith('```')) content = content.slice(3);
    if (content.endsWith('```')) content = content.slice(0, -3);
    content = content.trim();

    try {
      const parsed = JSON.parse(content);
      return {
        openingNote: parsed.openingNote || `${studentName}이는 이번 주 수업에 참여하며 학습을 이어갔습니다.`,
        closingNote: parsed.closingNote || '다음 주도 꾸준히 학습을 이어가겠습니다.',
      };
    } catch {
      console.error('[generate-ai-report] Opening/closing notes JSON parse error');
      return {
        openingNote: `${studentName}이는 이번 주 수업에 참여하며 학습을 이어갔습니다.`,
        closingNote: '다음 주도 꾸준히 학습을 이어가겠습니다.',
      };
    }
  } catch (error) {
    console.error('[generate-ai-report] Opening/closing notes error:', error);
    return {
      openingNote: `${studentName}이는 이번 주 수업에 참여하며 학습을 이어갔습니다.`,
      closingNote: '다음 주도 꾸준히 학습을 이어가겠습니다.',
    };
  }
}

// STUDENT_REPORT_TONE_V2_TEACHER_VOICE: Student message generation with validation and retry
async function generateStudentMessage(
  apiKey: string,
  systemPrompt: string,
  studentName: string,
  weekStart: string,
  weekEnd: string,
  subjectData: Record<string, { lessons: LessonRecord[]; curriculum: CurriculumInfo[]; previousLessons: LessonRecord[] }>
): Promise<string> {
  const maxRetries = 2;
  let attempts = 0;
  let lastContent = '';
  let lastViolations: string[] = [];

  // Build detailed observation data from teacher notes
  const observationData = Object.entries(subjectData).map(([subject, data]) => {
    const recentLesson = data.lessons[data.lessons.length - 1];
    const note = recentLesson?.learning_issues_note || '';
    const goal = recentLesson?.next_lesson_goal || '';
    const hwNote = recentLesson?.homework_check_note || '';
    return `[${subject}] 수업 ${data.lessons.length}회
  관찰 기록: ${note || '(없음)'}
  다음 수업 방향: ${goal || '(없음)'}
  숙제 관찰: ${hwNote || '(없음)'}`;
  }).join('\n');

  while (attempts < maxRetries) {
    attempts++;
    const isRetry = attempts > 1;

    const studentUserPrompt = `학생 이름: ${studentName}
기간: ${weekStart} ~ ${weekEnd}

[STUDENT_REPORT_TONE_V2_TEACHER_VOICE 규칙]
${isRetry ? `\n⚠️ 재생성 요청: 이전 메시지에서 다음 위반 감지됨: ${lastViolations.join(', ')}\n` : ''}
**학생 이름 호칭 (필수):**
- 첫 문장에서 "${studentName}아" 또는 "${studentName}야"로 다정하게 불러주세요.
- 이름 끝이 받침이면 "아", 받침 없으면 "야"

**절대 금지:**
- 일반 칭찬: "인상적이었어", "잘했어", "화이팅", "열심히 했어", "수고했어"
- 포스터 언어: "~해보자", "~하면 좋아요", "~도전해봅시다"
- 동기부여 연설: "할 수 있어", "응원할게", "기대할게"
- 평가 어조: "향상되었어", "발전했어", "성장했어"

**필수 구조 (과목별 2-4문장):**
1. 수업에서 교사가 본 구체적 행동
2. 학생의 반응 (태도, 어려움, 시도)
3. (필수) 다음 시간에 볼 내용 - 교사가 기록한 next_lesson_goal 기반

**[REPORT_TRUST_UPGRADE_V1] 다음 수업 예고 (필수):**
- 마지막 과목 뒤에 "다음 시간에는 ~을/를 같이 볼 거야." 형태로 예고 1문장 필수
- 교사가 기록한 다음 수업 방향을 사용
- 기록이 없으면 "다음 시간에 이어서 같이 볼 거야."

**권장 표현:**
- "${studentName}아, 이번 수업에서는 ~하는 모습이 보였어."
- "~할 때 잠시 멈칫했지만 다시 시도했어."
- "이 부분은 다음 시간에 다시 같이 볼 거야."
- "아직 익숙하지 않은 단계야."

이번 주 관찰 데이터:
${observationData}

위 관찰 기록을 바탕으로 교사가 학생에게 직접 말하듯 차분하게 작성하세요. 마지막에 반드시 다음 수업 예고 1문장을 포함하세요.`;

    try {
      console.log(`[generate-ai-report] Student message attempt ${attempts}/${maxRetries}${isRetry ? ` (violations: ${lastViolations.join(',')})` : ''}`);

      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: studentUserPrompt },
          ],
        }),
      });

      if (!response.ok) {
        console.error('[generate-ai-report] Student message AI error:', response.status);
        return generateFallbackStudentMessage(studentName, weekStart, weekEnd, subjectData);
      }

      const result = await response.json();
      lastContent = result.choices?.[0]?.message?.content || '';

      // Validate student message with new patterns
      const validation = validateStudentMessage(lastContent);
      
      if (validation.isValid) {
        console.log(`[generate-ai-report] Student message valid on attempt ${attempts}`);
        const startDate = new Date(weekStart);
        const endDate = new Date(weekEnd);
        const header = `[더멘토] 이번 주 체크 (${startDate.getMonth() + 1}/${startDate.getDate()}~${endDate.getMonth() + 1}/${endDate.getDate()})`;
        return header + '\n\n' + lastContent;
      }

      console.warn(`[generate-ai-report] Student message validation failed (attempt ${attempts}):`, validation.violations);
      lastViolations = validation.violations;
      
      // If this was the last attempt, use the content anyway but log warning
      if (attempts >= maxRetries) {
        console.warn('[generate-ai-report] Using student message despite violations after max retries');
        const startDate = new Date(weekStart);
        const endDate = new Date(weekEnd);
        const header = `[더멘토] 이번 주 체크 (${startDate.getMonth() + 1}/${startDate.getDate()}~${endDate.getMonth() + 1}/${endDate.getDate()})`;
        return header + '\n\n' + lastContent;
      }
    } catch (error) {
      console.error('[generate-ai-report] Student message error:', error);
      return generateFallbackStudentMessage(studentName, weekStart, weekEnd, subjectData);
    }
  }

  // Fallback if loop exits without returning
  return generateFallbackStudentMessage(studentName, weekStart, weekEnd, subjectData);
}

// STUDENT_REPORT_TONE_V2_TEACHER_VOICE: Fallback message with teacher-voice tone
function generateFallbackStudentMessage(
  studentName: string,
  weekStart: string,
  weekEnd: string,
  subjectData: Record<string, { lessons: LessonRecord[]; curriculum: CurriculumInfo[]; previousLessons: LessonRecord[] }>
): string {
  const startDate = new Date(weekStart);
  const endDate = new Date(weekEnd);
  const header = `[더멘토] 이번 주 체크 (${startDate.getMonth() + 1}/${startDate.getDate()}~${endDate.getMonth() + 1}/${endDate.getDate()})`;
  
  // Find observation and next goal from lessons
  let observation = '';
  let nextFocus = '';
  
  for (const [subject, data] of Object.entries(subjectData)) {
    const recentLesson = data.lessons[data.lessons.length - 1];
    if (recentLesson?.learning_issues_note && !observation) {
      observation = `${studentName}아, 이번 ${subject} 수업에서 ${recentLesson.learning_issues_note.slice(0, 40)}하는 모습이 보였어.`;
    }
    if (recentLesson?.next_lesson_goal && !nextFocus) {
      nextFocus = `다음 시간에는 ${recentLesson.next_lesson_goal} 부분 다시 같이 볼 거야.`;
    }
    if (observation && nextFocus) break;
  }
  
  // Default fallback with teacher-voice tone
  if (!observation) {
    observation = `${studentName}아, 이번 주 수업 내용을 정리해봤어.`;
  }
  if (!nextFocus) {
    nextFocus = '다음 시간에 이어서 같이 볼 거야.';
  }
  
  return `${header}\n\n${observation} ${nextFocus} 📝`;
}
