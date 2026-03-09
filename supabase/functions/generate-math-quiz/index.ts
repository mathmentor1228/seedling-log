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

    const { data: concept, error: conceptError } = await supabase
      .from("math_concepts")
      .select("*")
      .eq("id", concept_id)
      .single();

    if (conceptError || !concept) throw new Error("Concept not found");

    const { data: fileData, error: downloadError } = await supabase.storage
      .from("math-concepts")
      .download(concept.pdf_storage_path);

    if (downloadError || !fileData) throw new Error("Failed to download PDF");

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
            content: `당신은 학원에서 학생들을 가르치는 수학 교육 전문가입니다. 주어진 수학 개념 PDF의 **모든 내용**을 빠짐없이 분석하여, **개념 이해도 확인** 중심의 퀴즈를 생성해야 합니다.

⚠️ 가장 중요한 원칙: "문제 풀이"가 아니라 "개념을 정확히 알고 있는가"를 확인하는 데 초점을 맞추세요.

## 출제 우선순위 (반드시 이 순서로 커버):
1. **개념의 정의·성질·조건 확인**: "이차방정식이 되기 위한 $a$의 조건은?", "근의 공식에서 판별식이 음수이면?" 등 정의와 성립 조건을 정확히 이해했는지 묻는 문제
2. **용어 정의 확인**: 단항식, 다항식, 항, 상수항, 계수, 차수 등 핵심 수학 용어의 정의
3. **개념 구분**: 비슷하지만 다른 개념들을 구별 (예: 단항식 vs 다항식, 차수 vs 계수, 등식 vs 항등식)
4. **정리/법칙 암기 확인**: 교환법칙, 결합법칙, 분배법칙 등의 이름과 내용을 정확히 연결
5. **공식 암기 확인**: PDF에 나오는 모든 공식을 하나하나 외우고 있는지 확인. 공식이 10개면 10개 전부 각각 출제
6. **개념 적용**: 오름차순/내림차순 정리, 동류항 정리 등 개념을 적용하는 간단한 확인
7. **지수법칙**: 기본 지수법칙 각각을 정확히 알고 있는지

## 힌트 생성 규칙 (매우 중요!)
각 문제에 반드시 hint 필드를 포함하세요:
- 정답이 한글 단어인 경우: **초성**을 힌트로 제공 (예: "방정식" → "ㅂㅈㅅ", "판별식" → "ㅍㅂㅅ")
- 정답이 수식인 경우: 해당 개념이 PDF에서 어떤 맥락에 등장하는지 **핵심 한 줄 요약**
- 참/거짓 문제: 관련 개념의 정의를 간접적으로 떠올리게 하는 힌트
- 힌트는 정답을 직접 알려주면 안 되고, 사고의 방향만 제시해야 합니다

## 문항 수 규칙
- PDF 내용의 분량에 비례하여 15~30문항 생성
- 특히 공식이 여러 개 나열된 부분은 공식 하나당 최소 1문항씩 출제
- 절대 5문항에 그치지 마세요

## 세 가지 유형을 골고루 섞으세요:
- "fill_blank": 빈칸 채우기 — 정의나 공식의 핵심 부분을 ___BLANK___로
- "true_false": 참/거짓 — 개념의 미묘한 차이를 묻는 진술문
- "short_answer": 단답형 — 용어를 묻거나 간단한 공식 결과

## 추가 규칙:
- ⚠️ 문제 순서를 반드시 랜덤으로 섞으세요!
- 난이도: easy 30%, medium 50%, hard 20%
- 수학 기호는 반드시 LaTeX
- 빈칸은 ___BLANK___로 표시
- 각 문제에 정답과 간단한 해설 포함
- question_number는 1부터 순서대로`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `이 PDF의 수학 개념을 **전체** 분석하세요. 모든 정의, 용어, 법칙, 공식을 빠짐없이 퀴즈로 만드세요.
특히 **개념의 정의, 성질, 조건**을 정확히 이해했는지 묻는 문제를 우선 출제하세요.
공식이 여러 개 나열된 부분은 각 공식마다 개별 문항으로 출제하세요.
각 문항에 반드시 hint(초성 또는 개념 힌트)를 포함하세요.
최소 15문항 이상, 내용이 많으면 25~30문항까지 생성하세요.
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
              description: "Generate math quiz questions with hints covering all concepts in the PDF",
              parameters: {
                type: "object",
                properties: {
                  questions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        question_number: { type: "number" },
                        question_type: { type: "string", enum: ["fill_blank", "true_false", "short_answer"] },
                        question_text: { type: "string", description: "문제 텍스트 (빈칸은 ___BLANK___로 표시, 수식은 LaTeX)" },
                        answer: { type: "string", description: "정답" },
                        explanation: { type: "string", description: "간단한 해설" },
                        difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
                        hint: { type: "string", description: "힌트: 한글 정답이면 초성(예: ㅂㅈㅅ), 수식이면 관련 개념 한 줄 요약. 정답을 직접 알려주면 안 됨" }
                      },
                      required: ["question_number", "question_type", "question_text", "answer", "explanation", "difficulty", "hint"],
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
    
    let questions = [];
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      questions = parsed.questions || [];
    }

    if (questions.length === 0) {
      throw new Error("AI가 퀴즈를 생성하지 못했습니다.");
    }

    // Shuffle questions (Fisher-Yates)
    for (let i = questions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [questions[i], questions[j]] = [questions[j], questions[i]];
    }
    questions = questions.map((q: any, idx: number) => ({ ...q, question_number: idx + 1 }));

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
