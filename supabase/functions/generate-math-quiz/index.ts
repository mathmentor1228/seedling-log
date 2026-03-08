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

    // Convert PDF to base64 safely
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
            content: `당신은 수학 교육 전문가입니다. 주어진 수학 개념 PDF의 **모든 내용**을 빠짐없이 분석하여 퀴즈를 생성해야 합니다.

핵심 규칙:
1. **문항 수는 PDF 내용의 분량에 비례**합니다. 개념이 많으면 15~30문항, 적으면 8~15문항을 생성하세요. 절대 5문항에 그치지 마세요.
2. PDF에 나오는 **모든 정의, 공식, 정리, 예제, 성질**을 빠짐없이 퀴즈로 만드세요.
3. 세 가지 유형을 골고루 섞으세요:
   - "fill_blank": 빈칸 채우기 (핵심 정의/공식에서 중요 부분을 ___BLANK___로)
   - "true_false": 참/거짓 (개념의 미묘한 차이를 묻는 진술문, 정답은 "참" 또는 "거짓")
   - "short_answer": 단답형 (계산 결과나 용어를 직접 작성)
4. 난이도를 다양하게: easy 30%, medium 50%, hard 20% 비율
5. 수학 기호는 반드시 LaTeX 형식 (예: \\frac{1}{2}, \\sqrt{3}, x^2)
6. 빈칸 채우기의 빈칸은 ___BLANK___ 로 표시
7. 각 문제에 정답과 간단한 해설을 포함`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `이 PDF의 수학 개념을 **전체** 분석하고, 내용에 비례하여 충분한 수의 퀴즈를 생성해주세요. 최소 10문항 이상 생성하세요.
과정: ${concept.course}, 제목: ${concept.title}`
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
              description: "Generate math quiz questions covering all concepts in the PDF",
              parameters: {
                type: "object",
                properties: {
                  questions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        question_number: { type: "number" },
                        question_type: { type: "string", enum: ["fill_blank", "true_false", "short_answer"], description: "문제 유형" },
                        question_text: { type: "string", description: "문제 텍스트 (빈칸은 ___BLANK___로 표시, 수식은 LaTeX)" },
                        answer: { type: "string", description: "정답 (LaTeX 포함 가능, 참/거짓은 '참' 또는 '거짓')" },
                        explanation: { type: "string", description: "간단한 해설" },
                        difficulty: { type: "string", enum: ["easy", "medium", "hard"] }
                      },
                      required: ["question_number", "question_type", "question_text", "answer", "explanation", "difficulty"],
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
