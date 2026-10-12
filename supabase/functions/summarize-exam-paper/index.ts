// 시험지 분석 자료(원본/학생용/답안해설/교사용 분석지)를 읽어 분석 정리 초안을 만든다. 저장은 하지 않음.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const BodySchema = z.object({ report_id: z.string().uuid() });

function b64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf); let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    if (!token) return json({ error: 'Unauthorized' }, 401);
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: { user } } = await sb.auth.getUser(token);
    if (!user) return json({ error: 'Unauthorized' }, 401);
    const { data: roles } = await sb.from('user_roles').select('role').eq('user_id', user.id);
    if (!(roles || []).some((r: any) => ['admin', 'teacher', 'assistant'].includes(r.role))) return json({ error: '권한이 없습니다' }, 403);

    const { data: r } = await sb.from('exam_analysis_reports').select('*').eq('id', parsed.data.report_id).maybeSingle();
    if (!r) return json({ error: '분석보고서를 찾을 수 없습니다' }, 404);

    const slots: [string, string | null][] = [
      ['교사용 분석지', r.teacher_analysis_pdf_path], ['원본 시험지', r.original_pdf_path],
      ['답안·해설지', r.answer_pdf_path], ['학생용 시험지', r.student_paper_path],
    ];
    const content: any[] = [];
    let total = 0;
    for (const [label, path] of slots) {
      if (!path) continue;
      const { data: blob } = await sb.storage.from('exam-analysis').download(path);
      if (!blob) continue;
      if (total + blob.size > 18_000_000) continue;
      total += blob.size;
      const isPdf = path.toLowerCase().endsWith('.pdf') || blob.type === 'application/pdf';
      const mime = isPdf ? 'application/pdf' : (blob.type || 'image/jpeg');
      const dataUrl = `data:${mime};base64,${b64(await blob.arrayBuffer())}`;
      content.push({ type: 'text', text: `[${label}]` });
      content.push(isPdf ? { type: 'file', file: { filename: `${label}.pdf`, file_data: dataUrl } } : { type: 'image_url', image_url: { url: dataUrl } });
    }
    if (content.length === 0) return json({ error: '읽을 자료가 없습니다. 먼저 시험지나 분석지를 올려 주세요.' }, 400);

    const prompt = `${r.school_name} ${r.grade} ${r.subject} ${r.exam_year ?? ''} ${r.exam_type ?? ''} 시험 자료입니다.
교사용 분석지가 있으면 그 내용을 가장 우선으로 하고, 없으면 시험지·해설지를 직접 분석하세요.
JSON 하나만 출력:
{"exam_difficulty":"매우쉬움|쉬움|중|어려움|매우어려움 중 하나 또는 빈 문자열","avg_score":숫자 또는 null(자료에 있을 때만),
"overall_review":"출제 경향 총평 3~5문장","focus_summary":"어떤 부분 위주로 출제됐는지","tricky_points":"까다로운 포인트(문항 번호 포함)",
"items":[{"item_number":1,"points":숫자 또는 null,"unit_name":"단원","question_type":"객관식|서술형 등","difficulty":"하|중하|중|중상|상|매우어려움","note":"까다로운 이유·출제 포인트 한 줄"}]}
모든 문항을 빠짐없이 포함하세요.`;
    content.unshift({ type: 'text', text: prompt });

    const ai = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('LOVABLE_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'google/gemini-3-flash-preview', messages: [{ role: 'user', content }], response_format: { type: 'json_object' } }),
    });
    if (!ai.ok) {
      const t = await ai.text();
      const msg = ai.status === 429 ? '요청이 많아요. 잠시 후 다시 시도해 주세요.' : ai.status === 402 ? 'AI 크레딧이 부족합니다.' : `AI 오류 (${ai.status})`;
      console.error(ai.status, t);
      return json({ error: msg }, ai.status);
    }
    const out = await ai.json();
    const text: string = out.choices?.[0]?.message?.content || '';
    const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    let result: any;
    try { result = JSON.parse(cleaned); } catch { result = JSON.parse(cleaned.slice(cleaned.indexOf('{'), cleaned.lastIndexOf('}') + 1)); }
    return json({ result });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
