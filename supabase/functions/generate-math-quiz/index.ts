import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as encodeBase64 } from "https://deno.land/std@0.168.0/encoding/base64.ts";
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

    // Verify caller is admin
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await anonClient.auth.getUser();
    if (userError || !user) throw new Error("Unauthorized");

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) throw new Error("Admin only");

    const { concept_id } = await req.json();
    if (!concept_id) throw new Error("concept_id required");

    // Get concept
    const { data: concept, error: conceptError } = await supabase
      .from("math_concepts")
      .select("*")
      .eq("id", concept_id)
      .single();

    if (conceptError || !concept) throw new Error("Concept not found");

    // Download PDF from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("math-concepts")
      .download(concept.pdf_storage_path);

    if (downloadError || !fileData) throw new Error("Failed to download PDF");

    // Extract text from PDF (send raw bytes to AI for analysis)
    const pdfBytes = await fileData.arrayBuffer();
    const pdfBase64 = encodeBase64(new Uint8Array(pdfBytes));

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
            content: `당신은 수학 교육 전문가입니다. 주어진 수학 개념 PDF의 내용을 분석하여 '빈칸 채우기 퀴즈' 5문항을 생성해야 합니다.

규칙:
1. 각 문제는 핵심 개념을 묻는 빈칸 채우기 형식이어야 합니다.
2. 수학 기호는 반드시 LaTeX 형식으로 작성하세요 (예: \\frac{1}{2}, \\sqrt{3}, x^2).
3. 빈칸은 ___BLANK___ 로 표시하세요.
4. 각 문제에 정답과 간단한 해설을 포함하세요.

반드시 아래 JSON 형식으로 응답하세요.`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `이 PDF의 수학 개념을 분석하고 빈칸 채우기 퀴즈 5문항을 생성해주세요. 과정: ${concept.course}, 제목: ${concept.title}`
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:application/pdf;base64,${pdfBase64}`
                }
              }
            ]
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_quiz",
              description: "Generate fill-in-the-blank math quiz questions",
              parameters: {
                type: "object",
                properties: {
                  questions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        question_number: { type: "number" },
                        question_text: { type: "string", description: "문제 텍스트 (빈칸은 ___BLANK___로 표시, 수식은 LaTeX)" },
                        answer: { type: "string", description: "정답 (LaTeX 포함 가능)" },
                        explanation: { type: "string", description: "간단한 해설" },
                        difficulty: { type: "string", enum: ["easy", "medium", "hard"] }
                      },
                      required: ["question_number", "question_text", "answer", "explanation", "difficulty"],
                      additionalProperties: false
                    }
                  }
                },
                required: ["questions"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "generate_quiz" } }
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
      console.error("AI error:", aiResponse.status, errText);
      throw new Error("AI generation failed");
    }

    const aiData = await aiResponse.json();
    
    // Extract questions from tool call
    let questions = [];
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      questions = parsed.questions || [];
    }

    if (questions.length === 0) {
      throw new Error("AI가 퀴즈를 생성하지 못했습니다.");
    }

    // Upsert quiz
    const { data: existingQuiz } = await supabase
      .from("math_concept_quizzes")
      .select("id")
      .eq("concept_id", concept_id)
      .maybeSingle();

    if (existingQuiz) {
      await supabase
        .from("math_concept_quizzes")
        .update({ questions, status: "draft", updated_at: new Date().toISOString() })
        .eq("id", existingQuiz.id);
    } else {
      await supabase
        .from("math_concept_quizzes")
        .insert({ concept_id, questions, status: "draft" });
    }

    // Update concept status
    await supabase
      .from("math_concepts")
      .update({ status: "quiz_generated", updated_at: new Date().toISOString() })
      .eq("id", concept_id);

    return new Response(JSON.stringify({ success: true, questions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-math-quiz error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
