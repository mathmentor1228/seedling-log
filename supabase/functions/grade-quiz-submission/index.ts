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

    // Get submission with quiz data
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

    if (!imageUrls || imageUrls.length === 0) throw new Error("No images to grade");

    // Build the question reference for AI
    const questionRef = questions.map((q: any) => 
      `Q${q.question_number} [${q.question_type}]: "${q.question_text}" → 정답: "${q.answer}"`
    ).join("\n");

    // Prepare image content for AI
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
            content: `당신은 한국 학생의 수학 시험 채점 전문가입니다. 학생이 손으로 적은 노트 사진을 분석하여 각 문제의 답안을 판독하고 채점해야 합니다.

중요 - 한글 손글씨 판독 규칙:
- 한국어 손글씨를 우선적으로 인식하세요. 학생들은 한글로 답을 적습니다.
- 한글 자모의 특성을 고려하세요 (ㄱ/ㅋ, ㄷ/ㅌ, ㅂ/ㅍ 등 유사 자모 구분).
- 흘려 쓴 한글도 문맥을 고려하여 최대한 판독하세요.

중요 - 취소선/수정 처리 규칙:
- 학생이 글자 위에 줄을 그어 취소(취소선)한 내용은 무시하세요.
- 가위표(X)로 지운 내용도 무시하세요.
- 지우개로 지우거나 덮어쓴 흔적이 있으면, 최종적으로 보이는 답만 인식하세요.
- 여러 번 고쳐 쓴 경우, 가장 마지막에 적은 답(취소되지 않은 답)을 최종 답으로 채택하세요.

중요 - 모호한 답안 처리 규칙:
- 손글씨가 심하게 불분명하여 어떤 답인지 확신할 수 없는 경우, status를 "needs_resubmit"으로 표시하세요.
- 여러 답이 겹쳐 써져 있어 최종 답을 특정할 수 없는 경우에도 "needs_resubmit"으로 처리하세요.
- 답이 잘려 있거나 사진이 흐릿하여 판독 불가능한 경우에도 "needs_resubmit"으로 처리하세요.
- "needs_resubmit" 문항은 is_correct를 false로 설정하고, note에 재제출이 필요한 이유를 한국어로 적어주세요.
- "needs_resubmit" 문항은 total_correct 및 total_graded 카운트에서 제외하세요.

채점 규칙:
1. 사진 속에서 문제 번호(Q1, Q2, 1번, 2번 등)에 해당하는 학생의 최종 답을 찾아 판독하세요.
2. 각 문제의 정답과 비교하여 맞았는지 틀렸는지 판정하세요.
3. 손글씨가 불분명한 경우 최대한 유추하되, 정말 판독 불가시 "needs_resubmit"으로 표시하세요.
4. 빈칸 채우기: 학생이 적은 답이 정답과 의미적으로 동일하면 정답 처리
5. 참/거짓: "참", "O", "T", "True" 등은 모두 "참"으로 인식, "거짓", "X", "F", "False" 등은 "거짓"
6. 단답형: 수학적으로 동치인 표현이면 정답 처리 (예: x^2+2x+1 = (x+1)^2)`
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
사진에서 찾을 수 없는 문제는 "not_found"로 처리하세요.`
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
              description: "Submit grading results for each quiz question",
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
                        status: { type: "string", enum: ["correct", "incorrect", "unreadable", "not_found"], description: "채점 상태" },
                        note: { type: "string", description: "채점 참고 사항" }
                      },
                      required: ["question_number", "student_answer", "is_correct", "status"],
                      additionalProperties: false
                    }
                  },
                  total_correct: { type: "number", description: "총 맞은 개수" },
                  total_graded: { type: "number", description: "총 채점된 문제 수" },
                  overall_feedback: { type: "string", description: "전체적인 피드백 한 줄" }
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

    // Calculate points: +10 for perfect, +5 for >70%, +2 for attempting
    const scoreRate = gradingResult.total_graded > 0
      ? gradingResult.total_correct / gradingResult.total_graded
      : 0;
    let pointsAwarded = 2; // base points for attempting
    if (scoreRate >= 1.0) pointsAwarded = 10;
    else if (scoreRate >= 0.7) pointsAwarded = 5;
    else if (scoreRate >= 0.5) pointsAwarded = 3;

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
        reason: `수학 개념 퀴즈 인증 (${gradingResult.total_correct}/${gradingResult.total_graded}점)`,
      });

    // Update student total points
    // Points update handled below
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
