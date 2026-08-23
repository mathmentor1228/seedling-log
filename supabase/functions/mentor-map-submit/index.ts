// MENTOR-MAP-V1: 공개 상담 신청 제출 전용 엔드포인트
// - anon 은 이 함수를 통해서만 INSERT 가능 (테이블 직접 권한 없음)
// - 목록 조회/수정/삭제 기능 없음
// - 서버 검증: 필수값, enum, 길이 제한, 전화번호 형식, rate limit, idempotency
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const AUTHOR_TYPES = ['student', 'parent', 'both'];
const SCHOOL_LEVELS = ['elementary', 'middle', 'high'];
const CONTACT_OWNERS = ['parent', 'student'];
const MAX_TEXT = 200;
const MAX_NOTE = 2000;

function clean(v: unknown, max = MAX_TEXT): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function cleanArray(v: unknown, max = 12): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === 'string').map((x) => x.trim().slice(0, 60)).slice(0, max);
}

function cleanJson(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (Object.keys(out).length >= 80) break;
    if (typeof val === 'string') out[k.slice(0, 60)] = val.slice(0, MAX_NOTE);
    else if (typeof val === 'number' || typeof val === 'boolean' || val === null) out[k.slice(0, 60)] = val;
    else if (Array.isArray(val)) out[k.slice(0, 60)] = cleanArray(val, 20);
    else if (typeof val === 'object') out[k.slice(0, 60)] = cleanJson(val);
  }
  return out;
}

function normalizePhone(p: unknown): string {
  const digits = String(p ?? '').replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('1')) return '0' + digits;
  return digits;
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return json({ error: 'invalid_body' }, 400);

    const student_name = clean((body as any).student_name, 40);
    const author_type = clean((body as any).author_type, 20);
    const school_level = clean((body as any).school_level, 20);
    const contact_owner = clean((body as any).contact_owner, 20) || 'parent';
    const contact_phone = normalizePhone((body as any).contact_phone);
    const consent = (body as any).consent === true;

    if (!student_name) return json({ error: 'student_name_required' }, 400);
    if (!AUTHOR_TYPES.includes(author_type)) return json({ error: 'invalid_author_type' }, 400);
    if (!SCHOOL_LEVELS.includes(school_level)) return json({ error: 'invalid_school_level' }, 400);
    if (!CONTACT_OWNERS.includes(contact_owner)) return json({ error: 'invalid_contact_owner' }, 400);
    if (!/^01[0-9]{8,9}$/.test(contact_phone)) return json({ error: 'invalid_phone' }, 400);
    if (!consent) return json({ error: 'consent_required' }, 400);

    const payload = {
      student_name,
      author_type,
      school_level,
      contact_owner,
      contact_phone,
      school_name: clean((body as any).school_name, 60) || null,
      grade: clean((body as any).grade, 20) || null,
      subjects: cleanArray((body as any).subjects),
      priority_subjects: cleanArray((body as any).priority_subjects, 2),
      preferred_method: clean((body as any).preferred_method, 40) || null,
      preferred_time: clean((body as any).preferred_time, 40) || null,
      student_answers: cleanJson((body as any).student_answers),
      parent_answers: cleanJson((body as any).parent_answers),
      subject_answers: cleanJson((body as any).subject_answers),
      score_info: cleanJson((body as any).score_info),
      comm_pref: cleanJson((body as any).comm_pref),
      free_note: clean((body as any).free_note, MAX_NOTE) || null,
      consent_at: new Date().toISOString(),
    };

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // idempotency: 클라이언트 제출 키 + 핵심 필드 해시
    const clientKey = clean((body as any).idempotency_key, 64);
    const submission_hash = await sha256(
      `${clientKey}|${student_name}|${contact_phone}|${author_type}|${school_level}`,
    );

    const { data: existing } = await admin
      .from('mentor_map_requests')
      .select('id')
      .eq('submission_hash', submission_hash)
      .maybeSingle();
    if (existing) return json({ ok: true, duplicate: true, id: existing.id });

    // rate limit: 동일 연락처 10분 내 3건 초과 차단
    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count } = await admin
      .from('mentor_map_requests')
      .select('id', { count: 'exact', head: true })
      .eq('contact_phone', contact_phone)
      .gte('created_at', since);
    if ((count ?? 0) >= 3) return json({ error: 'rate_limited' }, 429);

    const { data, error } = await admin
      .from('mentor_map_requests')
      .insert({ ...payload, submission_hash })
      .select('id')
      .single();

    if (error) {
      console.error('mentor_map_insert_failed', error.code);
      return json({ error: 'insert_failed' }, 500);
    }

    return json({ ok: true, id: data.id });
  } catch (e) {
    console.error('mentor_map_unexpected', (e as Error).name);
    return json({ error: 'unexpected' }, 500);
  }
});
