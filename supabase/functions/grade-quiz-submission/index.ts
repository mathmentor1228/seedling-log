import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { submission_id } = await req.json();
    if (!submission_id) throw new Error("submission_id required");

    const { data: submission, error: subError } = await supabase
      .from("math_quiz_submissions")
      .select("*, math_concept_quizzes(*)")
      .eq("id", submission_id)
      .single();

    if (subError || !submission) throw new Error("Submission not found");

    const quiz = submission.math_concept_quizzes;
    if (!quiz) throw new Error("Quiz not found");

    const questions = quiz.questions as any[];
    const imageUrls = submission.image_urls as string[];
    const hintsUsed = (submission as any).hints_used as number[] | null;

    if (!imageUrls || imageUrls.length === 0) throw new Error("No images to grade");

    const questionRef = questions.map((q: any) => 
      `Q${q.question_number} [${q.question_type}]: "${q.question_text}" → 정답: "${q.answer}" | 해설: "${q.explanation}"`
    ).join("\n");

    const imageContent = imageUrls.map((url: string) => ({
      type: "image_url" as const,
      image_url: { url }
    }));

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `당신은 한국 중·고등학생의 수학 시험을 채점하는 베테랑 수학 선생님입니다. 학생이 손으로 적은 노트 사진을 분석하여 각 문제의 답안을 판독하고, **친절하고 상세한 교육적 피드백**을 제공해야 합니다.

## 한글 OCR 강화 규칙
- 한국어 수학 용어에 특화하여 판독하세요: 이차방정식, 근의 공식, 판별식, 다항식, 단항식, 계수, 차수, 인수분해, 항등식 등
- 문맥 기반 오타 보정: "이차방젱식" → "이차방정식", "그의 공식" → "근의 공식" 등 수학 용어 문맥에서 유사 글자를 자동 보정
- 한글 자모 혼동 주의: ㄱ/ㅋ, ㄷ/ㅌ, ㅂ/ㅍ, ㅅ/ㅆ 등 유사 자모를 문맥으로 구분
- 흘려 쓴 한글도 수학 용어 사전과 대조하여 최대한 정확히 판독

## 취소선/수정 처리
- 취소선, 가위표(X)로 지운 내용은 무시
- 여러 번 고쳐 쓴 경우 최종 답(취소되지 않은 답)만 채택

## 모호한 답안 처리
- 심하게 불분명한 손글씨: status를 "needs_resubmit"으로 표시
- 여러 답이 겹쳐 써져 있는 경우도 "needs_resubmit"
- 사진이 흐리거나 답이 잘린 경우도 "needs_resubmit"
- "needs_resubmit" 문항은 is_correct=false, note에 재제출 이유를 한국어로 기재
- "needs_resubmit" 문항은 total_correct, total_graded에서 제외

## 채점 규칙
1. 사진에서 문제 번호별 학생의 최종 답을 판독
2. 정답과 비교하여 맞았는지 판정
3. 빈칸 채우기: 의미적으로 동일하면 정답 처리
4. 참/거짓: "참", "O", "T", "True" = 참 / "거짓", "X", "F", "False" = 거짓
5. 단답형: 수학적으로 동치인 표현이면 정답 처리

## 🌟 핵심: 상세한 교육적 피드백 (concept_feedback)
각 문항별로 단순 정답/오답이 아니라, **선생님처럼 따뜻하고 구체적인 피드백**을 concept_feedback 필드에 작성하세요:
- **정답인 경우**: "잘했어요! 이 개념을 정확히 이해하고 있네요." 또는 관련 심화 팁
- **오답인 경우**: 
  - 학생이 어떤 개념을 혼동했는지 구체적으로 지적 (예: "'계수'와 '차수'를 헷갈린 것 같아요")
  - 올바른 풀이 방향을 안내 (예: "이차방정식이 되려면 x²의 계수가 0이 아니어야 해요")
  - 비슷한 오답 유형에 대한 주의점 (예: "많은 학생들이 이 부분을 헷갈리는데...")
- **needs_resubmit인 경우**: 재제출이 필요한 이유를 친절하게 설명

## overall_feedback
전체 피드백은 학생을 격려하면서도 부족한 부분을 구체적으로 짚어주는 2~3문장으로 작성하세요.`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `아래 퀴즈의 정답 목록과 학생이 작성한 노트 사진을 비교하여 채점해주세요.

=== 퀴즈 정답 목록 ===
${questionRef}

=== 채점 요청 ===
각 문제번호별로 학생이 적은 답을 판독하고 정답 여부를 판정해주세요.
사진에서 찾을 수 없는 문제는 "not_found"로 처리하세요.
각 문항에 대해 **구체적이고 교육적인 피드백**(concept_feedback)을 반드시 작성해주세요.`
              },
              ...imageContent
            ]
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "submit_grading",
              description: "Submit grading results with detailed educational feedback",
              parameters: {
                type: "object",
                properties: {
                  results: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        question_number: { type: "number", description: "문제 번호" },
                        student_answer: { type: "string", description: "학생이 적은 답 (판독 결과)" },
                        is_correct: { type: "boolean", description: "정답 여부" },
                        status: { type: "string", enum: ["correct", "incorrect", "unreadable", "not_found", "needs_resubmit"], description: "채점 상태" },
                        note: { type: "string", description: "채점 참고 사항" },
                        concept_feedback: { type: "string", description: "선생님처럼 친절하고 구체적인 교육적 피드백. 정답이면 칭찬+팁, 오답이면 어떤 개념을 혼동했는지와 올바른 방향 안내" }
                      },
                      required: ["question_number", "student_answer", "is_correct", "status", "concept_feedback"],
                      additionalProperties: false
                    }
                  },
                  total_correct: { type: "number", description: "총 맞은 개수" },
                  total_graded: { type: "number", description: "총 채점된 문제 수" },
                  overall_feedback: { type: "string", description: "전체적인 교육적 피드백 2~3문장 (격려 + 부족한 점 구체 지적)" }
                },
                required: ["results", "total_correct", "total_graded", "overall_feedback"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "submit_grading" } }
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI 크레딧이 부족합니다." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiResponse.text();
      console.error("AI grading error:", aiResponse.status, errText);
      throw new Error("AI 채점에 실패했습니다.");
    }

    const aiData = await aiResponse.json();
    let gradingResult = null;

    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      gradingResult = JSON.parse(toolCall.function.arguments);
    }

    if (!gradingResult) throw new Error("AI 채점 결과를 파싱할 수 없습니다.");

    // Calculate points with hint penalty
    const scoreRate = gradingResult.total_graded > 0
      ? gradingResult.total_correct / gradingResult.total_graded
      : 0;
    let pointsAwarded = 2; // base points for attempting
    if (scoreRate >= 1.0) pointsAwarded = 10;
    else if (scoreRate >= 0.7) pointsAwarded = 5;
    else if (scoreRate >= 0.5) pointsAwarded = 3;

    // Halve points if hints were used
    if (hintsUsed && hintsUsed.length > 0) {
      pointsAwarded = Math.max(1, Math.ceil(pointsAwarded / 2));
    }

    // Update submission
    await supabase
      .from("math_quiz_submissions")
      .update({
        ai_grading_result: gradingResult,
        ai_total_score: gradingResult.total_correct,
        ai_total_questions: gradingResult.total_graded,
        points_awarded: pointsAwarded,
        status: "graded",
        updated_at: new Date().toISOString(),
      })
      .eq("id", submission_id);

    // Award points to student
    await supabase
      .from("student_point_history")
      .insert({
        student_id: submission.student_id,
        points: pointsAwarded,
        reason: `수학 개념 퀴즈 인증 (${gradingResult.total_correct}/${gradingResult.total_graded}점)${hintsUsed?.length ? ' [힌트 사용]' : ''}`,
      });

    const { data: student } = await supabase
      .from("students")
      .select("total_points")
      .eq("id", submission.student_id)
      .single();

    if (student) {
      await supabase
        .from("students")
        .update({ total_points: (student.total_points || 0) + pointsAwarded })
        .eq("id", submission.student_id);
    }

    return new Response(JSON.stringify({
      success: true,
      grading: gradingResult,
      points_awarded: pointsAwarded,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("grade-quiz-submission error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
