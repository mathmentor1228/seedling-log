import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const STAFF_ROLES = ['admin', 'teacher'];
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_REQUEST_BYTES = 9 * 1024 * 1024;
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

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
};

// --- Category classification logic ---
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  '활동형': ['함께 풀기', '확인하기', '탐구 활동', '활동'],
  '사고력': ['생각 키우기', '창의융합', '수학 역량 플러스', '창의', '융합', '역량'],
  '마무리': ['스스로 점검하기', '스스로 점검', '중단원 마무리', '대단원 마무리', '단원 마무리'],
  '예제': ['예제', '유제'],
};

function classifyCategory(problemNumber: string, questionText: string): string {
  const combined = `${problemNumber} ${questionText}`.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      if (combined.includes(kw.toLowerCase())) return cat;
    }
  }
  return '일반문항';
}

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

    const requestBytes = Number(req.headers.get('content-length') || 0);
    if (Number.isFinite(requestBytes) && requestBytes > MAX_REQUEST_BYTES) {
      return jsonResponse({
        success: false,
        error: `요청 크기가 너무 큽니다 (${(requestBytes / 1024 / 1024).toFixed(1)}MB). PDF는 8MB 이하로 나누어 업로드해 주세요.`,
        detail: { reason: 'request_too_large', requestBytes, limitBytes: MAX_REQUEST_BYTES },
      }, 413);
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const textbookId = (formData.get('textbook_id') as string | null)?.trim();
    const chapter = (formData.get('chapter') as string | null)?.trim() || '전체';
    const batchLabel = (formData.get('batch_label') as string | null)?.trim() || '';

    if (!file || !textbookId) {
      return jsonResponse({ success: false, error: 'file과 textbook_id가 필요합니다.' });
    }

    if (!file.size || file.size <= 0) {
      return jsonResponse({ success: false, error: '업로드된 파일이 비어 있습니다.' });
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return jsonResponse({
        success: false,
        error: `파일이 너무 큽니다 (${(file.size / 1024 / 1024).toFixed(1)}MB). PDF는 8MB 이하로 나누어 업로드해 주세요.`,
        detail: { fileName: file.name, fileSize: file.size, batchLabel, reason: 'pdf_too_large' },
      }, 413);
    }

    const { data: textbook, error: textbookError } = await adminClient
      .from('textbooks')
      .select('title, subject, grade, course')
      .eq('id', textbookId)
      .single();

    if (textbookError) {
      return jsonResponse({ success: false, error: '교재 정보를 찾을 수 없습니다.', detail: { batchLabel } });
    }

    const pdfUpload = isPdfFile(file);
    const mimeType = pdfUpload ? 'application/pdf' : (file.type || 'application/octet-stream');
    let aiFileUrl: string;

    if (pdfUpload) {
      // Gemini(OpenAI-compatible) does not accept PDF via remote URL.
      // PDFs must be sent as a data URL with MIME type.
      const fileBytes = new Uint8Array(await file.arrayBuffer());
      const base64Pdf = toBase64(fileBytes);
      aiFileUrl = `data:application/pdf;base64,${base64Pdf}`;
      console.log(`[extract] PDF encoded as data URL (${(file.size / 1024).toFixed(0)}KB)`);
    } else {
      // Keep signed URL flow for image files to avoid unnecessary memory usage.
      uploadedTempPath = `extract-textbook-examples/${user.id}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;

      console.log(`[extract] Uploading to storage: ${uploadedTempPath} (${(file.size / 1024).toFixed(0)}KB, ${mimeType})`);

      const { error: uploadError } = await adminClient.storage
        .from(TEMP_UPLOAD_BUCKET)
        .upload(uploadedTempPath, file, {
          contentType: mimeType,
          upsert: false,
        });

      if (uploadError) {
        console.error('[extract] Temp upload failed:', uploadError);
        return jsonResponse({
          success: false,
          error: '파일 업로드 중 오류가 발생했습니다.',
          detail: { fileName: file.name, batchLabel, reason: 'storage_upload_failed', dbError: uploadError.message },
        });
      }

      const { data: signedData, error: signedError } = await adminClient.storage
        .from(TEMP_UPLOAD_BUCKET)
        .createSignedUrl(uploadedTempPath, TEMP_UPLOAD_TTL_SECONDS);

      if (signedError || !signedData?.signedUrl) {
        console.error('[extract] Signed URL failed:', signedError);
        return jsonResponse({
          success: false,
          error: '파일 접근 링크 생성에 실패했습니다.',
          detail: { fileName: file.name, batchLabel, reason: 'signed_url_failed' },
        });
      }

      aiFileUrl = signedData.signedUrl;
      console.log(`[extract] Signed URL created, proceeding to AI analysis`);
    }

    const systemPrompt = `당신은 한국 수학/과학 교과서 전문 문항 추출기입니다.
주어진 교과서 페이지에서 **모든 학습 요소**를 빠짐없이 추출하세요.

[추출 대상 - 반드시 포함]
1) 번호가 있는 문제 (01, 02, 1, 2, ...)
2) '예제', '유제' — 개념 직후의 연습 문항
3) '함께 풀기', '확인하기' — 기초/활동형 문항
4) '생각 키우기', '창의융합', '탐구 활동', '수학 역량 플러스' — 사고력/심화 문항
5) '스스로 점검하기', '중단원 마무리', '대단원 마무리' — 마무리 문항
6) 빈칸(____) 채우기, 물음표(?)로 끝나는 질문형 텍스트 — 문항 후보로 간주

[추출 제외]
- 순수 개념 설명 본문 (정의, 정리 박스의 설명 자체)
- 목차, 페이지 번호만 있는 장식 텍스트

[category 분류 기준]
- '일반문항': 숫자 번호가 있는 일반적인 문제
- '예제': '예제', '유제' 키워드 포함
- '활동형': '함께 풀기', '확인하기', '탐구 활동' 등 활동 문항
- '사고력': '생각 키우기', '창의융합', '수학 역량 플러스' 등 심화/융합 문항
- '마무리': '스스로 점검하기', '중단원 마무리', '대단원 마무리' 등

[추출 규칙]
1) 문제 번호, 문제 텍스트, 정답, 해설을 빠짐없이 추출
2) 번호가 없는 '함께 풀기' 등은 problem_number에 해당 키워드를 기입 (예: "함께 풀기 1")
3) 수식은 LaTeX 표기법 사용 (예: $x^2 + 2x + 1$)
4) 그래프/도형이 포함된 문제는 graph_data에 함수식 정보를 JSON으로 기록
5) 삽화/실생활 이미지가 있는 문제는 has_illustration을 true로 설정
6) 난이도는 문제 복잡도에 따라 easy/medium/hard로 분류
7) 페이지 번호가 보이면 기록, 아니면 null
8) 문제 순서대로 정렬`;

    const userPrompt = [
      `교재: ${textbook?.title || '미확인'}`,
      `과목: ${textbook?.subject || '기타'}`,
      `학년: ${textbook?.grade || '미지정'}`,
      `과정: ${textbook?.course || '미지정'}`,
      `단원: ${chapter}`,
      '',
      '이 페이지에서 위 추출 대상에 해당하는 모든 학습 요소를 빠짐없이 추출하세요.',
      '번호가 없는 활동/예제도 반드시 포함하세요.',
      '출력은 function call(extract_examples) 스키마를 정확히 따르세요.',
    ].join('\n');

    console.log(`[extract] Processing file: ${file.name} (${(file.size / 1024).toFixed(0)}KB), batch: ${batchLabel || 'single'}`);

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
              description: 'Extract all learning elements from a textbook page',
              parameters: {
                type: 'object',
                properties: {
                  examples: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        problem_number: { type: 'string', description: '문제 번호 또는 키워드' },
                        page_number: { type: 'number' },
                        question_text: { type: 'string' },
                        answer: { type: 'string' },
                        explanation: { type: 'string' },
                        difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
                        category: {
                          type: 'string',
                          enum: ['일반문항', '예제', '활동형', '사고력', '마무리'],
                        },
                        has_illustration: { type: 'boolean' },
                        graph_data: {
                          type: 'object',
                          properties: {
                            functions: { type: 'array', items: { type: 'string' } },
                            x_range: { type: 'array', items: { type: 'number' } },
                            y_range: { type: 'array', items: { type: 'number' } },
                          },
                        },
                      },
                      required: ['problem_number', 'question_text', 'answer', 'difficulty', 'category'],
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
      const errText = await aiResponse.text();
      const status = aiResponse.status;

      console.error(`[extract] AI error (${status}): ${errText.slice(0, 500)}`);

      let errorMessage = 'AI 추출에 실패했습니다.';
      let reason = 'ai_error';

      if (status === 429) {
        errorMessage = '요청이 많습니다. 30초 후 다시 시도해주세요.';
        reason = 'rate_limit';
      } else if (status === 402) {
        errorMessage = 'AI 크레딧이 부족합니다.';
        reason = 'credit_exhausted';
      } else if (status === 400) {
        if (errText.includes('Unsupported image format')) {
          errorMessage = '지원 형식은 PNG/JPEG/WEBP/GIF 이미지 또는 PDF입니다.';
          reason = 'unsupported_format';
        } else if (errText.includes('too large') || errText.includes('size')) {
          errorMessage = '파일이 AI 처리 한도를 초과했습니다. 더 작은 파일로 나누어 업로드해 주세요.';
          reason = 'file_too_large_for_ai';
        } else {
          errorMessage = `AI 요청 오류: ${errText.slice(0, 200)}`;
          reason = 'bad_request';
        }
      } else if (status === 504 || status === 408) {
        errorMessage = 'AI 처리 시간이 초과되었습니다. 더 작은 파일로 나누어 시도해 주세요.';
        reason = 'timeout';
      }

      return jsonResponse({
        success: false,
        error: errorMessage,
        detail: { fileName: file.name, batchLabel, reason, httpStatus: status },
      });
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      return jsonResponse({
        success: false,
        error: 'AI 응답 형식이 올바르지 않습니다. 다시 시도해 주세요.',
        detail: { fileName: file.name, batchLabel, reason: 'invalid_ai_response' },
      });
    }

    let examples: any[] = [];
    try {
      const parsed = JSON.parse(toolCall.function.arguments);
      examples = Array.isArray(parsed.examples) ? parsed.examples : [];
    } catch (parseError) {
      console.error('[extract] AI parse error:', parseError);
      return jsonResponse({
        success: false,
        error: 'AI 응답 파싱에 실패했습니다. 다시 시도해주세요.',
        detail: { fileName: file.name, batchLabel, reason: 'parse_error' },
      });
    }

    if (examples.length === 0) {
      return jsonResponse({
        success: false,
        error: '문항을 감지하지 못했습니다. 문제 영역만 보이도록 페이지별 이미지(또는 8MB 이하 PDF)로 다시 업로드해 주세요.',
        detail: { fileName: file.name, batchLabel, reason: 'no_examples_found' },
      });
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
      category: ex.category || classifyCategory(ex.problem_number || '', ex.question_text || ''),
      graph_data: ex.graph_data || null,
      sort_order: idx,
      created_by: user.id,
    }));

    const { error: insertError } = await adminClient.from('textbook_examples').insert(rows);
    if (insertError) {
      console.error('[extract] Insert error:', insertError);
      return jsonResponse({
        success: false,
        error: '문항 저장 중 오류가 발생했습니다.',
        detail: { fileName: file.name, batchLabel, reason: 'db_insert_error', dbError: insertError.message },
      });
    }

    // Summarize by category
    const catSummary: Record<string, number> = {};
    for (const r of rows) {
      catSummary[r.category] = (catSummary[r.category] || 0) + 1;
    }

    console.log(`[extract] Success: ${rows.length} examples from ${file.name}`);

    return jsonResponse({
      success: true,
      count: rows.length,
      examples: rows,
      categorySummary: catSummary,
      batchLabel,
    });
  } catch (error) {
    console.error('[extract] Unhandled error:', error);
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
      detail: { reason: 'unhandled_error' },
    });
  } finally {
    if (adminClient && uploadedTempPath) {
      const { error: cleanupError } = await adminClient.storage
        .from(TEMP_UPLOAD_BUCKET)
        .remove([uploadedTempPath]);

      if (cleanupError) {
        console.error('[extract] Temp file cleanup failed:', cleanupError);
      }
    }
  }
});
