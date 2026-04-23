import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function isPdfDataUrl(url: string): boolean {
  return url.startsWith("data:application/pdf");
}

function isImageDataUrl(url: string): boolean {
  return (
    url.startsWith("data:image/") ||
    url.startsWith("data:application/octet-stream")
  );
}

function isPdfSource(
  url: string,
  fileMimeType?: string | null,
  fileName?: string | null,
): boolean {
  if (isPdfDataUrl(url)) return true;

  const normalizedMimeType = (fileMimeType || "").toLowerCase();
  const normalizedUrl = url.toLowerCase();
  const normalizedFileName = (fileName || "").toLowerCase();

  return (
    normalizedMimeType === "application/pdf" ||
    normalizedUrl.includes(".pdf") ||
    normalizedFileName.endsWith(".pdf")
  );
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function parseDataUrl(dataUrl: string): { mimeType: string; base64Data: string } | null {
  const value = String(dataUrl || "");
  if (!value.startsWith("data:")) return null;

  const commaIndex = value.indexOf(",");
  if (commaIndex < 0) return null;

  const header = value.slice(5, commaIndex);
  const payload = value.slice(commaIndex + 1).replace(/\s+/g, "");
  const mimeType = header.replace(/;base64$/i, "").trim() || "application/octet-stream";

  if (!header.toLowerCase().includes(";base64") || !payload) return null;

  return { mimeType, base64Data: payload };
}

function normalizeDataUrlMimeType(dataUrl: string, fileMimeType?: string | null): string {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return dataUrl;

  const normalizedMimeType = (fileMimeType || "").trim().toLowerCase();
  const mimeType = parsed.mimeType === "application/octet-stream" && normalizedMimeType
    ? normalizedMimeType
    : parsed.mimeType;

  return `data:${mimeType};base64,${parsed.base64Data}`;
}

function isSupportedAiMimeType(mimeType: string): boolean {
  return [
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "image/gif",
  ].includes(mimeType.toLowerCase());
}

function extractStorageObjectLocation(url: string) {
  try {
    const parsedUrl = new URL(url);
    const prefixes = [
      "/storage/v1/object/public/",
      "/storage/v1/object/authenticated/",
      "/storage/v1/object/sign/",
      "/storage/v1/object/",
    ];

    const matchedPrefix = prefixes.find((prefix) =>
      parsedUrl.pathname.startsWith(prefix),
    );

    if (!matchedPrefix) return null;

    const remainder = parsedUrl.pathname.slice(matchedPrefix.length);
    const [bucket, ...pathParts] = remainder.split("/");
    const objectPath = pathParts.join("/");

    if (!bucket || !objectPath) return null;

    return {
      bucket: decodeURIComponent(bucket),
      objectPath: decodeURIComponent(objectPath),
    };
  } catch {
    return null;
  }
}

async function fetchStoragePdfAsDataUrl(
  sourceUrl: string,
  fileMimeType?: string | null,
): Promise<string | null> {
  const location = extractStorageObjectLocation(sourceUrl);
  if (!location) return null;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("스토리지 접근 설정이 누락되었습니다.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await supabase.storage
    .from(location.bucket)
    .download(location.objectPath);

  if (error || !data) {
    throw new Error(error?.message || "스토리지 PDF 다운로드 실패");
  }

  const pdfBuffer = await data.arrayBuffer();
  if (!pdfBuffer.byteLength) {
    throw new Error("PDF 파일이 비어 있습니다.");
  }

  const mimeType = data.type || fileMimeType || "application/pdf";
  return `data:${mimeType};base64,${arrayBufferToBase64(pdfBuffer)}`;
}

async function resolveAiFileUrl(
  sourceUrl: string,
  fileMimeType?: string | null,
  fileName?: string | null,
): Promise<string> {
  if (sourceUrl.startsWith("data:")) {
    return normalizeDataUrlMimeType(sourceUrl, fileMimeType);
  }

  if (!isPdfSource(sourceUrl, fileMimeType, fileName)) {
    return sourceUrl;
  }

  if (isPdfDataUrl(sourceUrl)) {
    return sourceUrl;
  }

  const fileResponse = await fetch(sourceUrl);
  if (!fileResponse.ok) {
    const storagePdfDataUrl = await fetchStoragePdfAsDataUrl(sourceUrl, fileMimeType);
    if (storagePdfDataUrl) {
      return storagePdfDataUrl;
    }

    throw new Error(`PDF 파일을 불러오지 못했습니다. (${fileResponse.status})`);
  }

  const pdfBuffer = await fileResponse.arrayBuffer();
  if (!pdfBuffer.byteLength) {
    throw new Error("PDF 파일이 비어 있습니다.");
  }

  const mimeType =
    fileResponse.headers.get("content-type")?.split(";")[0] ||
    fileMimeType ||
    "application/pdf";

  return `data:${mimeType};base64,${arrayBufferToBase64(pdfBuffer)}`;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CURRENT_YEAR = new Date().getFullYear();

const EXAM_NOTICE_PARSE_SYSTEM_PROMPT = `당신은 한국 중고등학교 내신 시험 공고문을 분석하는 전문가입니다.

업로드된 문서에서 아래 정보를 정확하게 추출해주세요.

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 절대 포함하지 마세요.

{
  "school_name": "학교명 (문서에 없으면 null)",
  "exam_type": "시험 종류 (중간고사/기말고사/모의고사 중 하나)",
  "exam_year": "연도 (숫자, 예: 2026)",
  "exam_period": "학기 (1학기/2학기 중 하나)",
  "grade": "학년 (1/2/3 중 하나, 전학년이면 null)",
  "score_distribution": {
    "midterm": "중간고사 비율 (숫자만, 예: 35)",
    "final": "기말고사 비율 (숫자만, 예: 35)",
    "performance": "수행평가 비율 (숫자만, 예: 30)"
  },
  "exam_schedule": [
    {
      "date": "날짜 (YYYY-MM-DD 형식)",
      "day": "요일 (월/화/수/목/금)",
      "subject": "과목명",
      "start_time": "시작시간 (HH:MM)",
      "end_time": "종료시간 (HH:MM)",
      "grade": "해당 학년"
    }
  ],
  "exam_scope": [
    {
      "subject": "과목명",
      "scope_text": "시험범위 원문 그대로",
      "chapters": ["단원명1", "단원명2"],
      "pages": "페이지 범위 (예: p.1~p.85)"
    }
  ],
  "performance_assessments": [
    {
      "subject": "과목명",
      "type": "수행평가 유형 (서술형/논술형/실기/포트폴리오/발표 등)",
      "title": "수행평가 제목/내용",
      "ratio": "비율 (숫자만)",
      "period": "시행 시기 (예: 4월 3주)"
    }
  ],
  "notes": "기타 특이사항 (없으면 null)"
}

추출 규칙:

1. 표 형식의 데이터는 각 행을 개별 항목으로 변환
2. 날짜는 반드시 YYYY-MM-DD 형식으로 변환 (예: 4월 22일 → ${CURRENT_YEAR}-04-22)
3. 연도가 명시되지 않으면 현재 연도 사용
4. 과목명은 약어 사용 금지 (수학→수학, 영어→영어, 국어→국어)
5. 범위가 불명확하면 원문 그대로 scope_text에 기록
6. 없는 정보는 빈 배열[] 또는 null로 처리`;

const TEMPLATE_PARSE_PROMPT = `이 시험지 이미지에서 아래 정보를 추출해주세요.

반드시 JSON만 응답하세요.

{
  "total_items": 전체 문항 수(숫자),
  "items": [
    {
      "no": 문항번호(숫자),
      "type": "객관식" 또는 "주관식",
      "points": 배점(숫자),
      "is_essay": 주관식이면 true
    }
  ],
  "total_points": 총점(숫자)
}

규칙:

1. 배점이 명시된 경우 그대로 추출
2. 배점이 없으면 총점/문항수로 균등 배분
3. 주관식(서술형/단답형)은 is_essay:true
4. 문항 번호순으로 정렬`;

function extractMessageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          const text = (part as { text?: unknown }).text;
          return typeof text === "string" ? text : "";
        }
        return "";
      })
      .join("\n")
      .trim();
  }
  return "";
}

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

    const { fileUrl, fileDataUrl, fileType, subjectFilter, schoolName, fileName, fileMimeType } = await req.json();
    const sourceUrl =
      typeof fileDataUrl === "string" && fileDataUrl.startsWith("data:")
        ? fileDataUrl
        : fileUrl;

    if (!sourceUrl || !fileType || (fileType !== 'exam_template' && !schoolName)) {
      return new Response(
        JSON.stringify({ error: fileType === 'exam_template' ? "fileType and a valid file source are required" : "fileType, schoolName, and a valid file source are required" }),
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
      "subject": "과목명 (예: 수학, 영어, 국어 등 대분류)",
      "course_name": "세부 과정명 (예: 공통수학1, 대수, 미적분I, 영어I 등. 고등학교에서만 해당, 중등은 null)",
      "publisher": "출판사",
      "textbook_name": "교과서명",
      "author": "저자명 (문서에 있으면 추출, 없으면 null)"
    }
  ]
}
JSON만 반환하고 다른 텍스트는 포함하지 마세요.`;
    }

    if (fileType === "evaluation_plan") {
      extractionPrompt = `${EXAM_NOTICE_PARSE_SYSTEM_PROMPT}

문서는 ${schoolName}의 시험 공고문 또는 평가계획 문서입니다.
${subjectInstruction}
JSON만 반환하고 다른 텍스트는 포함하지 마세요.`;
    }

    if (fileType === "exam_template") {
      extractionPrompt = TEMPLATE_PARSE_PROMPT;
    }

    if (fileType === "other") {
      extractionPrompt = `
다음은 ${schoolName} 관련 학교 문서입니다.
${subjectInstruction}

이 문서에서 학사/시험/평가/교과서/행사 관련 정보를 자동으로 판별하여 추출해주세요.
가능한 모든 일정, 시험범위, 교과서 정보, 평가 정보를 포함해주세요.

아래 JSON 형식으로 반환해주세요:
{
  "schedules": [
    {
      "schedule_type": "exam|performance|holiday|event|other",
      "title": "일정명",
      "start_date": "YYYY-MM-DD 또는 null",
      "end_date": "YYYY-MM-DD 또는 null",
      "grade": 학년(숫자 또는 null),
      "subject": "과목명 또는 null",
      "description": "상세내용"
    }
  ]
}
일정이 없으면 빈 배열을 반환해주세요. JSON만 반환하고 다른 텍스트는 포함하지 마세요.`;
    }

    if (!extractionPrompt) {
      return new Response(
        JSON.stringify({ error: "Unsupported file type for AI analysis" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiFileUrl = await resolveAiFileUrl(sourceUrl, fileMimeType, fileName);
    const parsedAiDataUrl = parseDataUrl(aiFileUrl);

    if (parsedAiDataUrl && !isSupportedAiMimeType(parsedAiDataUrl.mimeType)) {
      return new Response(
        JSON.stringify({ error: "지원되지 않는 파일 형식입니다. PDF, PNG, JPG, WEBP 파일만 업로드해주세요." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Build messages — PDF data URLs are translated by the gateway to Gemini inlineData
    let contentParts: any[];
    if (isPdfDataUrl(aiFileUrl)) {
      const mimeType = parsedAiDataUrl?.mimeType || "application/pdf";
      const base64Data = parsedAiDataUrl?.base64Data || "";
      contentParts = [
        {
          type: "image_url",
          image_url: { url: `data:${mimeType};base64,${base64Data}` },
        },
        { type: "text", text: extractionPrompt },
      ];
    } else {
      contentParts = [
        { type: "image_url", image_url: { url: aiFileUrl } },
        { type: "text", text: extractionPrompt },
      ];
    }

    const messages: any[] = [{ role: "user", content: contentParts }];

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
          max_tokens: 16384,
          temperature: 0.1,
          response_format: { type: "json_object" },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);

      if (response.status === 413 || errText.includes("too large")) {
        return new Response(
          JSON.stringify({ error: "파일이 너무 큽니다. 5MB 이하의 파일을 사용해주세요." }),
          { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
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
      if (response.status === 400 && errText.includes("Unable to process input image")) {
        return new Response(
          JSON.stringify({ error: "업로드한 시험지를 읽지 못했습니다. PDF 또는 선명한 PNG/JPG 이미지로 다시 시도해주세요." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "AI 분석 실패" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResult = await response.json();
    const responseText = extractMessageText(
      aiResult.choices?.[0]?.message?.content,
    );

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
