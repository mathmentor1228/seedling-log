// EXAM-SCAN-V1: AI-powered exam schedule/scope extraction from images and PDFs
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const AI_GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    if (!lovableApiKey) {
      return new Response(JSON.stringify({ error: 'AI key not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check roles
    const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', user.id);
    const hasRole = roles?.some(r => ['admin', 'teacher', 'assistant'].includes(r.role));
    if (!hasRole) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { image_url, school_name, school_level, grade_year, academic_year, semester } = await req.json();

    if (!image_url) {
      return new Response(JSON.stringify({ error: 'image_url required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Call AI to extract exam schedule info from image
    const systemPrompt = `당신은 학교 시험 일정표/시험범위표를 분석하는 전문가입니다. 
이미지에서 시험 관련 정보를 정확하게 추출해주세요.

시험 시간표는 보통 날짜(요일)별로 교시가 나뉘고, 학년별로 시험 과목이 다릅니다.
각 학년별, 각 교시별 과목을 모두 개별 항목으로 추출하세요.

반드시 아래 JSON 형식으로 응답하세요:
{
  "exam_type": "중간고사" 또는 "기말고사" 또는 "1차지필" 또는 "2차지필" 또는 "기타",
  "subjects": [
    {
      "subject_name": "과목명 (예: 수학, 영어, 국어, 과학, 한국사 등)",
      "grade": 학년 숫자 (예: 1, 2, 3),
      "exam_date": "YYYY-MM-DD 형식 (알 수 없으면 null)",
      "exam_scope": "시험범위 텍스트 (알 수 없으면 null)",
      "exam_time": "HH:MM 형식의 시험 시작 시간 (알 수 없으면 null)",
      "period": 교시 숫자 (예: 1, 2, 3. 알 수 없으면 null)
    }
  ],
  "exam_date_start": "전체 시험 시작일 YYYY-MM-DD (알 수 없으면 null)",
  "exam_date_end": "전체 시험 종료일 YYYY-MM-DD (알 수 없으면 null)",
  "notes": "기타 참고사항"
}

주의사항:
- '자율학습', '청소 및 종례' 등 시험이 아닌 항목은 제외하세요
- 과목명은 표준 과목명으로 정규화 (예: 수I → 수학I, 영I → 영어I)
- 날짜는 반드시 YYYY-MM-DD 형식 (연도가 없으면 올해 기준 추정)
- 학년(grade)을 반드시 포함해주세요 (1학년, 2학년, 3학년)
- 같은 과목이라도 학년이 다르면 별도 항목으로 추출
- JSON만 출력하고 다른 텍스트는 포함하지 마세요`;

    const userPrompt = `아래 이미지에서 시험 일정과 범위 정보를 추출해주세요.
${school_name ? `학교: ${school_name}` : ''}
${semester ? `학기: ${semester}` : ''}
${academic_year ? `학년도: ${academic_year}` : ''}`;

    const aiResponse = await fetch(AI_GATEWAY_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: userPrompt },
              { type: 'image_url', image_url: { url: image_url } },
            ],
          },
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error('AI error:', errText);
      return new Response(JSON.stringify({ error: 'AI 분석 실패' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiResult = await aiResponse.json();
    const content = aiResult.choices?.[0]?.message?.content;

    if (!content) {
      return new Response(JSON.stringify({ error: 'AI 응답 없음' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let extracted;
    try {
      extracted = JSON.parse(content);
    } catch {
      // Try to extract JSON from response
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        extracted = JSON.parse(match[0]);
      } else {
        return new Response(JSON.stringify({ error: 'AI 응답 파싱 실패', raw: content }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // If auto_apply is requested, update/create archives
    const { auto_apply } = await req.json().catch(() => ({}));

    return new Response(JSON.stringify({
      success: true,
      extracted,
      school_name: school_name || null,
      school_level: school_level || null,
      grade_year: grade_year || null,
      academic_year: academic_year || null,
      semester: semester || null,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('scan-exam-schedule error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
