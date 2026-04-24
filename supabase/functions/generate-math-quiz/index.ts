import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { encode as encodeBase64 } from 'https://deno.land/std@0.168.0/encoding/base64.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const STAFF_ROLES = ['admin', 'teacher', 'assistant'];
const INLINE_PDF_MAX_BYTES = 3_500_000; // 안정 모드 전환 임계값 (약 3.5MB)
const MIN_QUESTION_COUNT = 12;

type Difficulty = 'easy' | 'medium' | 'hard';
type QuestionType = 'fill_blank' | 'true_false' | 'short_answer';

interface GeneratedQuestion {
  question_number: number;
  question_type: QuestionType;
  question_text: string;
  answer: string;
  explanation: string;
  difficulty: Difficulty;
  hint: string;
}

class AppError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'AppError';
    this.status = status;
  }
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const sanitizeText = (value: unknown, fallback = ''): string => {
  if (typeof value !== 'string') return fallback;
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const normalizeDifficulty = (value: unknown): Difficulty => {
  if (value === 'easy' || value === 'medium' || value === 'hard') return value;
  return 'medium';
};

const normalizeQuestionType = (value: unknown): QuestionType => {
  if (value === 'fill_blank' || value === 'true_false' || value === 'short_answer') return value;
  return 'short_answer';
};

const normalizeQuestions = (rawQuestions: unknown[]): GeneratedQuestion[] =>
  rawQuestions
    .map((raw, index) => {
      const row = (raw ?? {}) as Record<string, unknown>;
      const questionText = sanitizeText(row.question_text);
      const answer = sanitizeText(row.answer);
      const explanation = sanitizeText(row.explanation);

      if (!questionText || !answer) return null;

      return {
        question_number: index + 1,
        question_type: normalizeQuestionType(row.question_type),
        question_text: questionText,
        answer,
        explanation: explanation || '해설은 수업 중 확인하세요.',
        difficulty: normalizeDifficulty(row.difficulty),
        hint: sanitizeText(row.hint),
      } as GeneratedQuestion;
    })
    .filter((item): item is GeneratedQuestion => item !== null);

const buildSystemPrompt = () => `당신은 학원용 개념 퀴즈 출제 전문가입니다.
주어진 자료를 바탕으로 과목/학년에 맞는 개념 점검형 문제를 생성하세요.

[공통 원칙]
1) 개념 정의, 조건, 예외, 구분 포인트를 우선 확인
2) 문제 유형은 fill_blank, true_false, short_answer를 균형 있게 구성
3) 난이도 비율은 easy 30% / medium 50% / hard 20% 내외
4) 문제마다 answer, explanation, hint를 반드시 포함
5) hint는 정답을 직접 노출하지 말고 사고 방향만 제시
6) 최소 ${MIN_QUESTION_COUNT}문항 이상 생성
7) 빈칸 표기는 ___BLANK___
8) question_number는 1부터 연속된 숫자로 반환`;

const buildUserPrompt = (
  subject: string,
  grade: string,
  course: string,
  title: string,
  customPrompt: string,
  mode: 'pdf' | 'metadata',
) =>
  [
    `과목: ${subject}`,
    `학년: ${grade}`,
    `과정: ${course}`,
    `개념 제목: ${title}`,
    mode === 'pdf'
      ? '첨부 PDF를 기준으로 개념 퀴즈를 생성하세요.'
      : '첨부 PDF 없이 메타 정보 기반 안정 모드로 퀴즈를 생성하세요. 과목/학년에 맞는 표준 개념 범위를 반영하세요.',
    customPrompt ? `추가 출제 가이드:\n${customPrompt}` : '',
    '출력은 function call(generate_quiz) 스키마를 정확히 따르세요.',
  ]
    .filter(Boolean)
    .join('\n\n');

const quizToolSchema = {
  type: 'function',
  function: {
    name: 'generate_quiz',
    description: 'Generate concept quiz questions from context',
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
            required: ['question_number', 'question_type', 'question_text', 'answer', 'explanation', 'difficulty', 'hint'],
            additionalProperties: false,
          },
        },
      },
      required: ['questions'],
      additionalProperties: false,
    },
  },
};

const parseToolQuestions = (aiData: any): GeneratedQuestion[] => {
  const args = aiData?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return [];

  try {
    const parsed = JSON.parse(args);
    const rawQuestions = Array.isArray(parsed?.questions) ? parsed.questions : [];
    return normalizeQuestions(rawQuestions);
  } catch {
    return [];
  }
};

const requestQuizQuestions = async ({
  lovableApiKey,
  subject,
  grade,
  course,
  title,
  customPrompt,
  pdfBase64,
}: {
  lovableApiKey: string;
  subject: string;
  grade: string;
  course: string;
  title: string;
  customPrompt: string;
  pdfBase64: string | null;
}): Promise<GeneratedQuestion[]> => {
  const isPdfMode = Boolean(pdfBase64);
  const userPrompt = buildUserPrompt(subject, grade, course, title, customPrompt, isPdfMode ? 'pdf' : 'metadata');

  const userContent = isPdfMode
    ? [
        { type: 'text', text: userPrompt },
        {
          type: 'image_url',
          image_url: {
            url: `data:application/pdf;base64,${pdfBase64}`,
          },
        },
      ]
    : userPrompt;

  const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${lovableApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: userContent },
      ],
      tools: [quizToolSchema],
      tool_choice: { type: 'function', function: { name: 'generate_quiz' } },
      temperature: 0.7,
    }),
  });

  if (!aiResponse.ok) {
    if (aiResponse.status === 429) {
      throw new AppError('요청이 많습니다. 잠시 후 다시 시도해주세요.', 429);
    }
    if (aiResponse.status === 402) {
      throw new AppError('AI 크레딧이 부족합니다.', 402);
    }

    const errText = await aiResponse.text();
    console.error('AI error:', aiResponse.status, errText);
    throw new AppError('AI 생성에 실패했습니다. 잠시 후 다시 시도해주세요.', 500);
  }

  const aiData = await aiResponse.json();
  return parseToolQuestions(aiData);
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new AppError('인증 정보가 없습니다.', 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      throw new AppError('서버 설정이 누락되었습니다.', 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await anonClient.auth.getUser();

    if (userError || !user) throw new AppError('로그인이 필요합니다.', 401);

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', STAFF_ROLES)
      .limit(1)
      .maybeSingle();

    if (!roleData) {
      throw new AppError('관리자/선생님/조교만 사용 가능합니다.', 403);
    }

    const { concept_id } = await req.json();
    if (!concept_id) throw new AppError('concept_id가 필요합니다.', 400);

    const { data: concept, error: conceptError } = await supabase
      .from('math_concepts')
      .select('*')
      .eq('id', concept_id)
      .single();

    if (conceptError || !concept) throw new AppError('개념 자료를 찾을 수 없습니다.', 404);

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) throw new AppError('LOVABLE_API_KEY가 설정되지 않았습니다.', 500);

    const subject = concept.subject || '기타';
    const grade = concept.grade || '기타';
    const course = concept.course || '기타';
    const customPrompt = (concept.quiz_generation_prompt || '').trim();

    let pdfBase64: string | null = null;
    let generationMode: 'pdf' | 'metadata_fallback' | 'metadata_only' = 'metadata_only';
    let warningMessage: string | null = null;

    const fileSize = Number(concept.pdf_file_size || 0);
    const shouldTryPdfContext = fileSize > 0 && fileSize <= INLINE_PDF_MAX_BYTES;

    if (shouldTryPdfContext) {
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('math-concepts')
        .download(concept.pdf_storage_path);

      if (downloadError || !fileData) {
        console.error('PDF download error:', downloadError);
        warningMessage = 'PDF 다운로드 실패로 안정 모드(메타 기반)로 출제되었습니다.';
      } else {
        const pdfBytes = await fileData.arrayBuffer();
        pdfBase64 = encodeBase64(pdfBytes);
      }
    } else if (fileSize > INLINE_PDF_MAX_BYTES) {
      warningMessage = `파일 용량이 커 안정 모드(메타 기반)로 출제되었습니다. (권장 ${Math.round(
        INLINE_PDF_MAX_BYTES / 1024 / 1024,
      )}MB 이하)`;
    }

    let questions: GeneratedQuestion[] = [];

    if (pdfBase64) {
      try {
        questions = await requestQuizQuestions({
          lovableApiKey,
          subject,
          grade,
          course,
          title: concept.title,
          customPrompt,
          pdfBase64,
        });
        generationMode = 'pdf';
      } catch (error) {
        if (error instanceof AppError && (error.status === 429 || error.status === 402)) throw error;
        console.error('PDF mode generation failed, fallback to metadata mode:', error);
        warningMessage = 'PDF 분석 중 오류가 발생해 안정 모드(메타 기반)로 출제되었습니다.';
      }
    }

    if (questions.length === 0) {
      questions = await requestQuizQuestions({
        lovableApiKey,
        subject,
        grade,
        course,
        title: concept.title,
        customPrompt,
        pdfBase64: null,
      });
      generationMode = pdfBase64 ? 'metadata_fallback' : 'metadata_only';
    }

    if (questions.length < MIN_QUESTION_COUNT) {
      throw new AppError('문항 생성이 충분하지 않습니다. 설정을 조정 후 다시 시도해주세요.', 500);
    }

    for (let i = questions.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [questions[i], questions[j]] = [questions[j], questions[i]];
    }

    questions = questions.map((question, index) => ({
      ...question,
      question_number: index + 1,
    }));

    const { data: latestQuiz } = await supabase
      .from('math_concept_quizzes')
      .select('version_number')
      .eq('concept_id', concept_id)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersion = (latestQuiz?.version_number ?? 0) + 1;
    const today = new Date().toISOString().slice(0, 10);
    const versionLabel = `${today}_${concept.title}_V${nextVersion}`;

    // Auto-generate subtitle from concept metadata
    const subtitle = [course, grade, concept.title].filter(Boolean).join(' · ');

    const quizTitle = `${concept.title} (${course})`;

    const { data: newQuiz, error: insertError } = await supabase
      .from('math_concept_quizzes')
      .insert({
        concept_id,
        questions,
        status: 'draft',
        version_number: nextVersion,
        version_label: versionLabel,
        subtitle,
        title: quizTitle,
      })
      .select('id')
      .single();

    if (insertError) throw new AppError('퀴즈 저장에 실패했습니다.', 500);

    await supabase
      .from('math_concepts')
      .update({ status: 'quiz_generated', updated_at: new Date().toISOString() })
      .eq('id', concept_id);

    return jsonResponse({
      success: true,
      quiz_id: newQuiz.id,
      questions,
      generation_mode: generationMode,
      warning: warningMessage,
    });
  } catch (error) {
    console.error('generate-math-quiz error:', error);

    if (error instanceof AppError) {
      // 프론트에서 non-2xx generic 에러가 뜨지 않도록 200으로 전달
      return jsonResponse({ success: false, error: error.message, status: error.status });
    }

    return jsonResponse({ success: false, error: '퀴즈 생성 중 알 수 없는 오류가 발생했습니다.' });
  }
});
