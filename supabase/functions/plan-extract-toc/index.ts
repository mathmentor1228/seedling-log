// LESSON-PLAN-CORE-V1: 교재 목차 이미지 → 챕터+페이지 추출
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { image, mime } = await req.json();
    if (!image || typeof image !== 'string') return json({ error: 'image required' }, 400);
    const dataUrl = image.startsWith('data:') ? image : `data:${mime || 'image/png'};base64,${image}`;

    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) return json({ error: 'LOVABLE_API_KEY missing' }, 500);

    const systemPrompt = `너는 한국 학원 교재의 목차 이미지를 분석해 수업 챕터 목록을 뽑는 도우미다.
반드시 JSON 형식만 응답한다. 설명·마크다운 금지.
스키마: {"chapters":[{"title":"문자열","pages":"p.10-17 형식 또는 빈 문자열"}]}
규칙:
- 대단원/중단원/소단원이 섞여 있으면 실제 수업 단위(중단원 또는 소단원 우선)를 뽑는다.
- 제목은 번호 접두어 유지 (예: "1. 다항식의 연산").
- 페이지가 보이면 "p.시작-끝" 형식. 한 페이지면 "p.32". 없으면 빈 문자열.
- 목차가 아닌 표지·머리말·인덱스는 제외.`;

    const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: '이 목차 이미지를 분석해서 위 스키마의 JSON만 응답해.' },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return json({ error: 'ai_failed', detail: text }, 502);
    }
    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content || '{}';
    let parsed: any = {};
    try { parsed = JSON.parse(content); } catch { parsed = {}; }
    const chapters = Array.isArray(parsed.chapters) ? parsed.chapters : [];
    const clean = chapters
      .map((c: any) => ({
        title: String(c?.title || '').trim(),
        pages: String(c?.pages || '').trim(),
      }))
      .filter((c: any) => c.title);
    return json({ chapters: clean });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
