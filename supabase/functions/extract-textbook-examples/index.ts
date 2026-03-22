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
  new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const sanitizeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_');

const isPdfFile = (file: File) => {
  const lowerType = (file.type || '').toLowerCase();
  return lowerType === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
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

// Subject-specific system prompts
function getSystemPrompt(subject: string): string {
  if (subject === '영어') {
    return `당신은 한국 영어 학원 전문 학습 자료 추출기입니다.

[공통 전처리 — 반드시 최우선 적용]
1) PDF에서 텍스트를 추출할 때 **문장 중간에 강제로 들어간 줄바꿈(Enter)을 모두 제거**하고, 하나의 연결된 문장으로 먼저 합쳐라.
2) 약어(Mr. Dr. U.S. e.g. etc. vs.)의 마침표는 문장 분리 기준으로 사용하지 마라.
3) 머리글/바닥글/페이지 번호/워터마크 등 장식 텍스트는 무시하라.

[자료 유형 자동 감지]
아래 기준으로 자료 유형을 판단하고 해당 규칙에 따라 추출하라:
- 표/테이블 구조로 영단어와 뜻이 나열 → "단어"
- 영어 지문(문장 여러 개)만 있고 문제/보기 없음 → "해석"
- 지문 + 발문(질문) + 보기(①②③④⑤) 세트 → "독해"
- 문법 규칙 관련 빈칸/선택 문제 → "문법"

**1. 단어 (category: "단어")**
- 표(테이블) 또는 목록에서 영단어와 한국어 뜻을 **행 단위**로 인식한다.
- question_text: 영단어 (원형만, 깨끗하게)
- answer: 한국어 뜻 (여러 뜻은 쉼표 구분)
- explanation: 품사 정보가 있으면 기록 (예: "n." / "v." / "adj.")
- difficulty: easy(기초) / medium(중급) / hard(고급/다의어)
- problem_number: 순번 (1, 2, 3, ...)
- ⚠️ 한 행에 여러 단어가 있으면 각각 별도 항목으로 분리

**2. 해석 (category: "해석")**
- 지문 전체를 먼저 줄바꿈 제거 후 합친다.
- 그다음 **마침표(.)**, **물음표(?)**, **느낌표(!)** 기준으로 문장을 개별 분리한다.
- 각 문장은 독립된 하나의 항목으로 저장한다.
- question_text: 영어 문장 하나 (원문 그대로, 줄바꿈 없이)
- answer: 한국어 해석 (가능하면 추론, 없으면 빈 문자열)
- explanation: 핵심 문법 포인트 (간략히)
- difficulty: easy(단문) / medium(복문) / hard(도치/삽입/긴문장)
- problem_number: 순번 (1, 2, 3, ...)

**3. 독해 (category: "독해")**
- [지문 + 발문(질문) + 보기(①~⑤)]를 **하나의 블록**으로 인식한다.
- 하나의 지문에 여러 문제가 있으면, **각 문제를 별도 항목**으로 추출하되 question_text에 지문을 포함한다.
- question_text: "[지문] 본문 전체 \\n\\n[문제] 발문 텍스트 \\n①보기1 ②보기2 ③보기3 ④보기4 ⑤보기5"
- answer: 정답 (번호 또는 텍스트)
- explanation: 해설 (정답 근거 인용)
- difficulty: easy/medium/hard

**4. 문법 (category: "문법")**
- question_text: 문법 문제 전체 (보기 포함)
- answer: 정답
- explanation: 문법 규칙 설명

[출력 규칙]
1) 모든 항목에 problem_number 부여 (순번)
2) 수식/특수문자 그대로 보존
3) 페이지 번호가 보이면 page_number에 기록
4) 항목 순서대로 정렬
5) 표/목록은 행 단위로 빠짐없이 추출 — 누락 금지
6) 줄바꿈이 문장 중간에 있으면 반드시 제거 후 합쳐서 저장`;
  }

  // Default: math/science prompt
  return `당신은 한국 수학/과학 교과서 전문 문항 추출기입니다.
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
}


function getToolSchema(subject: string) {
  const categoryEnum = subject === '영어'
    ? ['단어', '해석', '독해', '문법', '일반문항']
    : ['일반문항', '예제', '활동형', '사고력', '마무리'];

  return {
    type: 'function' as const,
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
                category: { type: 'string', enum: categoryEnum },
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
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  let adminClient: ReturnType<typeof createClient> | null = null;
  let uploadedTempPath: string | null = null;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ success: false, error: '인증 정보가 없습니다.' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    if (!supabaseUrl || !serviceRoleKey || !anonKey) return jsonResponse({ success: false, error: '서버 설정이 올바르지 않습니다.' });
    if (!lovableApiKey) return jsonResponse({ success: false, error: 'AI 설정 키가 없습니다.' });

    adminClient = createClient(supabaseUrl, serviceRoleKey);
    const anonClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });

    const { data: { user }, error: userError } = await anonClient.auth.getUser();
    if (userError || !user) return jsonResponse({ success: false, error: '로그인이 필요합니다.' }, 401);

    const { data: roleData } = await adminClient.from('user_roles').select('role').eq('user_id', user.id).in('role', STAFF_ROLES).limit(1).maybeSingle();
    if (!roleData) return jsonResponse({ success: false, error: '선생님/관리자만 사용할 수 있습니다.' }, 403);

    const requestBytes = Number(req.headers.get('content-length') || 0);
    if (Number.isFinite(requestBytes) && requestBytes > MAX_REQUEST_BYTES) {
      return jsonResponse({ success: false, error: `요청 크기가 너무 큽니다. PDF는 8MB 이하로 나누어 업로드해 주세요.`, detail: { reason: 'request_too_large' } }, 413);
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const textbookId = (formData.get('textbook_id') as string | null)?.trim();
    const chapter = (formData.get('chapter') as string | null)?.trim() || '전체';
    const batchLabel = (formData.get('batch_label') as string | null)?.trim() || '';

    if (!file || !textbookId) return jsonResponse({ success: false, error: 'file과 textbook_id가 필요합니다.' });
    if (!file.size || file.size <= 0) return jsonResponse({ success: false, error: '업로드된 파일이 비어 있습니다.' });
    if (file.size > MAX_UPLOAD_BYTES) {
      return jsonResponse({ success: false, error: `파일이 너무 큽니다 (${(file.size / 1024 / 1024).toFixed(1)}MB).`, detail: { reason: 'pdf_too_large' } }, 413);
    }

    const { data: textbook, error: textbookError } = await adminClient.from('textbooks').select('title, subject, grade, course').eq('id', textbookId).single();
    if (textbookError) return jsonResponse({ success: false, error: '교재 정보를 찾을 수 없습니다.' });

    const subject = textbook?.subject || '수학';
    const pdfUpload = isPdfFile(file);
    const mimeType = pdfUpload ? 'application/pdf' : (file.type || 'application/octet-stream');
    let aiFileUrl: string;

    if (pdfUpload) {
      const fileBytes = new Uint8Array(await file.arrayBuffer());
      const base64Pdf = toBase64(fileBytes);
      aiFileUrl = `data:application/pdf;base64,${base64Pdf}`;
    } else {
      uploadedTempPath = `extract-textbook-examples/${user.id}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;
      const { error: uploadError } = await adminClient.storage.from(TEMP_UPLOAD_BUCKET).upload(uploadedTempPath, file, { contentType: mimeType, upsert: false });
      if (uploadError) return jsonResponse({ success: false, error: '파일 업로드 중 오류가 발생했습니다.', detail: { reason: 'storage_upload_failed' } });
      const { data: signedData, error: signedError } = await adminClient.storage.from(TEMP_UPLOAD_BUCKET).createSignedUrl(uploadedTempPath, TEMP_UPLOAD_TTL_SECONDS);
      if (signedError || !signedData?.signedUrl) return jsonResponse({ success: false, error: '파일 접근 링크 생성에 실패했습니다.', detail: { reason: 'signed_url_failed' } });
      aiFileUrl = signedData.signedUrl;
    }

    const systemPrompt = getSystemPrompt(subject);
    const userPrompt = [
      `교재: ${textbook?.title || '미확인'}`,
      `과목: ${subject}`,
      `학년: ${textbook?.grade || '미지정'}`,
      `과정: ${textbook?.course || '미지정'}`,
      `단원: ${chapter}`,
      '',
      '이 페이지에서 위 추출 대상에 해당하는 모든 학습 요소를 빠짐없이 추출하세요.',
      '출력은 function call(extract_examples) 스키마를 정확히 따르세요.',
    ].join('\n');

    console.log(`[extract] Processing: ${file.name} (${(file.size / 1024).toFixed(0)}KB), subject: ${subject}, batch: ${batchLabel || 'single'}`);

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${lovableApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: [{ type: 'text', text: userPrompt }, { type: 'image_url', image_url: { url: aiFileUrl } }] },
        ],
        tools: [getToolSchema(subject)],
        tool_choice: { type: 'function', function: { name: 'extract_examples' } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      const status = aiResponse.status;
      console.error(`[extract] AI error (${status}): ${errText.slice(0, 500)}`);
      let errorMessage = 'AI 추출에 실패했습니다.';
      let reason = 'ai_error';
      if (status === 429) { errorMessage = '요청이 많습니다. 30초 후 다시 시도해주세요.'; reason = 'rate_limit'; }
      else if (status === 402) { errorMessage = 'AI 크레딧이 부족합니다.'; reason = 'credit_exhausted'; }
      else if (status === 400) {
        if (errText.includes('Unsupported image format')) { errorMessage = 'PNG/JPEG/WEBP/GIF 형식만 지원됩니다.'; reason = 'unsupported_format'; }
        else if (errText.includes('too large') || errText.includes('size')) { errorMessage = '파일이 AI 처리 한도를 초과했습니다.'; reason = 'file_too_large_for_ai'; }
      } else if (status === 504 || status === 408) { errorMessage = 'AI 처리 시간이 초과되었습니다.'; reason = 'timeout'; }
      return jsonResponse({ success: false, error: errorMessage, detail: { reason, httpStatus: status } });
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) return jsonResponse({ success: false, error: 'AI 응답 형식이 올바르지 않습니다.', detail: { reason: 'invalid_ai_response' } });

    let examples: any[] = [];
    try {
      const parsed = JSON.parse(toolCall.function.arguments);
      examples = Array.isArray(parsed.examples) ? parsed.examples : [];
    } catch { return jsonResponse({ success: false, error: 'AI 응답 파싱에 실패했습니다.', detail: { reason: 'parse_error' } }); }

    if (examples.length === 0) return jsonResponse({ success: false, error: '문항을 감지하지 못했습니다.', detail: { reason: 'no_examples_found' } });

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
      return jsonResponse({ success: false, error: '문항 저장 중 오류가 발생했습니다.', detail: { reason: 'db_insert_error' } });
    }

    const catSummary: Record<string, number> = {};
    for (const r of rows) { catSummary[r.category] = (catSummary[r.category] || 0) + 1; }

    console.log(`[extract] Success: ${rows.length} examples from ${file.name}`);
    return jsonResponse({ success: true, count: rows.length, examples: rows, categorySummary: catSummary, batchLabel });
  } catch (error) {
    console.error('[extract] Unhandled error:', error);
    return jsonResponse({ success: false, error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.', detail: { reason: 'unhandled_error' } });
  } finally {
    if (adminClient && uploadedTempPath) {
      const { error: cleanupError } = await adminClient.storage.from(TEMP_UPLOAD_BUCKET).remove([uploadedTempPath]);
      if (cleanupError) console.warn('[extract] Temp cleanup failed:', cleanupError.message);
    }
  }
});
