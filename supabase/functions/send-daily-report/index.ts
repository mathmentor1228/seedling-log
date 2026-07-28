// DAILY-REPORT-V1: 데일리 학습 안내 알림톡 발송 (솔라피 연동)
// 전날 수업(lesson_records) 기준으로 출결·수업·테스트·숙제·피드백을 학부모에게 발송.
// 요청: { date?: 'YYYY-MM-DD', dryRun?: boolean, testPhone?: string, studentIds?: string[], force?: boolean }
//  - date 생략 시 KST 기준 어제 (매일 14:00 KST 스케줄 실행 전제)
//  - dryRun: 발송 없이 메시지 미리보기만 반환
//  - testPhone: 모든 메시지를 이 번호로만 발송 (실발송 테스트용, 로그 기록 안 함)
//  - force: 이미 발송된 학생도 재발송
// 응답: { results: [{ student_id, student_name, ok, reason?, preview? }], sent, failed, skipped }
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

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

// KST 기준 어제 날짜 (YYYY-MM-DD)
function yesterdayKST(): string {
  const kstNow = new Date(Date.now() + 9 * 3600_000);
  kstNow.setUTCDate(kstNow.getUTCDate() - 1);
  return kstNow.toISOString().slice(0, 10);
}

function formatDateKo(dateStr: string): string {
  // dateStr은 이미 KST 달력 날짜(YYYY-MM-DD) — UTC 자정으로 파싱해 UTC getter로 읽어야
  // 서버 타임존(UTC)에서 하루 밀리지 않는다.
  const d = new Date(dateStr + 'T00:00:00Z');
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일(${days[d.getUTCDay()]})`;
}

function clip(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

const HOMEWORK_RESULT_KO: Record<string, string> = {
  completed: '완료', partial: '일부 완료', not_done: '미완료', unable_to_verify: '확인 불가',
};

// 교사 기록을 학부모용 문장으로 재서술 (00 — 프로젝트 개요 AI 정책: 감정어 금지·150자 이내·~합니다 체)
async function rewriteFeedback(apiKey: string, studentName: string, rawNotes: string): Promise<string> {
  const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-3-flash-preview',
      messages: [
        {
          role: 'system',
          content: '너는 학원의 학습 전략 컨설턴트다. 교사의 수업 기록을 학부모에게 보내는 안내문으로 재서술한다. 규칙: 기록에 있는 사실만 사용(추측·창작 금지), 감정 단어 금지(놀랍게도·정말 열심히·대견하게도 등), 단문, ~합니다 체, 공백 포함 120자 이내, 1~2문장. 학생 이름은 넣지 않는다. 재서술한 문장만 출력한다.',
        },
        { role: 'user', content: `학생: ${studentName}\n교사 기록: ${rawNotes}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`ai_gateway_${res.status}`);
  const body = await res.json();
  const text = (body?.choices?.[0]?.message?.content ?? '').trim();
  if (!text) throw new Error('ai_empty');
  return clip(text, 150);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey);

    // 인증: pg_cron(x-cron-key) 또는 admin/teacher JWT
    const cronKey = req.headers.get('x-cron-key');
    const cronSecret = Deno.env.get('DAILY_REPORT_CRON_SECRET');
    if (!(cronSecret && cronKey === cronSecret)) {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) return json({ error: 'missing_auth' }, 401);
      const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return json({ error: 'unauthorized' }, 401);
      const { data: roleRows } = await admin.from('user_roles').select('role').eq('user_id', user.id);
      const allowed = (roleRows ?? []).some((r: any) => r.role === 'admin' || r.role === 'teacher');
      if (!allowed) return json({ error: 'forbidden' }, 403);
    }

    const cfg = {
      SOLAPI_API_KEY: Deno.env.get('SOLAPI_API_KEY'),
      SOLAPI_API_SECRET: Deno.env.get('SOLAPI_API_SECRET'),
      SOLAPI_PFID: Deno.env.get('SOLAPI_PFID'),
      SOLAPI_SENDER: Deno.env.get('SOLAPI_SENDER'),
      ALIMTALK_TEMPLATE_DAILY: Deno.env.get('ALIMTALK_TEMPLATE_DAILY'),
    };
    const missing = Object.entries(cfg).filter(([, v]) => !v).map(([k]) => k);
    if (missing.length > 0) return json({ error: 'not_configured', missing });
    const lovableKey = Deno.env.get('LOVABLE_API_KEY') ?? '';

    const payload = await req.json().catch(() => ({}));
    const reportDate: string = payload.date || yesterdayKST();
    const dryRun: boolean = !!payload.dryRun;
    const testPhone: string = (payload.testPhone || '').replace(/[^0-9]/g, '');
    const force: boolean = !!payload.force;
    const onlyStudentIds: string[] | null =
      Array.isArray(payload.studentIds) && payload.studentIds.length > 0 ? payload.studentIds : null;

    // 1) 해당 날짜 수업 기록 (휴강 제외)
    let lessonQuery = admin.from('lesson_records')
      .select('student_id, subject, lesson_date, lesson_range, notes, parent_direct_message, attendance_status, lesson_types, homework_status, test_name, test_content, test_result_text, english_pass_fail, test_name_2, test_content_2, test_result_text_2, english_pass_fail_2')
      .eq('lesson_date', reportDate);
    if (onlyStudentIds) lessonQuery = lessonQuery.in('student_id', onlyStudentIds);
    const { data: lessons, error: lessonErr } = await lessonQuery;
    if (lessonErr) return json({ error: 'lesson_load_failed', detail: lessonErr.message }, 500);

    const activeLessons = (lessons ?? []).filter((l: any) => !(l.lesson_types ?? []).includes('휴강'));
    const studentIds = [...new Set(activeLessons.map((l: any) => l.student_id))];
    if (studentIds.length === 0) return json({ results: [], sent: 0, failed: 0, skipped: 0, reportDate, reason: 'no_lessons' });

    const nextDate = new Date(reportDate + 'T00:00:00Z');
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    const nextDateStr = nextDate.toISOString().slice(0, 10);

    // 2) 학생·기발송·테스트·숙제 데이터 병렬 조회
    const [studentsRes, sentRes, testRes, vocabRes, hwCheckedRes, hwAssignedRes, bookLogRes] = await Promise.all([
      admin.from('students').select('id, name, parent_phone, parent_token, enrollment_status').in('id', studentIds),
      admin.from('daily_report_sends').select('student_id').eq('report_date', reportDate).in('student_id', studentIds),
      admin.from('test_records').select('student_id, subject, content, score, passed').eq('test_date', reportDate).in('student_id', studentIds),
      admin.from('vocab_test_results').select('student_id, book_name, day_number, correct_words, total_words, score_percent, passed').eq('test_date', reportDate).in('student_id', studentIds),
      admin.from('homework_assignments').select('student_id, subject, result, checked_at').gte('checked_at', reportDate + 'T00:00:00+09:00').lt('checked_at', nextDateStr + 'T00:00:00+09:00').in('student_id', studentIds),
      admin.from('homework_assignments').select('student_id, subject, content').eq('assigned_date', reportDate).in('student_id', studentIds),
      admin.from('student_book_progress_log').select('student_id, book_title, subject, book_role, from_page, to_page').eq('progress_date', reportDate).in('student_id', studentIds),
    ]);

    const studentMap = new Map((studentsRes.data ?? []).map((s: any) => [s.id, s]));
    const alreadySent = new Set((sentRes.data ?? []).map((r: any) => r.student_id));

    const groupBy = (rows: any[] | null) => {
      const m = new Map<string, any[]>();
      for (const r of rows ?? []) {
        if (!m.has(r.student_id)) m.set(r.student_id, []);
        m.get(r.student_id)!.push(r);
      }
      return m;
    };
    const testsByStudent = groupBy(testRes.data);
    const vocabByStudent = groupBy(vocabRes.data);
    const hwCheckedByStudent = groupBy(hwCheckedRes.data);
    const hwAssignedByStudent = groupBy(hwAssignedRes.data);
    const bookLogByStudent = groupBy(bookLogRes.data);
    const lessonsByStudent = groupBy(activeLessons);

    // 3) 수업계획(plan) 진도 — 그날 실제 나간 교재·단원·페이지 (있으면 lesson_range보다 우선)
    // 기준은 advanced_at(진도 나간 시각): 나중에 검증(verified) 처리돼도 배운 날짜가 보존됨.
    // session_id 기준은 그날 검증받은 과거 단원까지 딸려오므로 쓰지 않는다.
    const planLinesByStudent = new Map<string, Map<string, string[]>>();
    {
      const { data: progress } = await admin.from('plan_goal_progress')
        .select('student_id, status, partial_upto, plan_goals(title, pages, order_index), plan_designs(plan_tracks(textbook, subject))')
        .gte('advanced_at', reportDate + 'T00:00:00+09:00')
        .lt('advanced_at', nextDateStr + 'T00:00:00+09:00')
        .neq('status', 'planned')
        .in('student_id', studentIds);
      // 학생×(과목·교재)별로 단원을 모아 한 줄로
      const grouped = new Map<string, { subject: string; textbook: string; goals: any[] }>();
      for (const row of progress ?? []) {
        const track = (row as any).plan_designs?.plan_tracks;
        if (!track || !row.plan_goals) continue;
        const subject = track.subject || '수학';
        const textbook = track.textbook || '';
        const k = `${row.student_id}|${subject}|${textbook}`;
        if (!grouped.has(k)) grouped.set(k, { subject, textbook, goals: [] });
        grouped.get(k)!.goals.push(row);
      }
      for (const [k, g] of grouped) {
        const sid = k.split('|')[0];
        g.goals.sort((a, b) => (a.plan_goals.order_index ?? 0) - (b.plan_goals.order_index ?? 0));
        const goalTxt = g.goals.map(r => {
          const pages = r.partial_upto ? `~${r.partial_upto}` : (r.plan_goals.pages || '');
          return `${r.plan_goals.title}${pages ? ` (${pages})` : ''}`;
        }).join(', ');
        const line = `· [${g.subject}] ${g.textbook} — ${goalTxt}`;
        if (!planLinesByStudent.has(sid)) planLinesByStudent.set(sid, new Map());
        const bySubject = planLinesByStudent.get(sid)!;
        if (!bySubject.has(g.subject)) bySubject.set(g.subject, []);
        bySubject.get(g.subject)!.push(line);
      }
    }

    const results: any[] = [];
    const messages: any[] = [];
    const messageMeta: { student_id: string; variables: Record<string, string> }[] = [];
    let skipped = 0;

    for (const sid of studentIds) {
      const student = studentMap.get(sid);
      const name = student?.name ?? '?';
      const myLessons = lessonsByStudent.get(sid) ?? [];

      if (!student || student.enrollment_status === '퇴원') { skipped++; continue; }
      if (!force && !testPhone && alreadySent.has(sid)) {
        results.push({ student_id: sid, student_name: name, ok: false, reason: '이미 발송됨' });
        skipped++;
        continue;
      }
      const phone = testPhone || (student.parent_phone || '').replace(/[^0-9]/g, '');
      if (!phone) {
        results.push({ student_id: sid, student_name: name, ok: false, reason: '학부모 연락처 없음' });
        continue;
      }
      if (!student.parent_token) {
        results.push({ student_id: sid, student_name: name, ok: false, reason: '학부모 포털 토큰 없음' });
        continue;
      }

      // 출결: 기록별 출결 상태를 합쳐 중복 제거
      const attendance = [...new Set(myLessons.flatMap((l: any) => l.attendance_status ?? []))].join(', ') || '정상등원';

      // 수업 내역: plan 진도(교재·단원·페이지)가 있으면 우선, 없는 과목만 수업일지 진도 칸으로 폴백
      const myPlanLines = planLinesByStudent.get(sid);
      const planSubjects = new Set(myPlanLines ? [...myPlanLines.keys()] : []);
      const lessonLines = [
        ...(myPlanLines ? [...myPlanLines.values()].flat() : []),
        ...myLessons
          .filter((l: any) => !planSubjects.has(l.subject))
          .map((l: any) => {
            const range = l.lesson_range ? ` — ${l.lesson_range}` : '';
            return `· [${l.subject}]${range}`;
          }),
        // 병행교재(유형/연산 등) 오늘 진도 — TodaySession 마무리에서 입력한 이력
        ...(bookLogByStudent.get(sid) ?? []).map((b: any) => {
          const range = b.from_page != null && b.from_page + 1 < b.to_page
            ? `p.${b.from_page + 1}~${b.to_page}` : `~p.${b.to_page}`;
          return `· [${b.subject}] ${b.book_title}(${b.book_role}) — ${range}`;
        }),
      ];

      // 테스트: 수업 내 테스트 + 게릴라 테스트 + 단어시험
      const testLines: string[] = [];
      for (const l of myLessons) {
        for (const suffix of ['', '_2']) {
          const tName = l[`test_name${suffix}`];
          const tResult = l[`test_result_text${suffix}`];
          const passFail = l[`english_pass_fail${suffix}`];
          if (tName || tResult) {
            const label = tName || l[`test_content${suffix}`] || '테스트';
            const resultTxt = tResult || (passFail ? (passFail === 'pass' ? '통과' : '재시험') : '');
            testLines.push(`· [${l.subject}] ${label}${resultTxt ? `: ${resultTxt}` : ''}`);
          }
        }
      }
      for (const t of testsByStudent.get(sid) ?? []) {
        const passTxt = t.passed === true ? ' (통과)' : t.passed === false ? ' (재시험)' : '';
        testLines.push(`· [${t.subject}] ${clip(t.content || '테스트', 30)}${t.score ? `: ${t.score}` : ''}${passTxt}`);
      }
      for (const v of vocabByStudent.get(sid) ?? []) {
        const dayTxt = v.day_number ? ` Day ${v.day_number}` : '';
        testLines.push(`· 단어시험${v.book_name ? ` ${v.book_name}` : ''}${dayTxt}: ${v.correct_words}/${v.total_words} (${v.score_percent}%)${v.passed ? ' 통과' : ' 재시험 예정'}`);
      }

      // 숙제: 이날 확인된 결과 + 새로 내준 숙제
      const hwLines: string[] = [];
      for (const h of hwCheckedByStudent.get(sid) ?? []) {
        if (h.result) hwLines.push(`· [${h.subject}] ${HOMEWORK_RESULT_KO[h.result] ?? h.result}`);
      }
      if (hwLines.length === 0) {
        // 확인된 숙제가 없으면 수업일지의 숙제 상태로 대체
        for (const l of myLessons) {
          if (l.homework_status && l.homework_status !== 'none_assigned') {
            hwLines.push(`· [${l.subject}] ${HOMEWORK_RESULT_KO[l.homework_status] ?? l.homework_status}`);
          }
        }
      }
      for (const h of hwAssignedByStudent.get(sid) ?? []) {
        if (h.content) hwLines.push(`· [${h.subject}] 새 숙제: ${clip(h.content, 30)}`);
      }

      // 피드백: 교사 기록을 AI가 학부모용으로 재서술 (기록 없거나 실패하면 섹션 생략)
      const rawNotes = myLessons
        .map((l: any) => [l.parent_direct_message, l.notes].filter(Boolean).join(' / '))
        .filter(Boolean).join('\n');
      let feedback = '';
      if (rawNotes && lovableKey) {
        try { feedback = await rewriteFeedback(lovableKey, name, rawNotes); }
        catch { feedback = ''; }
      }

      // v3 템플릿: 소제목이 변수 안에 포함됨 — 내용 없으면 빈 문자열로 섹션 자체를 생략
      const section = (title: string, body: string) => body ? `\n\n■ ${title}\n${body}` : '';
      const variables: Record<string, string> = {
        '#{학생명}': name,
        '#{날짜}': formatDateKo(reportDate),
        '#{출결}': clip(attendance, 40),
        '#{수업내역}': clip(lessonLines.join('\n') || '· 기록 없음', 250),
        '#{테스트결과}': section('테스트', clip(testLines.join('\n'), 180)),
        '#{숙제상태}': section('숙제', clip(hwLines.join('\n'), 180)),
        '#{피드백}': section('선생님 한마디', feedback),
        '#{token}': student.parent_token,
      };

      messages.push({
        to: phone,
        from: cfg.SOLAPI_SENDER!,
        kakaoOptions: {
          pfId: cfg.SOLAPI_PFID!,
          templateId: cfg.ALIMTALK_TEMPLATE_DAILY!,
          variables,
          disableSms: true,
        },
      });
      messageMeta.push({ student_id: sid, variables });
      results.push({ student_id: sid, student_name: name, ok: true, ...(dryRun ? { preview: variables } : {}) });
    }

    if (dryRun) {
      return json({ results, sent: 0, failed: 0, skipped, reportDate, dryRun: true });
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
        const detail = body?.errorMessage || body?.message || `HTTP ${res.status}`;
        for (const r of results) if (r.ok) { r.ok = false; r.reason = `발송 실패: ${detail}`; }
        return json({ results, sent: 0, failed: results.length, skipped, reportDate });
      }

      const failedList: any[] = body?.failedMessageList ?? [];
      const failedPhones = new Set(failedList.map((f: any) => (f.to || '').replace(/[^0-9]/g, '')));
      messages.forEach((m, i) => {
        if (failedPhones.has(m.to)) {
          const r = results.find(x => x.student_id === messageMeta[i].student_id && x.ok);
          if (r) { r.ok = false; r.reason = '알림톡 발송 실패 (수신 불가)'; }
        }
      });

      // 발송 성공 건 로그 (테스트 발송은 기록하지 않음 — 실발송 시 중복 방지에 영향 없도록)
      if (!testPhone) {
        const rows = messageMeta
          .filter((_, i) => !failedPhones.has(messages[i].to))
          .map(m => ({ student_id: m.student_id, report_date: reportDate, variables: m.variables }));
        if (rows.length > 0) {
          await admin.from('daily_report_sends').upsert(rows, { onConflict: 'student_id,report_date' });
        }
      }
    }

    const sent = results.filter(r => r.ok).length;
    return json({ results, sent, failed: results.length - sent, skipped, reportDate });
  } catch (e) {
    return json({ error: 'internal', detail: String(e) }, 500);
  }
});
