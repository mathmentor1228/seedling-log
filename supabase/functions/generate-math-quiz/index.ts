import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { encode as encodeBase64 } from 'https://deno.land/std@0.168.0/encoding/base64.ts';
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

    const {
      data: { user },
      error: userError,
    } = await anonClient.auth.getUser();

    if (userError || !user) throw new Error('Unauthorized');

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', STAFF_ROLES)
      .limit(1)
      .maybeSingle();

    if (!roleData) {
      throw new Error('Admin/teacher/assistant only');
    }

    const { concept_id } = await req.json();
    if (!concept_id) throw new Error('concept_id required');

    const { data: concept, error: conceptError } = await supabase
      .from('math_concepts')
      .select('*')
      .eq('id', concept_id)
      .single();

    if (conceptError || !concept) throw new Error('Concept not found');

    const { data: fileData, error: downloadError } = await supabase.storage
      .from('math-concepts')
      .download(concept.pdf_storage_path);

    if (downloadError || !fileData) throw new Error('Failed to download PDF');

    const pdfBytes = await fileData.arrayBuffer();
    const pdfBase64 = encodeBase64(new Uint8Array(pdfBytes));

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) throw new Error('LOVABLE_API_KEY not configured');

    const subject = concept.subject || '미분류';
    const grade = concept.grade || '기타';
    const course = concept.course || '기타';
    const customPrompt = (concept.quiz_generation_prompt || '').trim();

    const systemPrompt = `당신은 학원용 개념 퀴즈 출제 전문가입니다.
주어진 PDF를 바탕으로 해당 과목의 핵심 개념을 정확히 이해했는지 점검하는 문제를 만드세요.

[공통 원칙]
1) 계산/암기만 확인하지 말고, 개념의 정의·조건·구분 포인트를 우선 확인
2) PDF 전체 범위를 빠짐없이 반영
3) 문제 유형은 fill_blank, true_false, short_answer를 균형 있게 구성
4) 난이도 비율은 easy 30% / medium 50% / hard 20% 내외
5) 문제마다 answer, explanation, hint를 반드시 포함
6) hint는 정답을 직접 노출하지 말고 사고 방향만 제시
7) 최소 12문항 이상 생성
8) 빈칸 표기는 ___BLANK___, 수식은 필요한 경우 LaTeX 사용
9) question_number는 1부터 연속된 숫자로 반환`;

    const userPrompt = [
      `PDF를 분석해 개념 퀴즈를 생성하세요.`,
      `과목: ${subject}`,
      `학년: ${grade}`,
      `과정: ${course}`,
      `개념 제목: ${concept.title}`,
      customPrompt ? `추가 출제 가이드:\n${customPrompt}` : '',
      `출력은 function call(generate_quiz) 스키마를 정확히 따르세요.`,
    ]
      .filter(Boolean)
      .join('\n\n');

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
          {
            role: 'user',
            content: [
              { type: 'text', text: userPrompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:application/pdf;base64,${pdfBase64}`,
                },
              },
            ],
          },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'generate_quiz',
              description: 'Generate concept quiz questions from uploaded PDF',
              parameters: {
                type: 'object',
                properties: {
                  questions: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        question_number: { type: 'number' },
                        question_type: { type: 'string', enum: ['fill_blank', 'true_false', 'short_answer'] },
                        question_text: { type: 'string' },
                        answer: { type: 'string' },
                        explanation: { type: 'string' },
                        difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
                        hint: { type: 'string' },
                      },
                      required: [
                        'question_number',
                        'question_type',
                        'question_text',
                        'answer',
                        'explanation',
                        'difficulty',
                        'hint',
                      ],
                      additionalProperties: false,
                    },
                  },
                },
                required: ['questions'],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: 'generate_quiz' } },
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: 'AI 크레딧이 부족합니다.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const errText = await aiResponse.text();
      console.error('AI error:', aiResponse.status, errText);
      throw new Error('AI generation failed');
    }

    const aiData = await aiResponse.json();

    let questions: any[] = [];
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      questions = parsed.questions || [];
    }

    if (questions.length === 0) {
      throw new Error('AI가 퀴즈를 생성하지 못했습니다.');
    }

    for (let i = questions.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [questions[i], questions[j]] = [questions[j], questions[i]];
    }

    questions = questions.map((question: any, index: number) => ({
      ...question,
      question_number: index + 1,
    }));

    const { data: existingQuiz } = await supabase
      .from('math_concept_quizzes')
      .select('id')
      .eq('concept_id', concept_id)
      .maybeSingle();

    if (existingQuiz) {
      await supabase
        .from('math_concept_quizzes')
        .update({ questions, status: 'draft', updated_at: new Date().toISOString() })
        .eq('id', existingQuiz.id);
    } else {
      await supabase.from('math_concept_quizzes').insert({ concept_id, questions, status: 'draft' });
    }

    await supabase
      .from('math_concepts')
      .update({ status: 'quiz_generated', updated_at: new Date().toISOString() })
      .eq('id', concept_id);

    return new Response(JSON.stringify({ success: true, questions }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('generate-math-quiz error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
