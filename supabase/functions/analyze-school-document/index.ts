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

    const { fileUrl, fileDataUrl, fileType, subjectFilter, schoolName } = await req.json();
    const sourceUrl =
      typeof fileDataUrl === "string" && fileDataUrl.startsWith("data:")
        ? fileDataUrl
        : fileUrl;

    if (!sourceUrl || !fileType || !schoolName) {
      return new Response(
        JSON.stringify({ error: "fileType, schoolName, and a valid file source are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const subjectInstruction =
      subjectFilter === "english"
        ? "영어 과목 관련 내용만 추출해주세요."
        : subjectFilter === "math"
        ? "수학 과목 관련 내용만 추출해주세요."
        : "모든 과목의 내용을 추출해주세요.";

    let extractionPrompt = "";

    if (fileType === "school_calendar") {
      extractionPrompt = `
다음은 ${schoolName} 학사일정 문서입니다.
${subjectInstruction}

아래 원칙을 꼭 지켜서 학사일정의 '개괄적이고 중요한 일정'만 추출해주세요:
- 시험기간, 방학, 개학/종업식, 재량휴업일, 소풍, 현장체험학습, 체육대회, 축제 같은 주요 일정은 빠뜨리지 마세요.
- 같은 의미의 세부 안내문, 반복 문구, 준비물 안내, 행정 문구는 제외하세요.
- 모든 학교 공통 성격의 모의고사(전국연합, 학력평가, 교육청 모의고사)는 반드시 일정으로 추출하세요.
- 날짜가 범위이면 start_date와 end_date를 모두 채우고, 하루 일정이면 같은 날짜를 넣어주세요.

아래 JSON 형식으로 반환해주세요:
{
  "schedules": [
    {
      "schedule_type": "exam|performance|holiday|event|other",
      "title": "일정명",
      "start_date": "YYYY-MM-DD",
      "end_date": "YYYY-MM-DD",
      "grade": 학년(숫자 또는 null),
      "subject": "과목명 또는 null",
      "description": "상세내용"
    }
  ]
}
JSON만 반환하고 다른 텍스트는 포함하지 마세요.`;
    }

    if (fileType === "textbook_list") {
      extractionPrompt = `
다음은 ${schoolName} 교과서/출판사 목록 문서입니다.
${subjectInstruction}

아래 JSON 형식으로 교과서 정보를 추출해주세요:
{
  "textbooks": [
    {
      "grade": 학년(숫자),
      "subject": "과목명",
      "publisher": "출판사",
      "textbook_name": "교과서명"
    }
  ]
}
JSON만 반환하고 다른 텍스트는 포함하지 마세요.`;
    }

    if (fileType === "evaluation_plan") {
      extractionPrompt = `
다음은 ${schoolName} 평가계획서 문서입니다.
${subjectInstruction}

아래 JSON 형식으로 평가 정보를 추출해주세요:
{
  "evaluations": [
    {
      "grade": 학년(숫자),
      "subject": "과목명",
      "semester": 학기(숫자),
      "exam_type": "중간고사|기말고사|수행평가",
      "exam_start_date": "YYYY-MM-DD 또는 null",
      "exam_end_date": "YYYY-MM-DD 또는 null",
      "exam_range": "시험범위",
      "evaluation_ratio": "반영비율 (예: 지필60%/수행40%)",
      "performance_detail": "수행평가 상세내용"
    }
  ]
}
JSON만 반환하고 다른 텍스트는 포함하지 마세요.`;
    }

    if (!extractionPrompt) {
      return new Response(
        JSON.stringify({ error: "Unsupported file type for AI analysis" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use Lovable AI Gateway with vision capability
    const messages: any[] = [
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: sourceUrl },
          },
          {
            type: "text",
            text: extractionPrompt,
          },
        ],
      },
    ];

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages,
          max_tokens: 4096,
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
        JSON.stringify({ error: "AI 분석 실패" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResult = await response.json();
    const responseText =
      aiResult.choices?.[0]?.message?.content || "";

    let extractedData: any = {};
    try {
      const clean = responseText.replace(/```json|```/g, "").trim();
      extractedData = JSON.parse(clean);
    } catch (_e) {
      console.error("JSON parse failed:", responseText);
      return new Response(
        JSON.stringify({ error: "데이터 파싱 실패", raw: responseText }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, data: extractedData }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("analyze-school-document error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
