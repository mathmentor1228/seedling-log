import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { encode as encodeBase64 } from 'https://deno.land/std@0.168.0/encoding/base64.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const STAFF_ROLES = ['admin', 'teacher'];
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const INLINE_BASE64_LIMIT_BYTES = 3 * 1024 * 1024;
const TEMP_UPLOAD_BUCKET = 'attachments';
const TEMP_UPLOAD_TTL_SECONDS = 60 * 10;

const jsonResponse = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const sanitizeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_');

const isPdfFile = (file: File) => {
  const lowerType = (file.type || '').toLowerCase();
  const lowerName = file.name.toLowerCase();
  return lowerType === 'application/pdf' || lowerName.endsWith('.pdf');
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let adminClient: ReturnType<typeof createClient> | null = null;
  let uploadedTempPath: string | null = null;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ success: false, error: '인증 정보가 없습니다.' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return jsonResponse({ success: false, error: '서버 설정이 올바르지 않습니다.' });
    }

    if (!lovableApiKey) {
      return jsonResponse({ success: false, error: 'AI 설정 키가 없습니다. 관리자에게 문의하세요.' });
    }

    adminClient = createClient(supabaseUrl, serviceRoleKey);
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await anonClient.auth.getUser();

    if (userError || !user) {
      return jsonResponse({ success: false, error: '로그인이 필요합니다.' }, 401);
    }

    const { data: roleData } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', STAFF_ROLES)
      .limit(1)
      .maybeSingle();

    if (!roleData) {
      return jsonResponse({ success: false, error: '선생님/관리자만 사용할 수 있습니다.' }, 403);
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const textbookId = (formData.get('textbook_id') as string | null)?.trim();
    const chapter = (formData.get('chapter') as string | null)?.trim() || '전체';

    if (!file || !textbookId) {
      return jsonResponse({ success: false, error: 'file과 textbook_id가 필요합니다.' });
    }

    if (!file.size || file.size <= 0) {
      return jsonResponse({ success: false, error: '업로드된 파일이 비어 있습니다.' });
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return jsonResponse({
        success: false,
        error: '파일이 너무 큽니다. 20MB 이하의 단일 페이지 파일로 업로드해 주세요.',
      });
    }

    const { data: textbook, error: textbookError } = await adminClient
      .from('textbooks')
      .select('title, subject, grade, course')
      .eq('id', textbookId)
      .single();

    if (textbookError) {
      return jsonResponse({ success: false, error: '교재 정보를 찾을 수 없습니다.' });
    }

    const mimeType = file.type || 'application/pdf';
    let fileUrl: string;

    if (file.size <= INLINE_BASE64_LIMIT_BYTES) {
      const fileBytes = await file.arrayBuffer();
      const fileBase64 = encodeBase64(new Uint8Array(fileBytes));
      fileUrl = `data:${mimeType};base64,${fileBase64}`;
    } else {
      uploadedTempPath = `extract-textbook-examples/${user.id}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;

      const { error: uploadError } = await adminClient.storage
        .from(TEMP_UPLOAD_BUCKET)
        .upload(uploadedTempPath, file, {
          contentType: mimeType,
          upsert: false,
        });

      if (uploadError) {
        console.error('Temp upload failed:', uploadError);
        return jsonResponse({ success: false, error: '파일 업로드 중 오류가 발생했습니다.' });
      }

      const { data: signedData, error: signedError } = await adminClient.storage
        .from(TEMP_UPLOAD_BUCKET)
        .createSignedUrl(uploadedTempPath, TEMP_UPLOAD_TTL_SECONDS);

      if (signedError || !signedData?.signedUrl) {
        console.error('Signed URL failed:', signedError);
        return jsonResponse({ success: false, error: '파일 접근 링크 생성에 실패했습니다.' });
      }

      fileUrl = signedData.signedUrl;
    }

    const systemPrompt = `당신은 교재 문항 추출 전문가입니다.
주어진 교재 페이지에서 "문제" 문항만 정확히 추출하세요.

[추출 원칙]
1) 문제 번호, 문제 텍스트, 정답, 해설을 빠짐없이 추출
2) "예제", 개념 설명, 본문 설명, 페이지 장식 문구는 제외
3) 수식은 LaTeX 표기법 사용 (예: $x^2 + 2x + 1$)
4) 그래프가 포함된 문제는 graph_data에 함수식 정보를 JSON으로 기록
5) 난이도는 문제 복잡도에 따라 easy/medium/hard로 분류
6) 페이지 번호가 보이면 기록, 아니면 null
7) 문제 순서대로 정렬`;

    const userPrompt = [
      `교재: ${textbook?.title || '미확인'}`,
      `과목: ${textbook?.subject || '기타'}`,
      `학년: ${textbook?.grade || '미지정'}`,
      `과정: ${textbook?.course || '미지정'}`,
      `단원: ${chapter}`,
      '이 페이지에서 문제 문항만 추출하세요.',
      '출력은 function call(extract_examples) 스키마를 정확히 따르세요.',
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
                image_url: { url: fileUrl },
              },
            ],
          },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'extract_examples',
              description: 'Extract textbook problems only',
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
        return jsonResponse({ success: false, error: '요청이 많습니다. 잠시 후 다시 시도해주세요.' });
      }
      if (aiResponse.status === 402) {
        return jsonResponse({ success: false, error: 'AI 크레딧이 부족합니다.' });
      }
      const errText = await aiResponse.text();
      console.error('AI error:', aiResponse.status, errText);
      return jsonResponse({ success: false, error: 'AI 추출에 실패했습니다. 파일을 페이지 단위로 다시 시도해주세요.' });
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      return jsonResponse({ success: false, error: 'AI 응답 형식이 올바르지 않습니다.' });
    }

    let examples: any[] = [];
    try {
      const parsed = JSON.parse(toolCall.function.arguments);
      examples = Array.isArray(parsed.examples) ? parsed.examples : [];
    } catch (parseError) {
      console.error('AI parse error:', parseError);
      return jsonResponse({ success: false, error: 'AI 응답 파싱에 실패했습니다. 다시 시도해주세요.' });
    }

    if (examples.length === 0) {
      return jsonResponse({ success: false, error: '페이지에서 문제를 찾지 못했습니다. 문제가 보이는 단일 페이지로 다시 시도해주세요.' });
    }

    const rows = examples.slice(0, 120).map((ex: any, idx: number) => ({
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

    const { error: insertError } = await adminClient.from('textbook_examples').insert(rows);
    if (insertError) {
      console.error('Insert error:', insertError);
      return jsonResponse({ success: false, error: '문항 저장 중 오류가 발생했습니다.' });
    }

    return jsonResponse({ success: true, count: rows.length, examples: rows });
  } catch (error) {
    console.error('extract-textbook-examples error:', error);
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
    });
  } finally {
    if (adminClient && uploadedTempPath) {
      const { error: cleanupError } = await adminClient.storage
        .from(TEMP_UPLOAD_BUCKET)
        .remove([uploadedTempPath]);

      if (cleanupError) {
        console.error('Temp file cleanup failed:', cleanupError);
      }
    }
  }
});