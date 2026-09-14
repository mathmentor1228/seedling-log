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
    if (testPhone && (studentIds.length < 1 || studentIds.length > 3)) return json({ error: 'test_requires_1_to_3_students' }, 400);
    const allowResend = body?.allow_resend === true;

    // 대상 학생 조회 (연락처/토큰은 서버에서만 사용)
    const { data: students, error: sErr } = await admin
      .from('students')
      .select('id, name, parent_phone, parent_token')
      .in('id', studentIds);
    if (sErr) return json({ error: 'student_load_failed', detail: sErr.message }, 500);

    // 이미 성공 발송된 학생은 allow_resend 없이는 다시 보내지 않는다 (형제 재발송 때 나머지 학부모에게 두 번 가는 사고 방지).
    const { data: priorSends } = testPhone
      ? { data: [] as any[] }
      : await admin.from('parent_survey_sends').select('student_id, sent_at').eq('status', 'sent').in('student_id', studentIds);
    const alreadySent = new Map<string, string>((priorSends ?? []).map((r: any) => [r.student_id, String(r.sent_at).slice(0, 10)]));

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
      if (!allowResend && alreadySent.has(s.id)) {
        results.push({ student_id: s.id, student_name: s.name, ok: false, reason: `이미 발송됨 (${alreadySent.get(s.id)})` });
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
      // 알림톡은 템플릿에 등록된 변수만 허용한다. 승인 템플릿(학부모설문안내)은
      // 본문의 #{학생명}과 버튼 링크의 #{token}만 쓰므로 #{설문링크}는 보내지 않는다.
      // link 자체는 아래 dry_run 미리보기에서 계속 쓴다.
      const variables = {
        '#{학생명}': String(s.name || '').replace(/_.*$/, ''),
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
        // 학생별 결과를 전화번호가 아니라 학생 ID로 되짚기 위해 붙인다 (형제는 번호가 같다).
        customFields: { studentId: s.id },
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
      // allowDuplicates: 형제·자매는 학부모 번호가 같아도 아이별로 각각 받아야 한다. 없으면 솔라피가 1026(중복 수신번호)으로 한 건만 남긴다.
      body: JSON.stringify({ messages, allowDuplicates: true }),
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
      // 솔라피가 준 실패 사유를 그대로 보여준다. '수신 불가'로 뭉개면 템플릿 미승인·변수 불일치·번호 문제를 구분할 수 없다.
      const failedReasonByPhone = new Map<string, string>(
        failedList.map((f: any) => [
          (f.to || '').replace(/[^0-9]/g, ''),
          [f.statusCode, f.statusMessage || f.errorMessage || f.reason].filter(Boolean).join(' '),
        ]),
      );
      const groupId = resBody?.groupInfo?.groupId ?? null;

      // 학생 ID → 최종 상태. 카카오 미사용(3104) 같은 지연 실패까지 잡기 위해 잠시 기다린 뒤 그룹 메시지 목록을 읽는다.
      const finalByStudent = new Map<string, { code: string; message: string }>();
      if (groupId) {
        try {
          await new Promise((r) => setTimeout(r, 3000));
          const listAuth = await solapiAuthHeader(cfg.SOLAPI_API_KEY!, cfg.SOLAPI_API_SECRET!);
          const lr = await fetch(`https://api.solapi.com/messages/v4/list?groupId=${encodeURIComponent(groupId)}&limit=500`, {
            headers: { Authorization: listAuth },
          });
          if (lr.ok) {
            const lj = await lr.json().catch(() => ({}));
            for (const msg of Object.values((lj?.messageList ?? {}) as Record<string, any>)) {
              const sid = msg?.customFields?.studentId;
              if (sid) finalByStudent.set(String(sid), { code: String(msg.statusCode ?? ''), message: String(msg.statusMessage ?? '') });
            }
          }
        } catch (e) {
          console.warn('[send-parent-survey] 최종 상태 조회 실패, 즉시 응답 기준으로 기록:', String(e));
        }
      }
      // 1xxx = 등록 실패, 3xxx(3000 제외) = 발송 실패. 2000/3000/4000 은 접수·발송중·수신완료.
      const isFailCode = (c: string) => /^1\d{3}$/.test(c) || (/^3\d{3}$/.test(c) && c !== '3000');

      messageMeta.forEach((m, i) => {
        const fin = finalByStudent.get(m.student_id);
        let failed: boolean;
        let reason: string | undefined;
        if (fin) {
          failed = isFailCode(fin.code);
          reason = failed ? `알림톡 발송 실패: ${[fin.code, fin.message].filter(Boolean).join(' ')}` : undefined;
        } else {
          failed = failedPhones.has(messages[i].to);
          reason = failed ? `알림톡 발송 실패: ${failedReasonByPhone.get(messages[i].to) || '사유 미제공 (수신 불가 추정)'}` : undefined;
        }
        okResults.push({
          student_id: m.student_id,
          student_name: m.student_name,
          ok: !failed,
          reason,
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
