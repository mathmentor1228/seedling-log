import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// v2.0 Fallback prompts - observation-based narrative style
const FALLBACK_PARENT_PROMPT = `당신은 학생의 담당 선생님입니다. 학부모에게 보내는 주간 학습 리포트를 작성하세요.

[핵심 원칙]
1. 관찰 → 해석 → 방향 구조로 서술하세요
2. 구체적인 수업 장면이나 반응을 묘사하세요 (예: "분수 문제에서 계속 분모를 먼저 확인하는 습관이 생겼어요")
3. 숫자나 점수를 나열하지 말고, 그 의미를 해석하세요
4. "잘하고 있습니다", "열심히 했습니다" 같은 일반적 칭찬 대신 구체적 행동을 언급하세요
5. 키워드 나열 금지 (예: "학습 포인트: 계산 실수 잦음" ← 이런 형식 사용 금지)

[과목별 작성 가이드]
각 과목에 대해:
- 관찰: 이번 주 수업에서 눈에 띈 구체적 장면
- 해석: 그것이 학습 흐름에서 갖는 의미
- 방향: 다음 주에 집중할 부분과 이유

[테스트 결과 해석]
- 점수만 알리지 말고, 어떤 유형에서 막혔는지/잘했는지 해석
- 테스트가 없으면 이 섹션 생략

[출결/숙제 언급]
- 정상이면 언급하지 않음
- 이슈가 있을 때만 간단히 언급하고 맥락 설명

[분량]
- 과목당 3-5문장
- 전체 300-500자

반드시 한국어로 작성하세요.`;

const FALLBACK_STUDENT_PROMPT = `당신은 학생의 담당 선생님입니다. 학생에게 보내는 짧은 주간 메시지를 작성하세요.

[핵심 원칙]
1. 이번 주 수업에서 학생이 한 구체적 행동 1가지 언급
2. 다음 주 명확한 미션 1가지 제시
3. "잘했어", "열심히 했어" 같은 일반적 칭찬 금지
4. 점수나 이해도 숫자 기반 칭찬 금지

[형식]
- 2-3문장으로 끝내기
- 이모지 1-2개까지만 사용
- 친근하지만 가볍지 않은 톤

예시:
"이번 주 분수 통분할 때 공배수 찾는 거 훨씬 빨라졌어. 다음 주는 분수 나눗셈 뒤집기 규칙 외워오자! 💪"

반드시 한국어로 작성하세요.`;

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

// Load prompts from database
async function loadPrompts(supabase: any): Promise<{ parentPrompt: string; studentPrompt: string; parentVersion: string; studentVersion: string }> {
  try {
    const { data: templates, error } = await supabase
      .from('report_templates')
      .select('*')
      .eq('is_active', true);

    if (error) {
      console.error('[generate-ai-report] Error loading prompts from DB:', error);
      return {
        parentPrompt: FALLBACK_PARENT_PROMPT,
        studentPrompt: FALLBACK_STUDENT_PROMPT,
        parentVersion: 'fallback',
        studentVersion: 'fallback',
      };
    }

    const parentTemplate = templates?.find((t: ReportTemplate) => t.template_name === 'parent');
    const studentTemplate = templates?.find((t: ReportTemplate) => t.template_name === 'student');

    return {
      parentPrompt: parentTemplate?.prompt_text || FALLBACK_PARENT_PROMPT,
      studentPrompt: studentTemplate?.prompt_text || FALLBACK_STUDENT_PROMPT,
      parentVersion: parentTemplate?.version || 'fallback',
      studentVersion: studentTemplate?.version || 'fallback',
    };
  } catch (err) {
    console.error('[generate-ai-report] Exception loading prompts:', err);
    return {
      parentPrompt: FALLBACK_PARENT_PROMPT,
      studentPrompt: FALLBACK_STUDENT_PROMPT,
      parentVersion: 'fallback',
      studentVersion: 'fallback',
    };
  }
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

    console.log(`[generate-ai-report] Generating for ${student_name} (${student_id}), week: ${week_start} to ${week_end}`);

    // Load prompts from database
    const { parentPrompt, studentPrompt, parentVersion, studentVersion } = await loadPrompts(supabase);
    console.log(`[generate-ai-report] Using prompts - parent: ${parentVersion}, student: ${studentVersion}`);

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
          prompt_versions: { parent: parentVersion, student: studentVersion },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch previous week's lessons for context (1-2 weeks back)
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
    const userPrompt = buildUserPrompt(student_name, week_start, week_end, subjectData);

    console.log('[generate-ai-report] Calling AI gateway for parent report...');

    // Call Lovable AI Gateway for parent report
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: parentPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Payment required. Please add credits to your workspace.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await aiResponse.text();
      console.error('[generate-ai-report] AI gateway error:', aiResponse.status, errorText);
      throw new Error(`AI gateway error: ${aiResponse.status}`);
    }

    const aiResult = await aiResponse.json();
    const parentMessageContent = aiResult.choices?.[0]?.message?.content || '';

    console.log('[generate-ai-report] AI response received, length:', parentMessageContent.length);

    // Determine draft status based on data completeness
    const hasSufficientData = currentWeekLessons.some(l => 
      (l.learning_issues_note && l.learning_issues_note.trim()) || 
      (l.next_lesson_goal && l.next_lesson_goal.trim())
    );
    
    const draftStatus = currentWeekLessons.length <= 1 && !hasSufficientData 
      ? 'draft' 
      : 'ready';

    // Generate a shorter student-focused message
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
    const versionMarker = `[PROMPT_VERSION: parent=${parentVersion}, student=${studentVersion}]\n\n`;
    
    return new Response(
      JSON.stringify({
        success: true,
        parent_message: parentHeader + '\n\n' + parentMessageContent,
        student_message: studentMessageContent,
        draft_status: draftStatus,
        lesson_count: currentWeekLessons.length,
        subjects: Object.keys(subjectData),
        prompt_versions: { parent: parentVersion, student: studentVersion },
        // Admin-only debug info with version marker
        _debug: {
          version_marker: versionMarker.trim(),
          parent_prompt_version: parentVersion,
          student_prompt_version: studentVersion,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[generate-ai-report] Error:', errorMessage);
    
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

function buildUserPrompt(
  studentName: string,
  weekStart: string,
  weekEnd: string,
  subjectData: Record<string, { lessons: LessonRecord[]; curriculum: CurriculumInfo[]; previousLessons: LessonRecord[] }>
): string {
  let prompt = `학생: ${studentName}
기간: ${weekStart} ~ ${weekEnd}

=== 이번 주 수업 데이터 ===\n\n`;

  for (const [subject, data] of Object.entries(subjectData)) {
    prompt += `【${subject}】 수업 ${data.lessons.length}회\n`;
    
    for (const lesson of data.lessons) {
      prompt += `- ${lesson.lesson_date}:\n`;
      prompt += `  이해도: ${lesson.understanding_score}/5\n`;
      
      const lessonTypes = lesson.lesson_types?.filter(t => t !== '정규') || [];
      if (lessonTypes.length > 0) {
        prompt += `  수업유형: ${lessonTypes.join(', ')}\n`;
      }
      
      if (lesson.attendance_status && lesson.attendance_status.length > 0) {
        const nonNormal = lesson.attendance_status.filter(s => s !== '정상등원' && s !== '등원');
        if (nonNormal.length > 0) {
          prompt += `  출결: ${nonNormal.join(', ')}\n`;
        }
      }
      
      if (lesson.homework_status && lesson.homework_status !== 'none_assigned') {
        prompt += `  숙제: ${lesson.homework_status}\n`;
      }
      
      if (lesson.homework_check_note) {
        prompt += `  숙제확인노트: ${lesson.homework_check_note}\n`;
      }
      
      if (lesson.learning_issues && lesson.learning_issues.length > 0) {
        prompt += `  학습이슈: ${lesson.learning_issues.join(', ')}\n`;
      }
      
      if (lesson.learning_issues_note) {
        prompt += `  학습상황상세: ${lesson.learning_issues_note}\n`;
      }
      
      if (lesson.next_lesson_goal) {
        prompt += `  다음목표: ${lesson.next_lesson_goal}\n`;
      }
      
      if (lesson.test_result_text) {
        prompt += `  테스트: ${lesson.test_title || '테스트'} - ${lesson.test_result_text}\n`;
      }
    }

    // Curriculum info
    if (data.curriculum.length > 0) {
      prompt += `\n  [교육과정 정보]\n`;
      for (const curr of data.curriculum) {
        prompt += `  - ${curr.unit_title} (${curr.unit_key})\n`;
        prompt += `    흐름: ${curr.flow_summary}\n`;
        if (curr.next_summary) {
          prompt += `    다음단계: ${curr.next_summary}\n`;
        }
      }
    }

    // Previous week context
    if (data.previousLessons.length > 0) {
      prompt += `\n  [이전 1-2주 참고]\n`;
      for (const prev of data.previousLessons.slice(0, 3)) {
        prompt += `  - ${prev.lesson_date}: 이해도 ${prev.understanding_score}/5`;
        if (prev.learning_issues_note) {
          prompt += ` / ${prev.learning_issues_note.slice(0, 50)}...`;
        }
        prompt += '\n';
      }
    }

    prompt += '\n';
  }

  prompt += `\n위 데이터를 바탕으로 학부모용 주간 리포트를 작성해주세요.
각 과목별로 지침에 따라 작성하되,
테스트가 없으면 테스트 관련 섹션은 생략하세요.`;

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

이번 주 수업 요약:
${Object.entries(subjectData).map(([subject, data]) => {
  const avgScore = data.lessons.reduce((sum, l) => sum + l.understanding_score, 0) / data.lessons.length;
  const goals = data.lessons.filter(l => l.next_lesson_goal).map(l => l.next_lesson_goal).slice(-1);
  return `- ${subject}: ${data.lessons.length}회 수업, 평균 이해도 ${avgScore.toFixed(1)}/5${goals.length > 0 ? `, 다음 목표: ${goals[0]}` : ''}`;
}).join('\n')}

위 데이터로 학생에게 보내는 짧은 격려 메시지를 작성해주세요.`;

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
    const startDate = new Date(weekStart);
    const endDate = new Date(weekEnd);
    const header = `[더멘토] 이번 주 체크 (${startDate.getMonth() + 1}/${startDate.getDate()}~${endDate.getMonth() + 1}/${endDate.getDate()})`;
    
    return header + '\n\n' + (result.choices?.[0]?.message?.content || generateFallbackStudentMessage(studentName, weekStart, weekEnd, subjectData));
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
  const subjects = Object.keys(subjectData);
  const totalLessons = Object.values(subjectData).reduce((sum, d) => sum + d.lessons.length, 0);
  
  const startDate = new Date(weekStart);
  const endDate = new Date(weekEnd);
  const header = `[더멘토] 이번 주 체크 (${startDate.getMonth() + 1}/${startDate.getDate()}~${endDate.getMonth() + 1}/${endDate.getDate()})`;
  
  let message = `${header}\n\n`;
  message += `${studentName} 학생, 이번 주도 수고했어요! 🌟\n\n`;
  message += `총 ${totalLessons}회 수업을 잘 따라왔어요.\n\n`;
  
  message += '📋 다음 주 미션:\n';
  for (const [subject, data] of Object.entries(subjectData)) {
    const lastGoal = data.lessons.filter(l => l.next_lesson_goal).slice(-1)[0]?.next_lesson_goal;
    if (lastGoal) {
      message += `- ${subject}: ${lastGoal}\n`;
    }
  }
  
  return message;
}
