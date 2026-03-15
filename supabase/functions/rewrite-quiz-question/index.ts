import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const STAFF_ROLES = ['admin', 'teacher', 'assistant'];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing authorization');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await anonClient.auth.getUser();
    if (userError || !user) throw new Error('Unauthorized');

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', STAFF_ROLES)
      .limit(1)
      .maybeSingle();

    if (!roleData) throw new Error('Admin/teacher/assistant only');

    const { quiz_id, question_index, rewrite_mode, question } = await req.json();
    if (!quiz_id || question_index === undefined || !rewrite_mode || !question) {
      throw new Error('quiz_id, question_index, rewrite_mode, question required');
    }

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) throw new Error('LOVABLE_API_KEY not configured');

    let instruction = '';
    switch (rewrite_mode) {
      case 'fix_code':
        instruction = `이 문제의 텍스트에서 HTML 태그(<span>, <div>, class=, style= 등), 영어 코드 문자열, math-renderer 같은 기술적 문자열을 모두 제거하세요.
순수하게 한국어 문제 내용과 올바른 LaTeX 수식($...$)만 남기세요.
문제의 의미, 정답, 해설 내용은 절대 바꾸지 마세요. 오직 코드/태그 정제만 수행하세요.
문제 유형(${question.question_type})과 난이도(${question.difficulty})를 그대로 유지하세요.`;
        break;
      case 'easier':
        instruction = `이 문제를 더 쉽게 다시 작성하세요. 초보자도 이해할 수 있는 수준으로 풀어서 출제하되, 같은 개념을 다뤄야 합니다. 문제 유형(${question.question_type})은 유지하세요.`;
        break;
      case 'deeper':
        instruction = `이 문제를 심화 버전으로 다시 작성하세요. 해당 개념의 원리, 증명 과정, 조건의 경계 케이스 등을 묻는 깊은 문제로 변경하세요. 문제 유형(${question.question_type})은 유지하세요.`;
        break;
      case 'example':
        instruction = `이 개념을 실제 숫자나 식에 대입해 풀어볼 수 있는 기초 수치 예제 문제를 1개 만들어주세요. 문제 유형은 short_answer로 설정하세요.`;
        break;
      default:
        throw new Error('Invalid rewrite_mode');
    }

    const systemPrompt = `당신은 학원용 개념 퀴즈 문항 편집 전문가입니다.
주어진 원본 문항을 지시에 따라 다시 작성합니다.
반드시 generate_question 함수를 호출하여 결과를 반환하세요.
빈칸 표기는 ___BLANK___, 수식은 LaTeX($...$)를 사용하세요.
hint는 정답을 직접 노출하지 말고 사고 방향만 제시하세요.`;

    const userPrompt = `원본 문항:
- 유형: ${question.question_type}
- 난이도: ${question.difficulty}
- 문제: ${question.question_text}
- 정답: ${question.answer}
- 해설: ${question.explanation}

지시사항: ${instruction}`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'generate_question',
              description: 'Return a rewritten quiz question',
              parameters: {
                type: 'object',
                properties: {
                  question_type: { type: 'string', enum: ['fill_blank', 'true_false', 'short_answer'] },
                  question_text: { type: 'string' },
                  answer: { type: 'string' },
                  explanation: { type: 'string' },
                  difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
                  hint: { type: 'string' },
                },
                required: ['question_type', 'question_text', 'answer', 'explanation', 'difficulty', 'hint'],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: 'generate_question' } },
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: 'AI 크레딧이 부족합니다.' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errText = await aiResponse.text();
      console.error('AI error:', aiResponse.status, errText);
      throw new Error('AI rewrite failed');
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error('AI did not return a question');

    const newQuestion = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify({ success: true, question: newQuestion, mode: rewrite_mode }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('rewrite-quiz-question error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
