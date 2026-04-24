import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const WrongItemSchema = z.object({
  itemNumber: z.number().int().positive(),
  type: z.enum(['객관식', '주관식']),
  points: z.number().min(0),
  errorTypes: z.array(z.string().min(1)).default([]),
  customReason: z.string().nullable().optional(),
});

const TopErrorSchema = z.object({
  type: z.string().min(1),
  count: z.number().int().min(1),
});

const SelfCheckSchema = z.object({
  itemNumber: z.number().int().positive(),
  remembered: z.boolean().nullable().optional(),
  conceptConfused: z.boolean().nullable().optional(),
  academyHelped: z.boolean().nullable().optional(),
  needMore: z.string().nullable().optional(),
  myMistake: z.string().nullable().optional(),
});

const RequestSchema = z.object({
  studentName: z.string().min(1).max(100),
  grade: z.string().nullable().optional(),
  subject: z.string().min(1).max(100),
  schoolName: z.string().min(1).max(200),
  examYear: z.number().int().nullable().optional(),
  examPeriod: z.string().nullable().optional(),
  examType: z.string().min(1).max(100),
  totalItems: z.number().int().min(1),
  correctCount: z.number().int().min(0),
  wrongCount: z.number().int().min(0),
  partialCount: z.number().int().min(0),
  earnedScore: z.number().min(0),
  totalScore: z.number().min(0),
  wrongItems: z.array(WrongItemSchema),
  topErrors: z.array(TopErrorSchema).max(3).default([]),
  selfChecks: z.array(SelfCheckSchema).default([]),
});

function buildPrompt(input: z.infer<typeof RequestSchema>) {
  const wrongItemsText = input.wrongItems.length > 0
    ? input.wrongItems.map((item) => {
      const reasons = item.errorTypes.length > 0 ? item.errorTypes.join(', ') : '유형 미분류';
      const customReason = item.customReason?.trim() ? ` / ${item.customReason.trim()}` : '';
      return `- ${item.itemNumber}번 (${item.type}, ${item.points}점): ${reasons}${customReason}`;
    }).join('\n')
    : '- 오답 문항 없음';

  const topErrorsText = input.topErrors.length > 0
    ? input.topErrors.map((item) => `${item.type}(${item.count}회)`).join(', ')
    : '패턴 없음';

  const accuracy = input.totalItems > 0
    ? Math.round((input.correctCount / input.totalItems) * 100)
    : 0;

  const roundedEarnedScore = Math.round(input.earnedScore * 10) / 10;

  return `당신은 경험 많은 수학 전문 선생님입니다.

아래 학생의 시험 채점 결과를 바탕으로 선생님이 학생에게 전달할 분석 코멘트 초안을 작성해주세요.

## 시험 정보
- 학생: ${input.studentName}
- 과목: ${input.subject}
- 학교: ${input.schoolName}
- 시험: ${input.examYear ?? '-'}년 ${input.examPeriod ?? '-'} ${input.examType}
- 학년: ${input.grade ? `${input.grade}학년` : '미상'}

## 채점 결과
- 총점: ${input.totalScore}점 만점에 ${roundedEarnedScore}점
- 정답률: ${accuracy}%
- 맞은 문항: ${input.correctCount}개
- 틀린 문항: ${input.wrongCount}개
- 부분 점수: ${input.partialCount}개

## 틀린 문항 상세
${wrongItemsText}

## 주요 오답 패턴
${topErrorsText}

## 작성 지침
1. 학생에게 직접 말하는 따뜻하고 격려하는 톤으로 작성
2. 아래 4가지 섹션으로 구성:
   - 전체 총평 (2~3문장)
   - 주요 오답 분석 (틀린 문항별 간략 패턴)
   - 취약 개념/단원 짚기 (오답유형 기반)
   - 다음 학습 방향 + 시험 전략 조언
3. 각 섹션은 이모지 없이 제목과 내용으로 구분
4. 전체 길이: 300~400자 내외
5. 한국어로 작성`;
}

function extractContentText(payload: any): string {
  const message = payload?.choices?.[0]?.message?.content;
  if (typeof message === 'string') return message.trim();
  if (Array.isArray(message)) {
    return message
      .map((entry) => (typeof entry?.text === 'string' ? entry.text : ''))
      .join('')
      .trim();
  }
  return '';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const parsed = RequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY is not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          {
            role: 'system',
            content: '당신은 학생에게 시험 분석 피드백을 작성하는 숙련된 한국어 수학 선생님입니다. 따뜻하지만 구체적이고, 실제 채점 결과에 근거한 코멘트만 작성하세요.',
          },
          {
            role: 'user',
            content: buildPrompt(parsed.data),
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();

      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'AI 요청이 잠시 많습니다. 잠시 후 다시 시도해주세요.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'AI 사용 한도가 부족합니다. 워크스페이스 사용량을 확인해주세요.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ error: `AI gateway error [${response.status}]: ${errorText}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const comment = extractContentText(data);

    if (!comment) {
      return new Response(JSON.stringify({ error: 'AI 응답에서 코멘트를 생성하지 못했습니다.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ comment }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});