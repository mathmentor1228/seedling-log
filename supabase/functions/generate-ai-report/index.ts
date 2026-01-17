import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// The detailed system prompt for report generation - focused on personally observed narratives
const REPORT_SYSTEM_PROMPT = `Generate weekly learning reports that feel personally observed, not summarized.

CRITICAL OVERRIDE RULE:
Do NOT generate bullet-point summaries for learning points.
All learning points must be written as explanatory sentences that reflect teacher observation.

────────────────────────
MANDATORY WRITING RULES (Non-negotiable)
────────────────────────

1. Opening Sentence Rule
   - The opening sentence must describe the student's current learning posture
     (e.g. approach, stability, hesitation, consistency).
   - Never use abstract phrases like "전반적으로 안정적입니다".

2. Learning Difficulty Rule
   - If weaknesses exist, explain:
     a) In what situation they appeared
     b) Why they likely occurred
     c) What the teacher is focusing on because of it
   - Never list weaknesses as keywords only.

3. Test Usage Rule
   - Test scores must NEVER stand alone.
   - Always explain what the result indicates about understanding or habits.

4. Attendance Context Rule
   - Attendance issues must be connected to learning impact or rhythm,
     not just listed as events.

Example Transformation (for reference):
BAD: "계산 실수 잦음, 개념 이해 부족"
GOOD: "계산 과정에서 서두르다 보니 중간 계산을 놓치는 경우가 반복적으로 관찰되었습니다.
       이는 개념을 모른다기보다는 문제를 끝까지 점검하는 습관이 아직 안정되지 않은 단계로 보입니다."

────────────────────────
A) SUBJECT NARRATIVE STRUCTURE (MANDATORY)
────────────────────────
For each subject, write 4 short paragraphs (1–2 sentences each):

1. Learning Context
   - What content the student worked on this week
   - Where this content sits in the overall curriculum flow

2. Observed Student Behavior
   - How the student approached the learning
   - Include pace, hesitation, confidence, or focus if observed

3. Interpretation (Teacher's Insight)
   - Explain WHY the student struggled or succeeded
   - Avoid judgment words like "부족", "미흡" alone
   - Example: instead of "개념 이해 부족",
     explain what kind of misunderstanding appeared

4. Next Instructional Direction
   - What the teacher will focus on next week
   - Why that focus matters now

Select ONE narrative tone based on data:
- 안정형: steady progress and stable understanding
- 개선형: visible improvement through repetition or effort
- 관리형: understanding exists but needs tighter guidance
- 주의형: focus, consistency, or foundational gaps need attention

────────────────────────
B) STUDENT REPORT (Emotional Engagement)
────────────────────────
- Never use generic praise like "잘했어요"
- Speak directly to the student (but politely)
- Mention ONE concrete moment or behavior
- End with ONE clear next action

Example tone (do not copy literally):
"문제를 끝까지 읽고 다시 생각하려는 태도가 보였습니다.
다음 시간에는 같은 방식으로 새로운 유형에도 도전해봅시다."

────────────────────────
C) PARENT REPORT TONE RULE
────────────────────────
- Write as if explaining the child's learning to a caring adult, not reporting performance.
- Make parents understand: "아, 지금 이걸 배우는 단계구나."
- Attendance issues must be described with educational impact, not just listed.
- The report should feel written by a teacher who truly knows the student.

────────────────────────
D) DATA USAGE RULES
────────────────────────
- Homework: Explain patterns (e.g., hesitation, inconsistency), not counts.
- Tests: Use scores only to support explanation, never as the main point.
- Low data weeks: Be honest, but still provide direction.
- If data is insufficient: Do NOT exaggerate. Explain limited data honestly.

────────────────────────
E) REVIEW TAGGING
────────────────────────
Assign one status tag per report:
- GREEN (발송 OK): sufficient data + meaningful narrative
- YELLOW (보완 권장): limited data but acceptable
- RED (추가 입력 필요): content too shallow to send

────────────────────────
TONE PRINCIPLE (Most Important)
────────────────────────
Write as a teacher who is responsible for the student's next step,
not as an evaluator listing problems.

OUTPUT FORMAT:
- Output must be in Korean.
- Generate TWO separate reports: one for parents (parent_message) and one for students (student_message).
- Structure each subject report with the 4 paragraphs: Learning Context → Observed Behavior → Interpretation → Next Direction
- Include the review_status tag (GREEN/YELLOW/RED) in your response.`;

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
각 과목별로 지침에 따라 [1]~[6] 섹션을 작성하되,
테스트가 없으면 [5] 섹션은 생략하세요.`;

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
