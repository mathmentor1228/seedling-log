// ATTENDANCE-PARENT-NOTIFY-V1: 담당 교사가 학생별 지각·등원 전 알림톡을 한 건씩 발송한다.
// dry_run은 발송하지 않고 수신자·문구·중복 여부만 반환한다.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3.23.8';
import {
  ATTENDANCE_NOTIFICATION_LABEL,
  buildAttendanceNotificationMessage,
  type AttendanceNotificationType,
} from '../_shared/attendanceNotification.ts';

const BodySchema = z.object({
  student_id: z.string().uuid(),
  notification_type: z.enum(['late', 'not_arrived']),
  subject: z.string().trim().min(1).max(30),
  start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  dry_run: z.boolean().optional().default(false),
  allow_resend: z.boolean().optional().default(false),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 7 ? `${digits.slice(0, 3)}-****-${digits.slice(-4)}` : '연락처 확인 필요';
}

function kstDayBounds(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const date = kst.toISOString().slice(0, 10);
  return {
    start: `${date}T00:00:00+09:00`,
    end: `${date}T23:59:59.999+09:00`,
  };
}

async function solapiAuthHeader(apiKey: string, apiSecret: string) {
  const date = new Date().toISOString();
  const salt = crypto.randomUUID().replace(/-/g, '');
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(apiSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(date + salt));
  const signature = [...new Uint8Array(signatureBuffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

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
    const isAdmin = (roleRows ?? []).some((r) => r.role === 'admin');
    const isTeacher = (roleRows ?? []).some((r) => r.role === 'teacher');
    if (!isAdmin && !isTeacher) return json({ error: 'forbidden' }, 403);

    const rawBody = await req.json().catch(() => ({}));
    // 원장 전용: 출결 템플릿 카테고리 조회·등록·검수 요청 (일회성 관리 작업)
    if (rawBody?.action === 'template_categories' || rawBody?.action === 'register_template') {
      if (!isAdmin) return json({ error: 'forbidden' }, 403);
      const apiKey = Deno.env.get('SOLAPI_API_KEY');
      const apiSecret = Deno.env.get('SOLAPI_API_SECRET');
      const pfId = Deno.env.get('SOLAPI_PFID');
      if (!apiKey || !apiSecret || !pfId) return json({ error: 'solapi_not_configured' }, 500);
      const base = 'https://api.solapi.com/kakao/v2/templates';
      if (rawBody.action === 'template_categories') {
        const r = await fetch(`${base}/categories`, { headers: { Authorization: await solapiAuthHeader(apiKey, apiSecret) } });
        return json({ status: r.status, data: await r.json().catch(() => null) });
      }
      const content = [
        '[더멘토학원 출결 안내]',
        '학생: #{학생명}',
        '수업: #{과목} #{수업시간}',
        '상태: #{출결상태}',
        '',
        '#{안내문구}',
        '',
        '담당 선생님: #{선생님명}',
      ].join('\n');
      const createRes = await fetch(base, {
        method: 'POST',
        headers: { Authorization: await solapiAuthHeader(apiKey, apiSecret), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: '출결 알림(지각·등원 전)',
          content,
          categoryCode: String(rawBody.category_code ?? ''),
          channelId: pfId,
          messageType: 'BA',
          emphasizeType: 'NONE',
        }),
      });
      const created = await createRes.json().catch(() => null);
      if (!createRes.ok || !created?.templateId) return json({ step: 'create', status: createRes.status, data: created }, 502);
      const inspRes = await fetch(`${base}/${created.templateId}/inspection`, {
        method: 'PUT',
        headers: { Authorization: await solapiAuthHeader(apiKey, apiSecret) },
      });
      const insp = await inspRes.json().catch(() => null);
      return json({ templateId: created.templateId, inspection_status: inspRes.status, inspection: insp });
    }

    const parsed = BodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return json({ error: 'invalid_request', detail: parsed.error.flatten().fieldErrors }, 400);
    }
    const body = parsed.data;

    if (!isAdmin) {
      const { data: ownsStudent, error: ownershipError } = await admin.rpc('teacher_owns_student', {
        _teacher_id: user.id,
        _student_id: body.student_id,
      });
      if (ownershipError) return json({ error: 'ownership_check_failed', detail: ownershipError.message }, 500);
      if (!ownsStudent) return json({ error: 'forbidden' }, 403);
    }

    const [{ data: student, error: studentError }, { data: profile }] = await Promise.all([
      admin.from('students')
        .select('id, name, parent_phone, parent_name, enrollment_status')
        .eq('id', body.student_id)
        .maybeSingle(),
      admin.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
    ]);
    if (studentError) return json({ error: 'student_load_failed', detail: studentError.message }, 500);
    if (!student) return json({ error: 'student_not_found' }, 404);
    if (student.enrollment_status === '퇴원') return json({ error: 'withdrawn_student' }, 400);

    const phone = String(student.parent_phone || '').replace(/\D/g, '');
    if (!/^01\d{8,9}$/.test(phone)) {
      return json({ error: 'parent_phone_missing', detail: '학생 정보에서 학부모 휴대전화 번호를 먼저 확인해 주세요.' }, 400);
    }

    const teacherName = profile?.full_name || '담당 선생님';
    const type = body.notification_type as AttendanceNotificationType;
    const notificationLabel = ATTENDANCE_NOTIFICATION_LABEL[type];
    const message = buildAttendanceNotificationMessage({
      type,
      studentName: student.name,
      subject: body.subject,
      startTime: body.start_time,
      teacherName,
    });

    const bounds = kstDayBounds();
    const { data: previous, error: previousError } = await admin
      .from('parent_notifications')
      .select('id, timestamp')
      .eq('student_id', student.id)
      .eq('type', notificationLabel)
      .gte('timestamp', bounds.start)
      .lte('timestamp', bounds.end)
      .order('timestamp', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (previousError) return json({ error: 'history_load_failed', detail: previousError.message }, 500);

    const cfg = {
      SOLAPI_API_KEY: Deno.env.get('SOLAPI_API_KEY'),
      SOLAPI_API_SECRET: Deno.env.get('SOLAPI_API_SECRET'),
      SOLAPI_PFID: Deno.env.get('SOLAPI_PFID'),
      SOLAPI_SENDER: Deno.env.get('SOLAPI_SENDER'),
      ALIMTALK_TEMPLATE_ATTENDANCE: Deno.env.get('ALIMTALK_TEMPLATE_ATTENDANCE'),
    };
    const missing = Object.entries(cfg).filter(([, value]) => !value).map(([key]) => key);

    if (body.dry_run) {
      return json({
        preview: {
          student_id: student.id,
          student_name: student.name,
          parent_name: student.parent_name,
          phone_masked: maskPhone(phone),
          teacher_name: teacherName,
          type,
          message,
          variables: {
            '#{학생명}': student.name.replace(/_[A-Z]$/, ''),
            '#{과목}': body.subject,
            '#{수업시간}': body.start_time,
            '#{출결상태}': notificationLabel,
            '#{안내문구}': message.split('\n\n')[1],
            '#{선생님명}': teacherName,
          },
          duplicate: !!previous,
          previous_sent_at: previous?.timestamp ?? null,
          missing,
        },
      });
    }

    if (missing.length > 0) return json({ error: 'not_configured', missing });
    if (previous && !body.allow_resend) {
      return json({ error: 'already_sent', notification_id: previous.id, timestamp: previous.timestamp }, 409);
    }

    const variables = {
      '#{학생명}': student.name.replace(/_[A-Z]$/, ''),
      '#{과목}': body.subject,
      '#{수업시간}': body.start_time,
      '#{출결상태}': notificationLabel,
      '#{안내문구}': message.split('\n\n')[1],
      '#{선생님명}': teacherName,
    };

    const authorization = await solapiAuthHeader(cfg.SOLAPI_API_KEY!, cfg.SOLAPI_API_SECRET!);
    const providerResponse = await fetch('https://api.solapi.com/messages/v4/send-many/detail', {
      method: 'POST',
      headers: { Authorization: authorization, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{
          to: phone,
          from: cfg.SOLAPI_SENDER!,
          kakaoOptions: {
            pfId: cfg.SOLAPI_PFID!,
            templateId: cfg.ALIMTALK_TEMPLATE_ATTENDANCE!,
            variables,
            disableSms: true,
          },
          customFields: { studentId: student.id, notificationType: type },
        }],
      }),
    });
    const providerBody = await providerResponse.json().catch(() => ({}));
    if (!providerResponse.ok) {
      const detail = providerBody?.errorMessage || providerBody?.message || `HTTP ${providerResponse.status}`;
      return json({ error: 'provider_error', detail: `알림톡 발송 실패: ${detail}` }, 502);
    }

    const failed = (providerBody?.failedMessageList ?? [])[0];
    if (failed) {
      const detail = [failed.statusCode, failed.statusMessage || failed.errorMessage || failed.reason].filter(Boolean).join(' ');
      return json({ error: 'provider_error', detail: `알림톡 발송 실패: ${detail || '수신 불가'}` }, 502);
    }

    const { data: saved, error: saveError } = await admin.from('parent_notifications').insert({
      student_id: student.id,
      parent_phone: phone,
      type: notificationLabel,
      message,
    }).select('id, timestamp').single();

    return json({
      ok: true,
      status: 'accepted',
      notification_id: saved?.id ?? null,
      sent_at: saved?.timestamp ?? new Date().toISOString(),
      provider_message_id: providerBody?.groupInfo?.groupId ?? null,
      log_recorded: !saveError,
      warning: saveError ? '알림톡은 접수됐지만 발송 기록 저장에는 실패했습니다.' : null,
    });
  } catch (error) {
    return json({ error: 'internal', detail: String(error) }, 500);
  }
});
