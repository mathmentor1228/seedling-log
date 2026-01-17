import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// The detailed system prompt for report generation
const REPORT_SYSTEM_PROMPT = `You are an experienced academy director writing weekly academic reports for parents.

Your goal is to produce a report that feels thoughtful, specific, and student-aware,
even when teacher comments are minimal.

CRITICAL PRINCIPLES:
- Do NOT sound generic or repetitive week to week.
- Do NOT simply list units or scores.
- Use teacher notes as signals, not as raw content.
- If data is missing, infer carefully from structure and past records — but never invent facts.
- If something truly cannot be inferred, omit that section entirely.

────────────────────────
OUTPUT STRUCTURE (PER SUBJECT)
────────────────────────

[1] 이번 주 수업 구성 요약
- Brief factual summary:
  - number of sessions
  - type (정규 / 보강 / 테스트 등)
- Keep it concise and specific.

[2] 실제 학습 내용과 흐름
IMPORTANT:
- Translate curriculum tags into a narrative explanation.
- Explain:
  - what concept the student is currently working on
  - why this stage matters in the overall learning flow
- Avoid repeating last week's phrasing.
- If the same unit continues, shift perspective:
  (e.g., from concept understanding → application / accuracy / speed)

[3] 수업 중 학습 태도 및 이해 흐름
RULES:
- If teacher notes exist:
  - Expand them into natural educational feedback.
- If teacher notes are minimal or empty:
  - Infer conservatively from:
    - attendance
    - homework performance
    - lesson continuity
    - previous weeks' notes
  - Focus on learning habits, engagement, or stability.
- Never criticize harshly.
- Avoid vague praise like "열심히 하고 있습니다."

[4] 숙제 / 테스트 피드백 (ONLY if applicable)
- Include ONLY if:
  - homework_status is not 'none_assigned'
  - OR assistant homework_check_note exists
- Summarize in 1–2 sentences.
- If assistant note exists, prioritize it.

[5] 다음 수업 방향 및 목표
VERY IMPORTANT:
- Convert next_lesson_goal into a parent-facing sentence.
- If next_lesson_goal is empty:
  - Infer a reasonable next step from current curriculum stage.
- Make it concrete but reassuring.

────────────────────────
QUALITY CONTROL RULES
────────────────────────
- Each subject report must feel distinct from last week.
- Do NOT reuse identical sentence structures across weeks.
- Prefer explanation over evaluation.
- Length: concise but substantial (5–8 sentences per subject).
- Output must be in Korean.`;

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
  // Previous weeks data for context
  previous_week_lessons?: LessonRecord[];
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

    console.log('[generate-ai-report] Calling AI gateway...');

    // Call Lovable AI Gateway
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: REPORT_SYSTEM_PROMPT },
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
    const parentMessage = aiResult.choices?.[0]?.message?.content || '';

    console.log('[generate-ai-report] AI response received, length:', parentMessage.length);

    // Determine draft status based on data completeness
    const hasSufficientData = currentWeekLessons.some(l => 
      (l.learning_issues_note && l.learning_issues_note.trim()) || 
      (l.next_lesson_goal && l.next_lesson_goal.trim())
    );
    
    const draftStatus = currentWeekLessons.length <= 1 && !hasSufficientData 
      ? 'draft' 
      : 'ready';

    // Generate a shorter student-focused message
    const studentMessage = await generateStudentMessage(
      LOVABLE_API_KEY,
      student_name,
      week_start,
      week_end,
      subjectData
    );

    return new Response(
      JSON.stringify({
        success: true,
        parent_message: formatParentHeader(student_name, week_start, week_end) + '\n\n' + parentMessage,
        student_message: studentMessage,
        draft_status: draftStatus,
        lesson_count: currentWeekLessons.length,
        subjects: Object.keys(subjectData),
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
각 과목별로 지침에 따라 [1]~[5] 섹션을 작성하되, 
데이터가 충분하지 않은 섹션은 생략하세요.`;

  return prompt;
}

async function generateStudentMessage(
  apiKey: string,
  studentName: string,
  weekStart: string,
  weekEnd: string,
  subjectData: Record<string, { lessons: LessonRecord[]; curriculum: CurriculumInfo[]; previousLessons: LessonRecord[] }>
): Promise<string> {
  const studentPrompt = `학생 이름: ${studentName}
기간: ${weekStart} ~ ${weekEnd}

이번 주 수업 요약:
${Object.entries(subjectData).map(([subject, data]) => {
  const avgScore = data.lessons.reduce((sum, l) => sum + l.understanding_score, 0) / data.lessons.length;
  const goals = data.lessons.filter(l => l.next_lesson_goal).map(l => l.next_lesson_goal).slice(-1);
  return `- ${subject}: ${data.lessons.length}회 수업, 평균 이해도 ${avgScore.toFixed(1)}/5${goals.length > 0 ? `, 다음 목표: ${goals[0]}` : ''}`;
}).join('\n')}

위 데이터로 학생에게 보내는 짧은 격려 메시지를 작성해주세요.
- 친근하고 격려하는 톤
- 이모지 1-2개 사용 가능
- 구체적인 "다음 미션" 1-2개 제시
- 3-5문장으로 간결하게`;

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
          { role: 'system', content: '당신은 학원 선생님입니다. 학생에게 격려하는 짧은 메시지를 작성합니다.' },
          { role: 'user', content: studentPrompt },
        ],
      }),
    });

    if (!response.ok) {
      console.error('[generate-ai-report] Student message AI error:', response.status);
      return generateFallbackStudentMessage(studentName, subjectData);
    }

    const result = await response.json();
    const startDate = new Date(weekStart);
    const endDate = new Date(weekEnd);
    const header = `[더멘토] 이번 주 체크 (${startDate.getMonth() + 1}/${startDate.getDate()}~${endDate.getMonth() + 1}/${endDate.getDate()})`;
    
    return header + '\n\n' + (result.choices?.[0]?.message?.content || generateFallbackStudentMessage(studentName, subjectData));
  } catch (error) {
    console.error('[generate-ai-report] Student message error:', error);
    return generateFallbackStudentMessage(studentName, subjectData);
  }
}

function generateFallbackStudentMessage(
  studentName: string,
  subjectData: Record<string, { lessons: LessonRecord[]; curriculum: CurriculumInfo[]; previousLessons: LessonRecord[] }>
): string {
  const subjects = Object.keys(subjectData);
  const totalLessons = Object.values(subjectData).reduce((sum, d) => sum + d.lessons.length, 0);
  
  let message = `${studentName} 학생, 이번 주도 수고했어요! 🌟\n\n`;
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
