import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// v2.1-narrative-lock: Enforced narrative-only output
const TEMPLATE_VERSION = 'v2.1-narrative-lock';

// Forbidden patterns for validation
const FORBIDDEN_PATTERNS = {
  bulletPoints: /[·\-•]\s+/g,
  keywordLists: /(학습\s*포인트|포인트|요약|정리|체크\s*리스트)\s*[:：]/gi,
  abstractEvaluations: /(전반적으로\s*(안정|양호|좋은|괜찮)|(잘\s*따라[오옴]|열심히\s*했|잘\s*했|노력\s*했|수고\s*했)|안정적인\s*흐름|안정적\s*학습|무난\s*하게|순조롭게|문제\s*없)/gi,
  forbiddenOpenings: /^(전반적으로|안정적인\s*흐름|이번\s*주\s*학습이\s*안정|전반적\s*학습)/gmi,
  genericClosings: /(지속\s*점검하겠습니다|계속\s*지켜보겠습니다|잘\s*이끌어|꾸준히\s*지도|앞으로도\s*잘)$/gmi,
};

// v2.1 Narrative-lock system prompt - enforces 3-paragraph structure per subject
const NARRATIVE_LOCK_PARENT_PROMPT = `당신은 학원 담당 선생님입니다. 학부모에게 보내는 주간 학습 리포트를 작성합니다.

[v2.1 NARRATIVE-LOCK 규칙 - 반드시 준수]

1. 절대 금지 항목 (위반 시 생성 실패):
   - 글머리 기호 사용 금지 (·, -, •)
   - 키워드 나열 금지 (예: "학습 포인트:", "정리:", "요약:")
   - 추상적 평가 금지 (예: "전반적으로 안정적", "잘 따라옴", "열심히 했습니다")
   - 숫자만 나열 금지 (예: "이해도 4/5, 숙제 완료")

2. 과목별 필수 3단락 구조:

   [1단락: 학습 맥락 (Learning Context)]
   - 이번 주 어떤 내용을 학습했는지
   - 이 내용이 전체 교육과정에서 어느 위치인지
   - 평가 표현 절대 금지, 사실만 서술

   [2단락: 관찰된 학습 행동 (Observed Learning Behavior)]
   - 수업 중 학생이 실제로 보인 반응, 행동
   - 문제 풀이 속도, 망설임, 집중도, 질문 패턴 등 구체적 묘사
   - "요약"이나 "결론"이 아닌, 수업 장면 묘사처럼 서술

   [3단락: 교사 해석 및 방향 (Teacher Interpretation & Direction)]
   - 2단락의 행동이 왜 나타났는지 해석
   - 다음 수업에서 집중할 부분
   - 반드시 "지도 방향" 또는 "다음 주 초점" 언급

3. 테스트/숙제/출결 통합 규칙:
   - 테스트 점수: 반드시 설명 문장 안에서만 언급 (예: "분수 연산에서 70점을 받았는데, 이는 통분 과정에서의 계산 실수가 주원인입니다")
   - 숙제: 패턴이나 습관으로 서술 (예: "숙제를 미리 해오는 습관이 자리잡고 있습니다" / "숙제 완료 횟수"만 나열 금지)
   - 출결: 학습 리듬에 미친 영향으로 서술 (단순 이벤트 나열 금지)

4. 도입부 규칙:
   - 학생의 현재 학습 자세나 태도를 구체적으로 묘사
   - 금지 표현: "전반적으로", "안정적인 흐름", "이번 주 학습이 안정"

5. 마무리 규칙:
   - 부모님께 학습이 의도적으로 설계되고 있음을 안심시키는 문장
   - 금지 표현: "지속 점검하겠습니다", "계속 지켜보겠습니다"
   - 좋은 예: "다음 주에는 [구체적 단원]을 통해 [구체적 능력]을 다지는 데 집중할 예정입니다"

6. 분량:
   - 과목당 3단락, 각 1~3문장
   - 전체 400-600자

반드시 위 규칙을 엄격히 준수하여 한국어로 작성하세요.`;

const NARRATIVE_LOCK_STUDENT_PROMPT = `당신은 학원 담당 선생님입니다. 학생에게 보내는 짧은 주간 메시지를 작성합니다.

[v2.1 규칙]
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

interface ReportTemplate {
  id: string;
  template_name: string;
  prompt_text: string;
  version: string;
  is_active: boolean;
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
}

interface ValidationResult {
  isValid: boolean;
  violations: string[];
}

// Validate generated content against forbidden patterns
function validateNarrativeOutput(content: string): ValidationResult {
  const violations: string[] = [];

  // Check for bullet points
  if (FORBIDDEN_PATTERNS.bulletPoints.test(content)) {
    violations.push('BULLET_POINTS_DETECTED');
  }

  // Check for keyword lists
  if (FORBIDDEN_PATTERNS.keywordLists.test(content)) {
    violations.push('KEYWORD_LIST_DETECTED');
  }

  // Check for abstract evaluations
  if (FORBIDDEN_PATTERNS.abstractEvaluations.test(content)) {
    violations.push('ABSTRACT_EVALUATION_DETECTED');
  }

  // Check for forbidden openings (first 100 chars)
  const opening = content.slice(0, 100);
  if (FORBIDDEN_PATTERNS.forbiddenOpenings.test(opening)) {
    violations.push('FORBIDDEN_OPENING_DETECTED');
  }

  // Check for generic closings (last 100 chars)
  const closing = content.slice(-100);
  if (FORBIDDEN_PATTERNS.genericClosings.test(closing)) {
    violations.push('GENERIC_CLOSING_DETECTED');
  }

  return {
    isValid: violations.length === 0,
    violations,
  };
}

// Load prompts - now defaults to v2.1 narrative-lock prompts
async function loadPrompts(supabase: any): Promise<{ parentPrompt: string; studentPrompt: string; parentVersion: string; studentVersion: string }> {
  try {
    const { data: templates, error } = await supabase
      .from('report_templates')
      .select('*')
      .eq('is_active', true);

    if (error) {
      console.error('[generate-ai-report] Error loading prompts from DB:', error);
      // Use v2.1 narrative-lock prompts as fallback
      return {
        parentPrompt: NARRATIVE_LOCK_PARENT_PROMPT,
        studentPrompt: NARRATIVE_LOCK_STUDENT_PROMPT,
        parentVersion: TEMPLATE_VERSION,
        studentVersion: TEMPLATE_VERSION,
      };
    }

    const parentTemplate = templates?.find((t: ReportTemplate) => t.template_name === 'parent');
    const studentTemplate = templates?.find((t: ReportTemplate) => t.template_name === 'student');

    // Always use v2.1 prompts to enforce narrative-lock
    return {
      parentPrompt: NARRATIVE_LOCK_PARENT_PROMPT,
      studentPrompt: NARRATIVE_LOCK_STUDENT_PROMPT,
      parentVersion: TEMPLATE_VERSION,
      studentVersion: TEMPLATE_VERSION,
    };
  } catch (err) {
    console.error('[generate-ai-report] Exception loading prompts:', err);
    return {
      parentPrompt: NARRATIVE_LOCK_PARENT_PROMPT,
      studentPrompt: NARRATIVE_LOCK_STUDENT_PROMPT,
      parentVersion: TEMPLATE_VERSION,
      studentVersion: TEMPLATE_VERSION,
    };
  }
}

// Generate parent report with validation and retry
async function generateParentReportWithRetry(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  maxRetries: number = 2
): Promise<{ content: string; isValid: boolean; violations: string[]; attempts: number }> {
  let attempts = 0;
  let lastContent = '';
  let lastViolations: string[] = [];

  while (attempts < maxRetries) {
    attempts++;
    console.log(`[generate-ai-report] Parent report attempt ${attempts}/${maxRetries}`);

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
            content: attempts > 1 
              ? userPrompt + `\n\n[재생성 요청] 이전 생성에서 다음 규칙 위반이 감지되었습니다: ${lastViolations.join(', ')}. 반드시 규칙을 준수해주세요. 글머리 기호(·, -, •)와 추상적 평가("전반적으로 안정", "잘 따라옴" 등)를 절대 사용하지 마세요.`
              : userPrompt
          },
        ],
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

    const validation = validateNarrativeOutput(lastContent);
    lastViolations = validation.violations;

    console.log(`[generate-ai-report] Attempt ${attempts} validation:`, validation.isValid ? 'PASSED' : `FAILED (${lastViolations.join(', ')})`);

    if (validation.isValid) {
      return {
        content: lastContent,
        isValid: true,
        violations: [],
        attempts,
      };
    }
  }

  // All retries exhausted - return last attempt with violation info
  console.warn(`[generate-ai-report] All ${maxRetries} attempts failed validation. Violations: ${lastViolations.join(', ')}`);
  return {
    content: lastContent,
    isValid: false,
    violations: lastViolations,
    attempts,
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

    const { student_id, student_name, week_start, week_end } = await req.json() as GenerateReportRequest;

    console.log(`[REPORT_GEN_DEBUG_V2.1] templateVersion=${TEMPLATE_VERSION}`);
    console.log(`[generate-ai-report] Generating for ${student_name} (${student_id}), week: ${week_start} to ${week_end}`);

    // Load prompts (now always uses v2.1 narrative-lock)
    const { parentPrompt, studentPrompt, parentVersion, studentVersion } = await loadPrompts(supabase);
    console.log(`[generate-ai-report] Using prompts - version: ${TEMPLATE_VERSION}`);

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
          prompt_versions: { parent: parentVersion, student: studentVersion },
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
    const userPrompt = buildNarrativeUserPrompt(student_name, week_start, week_end, subjectData);

    console.log('[generate-ai-report] Calling AI gateway for parent report with validation...');

    // Generate parent report with validation and retry
    const parentResult = await generateParentReportWithRetry(
      LOVABLE_API_KEY,
      parentPrompt,
      userPrompt,
      2 // max 2 attempts
    );

    let parentMessageContent = parentResult.content;
    let draftStatus = 'ready';
    let riskLevel: string | null = null;

    // Handle validation failures or insufficient data
    if (!parentResult.isValid || !hasSufficientNarrativeData) {
      if (!hasSufficientNarrativeData) {
        console.log('[generate-ai-report] Insufficient narrative data - marking as RED');
        parentMessageContent = INSUFFICIENT_DATA_MESSAGE;
        draftStatus = 'needs_input';
        riskLevel = 'high'; // RED marker
      } else if (!parentResult.isValid) {
        console.log('[generate-ai-report] Validation failed after retries - marking as RED');
        // Still use the content but mark as needing review
        draftStatus = 'needs_review';
        riskLevel = 'medium';
      }
    }

    // Generate student message
    const studentMessageContent = await generateStudentMessage(
      LOVABLE_API_KEY,
      studentPrompt,
      student_name,
      week_start,
      week_end,
      subjectData
    );

    // Format final messages with version marker for admin
    const parentHeader = formatParentHeader(student_name, week_start, week_end);
    const debugMarker = `[REPORT_GEN_DEBUG_V2.1] templateVersion=${TEMPLATE_VERSION}`;
    
    return new Response(
      JSON.stringify({
        success: true,
        parent_message: parentHeader + '\n\n' + parentMessageContent,
        student_message: studentMessageContent,
        draft_status: draftStatus,
        risk_level: riskLevel,
        lesson_count: currentWeekLessons.length,
        subjects: Object.keys(subjectData),
        template_version: TEMPLATE_VERSION,
        prompt_versions: { parent: parentVersion, student: studentVersion },
        // Admin-only debug info
        _debug: {
          debug_marker: debugMarker,
          template_version: TEMPLATE_VERSION,
          validation_passed: parentResult.isValid,
          validation_attempts: parentResult.attempts,
          violations: parentResult.violations,
          has_sufficient_data: hasSufficientNarrativeData,
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

// v2.1 Narrative-focused user prompt builder
function buildNarrativeUserPrompt(
  studentName: string,
  weekStart: string,
  weekEnd: string,
  subjectData: Record<string, { lessons: LessonRecord[]; curriculum: CurriculumInfo[]; previousLessons: LessonRecord[] }>
): string {
  let prompt = `학생: ${studentName}
기간: ${weekStart} ~ ${weekEnd}

[중요] 아래 데이터를 바탕으로 각 과목별 3단락 구조(학습 맥락 → 관찰된 행동 → 교사 해석 및 방향)로 서술하세요.
글머리 기호(·, -, •), 키워드 나열, 추상적 평가("전반적으로 안정", "잘 따라옴")는 절대 사용하지 마세요.

=== 이번 주 수업 데이터 ===\n\n`;

  for (const [subject, data] of Object.entries(subjectData)) {
    prompt += `【${subject}】 수업 ${data.lessons.length}회\n`;
    
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
=== 작성 지침 ===
1. 각 과목별로 반드시 3단락으로 작성:
   - 1단락: 이번 주 학습 내용과 교육과정 위치 (평가 없이 사실만)
   - 2단락: 수업 중 관찰된 학생 행동 (구체적 장면 묘사)
   - 3단락: 교사의 해석과 다음 주 지도 방향

2. 테스트 점수는 반드시 해석과 함께 문장 안에서 언급

3. 도입부에서 학생의 현재 학습 자세를 구체적으로 묘사 (금지: "전반적으로", "안정적")

4. 마무리에서 다음 주 구체적 학습 계획 언급 (금지: "지속 점검하겠습니다")`;

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
    const validation = validateNarrativeOutput(content);
    if (!validation.isValid) {
      console.warn('[generate-ai-report] Student message validation failed:', validation.violations);
      // Use content anyway for student message, less critical
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
