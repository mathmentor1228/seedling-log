// LEARNING-ANALYSIS-V1: Analyze student learning progress for teacher dashboard
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Verify auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { action, student_id, teacher_id } = await req.json();

    // Check role
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    const isAdmin = roleData?.role === 'admin';
    const effectiveTeacherId = isAdmin ? (teacher_id || user.id) : user.id;

    if (action === 'teacher_overview') {
      // Get all students linked to this teacher via lesson records (last 60 days)
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      const sixtyDaysStr = sixtyDaysAgo.toISOString().split('T')[0];

      const { data: lessons } = await supabase
        .from('lesson_records')
        .select(`
          id, student_id, subject, course, curriculum_unit_key,
          understanding_score, lesson_date, lesson_range, submitted
        `)
        .eq('teacher_id', effectiveTeacherId)
        .eq('submitted', true)
        .gte('lesson_date', sixtyDaysStr)
        .order('lesson_date', { ascending: true });

      if (!lessons || lessons.length === 0) {
        return new Response(JSON.stringify({ students: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get student names
      const studentIds = [...new Set(lessons.map(l => l.student_id))];
      const { data: students } = await supabase
        .from('students')
        .select('id, name, grade, school_level, grade_year')
        .in('id', studentIds);

      const studentMap = new Map((students || []).map(s => [s.id, s]));

      // Get curriculum unit titles for math
      const unitKeys = [...new Set(lessons.filter(l => l.curriculum_unit_key).map(l => l.curriculum_unit_key!))];
      let unitMap = new Map<string, string>();
      if (unitKeys.length > 0) {
        const { data: units } = await supabase
          .from('curriculum_map')
          .select('unit_key, unit_title')
          .in('unit_key', unitKeys);
        unitMap = new Map((units || []).map(u => [u.unit_key, u.unit_title]));
      }

      // Group by student
      const studentLessons = new Map<string, typeof lessons>();
      for (const l of lessons) {
        if (!studentLessons.has(l.student_id)) studentLessons.set(l.student_id, []);
        studentLessons.get(l.student_id)!.push(l);
      }

      const studentSummaries = [];

      for (const [sid, sLessons] of studentLessons) {
        const student = studentMap.get(sid);
        if (!student) continue;

        // Group by subject
        const bySubject = new Map<string, typeof sLessons>();
        for (const l of sLessons) {
          if (!bySubject.has(l.subject)) bySubject.set(l.subject, []);
          bySubject.get(l.subject)!.push(l);
        }

        const subjects = [];
        for (const [subject, subLessons] of bySubject) {
          const scores = subLessons
            .filter(l => l.understanding_score != null)
            .map(l => ({ date: l.lesson_date, score: l.understanding_score! }));

          const avgScore = scores.length > 0
            ? Math.round(scores.reduce((s, x) => s + x.score, 0) / scores.length * 10) / 10
            : null;

          // Trend: compare last 5 vs first 5
          let trend: 'up' | 'down' | 'stable' | null = null;
          if (scores.length >= 4) {
            const half = Math.floor(scores.length / 2);
            const firstHalf = scores.slice(0, half);
            const secondHalf = scores.slice(half);
            const avgFirst = firstHalf.reduce((s, x) => s + x.score, 0) / firstHalf.length;
            const avgSecond = secondHalf.reduce((s, x) => s + x.score, 0) / secondHalf.length;
            const diff = avgSecond - avgFirst;
            trend = diff > 0.3 ? 'up' : diff < -0.3 ? 'down' : 'stable';
          }

          // Unit dwell analysis (math with curriculum_unit_key)
          const unitDwell: { unit_key: string; unit_title: string; lesson_count: number; avg_score: number | null }[] = [];
          if (subject === '수학') {
            const byUnit = new Map<string, typeof subLessons>();
            for (const l of subLessons) {
              if (l.curriculum_unit_key) {
                if (!byUnit.has(l.curriculum_unit_key)) byUnit.set(l.curriculum_unit_key, []);
                byUnit.get(l.curriculum_unit_key)!.push(l);
              }
            }
            for (const [uk, uLessons] of byUnit) {
              const uScores = uLessons.filter(l => l.understanding_score != null);
              unitDwell.push({
                unit_key: uk,
                unit_title: unitMap.get(uk) || uk,
                lesson_count: uLessons.length,
                avg_score: uScores.length > 0
                  ? Math.round(uScores.reduce((s, l) => s + l.understanding_score!, 0) / uScores.length * 10) / 10
                  : null,
              });
            }
            unitDwell.sort((a, b) => b.lesson_count - a.lesson_count);
          }

          // For non-math subjects, track lesson_range progression
          const recentTopics = subject !== '수학'
            ? subLessons.slice(-5).map(l => ({ date: l.lesson_date, range: l.lesson_range }))
            : [];

          subjects.push({
            subject,
            course: subLessons[subLessons.length - 1]?.course || null,
            total_lessons: subLessons.length,
            avg_score: avgScore,
            trend,
            score_history: scores.slice(-10),
            unit_dwell: unitDwell.slice(0, 5),
            recent_topics: recentTopics,
            last_lesson_date: subLessons[subLessons.length - 1]?.lesson_date,
          });
        }

        const gradeLabel = student.school_level && student.grade_year
          ? `${student.school_level}${student.grade_year}`
          : student.grade || '';

        studentSummaries.push({
          student_id: sid,
          student_name: student.name,
          grade: gradeLabel,
          subjects,
        });
      }

      // Sort by name
      studentSummaries.sort((a, b) => a.student_name.localeCompare(b.student_name, 'ko'));

      return new Response(JSON.stringify({ students: studentSummaries }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'ai_comment') {
      // Generate AI learning analysis for a specific student
      if (!student_id) {
        return new Response(JSON.stringify({ error: 'student_id required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Fetch student data
      const { data: student } = await supabase
        .from('students')
        .select('name, grade, school_level, grade_year')
        .eq('id', student_id)
        .single();

      // Fetch recent lessons (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: lessons } = await supabase
        .from('lesson_records')
        .select(`
          subject, course, curriculum_unit_key, understanding_score,
          lesson_date, lesson_range, homework_status, learning_issues,
          next_lesson_goal, notes
        `)
        .eq('student_id', student_id)
        .eq('teacher_id', effectiveTeacherId)
        .eq('submitted', true)
        .gte('lesson_date', thirtyDaysAgo.toISOString().split('T')[0])
        .order('lesson_date', { ascending: true });

      if (!lessons || lessons.length === 0) {
        return new Response(JSON.stringify({ comment: '분석할 수업 데이터가 부족합니다.' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get unit titles
      const uKeys = [...new Set(lessons.filter(l => l.curriculum_unit_key).map(l => l.curriculum_unit_key!))];
      let uMap = new Map<string, string>();
      if (uKeys.length > 0) {
        const { data: units } = await supabase
          .from('curriculum_map')
          .select('unit_key, unit_title, flow_summary')
          .in('unit_key', uKeys);
        uMap = new Map((units || []).map(u => [u.unit_key, `${u.unit_title} (${u.flow_summary})`]));
      }

      // Fetch vocab test results if any
      const { data: vocabResults } = await supabase
        .from('vocab_test_results')
        .select('test_date, day_number, book_name, score_percent, passed')
        .eq('student_id', student_id)
        .gte('test_date', thirtyDaysAgo.toISOString().split('T')[0])
        .order('test_date');

      // Build prompt data
      const gradeLabel = student?.school_level && student?.grade_year
        ? `${student.school_level}${student.grade_year}`
        : student?.grade || '미정';

      const lessonSummary = lessons.map(l => {
        const unitTitle = l.curriculum_unit_key ? uMap.get(l.curriculum_unit_key) || l.curriculum_unit_key : '';
        return `- ${l.lesson_date} [${l.subject}] ${l.course || ''} ${unitTitle} | 범위: ${l.lesson_range} | 이해도: ${l.understanding_score ?? 'N/A'}/5 | 숙제: ${l.homework_status} | 특이사항: ${l.learning_issues?.join(', ') || '없음'} | 메모: ${l.notes || '없음'}`;
      }).join('\n');

      const vocabSummary = vocabResults && vocabResults.length > 0
        ? vocabResults.map(v => `- ${v.test_date} ${v.book_name} Day${v.day_number}: ${v.score_percent}% ${v.passed ? '합격' : '불합격'}`).join('\n')
        : '단어 시험 기록 없음';

      const prompt = `당신은 학원 교사를 위한 학습 분석 어시스턴트입니다. 아래 학생의 최근 수업 데이터를 분석하여, 교사가 학생 지도에 활용할 수 있는 실용적인 인사이트를 제공해주세요.

학생: ${student?.name} (${gradeLabel})

최근 수업 기록:
${lessonSummary}

단어 시험 기록:
${vocabSummary}

다음 형식으로 분석해주세요:
1. 📊 학습 현황 요약 (2-3문장)
2. ⚠️ 주의가 필요한 부분 (체류가 긴 단원, 이해도 하락 패턴 등)
3. ✅ 잘하고 있는 부분
4. 🎯 향후 학습 방향 제안 (구체적이고 실행 가능한 1-2가지)

응답은 한국어로, 교사가 바로 참고할 수 있도록 간결하게 작성해주세요. 전체 응답은 300자 이내로 해주세요.`;

      const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
      if (!LOVABLE_API_KEY) {
        return new Response(JSON.stringify({ error: 'AI API key not configured' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-3-flash-preview',
          messages: [
            { role: 'system', content: '학원 교사를 위한 학생 학습 분석 어시스턴트입니다. 데이터 기반으로 간결하고 실용적인 인사이트를 제공합니다.' },
            { role: 'user', content: prompt },
          ],
        }),
      });

      if (!aiResp.ok) {
        const status = aiResp.status;
        if (status === 429) {
          return new Response(JSON.stringify({ error: 'AI 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.' }), {
            status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        if (status === 402) {
          return new Response(JSON.stringify({ error: 'AI 크레딧이 부족합니다.' }), {
            status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        console.error('AI gateway error:', status, await aiResp.text());
        return new Response(JSON.stringify({ error: 'AI 분석에 실패했습니다.' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const aiData = await aiResp.json();
      const comment = aiData.choices?.[0]?.message?.content || 'AI 분석 결과를 생성할 수 없습니다.';

      return new Response(JSON.stringify({ comment }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('student-progress-analysis error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
