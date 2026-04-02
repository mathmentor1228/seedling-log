import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { schoolName, schedules, textbooks, archives } = await req.json();

    if (!schoolName) {
      return new Response(
        JSON.stringify({ error: "schoolName is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const prompt = `
당신은 학원 선생님을 위한 수업 준비 가이드를 작성하는 전문가입니다.

학교명: ${schoolName}

## 시험 일정
${JSON.stringify(schedules || [], null, 2)}

## 교과서 정보
${JSON.stringify(textbooks || [], null, 2)}

## 내신 자료 (과거 시험 분석)
${JSON.stringify(archives || [], null, 2)}

위 데이터를 바탕으로 선생님이 수업 준비에 참고할 수 있는 가이드를 작성해주세요.

다음 섹션을 포함해주세요:
1. **시험 일정 요약**: 다가오는 시험과 D-day
2. **교과서/출판사 정보**: 학년별 사용 교과서 정리
3. **시험 대비 포인트**: 과거 시험 분석을 바탕으로 한 수업 준비 포인트
4. **수업 전략 제안**: 시험 시기에 맞춘 수업 운영 전략

마크다운 형식으로 작성하고, 실용적이고 간결하게 작성해주세요.
`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content: "당신은 학원 운영 전문가입니다. 선생님을 위한 실용적인 수업 가이드를 마크다운 형식으로 작성합니다.",
            },
            { role: "user", content: prompt },
          ],
          stream: false,
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "AI 요청 한도 초과. 잠시 후 다시 시도해주세요." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI 크레딧이 부족합니다." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "가이드 생성 실패" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResult = await response.json();
    const guide = aiResult.choices?.[0]?.message?.content || "";

    return new Response(
      JSON.stringify({ success: true, guide }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("generate-school-guide error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
