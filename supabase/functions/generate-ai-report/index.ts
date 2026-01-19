import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// v2.4-engine-debug: Add debug header to saved report text + debug_info column
// REPORT-ENGINE-DEBUG-V1
const TEMPLATE_VERSION = 'v2.4-engine-debug';
const FORMATTER_NAME = 'renderReportFromJson-v2.4';

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
};

// v2.2 JSON-first system prompt - forces structured JSON output
const JSON_PARENT_PROMPT = `당신은 학원 담당 선생님입니다. 학부모에게 보내는 주간 학습 리포트를 JSON 형식으로 작성합니다.

[v2.2 NARRATIVE-JSON 규칙 - 반드시 준수]

**출력 형식: JSON만 허용**
반드시 아래 JSON 스키마로만 응답하세요. 다른 형식은 시스템 오류를 발생시킵니다.

{
  "subjects": [
    {
      "subject": "과목명",
      "paragraphs": [
        "1단락: 학습 맥락 - 이번 주 학습 내용과 교육과정 위치. 평가 없이 사실만.",
        "2단락: 관찰된 행동 - 수업 중 학생의 구체적 반응, 행동, 문제풀이 속도, 질문 패턴 등.",
        "3단락: 교사 해석 및 방향 - 행동의 원인 해석과 다음 주 지도 방향."
      ],
      "testsSummary": "테스트 결과 설명 문장 (선택사항)",
      "homeworkSummary": "숙제 패턴 설명 문장 (선택사항)",
      "attendanceImpact": "출결이 학습에 미친 영향 (선택사항)"
    }
  ],
  "openingNote": "학생의 현재 학습 자세/태도 구체적 묘사",
  "closingNote": "다음 주 구체적 학습 계획 안내",
  "adminTag": "GREEN 또는 YELLOW 또는 RED"
}

**절대 금지 항목 (위반 시 생성 실패):**
- 글머리 기호 (·, -, •) 사용 금지
- 키워드 나열 금지 (예: "학습 포인트:", "다음 주 계획:")
- 추상적 평가 금지 (예: "전반적으로 안정", "잘 따라옴")
- openingNote에서 금지: "전반적으로", "안정적인 흐름"
- closingNote에서 금지: "지속 점검하겠습니다", "계속 지켜보겠습니다"

**paragraphs 규칙:**
- 정확히 3개의 문자열 배열
- 각 문자열은 1~3문장의 완전한 문장
- 요약이나 키워드 목록 형태 금지

**테스트/숙제/출결 규칙:**
- 점수는 반드시 해석 문장 안에 포함 (예: "분수 연산에서 70점을 받았는데, 통분 과정에서의 계산 실수가 원인입니다")
- 숙제는 패턴/습관으로 서술 (횟수만 나열 금지)
- 출결은 학습 리듬에 미친 영향으로 서술

**adminTag 기준:**
- GREEN: 충분한 서술 데이터로 완성된 리포트
- YELLOW: 일부 과목 서술 부족하지만 리포트 생성 가능
- RED: 서술 데이터 부족으로 교사 추가 관찰 필요

반드시 유효한 JSON만 출력하세요. 마크다운이나 추가 텍스트 없이 JSON만 반환합니다.`;

// Stronger retry prompt
const RETRY_SYSTEM_PROMPT = `당신은 학원 담당 선생님입니다.

**경고: 이전 생성에서 규칙 위반이 감지되었습니다.**

**절대 금지:**
- 글머리 기호 (·, -, •) 사용 → 문장으로 연결
- "\n-" 또는 "\n•" 형식 → 완전한 문장으로 서술
- 키워드: 레이블 형식 → 자연스러운 문장으로
- "전반적으로", "안정적" 같은 추상적 표현 → 구체적 관찰로 대체

반드시 유효한 JSON만 출력하세요. paragraphs는 정확히 3개의 완전한 문장 배열이어야 합니다.`;

const NARRATIVE_LOCK_STUDENT_PROMPT = `당신은 학원 담당 선생님입니다. 학생에게 보내는 짧은 주간 메시지를 작성합니다.

[v2.2 규칙]
1. 이번 주 수업에서 학생이 한 구체적 행동 1가지만 언급
2. 다음 주 명확한 미션 1가지 제시
3. 금지: "잘했어", "열심히 했어", "수고했어" 같은 일반 칭찬
4. 금지: 점수나 이해도 숫자 기반 칭찬
5. 글머리 기호(·, -, •) 사용 금지

[형식]
- 2-3문장
- 이모지 1-2개만
- 친근하지만 가볍지 않은 톤

예시:
"이번 주 분수 통분할 때 공배수 찾는 속도가 확실히 빨라졌어. 다음 주는 분수 나눗셈에서 '뒤집어 곱하기' 원리 확실히 이해하고 오자! 💪"

반드시 한국어로 작성하세요.`;

// Failure message when narrative cannot be generated
const INSUFFICIENT_DATA_MESSAGE = "이번 주 학습 내용을 충분히 설명하기 위해 교사 추가 관찰이 필요합니다.";

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
}

interface ValidationResult {
  isValid: boolean;
  violations: string[];
}

// FINAL TEXT VALIDATOR - runs on the string that will be saved to DB
// v2.3: Added bracket and summary block detection
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

  // NEW v2.3: Check for legacy bracket headers 【...】
  FORBIDDEN_PATTERNS.bracketHeaders.lastIndex = 0;
  if (FORBIDDEN_PATTERNS.bracketHeaders.test(content)) {
    violations.push('BRACKET_HEADER_DETECTED');
  }

  // NEW v2.3: Check for summary blocks like "수업 3회, 평균 이해도"
  FORBIDDEN_PATTERNS.summaryBlocks.lastIndex = 0;
  if (FORBIDDEN_PATTERNS.summaryBlocks.test(content)) {
    violations.push('SUMMARY_BLOCK_DETECTED');
  }

  // Check if content starts with 【
  if (content.trim().startsWith('【')) {
    violations.push('STARTS_WITH_BRACKET');
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
        model: 'google/gemini-3-flash-preview',
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

    console.log(`[REPORT_GEN_DEBUG_V2.4] templateVersion=${TEMPLATE_VERSION} formatter=${FORMATTER_NAME}`);
    console.log(`[generate-ai-report] Generating for ${student_name} (${student_id}), week: ${week_start} to ${week_end}`);

    // Fetch this week's lesson records
    const { data: currentWeekLessons, error: lessonsError } = await supabase
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

    if (!currentWeekLessons || currentWeekLessons.length === 0) {
      console.log('[generate-ai-report] No lessons found for this week');
      return new Response(
        JSON.stringify({
          success: true,
          parent_message: null,
          student_message: null,
          draft_status: 'no_lessons',
          template_version: TEMPLATE_VERSION,
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

    const { data: previousLessons } = await supabase
      .from('lesson_records')
      .select('*')
      .eq('student_id', student_id)
      .gte('lesson_date', prevWeekStart.toISOString().split('T')[0])
      .lte('lesson_date', prevWeekEnd.toISOString().split('T')[0])
      .eq('submitted', true)
      .order('lesson_date', { ascending: false });

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
    const userPrompt = buildJsonUserPrompt(student_name, week_start, week_end, subjectData);

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
        NARRATIVE_LOCK_STUDENT_PROMPT,
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

    // Generate parent report with JSON output and validation
    const parentResult = await generateParentReportWithRetry(
      LOVABLE_API_KEY,
      userPrompt,
      2, // max 2 attempts
      strictNarrative
    );

    let parentMessageContent = parentResult.content;
    let draftStatus = 'ready';
    let riskLevel: string | null = null;

    // Handle validation failures
    if (!parentResult.isValid) {
      console.log('[generate-ai-report] Validation failed after retries - marking based on adminTag');
      draftStatus = 'needs_review';
      riskLevel = parentResult.adminTag === 'RED' ? 'high' : 'medium';
      
      // If completely failed, use insufficient data message
      if (!parentMessageContent || parentResult.violations.includes('JSON_PARSE_FAILED')) {
        parentMessageContent = INSUFFICIENT_DATA_MESSAGE;
        draftStatus = 'needs_input';
        riskLevel = 'high';
      }
    } else {
      // Set risk level based on adminTag from JSON
      if (parentResult.adminTag === 'RED') {
        riskLevel = 'high';
        draftStatus = 'needs_input';
      } else if (parentResult.adminTag === 'YELLOW') {
        riskLevel = 'medium';
      }
    }

    // Generate student message
    const studentMessageContent = await generateStudentMessage(
      LOVABLE_API_KEY,
      NARRATIVE_LOCK_STUDENT_PROMPT,
      student_name,
      week_start,
      week_end,
      subjectData
    );

    // REPORT-DEBUG-DETAIL-V1: Format final messages with explicit debug fields
    const parentHeader = formatParentHeader(student_name, week_start, week_end);
    const subjectsIncluded = Object.keys(subjectData);
    const renderer = 'narrative'; // Always narrative in v2.1+
    const validatorStatus = parentResult.isValid ? 'pass' : 'fail';
    const failureReason = !parentResult.isValid 
      ? (parentResult.violations.includes('JSON_PARSE_FAILED') ? 'json_parse_failed' : 'validator_failed')
      : null;
    
    // Explicit debug info with all diagnostic fields
    const debugInfo = [
      `[REPORT_ENGINE_DEBUG]`,
      `marker=REPORT-DEBUG-DETAIL-V1`,
      `source=edge_function`,
      `templateVersion=${TEMPLATE_VERSION}`,
      `renderer=${renderer}`,
      `validator=${validatorStatus}`,
      `retries=${parentResult.attempts}`,
      `tag=${parentResult.adminTag}`,
      `subjectsIncluded=[${subjectsIncluded.join(',')}]`,
      failureReason ? `reason=${failureReason}` : null,
    ].filter(Boolean).join(' ');
    
    const debugMarker = `[REPORT_GEN_DEBUG_V2.4] templateVersion=${TEMPLATE_VERSION} renderer=${renderer} retries=${parentResult.attempts} validator=${validatorStatus} tag=${parentResult.adminTag} subjects=[${subjectsIncluded.join(',')}]`;
    
    // Embed debug header in saved report text (at the start, after header)
    const parentMessageWithDebug = parentHeader + '\n\n' + debugInfo + '\n\n' + parentMessageContent;
    
    console.log(`[generate-ai-report] REPORT-DEBUG-DETAIL-V1: student=${student_name} subjects=${subjectsIncluded.join(',')} validator=${validatorStatus} tag=${parentResult.adminTag} retries=${parentResult.attempts}`);
    
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
        _debug: {
          debug_marker: debugMarker,
          marker: 'REPORT-DEBUG-DETAIL-V1',
          template_version: TEMPLATE_VERSION,
          renderer: renderer,
          formatter: FORMATTER_NAME,
          validator: validatorStatus,
          validation_passed: parentResult.isValid,
          validation_attempts: parentResult.attempts,
          violations: parentResult.violations,
          has_sufficient_data: hasSufficientNarrativeData,
          admin_tag: parentResult.adminTag,
          subjects_included: subjectsIncluded,
          reason: failureReason,
          json_output: parentResult.jsonOutput,
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
  subjectData: Record<string, { lessons: LessonRecord[]; curriculum: CurriculumInfo[]; previousLessons: LessonRecord[] }>
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
        const nonNormal = lesson.attendance_status.filter(s => s !== '정상등원' && s !== '등원');
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

async function generateStudentMessage(
  apiKey: string,
  systemPrompt: string,
  studentName: string,
  weekStart: string,
  weekEnd: string,
  subjectData: Record<string, { lessons: LessonRecord[]; curriculum: CurriculumInfo[]; previousLessons: LessonRecord[] }>
): Promise<string> {
  const studentUserPrompt = `학생 이름: ${studentName}
기간: ${weekStart} ~ ${weekEnd}

[중요] 글머리 기호(·, -, •) 사용 금지. 일반 칭찬("잘했어", "수고했어") 금지.

이번 주 수업 내용:
${Object.entries(subjectData).map(([subject, data]) => {
  const goals = data.lessons.filter(l => l.next_lesson_goal).map(l => l.next_lesson_goal).slice(-1);
  const notes = data.lessons.filter(l => l.learning_issues_note).map(l => l.learning_issues_note).slice(-1);
  return `${subject}: ${data.lessons.length}회 수업${goals.length > 0 ? `, 다음 목표: ${goals[0]}` : ''}${notes.length > 0 ? `, 관찰: ${notes[0]?.slice(0, 50)}` : ''}`;
}).join('\n')}

위 내용을 바탕으로 학생에게 보내는 짧은 격려 메시지를 작성하세요.
구체적인 행동 1가지 언급 + 다음 주 미션 1가지 제시.`;

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
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
    const content = result.choices?.[0]?.message?.content || '';
    
    // Validate student message too
    const validation = validateFinalReportText(content);
    if (!validation.isValid) {
      console.warn('[generate-ai-report] Student message validation failed:', validation.violations);
    }
    
    const startDate = new Date(weekStart);
    const endDate = new Date(weekEnd);
    const header = `[더멘토] 이번 주 체크 (${startDate.getMonth() + 1}/${startDate.getDate()}~${endDate.getMonth() + 1}/${endDate.getDate()})`;
    
    return header + '\n\n' + content;
  } catch (error) {
    console.error('[generate-ai-report] Student message error:', error);
    return generateFallbackStudentMessage(studentName, weekStart, weekEnd, subjectData);
  }
}

function generateFallbackStudentMessage(
  studentName: string,
  weekStart: string,
  weekEnd: string,
  subjectData: Record<string, { lessons: LessonRecord[]; curriculum: CurriculumInfo[]; previousLessons: LessonRecord[] }>
): string {
  const startDate = new Date(weekStart);
  const endDate = new Date(weekEnd);
  const header = `[더멘토] 이번 주 체크 (${startDate.getMonth() + 1}/${startDate.getDate()}~${endDate.getMonth() + 1}/${endDate.getDate()})`;
  
  // Find a concrete next goal from lessons
  let nextGoal = '';
  for (const [subject, data] of Object.entries(subjectData)) {
    const goal = data.lessons.find(l => l.next_lesson_goal)?.next_lesson_goal;
    if (goal) {
      nextGoal = `다음 주 ${subject} 미션: ${goal}`;
      break;
    }
  }
  
  if (!nextGoal) {
    nextGoal = '다음 주도 꾸준히 진행하자!';
  }
  
  return `${header}\n\n${studentName} 학생, ${nextGoal} 💪`;
}
