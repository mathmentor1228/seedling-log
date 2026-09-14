/** Server-only notification. Never accept bot credentials or destination from request data. */
export type ConsultationNotice = {
  id: string;
  school_level?: string | null;
  grade_year?: number | null;
  preferred_date?: string | null;
  preferred_time?: string | null;
  subjects?: string[] | null;
};
export type NoticeConfig = { botToken?: string; chatId?: string };
export type NoticeResult = { status: 'sent' | 'not_configured' | 'failed'; attempts: number; code?: number };
const singleLine = (value: string) => value.replace(/[\r\n\u0000-\u001f\u007f]/g, ' ').slice(0, 100);
export function formatConsultationNotice(lead: ConsultationNotice) {
  return [
    '📩 원장님, 새 상담 신청이 접수됐어요.',
    '찰떡이가 알려드립니다.',
    '',
    `희망 일정: ${singleLine([lead.preferred_date, lead.preferred_time].filter(Boolean).join(' ')) || '미입력'}`,
    `학년: ${singleLine(`${lead.school_level || ''}${lead.grade_year || ''}`) || '미입력'}`,
    `희망 과목: ${singleLine((lead.subjects || []).join(', ')) || '미입력'}`,
    `접수번호: ${singleLine(lead.id)}`,
    '',
    '아직 일정 확정 전입니다. 상담 관리 화면에서 확인해주세요.',
    'https://seedling-log.lovable.app/admin/admissions',
  ].join('\n');
}
export async function sendConsultationNotice(
  lead: ConsultationNotice,
  config: NoticeConfig,
  fetcher: typeof fetch = fetch,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise(resolve => setTimeout(resolve, ms)),
): Promise<NoticeResult> {
  // Only an explicitly configured private numeric chat is supported.
  if (!config.botToken?.trim() || !/^[1-9]\d*$/.test(config.chatId || '')) {
    return { status: 'not_configured', attempts: 0 };
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetcher(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: config.chatId, text: formatConsultationNotice(lead),
          link_preview_options: { is_disabled: true } }),
        signal: AbortSignal.timeout(5000),
      });
      const body = await response.json().catch(() => null);
      if (response.ok && body?.ok === true) return { status: 'sent', attempts: attempt };
      const code = Number(body?.error_code) || response.status;
      if (attempt === 3 || (code !== 429 && code < 500)) return { status: 'failed', attempts: attempt, code };
      const retryAfter = Number(body?.parameters?.retry_after);
      // Never retry earlier than Telegram permits; long throttles are reported as failures.
      if (code === 429 && (!Number.isFinite(retryAfter) || retryAfter > 10 || retryAfter < 0)) {
        return { status: 'failed', attempts: attempt, code };
      }
      await sleep(code === 429 ? Math.max(1000, retryAfter * 1000) : attempt * 500);
    } catch {
      // Never log exceptions: network errors may contain the bot token in their URL.
      if (attempt === 3) return { status: 'failed', attempts: attempt };
      await sleep(attempt * 500);
    }
  }
  return { status: 'failed', attempts: 3 };
}
