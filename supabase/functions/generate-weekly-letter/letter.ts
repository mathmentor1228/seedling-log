// WEEKLY-LETTER-V1 — 주간 학습 편지의 순수 로직.
// Deno(엣지 함수)와 vitest(src/lib/weeklyLetter.test.ts) 양쪽에서 import 한다. 네트워크·DB 접근 없음.
//
// 원칙 (2026-10-01 개편안)
//   1. 편지의 심장은 "선생님이 직접 쓴 말"이다. AI는 그것을 학부모 말로 다듬기만 한다.
//   2. 선생님 말이 한 줄도 없는 학생은 편지를 만들지 않는다. (밍밍한 문안이 나가는 것을 구조적으로 막는다)
//   3. 검증에 걸리면 저장하지 않는다. 중립 대체 문안은 없다.
//   4. 수업 횟수·이해도 점수는 학부모 문안에 쓰지 않는다 (2026-08-20 원칙).
import { givenName, nameTopic, nameVocative } from '../_shared/name.ts';

export interface LessonRow {
  id: string;
  student_id: string;
  subject: string;
  lesson_date: string;
  teacher_id: string;
  teacher_display_name: string | null;
  lesson_range: string | null;
  notes: string | null;
  parent_direct_message: string | null;
  learning_issues_note: string | null;
  next_lesson_goal: string | null;
  homework_check_note: string | null;
  homework_status: string | null;
  test_result: string | null;
  test_result_text: string | null;
  test_title: string | null;
  test_name: string | null;
  understanding_score: number | null;
  attendance_status: string[] | null;
  weekly_summary: string | null;
  weekly_summary_week: string | null;
}

export type LineKind = '학부모께 한 줄' | '학습 이슈' | '숙제 관찰' | '다음 수업 방향';

export interface TeacherLine { subject: string; date: string; kind: LineKind; text: string }
export interface SubjectFacts {
  subject: string;
  lessons: number;
  absences: number;
  ranges: string[];
  homework: string[];
  tests: string[];
  understanding: number[];
}
export interface VerbatimComment { subject: string; teacher: string; text: string }
export interface Material {
  subjects: SubjectFacts[];
  lines: TeacherLine[];
  verbatim: VerbatimComment[];
  totalLessons: number;
}

export type SkipReason = 'no_lessons' | 'no_teacher_note';

const HOMEWORK_LABEL: Record<string, string> = {
  completed: '완료', done: '완료', partial: '부분', not_done: '미완', none_assigned: '',
};
const ABSENT_MARKERS = ['인정결석', '무단결석', '결석', '미등원', 'legacy_absent'];
// 선생님들이 진도 칸에 적는 결석 사유·안내문. 진도가 아니므로 기록 카드와 AI 재료에서 뺀다.
const NOT_A_RANGE = /결석|사유|수업이\s*없|휴강|보충\s*수업\s*예정|시험\s*기간|예정입니다|없습니다/;

export function isRealRange(text: string): boolean {
  return text.length > 0 && !NOT_A_RANGE.test(text);
}

/** `[보충 시간: 15:00]` 같은 시스템 태그를 떼고 공백 정리 */
export function cleanLine(text: string | null | undefined): string {
  return (text || '').replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
}

function md(date: string): string {
  const [, m, d] = date.split('-');
  return `${Number(m)}/${Number(d)}`;
}

export function collectMaterial(lessons: LessonRow[], verbatimTeacherIds: string[], weekStart: string): Material {
  const bySubject = new Map<string, SubjectFacts>();
  const lines: TeacherLine[] = [];
  const verbatim: VerbatimComment[] = [];
  const seenVerbatim = new Set<string>();
  const verbatimSet = new Set(verbatimTeacherIds);

  const sorted = [...lessons].sort((a, b) => a.lesson_date.localeCompare(b.lesson_date));
  for (const l of sorted) {
    const f = bySubject.get(l.subject) ?? { subject: l.subject, lessons: 0, absences: 0, ranges: [], homework: [], tests: [], understanding: [] };
    bySubject.set(l.subject, f);
    f.lessons += 1;
    const att = l.attendance_status || [];
    const absent = att.some(a => ABSENT_MARKERS.includes(a));
    if (absent) f.absences += 1;
    const range = cleanLine(l.lesson_range);
    if (!absent && isRealRange(range) && !f.ranges.includes(range)) f.ranges.push(range);
    const hw = HOMEWORK_LABEL[l.homework_status || ''] ?? '';
    if (hw) f.homework.push(hw);
    if (l.test_result === 'pass' || l.test_result === 'fail') {
      const title = cleanLine(l.test_title || l.test_name) || '테스트';
      const detail = cleanLine(l.test_result_text);
      f.tests.push(`${title} ${l.test_result === 'pass' ? '통과' : '미통과'}${detail ? ` (${detail})` : ''}`);
    }
    if (typeof l.understanding_score === 'number') f.understanding.push(l.understanding_score);

    // 원문 그대로 싣는 선생님(영어 이재진): 주간 코멘트는 verbatim, 그 외 메모는 AI 재료에서 제외
    if (verbatimSet.has(l.teacher_id)) {
      const ws = cleanLine(l.weekly_summary);
      const inWeek = l.weekly_summary_week === weekStart || !l.weekly_summary_week;
      if (ws && inWeek) {
        const key = `${l.subject}|${ws}`;
        if (!seenVerbatim.has(key)) {
          seenVerbatim.add(key);
          verbatim.push({ subject: l.subject, teacher: l.teacher_display_name || '담당 선생님', text: ws });
        }
      }
      continue;
    }

    const date = md(l.lesson_date);
    const push = (kind: LineKind, raw: string | null, min: number) => {
      const t = cleanLine(raw);
      if (t.length >= min) lines.push({ subject: l.subject, date, kind, text: t });
    };
    push('학부모께 한 줄', l.notes, 4);
    push('학부모께 한 줄', l.parent_direct_message, 4);
    push('학습 이슈', l.learning_issues_note, 6);
    push('숙제 관찰', l.homework_check_note, 4);
    push('다음 수업 방향', l.next_lesson_goal, 4);
  }

  return {
    subjects: [...bySubject.values()],
    lines,
    verbatim,
    totalLessons: lessons.length,
  };
}

/** 편지를 만들 수 없는 이유. null이면 만들 수 있다. */
export function skipReason(m: Material): SkipReason | null {
  if (m.totalLessons === 0) return 'no_lessons';
  const core = m.lines.filter(l => l.kind === '학부모께 한 줄' || l.kind === '학습 이슈' || l.kind === '숙제 관찰');
  if (core.length === 0 && m.verbatim.length === 0) return 'no_teacher_note';
  return null;
}

export function formatHeader(studentName: string, weekStart: string, weekEnd: string): string {
  return `[더멘토] ${givenName(studentName)} 주간 학습 편지 (${md(weekStart)}~${md(weekEnd)})`;
}

function homeworkPhrase(hw: string[]): string {
  if (hw.length === 0) return '';
  if (hw.every(h => h === '완료')) return '숙제 모두 해옴';
  if (hw.some(h => h === '미완')) return '숙제 안 해온 날 있음';
  return '숙제 일부만 해온 날 있음';
}

/** 편지 아래 붙는 사실 카드. 수업 횟수·이해도 숫자는 쓰지 않는다. */
export function buildFactsCard(m: Material): string {
  const rows = m.subjects.map(s => {
    const parts = [
      s.ranges.length ? `진도 ${s.ranges.join(', ')}` : '',
      homeworkPhrase(s.homework),
      ...s.tests,
      s.absences > 0 ? '결석 있음' : '',
    ].filter(Boolean);
    return `${s.subject} · ${parts.length ? parts.join(' · ') : '기록된 세부 내용 없음'}`;
  });
  return `───\n이번 주 기록\n${rows.join('\n')}`;
}

export function buildVerbatimBlock(m: Material): string {
  if (m.verbatim.length === 0) return '';
  return m.verbatim.map(v => `💬 ${v.subject} ${v.teacher}\n${v.text}`).join('\n\n');
}

export const LETTER_SYSTEM_PROMPT = `당신은 더멘토학원의 담당 선생님입니다. 아래 "선생님이 직접 쓴 말"을 바탕으로 학부모께 보내는 짧은 편지를 씁니다.

[재료의 우선순위]
1. 선생님이 직접 쓴 말이 편지의 중심입니다. 뜻을 바꾸지 말고, 학부모께 설명하는 말로 다듬어 옮깁니다. 거기 들어 있는 사실(단원·개념·막힌 지점·시도 횟수·숙제 상태)은 전부 살립니다.
2. 기록된 사실(진도·숙제·테스트)은 선생님 말을 뒷받침할 때만 한 구절로 씁니다.
3. 그 밖의 것은 쓰지 않습니다. 기록에 없는 장면(표정·손·연필·목소리·웃음·한숨·고개)과 기록에 없는 평가는 만들지 않습니다. 재료가 한 줄이면 한 줄만큼만 씁니다.

[길이와 모양]
4~6문장, 한 단락 또는 두 단락. 과목 소제목·글머리 기호·숫자 나열은 쓰지 않습니다. 이해도 점수와 수업 횟수는 쓰지 않습니다.

[기간 표현]
이 편지는 해당 주가 끝날 때 보냅니다. "이번 주"라고 부르고 "지난주"는 쓰지 않습니다.

[순서]
첫 문장은 선생님 말 가운데 아이가 해낸 것·진전된 것으로 시작합니다. 아쉬운 점(숙제 누락·태도)은 그 뒤에 사실로 적되, 반드시 "다음 수업에서 학원이 하는 것" 한 문장이 따라오고, 필요하면 "가정에서 부탁드리는 것" 한 문장을 덧붙입니다. 아쉬운 점으로 편지를 끝내지 않습니다.

[공지성 메모]
"보강 진행", "공휴일 정상 수업", "시험 대비 일정" 같은 안내는 편지 맨 끝에 한 문장으로 따로 전달합니다. "다음 수업에서는"과 섞지 않습니다.

[이름]
성을 떼고 주어형 호칭(예: 민준이는, 지우는)으로 첫 문장을 시작합니다. 편지 어디에서도 성을 붙여 부르지 않습니다.

[어려움을 쓸 때]
무엇이 어려웠는지 → 왜 그럴 수 있는지(이 단원·이 시기에 흔한 과정인지, 앞 개념과 어떻게 이어지는지. "~일 수 있습니다", "~하곤 합니다"로) → 학원이 무엇부터 다시 보는지, 세 가지를 한 세트로 씁니다. "못합니다", "약합니다", "부족합니다"처럼 아이를 결론짓는 말 대신 "~까지는 되고, ~에서 시간이 걸립니다"처럼 어디까지 왔는지를 씁니다.

[잘한 것]
추상 칭찬 대신 기록된 사실로 씁니다. "열심히 했습니다" 대신 "공통인수를 먼저 찾는 순서가 자리 잡았습니다".

[말투]
~합니다 체. 짧은 문장. 쓰지 않는 말: 놀랍게도·정말·대견하게도 같은 감정어, 전반적으로·안정적으로·꾸준히 같은 뭉뚱그린 말, 또래·다른 학생과의 비교, 항상·전혀·완벽. 미래는 약속하지 않고 현재형으로 씁니다("~하겠습니다" 대신 "다음 수업에서는 ~부터 다시 봅니다").

[마무리]
가정에서 부탁드릴 것이 선생님 말에 근거가 있을 때만 한 문장("가정에서 ~ 부탁드립니다"). 근거가 없으면 다음 수업에서 볼 것 한 문장으로 끝냅니다.

[원장 문체 예시 — 이 결을 따릅니다]
"처음에는 문제에 어떻게 접근할지 찾기 어려워하기도 했습니다. 그래서 점수가 다소 낮았는데, 유형이 익숙해지면서 곧잘 풀어냈습니다."
"새로운 용어가 많이 등장하고 문제 유형도 다양해 어렵다는 말이 쉽게 나옵니다. 대부분 아이들이 이 단원을 시작하면 겪는 과정입니다. 그래서 다음 수업에서는 개념 하나를 골라 가볍게 다시 짚습니다."
"연산에서 틀릴 것 같다는 말을 종종 하곤 합니다. 지금은 혼합계산까지 스스로 식을 세우는 데까지 왔습니다."

[학생용 메모]
같은 재료로 학생에게 직접 말하듯 2~3문장. 호격(예: 민준아, 지우야)으로 시작합니다. 반말로만 씁니다("~했어", "~해보자"). "~합니다", "~습니다"는 쓰지 않습니다. 잘한 것 하나를 먼저, 그다음 다음 시간에 같이 할 것 하나. 아쉬운 점을 나열하거나 꾸짖지 않습니다("아쉬워", "부족해" 금지). 이모지는 맨 끝에 🌱 하나만.

출력은 JSON만 허용합니다: {"parent_letter": "...", "student_note": "..."}`;

export function buildUserPrompt(studentName: string, weekStart: string, weekEnd: string, m: Material): string {
  const topic = nameTopic(studentName);
  const voc = nameVocative(studentName);
  const facts = m.subjects.map(s => {
    const parts = [
      s.ranges.length ? `진도 ${s.ranges.join(', ')}` : '진도 기록 없음',
      homeworkPhrase(s.homework) || '숙제 기록 없음',
      s.tests.length ? `테스트 ${s.tests.join(', ')}` : '',
      s.absences > 0 ? '결석한 날 있음' : '',
    ].filter(Boolean);
    return `- ${s.subject}: ${parts.join(' / ')}`;
  }).join('\n');
  const lines = m.lines.map(l => `- [${l.subject} ${l.date} · ${l.kind}] ${l.text}`).join('\n');
  const verbatimNote = m.verbatim.length
    ? `\n\n[참고] ${m.verbatim.map(v => v.subject).join(', ')} 담당 선생님의 주간 코멘트는 편지 아래에 원문 그대로 따로 실립니다. 그 과목은 편지 본문에서 다루지 않습니다.`
    : '';
  return `학생 호칭: 주어형 "${topic}", 호격 "${voc}" (이 두 형태만 사용)
기간: ${weekStart} ~ ${weekEnd}

[기록된 사실]
${facts}

[선생님이 직접 쓴 말]
${lines || '(없음)'}${verbatimNote}

위 재료만으로 학부모 편지(parent_letter)와 학생 메모(student_note)를 JSON으로 작성하세요.`;
}

export interface LetterJson { parent_letter: string; student_note: string }

export function parseLetterJson(raw: string): LetterJson | null {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const obj = JSON.parse(text);
    if (typeof obj?.parent_letter === 'string' && typeof obj?.student_note === 'string') {
      return { parent_letter: obj.parent_letter.trim(), student_note: obj.student_note.trim() };
    }
  } catch { /* fallthrough */ }
  const start = text.indexOf('{'); const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const obj = JSON.parse(text.slice(start, end + 1));
      if (typeof obj?.parent_letter === 'string' && typeof obj?.student_note === 'string') {
        return { parent_letter: obj.parent_letter.trim(), student_note: obj.student_note.trim() };
      }
    } catch { /* ignore */ }
  }
  return null;
}

const SCENE_WORDS = ['연필', '표정', '눈빛', '한숨', '웃음', '미소', '고개', '자세', '목소리', '환하게', '골똘히', '멈칫', '손을'];
const VAGUE_WORDS = ['전반적으로', '안정적으로', '꾸준히', '항상', '전혀', '완벽', '또래', '다른 학생', '친구들보다', '100%', '놀랍게도', '대견하게도', '기특하게도'];
// '감사하겠습니다'는 인사말이라 허용 (2026-09-13 완곡화 규칙과 동일)
const PROMISE_PATTERNS = [/(?<!감사하|좋)겠습니다/, /할 예정/, /예정입니다/, /계획입니다/];
const JUDGEMENT_PATTERNS = [/못합니다/, /약합니다/, /부족합니다/];

export interface Validation { ok: boolean; violations: string[] }

export function validateParentLetter(text: string, studentName: string): Validation {
  const v: string[] = [];
  const g = givenName(studentName);
  const full = (studentName || '').trim().replace(/_.*$/, '');
  if (!text || text.length < 100) v.push('TOO_SHORT');
  if (text.length > 800) v.push('TOO_LONG');
  if (g && !text.includes(g)) v.push('NAME_MISSING');
  if (full.length >= 3 && full !== g && text.includes(full)) v.push('SURNAME_USED');
  if (/(^|\n)\s*[-•·]/.test(text) || /【/.test(text)) v.push('BULLETS');
  if (/\d+\s*회/.test(text)) v.push('COUNT_EXPOSURE');
  if (/\d\s*\/\s*5/.test(text) || /이해도\s*\d/.test(text)) v.push('SCORE_EXPOSURE');
  for (const w of SCENE_WORDS) if (text.includes(w)) v.push(`SCENE:${w}`);
  for (const w of VAGUE_WORDS) if (text.includes(w)) v.push(`VAGUE:${w}`);
  for (const p of PROMISE_PATTERNS) if (p.test(text)) v.push(`PROMISE:${p.source}`);
  for (const p of JUDGEMENT_PATTERNS) if (p.test(text)) v.push(`JUDGEMENT:${p.source}`);
  if (text.includes('지난주') || text.includes('지난 주')) v.push('LAST_WEEK_WORDING');
  const sentences = text.split(/(?<=[.!?다])\s+/).filter(s => s.trim().length > 0);
  if (sentences.length > 9) v.push('TOO_MANY_SENTENCES');
  return { ok: v.length === 0, violations: v };
}

export function validateStudentNote(text: string, studentName: string): Validation {
  const v: string[] = [];
  const g = givenName(studentName);
  if (!text || text.length < 20) v.push('TOO_SHORT');
  if (text.length > 320) v.push('TOO_LONG');
  if (g && !text.includes(g)) v.push('NAME_MISSING');
  for (const w of SCENE_WORDS) if (text.includes(w)) v.push(`SCENE:${w}`);
  for (const w of ['또래', '친구들보다', '다른 학생']) if (text.includes(w)) v.push(`VAGUE:${w}`);
  if (/(습니다|합니다)(?=[.!?\s]|$)/.test(text)) v.push('HONORIFIC_MIX');
  for (const w of ['아쉬워', '아쉽', '부족해']) if (text.includes(w)) v.push(`SCOLDING:${w}`);
  return { ok: v.length === 0, violations: v };
}

/** 학부모에게 저장되는 최종 문안 */
export function composeParentMessage(studentName: string, weekStart: string, weekEnd: string, letter: string, m: Material): string {
  const blocks = [formatHeader(studentName, weekStart, weekEnd), letter.trim(), buildFactsCard(m)];
  const vb = buildVerbatimBlock(m);
  if (vb) blocks.push(vb);
  return blocks.join('\n\n');
}

export function averageUnderstanding(m: Material): number | null {
  const all = m.subjects.flatMap(s => s.understanding);
  if (all.length === 0) return null;
  return Math.round((all.reduce((a, b) => a + b, 0) / all.length) * 10) / 10;
}

export function homeworkCompletionRate(m: Material): number | null {
  const all = m.subjects.flatMap(s => s.homework);
  if (all.length === 0) return null;
  const done = all.filter(h => h === '완료').length + all.filter(h => h === '부분').length * 0.5;
  return Math.round((done / all.length) * 100);
}

export function firstSentence(text: string): string {
  const s = text.split(/(?<=다\.)\s+/)[0] || text;
  return s.length > 80 ? s.slice(0, 77) + '…' : s;
}
