// TEXTBOOK-BILL-V1: 교재비 청구 알림톡 발송 (솔라피 연동)
// 요청: { targets: [{ student_id: string, dist_ids: string[] }], mode: 'before' | 'after' }
// 응답: { results: [{ student_id, student_name, ok, reason? }], sent, failed }
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const ACCOUNT_INFO = '카카오 3333156191775 최윤기';

// /pay-info 페이지용 base64url 인코딩 — { s: 학생명, a: 금액, n: 입금자명 }
function encodePayData(studentName: string, amount: number, depositor: string): string {
  const jsonBytes = new TextEncoder().encode(JSON.stringify({ s: studentName, a: amount, n: depositor }));
  const b64 = btoa(String.fromCharCode(...jsonBytes));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
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
    const allowed = (roleRows ?? []).some((r: any) => r.role === 'admin' || r.role === 'teacher');
    if (!allowed) return json({ error: 'forbidden' }, 403);

    // 솔라피 설정 확인 — 미설정이면 어떤 키가 비었는지 알려줌
    const cfg = {
      SOLAPI_API_KEY: Deno.env.get('SOLAPI_API_KEY'),
      SOLAPI_API_SECRET: Deno.env.get('SOLAPI_API_SECRET'),
      SOLAPI_PFID: Deno.env.get('SOLAPI_PFID'),
      SOLAPI_SENDER: Deno.env.get('SOLAPI_SENDER'),
      ALIMTALK_TEMPLATE_BEFORE: Deno.env.get('ALIMTALK_TEMPLATE_BEFORE'),
      ALIMTALK_TEMPLATE_AFTER: Deno.env.get('ALIMTALK_TEMPLATE_AFTER'),
    };
    const missing = Object.entries(cfg).filter(([, v]) => !v).map(([k]) => k);
    // 200으로 반환 — 클라이언트가 안내 메시지를 바로 보여줄 수 있게 (예상 가능한 상태이므로 에러 아님)
    if (missing.length > 0) return json({ error: 'not_configured', missing });

    const { targets, mode } = await req.json();
    if (!Array.isArray(targets) || targets.length === 0) return json({ error: 'no_targets' }, 400);
    if (mode !== 'before' && mode !== 'after') return json({ error: 'bad_mode' }, 400);

    const templateId = mode === 'after' ? cfg.ALIMTALK_TEMPLATE_AFTER! : cfg.ALIMTALK_TEMPLATE_BEFORE!;

    const allDistIds = targets.flatMap((t: any) => t.dist_ids as string[]);
    const { data: dists, error: distErr } = await admin
      .from('textbook_distributions')
      .select('id, student_id, student_name, total_amount, payment_status, textbook_orders(textbook_name, subject)')
      .in('id', allDistIds);
    if (distErr) return json({ error: 'dist_load_failed', detail: distErr.message }, 500);

    const studentIds = [...new Set((dists ?? []).map((d: any) => d.student_id))];
    const { data: students } = await admin
      .from('students').select('id, name, parent_phone, parent_name').in('id', studentIds);
    const studentMap = new Map((students ?? []).map((s: any) => [s.id, s]));

    const results: any[] = [];
    const messages: any[] = [];
    const messageMeta: { student_id: string; dist_ids: string[] }[] = [];

    for (const target of targets) {
      const targetDists = (dists ?? []).filter((d: any) =>
        target.dist_ids.includes(d.id) && d.payment_status === '미납');
      const student = studentMap.get(target.student_id);
      const studentName = targetDists[0]?.student_name || student?.name || '?';

      if (targetDists.length === 0) {
        results.push({ student_id: target.student_id, student_name: studentName, ok: false, reason: '미납 건 없음' });
        continue;
      }
      const phone = (student?.parent_phone || '').replace(/[^0-9]/g, '');
      if (!phone) {
        results.push({ student_id: target.student_id, student_name: studentName, ok: false, reason: '학부모 연락처 없음' });
        continue;
      }

      const itemList = targetDists.map((d: any, i: number) => {
        const name = d.textbook_orders?.textbook_name || '교재';
        const subject = d.textbook_orders?.subject ? `[${d.textbook_orders.subject}] ` : '';
        return `${i + 1}. ${subject}${name} : ${Number(d.total_amount).toLocaleString()}원`;
      }).join('\n');
      const total = targetDists.reduce((s: number, d: any) => s + Number(d.total_amount), 0);
      const parentName = student?.parent_name;
      const depositor = parentName && parentName !== studentName
        ? `"${studentName}" 또는 "${parentName}"` : `"${studentName}"`;

      messages.push({
        to: phone,
        from: cfg.SOLAPI_SENDER!,
        kakaoOptions: {
          pfId: cfg.SOLAPI_PFID!,
          templateId,
          variables: {
            '#{학생명}': studentName,
            '#{교재내역}': itemList,
            '#{합계금액}': total.toLocaleString(),
            '#{계좌안내}': ACCOUNT_INFO,
            '#{입금자명}': depositor,
            // v2 템플릿의 "계좌·금액 복사" 버튼 링크 파라미터 (v1 템플릿에서는 무시됨)
            '#{결제정보}': encodePayData(studentName, total, studentName),
          },
          disableSms: true,
        },
      });
      messageMeta.push({ student_id: target.student_id, dist_ids: targetDists.map((d: any) => d.id) });
      results.push({ student_id: target.student_id, student_name: studentName, ok: true });
    }

    if (messages.length > 0) {
      const authorization = await solapiAuthHeader(cfg.SOLAPI_API_KEY!, cfg.SOLAPI_API_SECRET!);
      const res = await fetch('https://api.solapi.com/messages/v4/send-many/detail', {
        method: 'POST',
        headers: { Authorization: authorization, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        // 전체 실패 — 발송 성공으로 표시했던 것들을 실패로 뒤집음
        const detail = body?.errorMessage || body?.message || `HTTP ${res.status}`;
        for (const r of results) if (r.ok) { r.ok = false; r.reason = `발송 실패: ${detail}`; }
        return json({ results, sent: 0, failed: results.length });
      }

      // 개별 실패 반영 (솔라피는 건별 결과를 groupInfo/failedMessageList로 반환)
      const failedList: any[] = body?.failedMessageList ?? [];
      const failedPhones = new Set(failedList.map((f: any) => (f.to || '').replace(/[^0-9]/g, '')));
      messages.forEach((m, i) => {
        if (failedPhones.has(m.to)) {
          const r = results.find(x => x.student_id === messageMeta[i].student_id && x.ok);
          if (r) { r.ok = false; r.reason = '알림톡 발송 실패 (수신 불가)'; }
        }
      });

      // 발송 성공 건만 billed_at 기록
      const now = new Date().toISOString();
      const okDistIds = messageMeta
        .filter((_, i) => !failedPhones.has(messages[i].to))
        .flatMap(m => m.dist_ids);
      if (okDistIds.length > 0) {
        await admin.from('textbook_distributions').update({ billed_at: now }).in('id', okDistIds);
      }
    }

    const sent = results.filter(r => r.ok).length;
    return json({ results, sent, failed: results.length - sent });
  } catch (e) {
    return json({ error: 'internal', detail: String(e) }, 500);
  }
});
