import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return new Response(JSON.stringify({ error: "file is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Convert PDF to base64
    const arrayBuffer = await file.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

    const prompt = `You are a vocabulary extraction expert. Extract ALL word-meaning pairs from this PDF vocabulary test/answer sheet.

Rules:
1. Look for answer sheets (답안지) first - they contain both the word AND its meaning/answer filled in.
2. If no answer sheet, extract from test pages - the numbered items with blanks.
3. For English→Korean items (e.g. "1. goal - 목표"), output: english word | korean meaning
4. For Korean→English items (e.g. "62. 준비가 된 - prepared"), output: english word | korean meaning (swap them so english is first)
5. Remove numbering (1., 2., etc.)
6. Remove blank lines and formatting artifacts
7. Do NOT include section headers, instructions, or metadata

Output ONLY a JSON array of objects with "english" and "meaning" fields. No markdown, no explanation.
Example: [{"english":"goal","meaning":"목표, 목적(지); 골, 득점"},{"english":"prepared","meaning":"준비가 된"}]`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "user", content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:application/pdf;base64,${base64}` } },
          ]},
        ],
        temperature: 0.1,
        max_tokens: 8000,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`AI API error: ${response.status} - ${errText}`);
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || "";

    // Extract JSON from response (may be wrapped in markdown code block)
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    let words;
    try {
      words = JSON.parse(jsonStr);
    } catch {
      // Try to find array in content
      const arrayMatch = content.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        words = JSON.parse(arrayMatch[0]);
      } else {
        throw new Error("Failed to parse AI response as JSON");
      }
    }

    if (!Array.isArray(words)) throw new Error("Expected array of words");

    // Validate and clean
    const cleaned = words
      .filter((w: any) => w.english && w.meaning)
      .map((w: any, i: number) => ({
        english: String(w.english).trim(),
        meaning: String(w.meaning).trim(),
        sort_order: i,
      }));

    return new Response(JSON.stringify({ words: cleaned, count: cleaned.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("parse-vocab-pdf error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
