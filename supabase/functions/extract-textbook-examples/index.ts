import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { encode as encodeBase64 } from 'https://deno.land/std@0.168.0/encoding/base64.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const STAFF_ROLES = ['admin', 'teacher'];

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

    if (!roleData) throw new Error('Admin/teacher only');

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const textbookId = formData.get('textbook_id') as string;
    const chapter = formData.get('chapter') as string || '전체';

    if (!file || !textbookId) throw new Error('file and textbook_id required');

    const fileBytes = await file.arrayBuffer();
    const fileBase64 = encodeBase64(new Uint8Array(fileBytes));
    const mimeType = file.type || 'application/pdf';

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) throw new Error('LOVABLE_API_KEY not configured');

    // Get textbook info
    const { data: textbook } = await supabase
      .from('textbooks')
      .select('title, subject, grade, course')
      .eq('id', textbookId)
      .single();

    const systemPrompt = `당신은 교재 문제 추출 전문가입니다.
주어진 교재 이미지/PDF에서 모든 예제와 문제를 정확히 추출하세요.

[추출 원칙]
1) 문제 번호, 문제 텍스트, 정답, 해설을 빠짐없이 추출
2) 수식은 LaTeX 표기법 사용 (예: $x^2 + 2x + 1$)
3) 그래프가 포함된 문제는 graph_data에 함수식 정보를 JSON으로 기록
4) 난이도는 문제 복잡도에 따라 easy/medium/hard로 분류
5) 페이지 번호가 보이면 기록, 아니면 null
6) 문제 순서대로 정렬`;

    const userPrompt = [
      `교재: ${textbook?.title || '미확인'}`,
      `과목: ${textbook?.subject || '수학'}`,
      `단원: ${chapter}`,
      `이 교재 페이지에서 모든 예제/문제를 추출하세요.`,
      `출력은 function call(extract_examples) 스키마를 정확히 따르세요.`,
    ].join('\n\n');

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
                image_url: { url: `data:${mimeType};base64,${fileBase64}` },
              },
            ],
          },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'extract_examples',
              description: 'Extract textbook example problems',
              parameters: {
                type: 'object',
                properties: {
                  examples: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        problem_number: { type: 'string' },
                        page_number: { type: 'number' },
                        question_text: { type: 'string' },
                        answer: { type: 'string' },
                        explanation: { type: 'string' },
                        difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
                        graph_data: {
                          type: 'object',
                          properties: {
                            functions: {
                              type: 'array',
                              items: { type: 'string' },
                            },
                            x_range: { type: 'array', items: { type: 'number' } },
                            y_range: { type: 'array', items: { type: 'number' } },
                          },
                        },
                      },
                      required: ['problem_number', 'question_text', 'answer', 'difficulty'],
                      additionalProperties: false,
                    },
                  },
                },
                required: ['examples'],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: 'extract_examples' } },
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
      throw new Error('AI extraction failed');
    }

    const aiData = await aiResponse.json();
    let examples: any[] = [];
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      examples = parsed.examples || [];
    }

    if (examples.length === 0) {
      throw new Error('AI가 문제를 추출하지 못했습니다.');
    }

    // Insert into textbook_examples
    const rows = examples.map((ex: any, idx: number) => ({
      textbook_id: textbookId,
      chapter,
      page_number: ex.page_number || null,
      problem_number: ex.problem_number || String(idx + 1),
      question_text: ex.question_text,
      answer: ex.answer || '',
      explanation: ex.explanation || '',
      difficulty: ex.difficulty || 'medium',
      graph_data: ex.graph_data || null,
      sort_order: idx,
      created_by: user.id,
    }));

    const { error: insertError } = await supabase
      .from('textbook_examples')
      .insert(rows);

    if (insertError) throw insertError;

    return new Response(JSON.stringify({ success: true, count: rows.length, examples: rows }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('extract-textbook-examples error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
