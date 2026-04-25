const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function parseDataUrl(value: unknown): { mimeType: string; base64Data: string } | null {
  if (typeof value !== 'string' || !value.startsWith('data:')) return null;
  const commaIndex = value.indexOf(',');
  if (commaIndex < 0) return null;
  const header = value.slice(5, commaIndex);
  const payload = value.slice(commaIndex + 1);
  if (!header.toLowerCase().includes(';base64') || !payload) return null;
  return { mimeType: header.replace(/;base64$/i, '').trim() || 'application/octet-stream', base64Data: payload };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) throw new Error('LOVABLE_API_KEY is not configured');

    const { fileDataUrl, fileMimeType, subject, totalItems } = await req.json();
    const parsed = parseDataUrl(fileDataUrl);
    const mimeType = parsed?.mimeType || fileMimeType || '';
    if (!parsed || (!mimeType.startsWith('image/') && mimeType !== 'application/pdf')) {
      return new Response(JSON.stringify({ error: '이미지 또는 PDF 답지만 업로드할 수 있습니다.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const prompt = `이 ${subject ?? ''} 답지에서 각 문항의 정답을 추출해주세요. 반드시 JSON만 응답하세요.
{
  "answers": { "1": "정답값", "2": "정답값" },
  "total_items": 총문항수
}
규칙: 객관식은 1~5 번호만, 주관식/서술형은 정답 텍스트 그대로, 정답이 없는 문항은 null, 문항 번호를 정확히 매핑하세요.${totalItems ? ` 총 ${totalItems}문항 기준으로 확인하세요.` : ''}`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: `data:${mimeType};base64,${parsed.base64Data}` } }, { type: 'text', text: prompt }] }],
        temperature: 0.1,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      const error = response.status === 429 ? 'AI 요청 한도 초과. 잠시 후 다시 시도해주세요.' : response.status === 402 ? 'AI 크레딧이 부족합니다.' : '정답 추출 실패';
      console.error('extract-answer-key AI error:', response.status, text);
      return new Response(JSON.stringify({ error }), { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const data = await response.json();
    const text = String(data.choices?.[0]?.message?.content ?? '').replace(/```json|```/g, '').trim();
    const result = JSON.parse(text || '{}');
    return new Response(JSON.stringify({ answers: result.answers ?? {}, total_items: result.total_items ?? null }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('extract-answer-key error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});