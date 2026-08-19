// PARENT-SURVEY-V1: 학부모 설문 알림톡 일괄발송 (솔라피 연동, admin 전용)
// 요청: { student_ids: string[], dry_run?: boolean, test_phone?: string }
// 응답: { results: [...], sent, failed, skipped, template_variables? }
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SURVEY_BASE = 'https://seedling-log.lovable.app/parent/survey';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function maskPhone(phone: string): string {
  const d = (phone || '').replace(/[^0-9]/g, '');
  if (d.length < 7) return '***';
  return `${d.slice(0, 3)}-****-${d.slice(-4)}`;
}

async function solapiAuthHeader(apiKey: string, apiSecret: string) {
  const date = new Date().toISOString();
  const salt = crypto.randomUUID().replace(/-/g, '');
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(apiSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(date + salt));
  const signature = [...new Uint8Array(sigBuf)].map(b => b.toString(16).padStart(2, '0')).join('');
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'missing_auth' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);
    const { data: roleRows } = await admin.from('user_roles').select('role').eq('user_id', user.id);
    const isAdmin = (roleRows ?? []).some((r: any) => r.role === 'admin');
    if (!isAdmin) return json({ error: 'forbidden' }, 403);

    const body = await req.json().catch(() => ({}));
    const studentIds: string[] = Array.isArray(body?.student_ids) ? body.student_ids : [];
    const dryRun = body?.dry_run === true;
    const testPhone = typeof body?.test_phone === 'string' ? body.test_phone.replace(/[^0-9]/g, '') : '';
    if (studentIds.length === 0) return json({ error: 'no_targets' }, 400);
    if (testPhone && studentIds.length !== 1) return json({ error: 'test_requires_single_student' }, 400);

    // 대상 학생 조회 (연락처/토큰은 서버에서만 사용)
    const { data: students, error: sErr } = await admin
      .from('students')
      .select('id, name, parent_phone, parent_token')
      .in('id', studentIds);
    if (sErr) return json({ error: 'student_load_failed', detail: sErr.message }, 500);

    const cfg = {
      SOLAPI_API_KEY: Deno.env.get('SOLAPI_API_KEY'),
      SOLAPI_API_SECRET: Deno.env.get('SOLAPI_API_SECRET'),
      SOLAPI_PFID: Deno.env.get('SOLAPI_PFID'),
      SOLAPI_SENDER: Deno.env.get('SOLAPI_SENDER'),
      ALIMTALK_TEMPLATE_PARENT_SURVEY: Deno.env.get('ALIMTALK_TEMPLATE_PARENT_SURVEY'),
    };
    const missing = Object.entries(cfg).filter(([, v]) => !v).map(([k]) => k);

    const results: any[] = [];
    const messages: any[] = [];
    const messageMeta: { student_id: string; student_name: string }[] = [];
    const previews: any[] = [];

    for (const id of studentIds) {
      const s = (students ?? []).find((x: any) => x.id === id);
      if (!s) {
        results.push({ student_id: id, student_name: '?', ok: false, reason: '학생 정보 없음' });
        continue;
      }
      let token: string | null = s.parent_token;
      if (!token) {
        const { data: newToken } = await admin.rpc('generate_parent_token');
        if (newToken) {
          await admin.from('students').update({ parent_token: newToken }).eq('id', s.id);
          token = newToken as string;
        }
      }
      if (!token) {
        results.push({ student_id: s.id, student_name: s.name, ok: false, reason: '설문 토큰 생성 실패' });
        continue;
      }
      const phone = testPhone || (s.parent_phone || '').replace(/[^0-9]/g, '');
      if (!phone) {
        results.push({ student_id: s.id, student_name: s.name, ok: false, reason: '학부모 연락처 없음' });
        continue;
      }
      const link = `${SURVEY_BASE}?token=${token}`;
      const variables = {
        '#{학생명}': s.name,
        '#{설문링크}': link,
        '#{token}': token,
      };
      previews.push({
        student_id: s.id,
        student_name: s.name,
        phone_masked: maskPhone(phone),
        link,
        variables,
      });
      messages.push({
        to: phone,
        from: cfg.SOLAPI_SENDER!,
        kakaoOptions: {
          pfId: cfg.SOLAPI_PFID!,
          templateId: cfg.ALIMTALK_TEMPLATE_PARENT_SURVEY!,
          variables,
          disableSms: true,
        },
      });
      messageMeta.push({ student_id: s.id, student_name: s.name });
    }

    if (dryRun) {
      return json({
        dry_run: true,
        missing,
        previews,
        results, // 제외 사유만 포함
        target_count: previews.length,
        excluded_count: results.length,
      });
    }

    if (missing.length > 0) return json({ error: 'not_configured', missing });
    if (messages.length === 0) {
      return json({ results, sent: 0, failed: results.length, skipped: results.length });
    }

    const authorization = await solapiAuthHeader(cfg.SOLAPI_API_KEY!, cfg.SOLAPI_API_SECRET!);
    const res = await fetch('https://api.solapi.com/messages/v4/send-many/detail', {
      method: 'POST',
      headers: { Authorization: authorization, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    });
    const resBody = await res.json().catch(() => ({}));

    const okResults: any[] = [];
    if (!res.ok) {
      const detail = resBody?.errorMessage || resBody?.message || `HTTP ${res.status}`;
      for (const m of messageMeta) {
        okResults.push({ student_id: m.student_id, student_name: m.student_name, ok: false, reason: `발송 실패: ${detail}` });
      }
    } else {
      const failedList: any[] = resBody?.failedMessageList ?? [];
      const failedPhones = new Set(failedList.map((f: any) => (f.to || '').replace(/[^0-9]/g, '')));
      const groupId = resBody?.groupInfo?.groupId ?? null;
      messageMeta.forEach((m, i) => {
        const failed = failedPhones.has(messages[i].to);
        okResults.push({
          student_id: m.student_id,
          student_name: m.student_name,
          ok: !failed,
          reason: failed ? '알림톡 발송 실패 (수신 불가)' : undefined,
          provider_message_id: groupId,
        });
      });
    }

    // 테스트 발송은 운영 로그에 기록하지 않음
    if (!testPhone) {
      const rows = okResults.map(r => ({
        student_id: r.student_id,
        sent_by: user.id,
        status: r.ok ? 'sent' : 'failed',
        provider_message_id: r.provider_message_id ?? null,
        error_message: r.ok ? null : (r.reason ?? null),
      }));
      if (rows.length > 0) await admin.from('parent_survey_sends').insert(rows);
    }

    const all = [...okResults, ...results];
    const sent = okResults.filter(r => r.ok).length;
    return json({
      results: all,
      sent,
      failed: okResults.length - sent,
      skipped: results.length,
      test_mode: !!testPhone,
    });
  } catch (e) {
    return json({ error: 'internal', detail: String(e) }, 500);
  }
});
