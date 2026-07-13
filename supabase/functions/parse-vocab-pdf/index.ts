import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import JSZip from "npm:jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---- text extractors ----

function extractTextFromWordXml(xml: string): string {
  // preserve paragraph boundaries so day markers survive
  const withBreaks = xml
    .replace(/<w:tab[^\/]*\/>/g, "\t")
    .replace(/<w:br[^\/]*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n</w:p>");
  const paragraphs = withBreaks.split(/\n/);
  const lines: string[] = [];
  for (const p of paragraphs) {
    const parts = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) =>
      m[1]
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'"),
    );
    const line = parts.join("").replace(/\s+/g, " ").trim();
    if (line) lines.push(line);
  }
  return lines.join("\n");
}

function extractTextFromHwpxXml(xml: string): string {
  const withBreaks = xml.replace(/<\/hp:p>/g, "\n</hp:p>");
  const paragraphs = withBreaks.split(/\n/);
  const lines: string[] = [];
  for (const p of paragraphs) {
    const parts = [...p.matchAll(/<hp:t[^>]*>([\s\S]*?)<\/hp:t>/g)].map((m) =>
      m[1]
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'"),
    );
    const line = parts.join("").replace(/\s+/g, " ").trim();
    if (line) lines.push(line);
  }
  return lines.join("\n");
}

function detectDayLabelsFromText(text: string): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);

  for (const line of lines) {
    const match = line.match(/^(?:[\[\(【\{]?\s*)?(?:day|chapter|unit|week|데이)\s*0*(\d{1,2})(?:\s*[\]\)】\}]?)?(?:\b|\s|[:.\-])/i)
      || line.match(/^(?:[\[\(【\{]?\s*)?0*(\d{1,2})\s*(?:일차|회차|회)(?:\s*[\]\)】\}]?)?(?:\b|\s|[:.\-])/i);
    if (!match) continue;
    const label = `Day ${Number(match[1])}`;
    if (!seen.has(label)) {
      seen.add(label);
      labels.push(label);
    }
  }

  return labels;
}

function splitWordsByLabels(
  words: Array<{ english: string; meaning: string; sort_order: number }>,
  labels: string[],
): Array<Array<{ english: string; meaning: string; sort_order: number }>> {
  const count = labels.length;
  const baseSize = Math.floor(words.length / count);
  const remainder = words.length % count;
  const chunks: T[][] = [];
  let cursor = 0;

  for (let i = 0; i < count; i++) {
    const size = baseSize + (i < remainder ? 1 : 0);
    chunks.push(words.slice(cursor, cursor + size).map((word, idx) => ({ ...word, sort_order: idx })));
    cursor += size;
  }

  return chunks;
}

async function extractText(
  file: File,
): Promise<{ kind: "text"; text: string } | { kind: "pdf"; base64: string }> {
  const name = file.name.toLowerCase();
  const buf = new Uint8Array(await file.arrayBuffer());

  if (name.endsWith(".pdf")) {
    let binary = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < buf.length; i += CHUNK) {
      binary += String.fromCharCode(...buf.subarray(i, i + CHUNK));
    }
    return { kind: "pdf", base64: btoa(binary) };
  }

  if (name.endsWith(".docx")) {
    const zip = await JSZip.loadAsync(buf);
    const doc = zip.file("word/document.xml");
    if (!doc) throw new Error("Invalid .docx: word/document.xml not found");
    const xml = await doc.async("string");
    return { kind: "text", text: extractTextFromWordXml(xml) };
  }

  if (name.endsWith(".hwpx")) {
    const zip = await JSZip.loadAsync(buf);
    let text = "";
    for (const [entryName, entry] of Object.entries(zip.files)) {
      if (/^Contents\/section\d+\.xml$/i.test(entryName)) {
        // deno-lint-ignore no-explicit-any
        const xml = await (entry as any).async("string");
        text += extractTextFromHwpxXml(xml) + "\n";
      }
    }
    if (!text.trim()) throw new Error("Could not read .hwpx contents");
    return { kind: "text", text };
  }

  if (name.endsWith(".doc")) {
    // Only Word 2003 XML package format is supported for legacy .doc
    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    if (
      decoded.includes("mso-application") ||
      decoded.includes("<w:document") ||
      decoded.includes("<pkg:package")
    ) {
      return { kind: "text", text: extractTextFromWordXml(decoded) };
    }
    throw new Error(
      "레거시 바이너리 .doc 형식은 지원되지 않습니다. .docx 또는 PDF로 변환 후 업로드해주세요.",
    );
  }

  if (name.endsWith(".hwp")) {
    throw new Error(
      "레거시 .hwp 형식은 지원되지 않습니다. .hwpx 또는 PDF로 변환 후 업로드해주세요.",
    );
  }

  throw new Error("지원되지 않는 파일 형식입니다. (pdf, docx, doc, hwpx)");
}

// ---- AI parsing ----

const SYSTEM_PROMPT = `You extract vocabulary word lists from Korean study materials (test sheets or answer sheets).

Return ONLY a JSON object with this exact shape (no markdown, no explanation):
{
  "days": [
    { "label": "Day 1", "words": [ { "english": "...", "meaning": "..." } ] },
    { "label": "Day 2", "words": [ ... ] }
  ]
}

Rules:
1. Detect "Day N", "DAY N", "데이 N", "N일차", "N회", "Chapter N", "Unit N", "Week N" style headers and use them as day labels. If the document contains Day 1 through Day 10, return exactly 10 day objects. Do not merge multiple days into one "전체" entry. If none exist, put everything in a single day with label "전체".
2. Prefer answer sheets (답안지) when present — they include the correct meanings.
3. For English→Korean items (e.g. "1. goal - 목표"), english is "goal", meaning is "목표".
4. For Korean→English items, swap so english is always the English word/phrase.
5. Strip numbering (1., 2., etc.), section headers, and formatting artifacts.
6. Meaning may be multiple senses joined with comma or semicolon — keep as-is.
7. Never invent words. If unsure, skip.`;

async function callAI(payload: {
  kind: "text" | "pdf";
  text?: string;
  base64?: string;
}) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

  const userContent: unknown[] =
    payload.kind === "pdf"
      ? [
          { type: "text", text: "Extract the vocabulary list following the rules." },
          {
            type: "image_url",
            image_url: { url: `data:application/pdf;base64,${payload.base64}` },
          },
        ]
      : [
          {
            type: "text",
            text:
              "Extract the vocabulary list following the rules. Raw text extracted from the document:\n\n" +
              (payload.text ?? "").slice(0, 60000),
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
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        temperature: 0.1,
        max_tokens: 12000,
      }),
    },
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`AI gateway error ${response.status}: ${err}`);
  }
  const result = await response.json();
  const content: string = result.choices?.[0]?.message?.content ?? "";

  // strip markdown fences
  let jsonStr = content.trim();
  const fence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) jsonStr = fence[1].trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    const objMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!objMatch) throw new Error("AI response is not valid JSON");
    parsed = JSON.parse(objMatch[0]);
  }
  return parsed;
}

// ---- main ----

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return jsonResponse({ error: "file is required" }, 400);

    const extracted = await extractText(file);

    // If text extraction returned only a few chars, likely empty document
    if (extracted.kind === "text" && extracted.text.trim().length < 10) {
      return jsonResponse(
        { error: "문서에서 텍스트를 찾을 수 없습니다." },
        400,
      );
    }

    const parsed = await callAI(extracted) as {
      days?: Array<{ label?: string; words?: Array<{ english: string; meaning: string }> }>;
      words?: Array<{ english: string; meaning: string }>;
    };
    const detectedLabels = extracted.kind === "text" ? detectDayLabelsFromText(extracted.text) : [];

    // Normalize response
    let days: Array<{ label: string; words: Array<{ english: string; meaning: string; sort_order: number }> }> = [];
    if (Array.isArray(parsed?.days) && parsed.days.length > 0) {
      days = parsed.days.map((d, di) => ({
        label: (d.label || `Day ${di + 1}`).toString().trim() || `Day ${di + 1}`,
        words: (d.words || [])
          .filter((w) => w?.english && w?.meaning)
          .map((w, i) => ({
            english: String(w.english).trim(),
            meaning: String(w.meaning).trim(),
            sort_order: i,
          })),
      }));
    } else if (Array.isArray(parsed?.words)) {
      // Backwards-compat
      days = [
        {
          label: "전체",
          words: parsed.words
            .filter((w) => w?.english && w?.meaning)
            .map((w, i) => ({
              english: String(w.english).trim(),
              meaning: String(w.meaning).trim(),
              sort_order: i,
            })),
        },
      ];
    }

    days = days.filter((d) => d.words.length > 0);
    if (days.length === 0) {
      return jsonResponse({ error: "단어를 추출할 수 없습니다." }, 400);
    }

    const isSingleGenericDay = days.length === 1 && /^(전체|all|전체\s*단어)$/i.test(days[0].label.trim());
    if (isSingleGenericDay && detectedLabels.length > 1 && days[0].words.length >= detectedLabels.length) {
      const chunks = splitWordsByLabels(days[0].words, detectedLabels);
      days = detectedLabels.map((label, idx) => ({ label, words: chunks[idx] ?? [] })).filter((d) => d.words.length > 0);
    }

    const totalCount = days.reduce((s, d) => s + d.words.length, 0);

    // Backwards-compat: also return flat words array (concatenated)
    const flatWords = days.flatMap((d) =>
      d.words.map((w) => ({ english: w.english, meaning: w.meaning })),
    ).map((w, i) => ({ ...w, sort_order: i }));

    return jsonResponse({
      days,
      words: flatWords,
      count: totalCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("parse-vocab-pdf error:", message);
    return jsonResponse({ error: message }, 500);
  }
});
