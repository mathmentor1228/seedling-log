// Vocab QR self-grading edge function
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Question {
  questionNumber: number;
  type: "eng_to_kor" | "kor_to_eng";
  prompt: string;
  answer: string;
}

interface GradedAnswer {
  n: number;
  type: string;
  prompt: string;
  answer: string;
  student_answer: string;
  is_correct: boolean;
  reason: string;
}

const STRICTNESS_INSTRUCTIONS: Record<string, string> = {
  strict:
    "매운맛(STRICT): 정답에 여러 뜻이 쉼표·슬래시 등으로 적혀있으면 학생이 모든 뜻을 다 적어야 정답으로 인정한다. 하나라도 빠지면 오답.",
  normal:
    "보통맛(NORMAL): 정답에 여러 뜻이 있더라도 학생이 그 중 하나만 정확하게 적으면 정답으로 인정한다. 철자/맞춤법은 정확해야 한다.",
  lenient:
    "순한맛(LENIENT): 의미가 비슷하거나 유사어, 약간 다른 표현, 사소한 철자 오류도 정답으로 인정한다. 명백히 다른 뜻만 오답.",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const { token, student_id, submission_type, typed_answers, image_urls } = body;

    if (!token || !student_id || !submission_type) {
      return new Response(JSON.stringify({ error: "missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // 1. Load test by share token
    const { data: test, error: testErr } = await supabase
      .from("vocab_generated_tests")
      .select("id, title, test_data, grading_strictness")
      .eq("share_token", token)
      .single();

    if (testErr || !test) {
      return new Response(JSON.stringify({ error: "시험지를 찾을 수 없습니다" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const questions = (test.test_data as unknown as Question[]) || [];
    const strictness = test.grading_strictness || "normal";

    // 2. Get student answers (typed or via OCR)
    let studentAnswerMap: Record<number, string> = {};

    if (submission_type === "typing") {
      if (!typed_answers || typeof typed_answers !== "object") {
        return new Response(JSON.stringify({ error: "답안이 없습니다" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      for (const [k, v] of Object.entries(typed_answers)) {
        studentAnswerMap[parseInt(k)] = String(v ?? "").trim();
      }
    } else if (submission_type === "photo") {
      if (!image_urls || !Array.isArray(image_urls) || image_urls.length === 0) {
        return new Response(JSON.stringify({ error: "사진이 없습니다" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      studentAnswerMap = await extractAnswersFromImages(image_urls, questions);
    }

    // 3. AI grading
    const graded = await gradeAnswers(questions, studentAnswerMap, strictness);

    const auto_score = graded.filter((g) => g.is_correct).length;
    const total = graded.length;

    // 4. Save submission
    const { data: inserted, error: insErr } = await supabase
      .from("vocab_test_submissions")
      .insert({
        test_id: test.id,
        student_id,
        answers: graded,
        auto_score,
        final_score: auto_score,
        total,
        strictness_used: strictness,
        submission_type,
        image_urls: image_urls || [],
        status: "graded",
      })
      .select("id")
      .single();

    if (insErr) {
      console.error("insert error:", insErr);
      return new Response(JSON.stringify({ error: insErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        submission_id: inserted.id,
        score: auto_score,
        total,
        strictness,
        answers: graded,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("grade-vocab-submission error:", e);
    return new Response(JSON.stringify({ error: e.message || "unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function callLovableAI(messages: any[], tools?: any[]): Promise<any> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

  const body: any = {
    model: "google/gemini-2.5-flash",
    messages,
  };
  if (tools) {
    body.tools = tools;
    body.tool_choice = { type: "function", function: { name: tools[0].function.name } };
  }

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`AI gateway ${resp.status}: ${t}`);
  }
  return resp.json();
}

async function extractAnswersFromImages(
  urls: string[],
  questions: Question[],
): Promise<Record<number, string>> {
  const numbersList = questions.map((q) => q.questionNumber).join(", ");
  const content: any[] = [
    {
      type: "text",
      text: `이 사진들은 학생이 단어시험지에 답을 쓴 사진입니다. 문항 번호: ${numbersList}.
각 번호별로 학생이 적은 답안 텍스트만 추출해 주세요. 비어있거나 안 보이면 빈 문자열로.`,
    },
  ];
  for (const url of urls) {
    content.push({ type: "image_url", image_url: { url } });
  }

  const result = await callLovableAI(
    [{ role: "user", content }],
    [
      {
        type: "function",
        function: {
          name: "extract_answers",
          description: "Extract student handwritten answers per question number",
          parameters: {
            type: "object",
            properties: {
              answers: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    n: { type: "number" },
                    text: { type: "string" },
                  },
                  required: ["n", "text"],
                },
              },
            },
            required: ["answers"],
          },
        },
      },
    ],
  );

  const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) return {};
  const parsed = JSON.parse(toolCall.function.arguments);
  const map: Record<number, string> = {};
  for (const a of parsed.answers || []) {
    map[a.n] = (a.text || "").trim();
  }
  return map;
}

async function gradeAnswers(
  questions: Question[],
  studentMap: Record<number, string>,
  strictness: string,
): Promise<GradedAnswer[]> {
  const instruction = STRICTNESS_INSTRUCTIONS[strictness] || STRICTNESS_INSTRUCTIONS.normal;

  const items = questions.map((q) => ({
    n: q.questionNumber,
    type: q.type,
    prompt: q.prompt,
    correct: q.answer,
    student: studentMap[q.questionNumber] || "",
  }));

  const systemPrompt = `당신은 영어 단어시험 채점 전문가입니다. 아래 채점 기준에 따라 각 문항을 정확하게 채점하세요.

${instruction}

추가 규칙:
- 학생 답안이 빈 문자열이면 무조건 오답.
- type='eng_to_kor': 영어 단어가 prompt, 한국어 뜻이 correct.
- type='kor_to_eng': 한국어가 prompt, 영어가 correct. 영어 철자는 대소문자 구분 안함.
- 한국어는 조사·어미 차이는 모두 같은 의미면 정답.
- reason은 한국어로 한 줄(최대 30자) - "정답 일치", "뜻 일부만 적음 (X 빠짐)", "철자 오류", "오답" 등 간결하게.`;

  const result = await callLovableAI(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: `다음 문항들을 채점해주세요:\n${JSON.stringify(items)}` },
    ],
    [
      {
        type: "function",
        function: {
          name: "submit_grades",
          description: "Return grade for each question",
          parameters: {
            type: "object",
            properties: {
              grades: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    n: { type: "number" },
                    is_correct: { type: "boolean" },
                    reason: { type: "string" },
                  },
                  required: ["n", "is_correct", "reason"],
                },
              },
            },
            required: ["grades"],
          },
        },
      },
    ],
  );

  const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) throw new Error("AI grading failed - no tool call");
  const parsed = JSON.parse(toolCall.function.arguments);
  const gradeMap: Record<number, { is_correct: boolean; reason: string }> = {};
  for (const g of parsed.grades || []) {
    gradeMap[g.n] = { is_correct: !!g.is_correct, reason: g.reason || "" };
  }

  return questions.map((q) => {
    const student = studentMap[q.questionNumber] || "";
    const g = gradeMap[q.questionNumber] || { is_correct: false, reason: "채점 실패" };
    return {
      n: q.questionNumber,
      type: q.type,
      prompt: q.prompt,
      answer: q.answer,
      student_answer: student,
      is_correct: student.trim() === "" ? false : g.is_correct,
      reason: student.trim() === "" ? "답안 미작성" : g.reason,
    };
  });
}
