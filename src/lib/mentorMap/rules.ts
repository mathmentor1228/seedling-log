// MENTOR-MAP-V1: 응답 → '전해주신 어려움' / '상담에서 확인할 질문' / '수업에서 관찰할 부분' 순수 변환
// 금지: 진단·판정·능력 추정·성적 보장 표현. 실력 판정 대신 관찰 항목으로만 변환한다.
import { detailedSubjects } from './questions';
import { UNKNOWN_VALUE, type MentorMapAnswers, type Perspective, type SchoolLevel } from './types';

/** 제안서/화면 어디에도 등장하면 안 되는 표현 */
export const FORBIDDEN_PHRASES = [
  '진단',
  '진단테스트',
  '진단서',
  '판정',
  '결함',
  '능력평가',
  '실력 평가',
  '성적 향상 보장',
  '점수 보장',
  '등급 보장',
  '학교 수준',
  '능력이 부족',
  '수준이 낮',
];

export function containsForbidden(text: string): string[] {
  return FORBIDDEN_PHRASES.filter((p) => text.includes(p));
}

export const NOT_PROVIDED = '미입력';

/** 미입력을 0으로 취급하지 않고 '미입력'으로 구분 */
export function displayValue(v: string | string[] | undefined | null): string {
  if (v === undefined || v === null) return NOT_PROVIDED;
  if (Array.isArray(v)) {
    const filtered = v.filter((x) => x && x !== UNKNOWN_VALUE);
    if (v.includes(UNKNOWN_VALUE) && filtered.length === 0) return '잘 모르겠음(응답)';
    return filtered.length ? filtered.join(', ') : NOT_PROVIDED;
  }
  if (!v) return NOT_PROVIDED;
  if (v === UNKNOWN_VALUE) return '잘 모르겠음(응답)';
  return v;
}

export function isProvided(v: string | string[] | undefined | null): boolean {
  const d = displayValue(v);
  return d !== NOT_PROVIDED;
}

export interface ObservationItem {
  subject?: string;
  /** 응답자가 전한 어려움 */
  reported: string;
  /** 수업에서 관찰할 부분 */
  observe: string;
}

const SUBJECT_OBSERVATION: Record<string, { match: RegExp; reported: string; observe: string }[]> = {
  '수학': [
    { match: /설명이 어렵|다시 설명|개념 자체/, reported: '새 개념을 처음 접할 때 이해에 시간이 필요하다고 전해주셨습니다.', observe: '첫 설명 후 예시 문제에서 스스로 설명할 수 있는지' },
    { match: /실수/, reported: '계산 과정에서 실수가 반복된다고 전해주셨습니다.', observe: '풀이 중 계산 단계와 검산 습관' },
    { match: /답만|과정 쓰기|정리가 어려|설명 부족/, reported: '풀이 과정을 글로 표현하는 데 부담이 있다고 전해주셨습니다.', observe: '서술형 답안에서 근거 문장을 쓰는 방식' },
    { match: /넘어가|해설만/, reported: '틀린 문제를 다시 다루는 시간이 충분하지 않다고 전해주셨습니다.', observe: '오답 재도전 시 같은 유형의 처리 방식' },
    { match: /시간 부족|풀이 속도/, reported: '문제 푸는 속도에 부담을 느낀다고 전해주셨습니다.', observe: '제한 시간 내 문항 처리 흐름' },
  ],
  '영어': [
    { match: /단어|어휘|잊어버려|외우는/, reported: '어휘를 오래 기억하는 데 어려움을 전해주셨습니다.', observe: '수업 중 어휘 확인 시 재인출 방식' },
    { match: /문법|설명은 어려/, reported: '문법 개념 설명에 부담이 있다고 전해주셨습니다.', observe: '문장에서 문법 요소를 찾아 설명하는 과정' },
    { match: /독해|문장 구조|구문|주제 파악/, reported: '독해 과정에서 걸리는 지점을 전해주셨습니다.', observe: '지문에서 끊어 읽는 단위와 해석 순서' },
    { match: /듣기/, reported: '듣기 활동에 부담을 전해주셨습니다.', observe: '듣기 자료의 이해 범위' },
    { match: /본문|부교재|감점|서술형|쓰기/, reported: '학교 시험용 본문·서술형 대비 방법을 고민 중이라고 전해주셨습니다.', observe: '본문 정리 방식과 답안 작성 형태' },
  ],
  '국어': [
    { match: /속도|천천히|부담/, reported: '지문을 읽는 속도에 대한 부담을 전해주셨습니다.', observe: '지문 길이에 따른 읽기 흐름' },
    { match: /내용 파악|설명|어려워/, reported: '읽은 내용을 정리해 설명하는 데 어려움을 전해주셨습니다.', observe: '문단별 요지 정리 방식' },
    { match: /문법/, reported: '국어 문법 정리에 대한 고민을 전해주셨습니다.', observe: '문법 개념의 적용 사례 이해' },
    { match: /문학/, reported: '문학 작품 정리 방법에 대한 고민을 전해주셨습니다.', observe: '작품 정리 노트와 핵심어 활용' },
    { match: /서술형|핵심어/, reported: '서술형 답안 작성에 어려움을 전해주셨습니다.', observe: '답안에서 조건 반영과 핵심어 포함 여부' },
    { match: /시간/, reported: '시험 시간 배분에 부담을 전해주셨습니다.', observe: '영역별 소요 시간' },
  ],
  '과학': [
    { match: /용어|헷갈|어려워/, reported: '과학 용어와 개념 정리에 어려움을 전해주셨습니다.', observe: '용어를 자기 말로 설명하는 정도' },
    { match: /연결/, reported: '단원 간 개념 연결에 대한 고민을 전해주셨습니다.', observe: '앞 단원 개념을 새 문제에 적용하는 흐름' },
    { match: /계산/, reported: '계산이 포함된 단원에 부담을 전해주셨습니다.', observe: '공식 적용 단계와 단위 처리' },
    { match: /그래프|자료|실험/, reported: '자료·그래프 해석에 어려움을 전해주셨습니다.', observe: '자료에서 조건을 찾아내는 과정' },
    { match: /암기|잊/, reported: '암기 내용 유지에 대한 고민을 전해주셨습니다.', observe: '복습 주기와 재확인 결과' },
  ],
  '사회/역사': [
    { match: /개념|정리/, reported: '핵심 개념 정리 방법에 대한 고민을 전해주셨습니다.', observe: '단원별 개념 정리 형태' },
    { match: /흐름|사건별|연결/, reported: '시대 흐름과 인과 관계 정리에 어려움을 전해주셨습니다.', observe: '사건 간 연결을 설명하는 방식' },
    { match: /자료|지도|도표/, reported: '자료 해석에 부담을 전해주셨습니다.', observe: '자료에서 근거를 찾는 과정' },
    { match: /암기|기억|잊/, reported: '암기 내용 유지에 대한 고민을 전해주셨습니다.', observe: '반복 확인 시 기억 유지 정도' },
    { match: /서술형|핵심어/, reported: '서술형 답안 작성에 어려움을 전해주셨습니다.', observe: '답안 구성과 핵심어 포함 여부' },
  ],
};

/** 과목 응답 → 관찰 항목 (실력 판정 아님) */
export function toObservationItems(answers: MentorMapAnswers): ObservationItem[] {
  const targets = detailedSubjects(answers.subjects, answers.priority_subjects);
  const items: ObservationItem[] = [];
  for (const subject of targets) {
    const rules = SUBJECT_OBSERVATION[subject] ?? [];
    const values = Object.entries(answers.subject_answers)
      .filter(([k]) => k.startsWith(subjectPrefix(subject)))
      .flatMap(([, v]) => (Array.isArray(v) ? v : [v]))
      .filter((v): v is string => typeof v === 'string' && v !== UNKNOWN_VALUE && !!v);
    const joined = values.join(' ');
    for (const rule of rules) {
      if (rule.match.test(joined)) {
        items.push({ subject, reported: rule.reported, observe: rule.observe });
      }
    }
    if (!items.some((i) => i.subject === subject)) {
      items.push({
        subject,
        reported: '선택형 응답만으로는 어려움이 구체적으로 드러나지 않았습니다.',
        observe: '첫 수업에서 학습 과정을 함께 확인할 예정입니다.',
      });
    }
  }
  return items;
}

export function subjectPrefix(subject: string): string {
  switch (subject) {
    case '수학': return 'math_';
    case '영어': return 'eng_';
    case '국어': return 'kor_';
    case '과학': return 'sci_';
    case '사회/역사': return 'soc_';
    default: return 'etc_';
  }
}

/** 상담에서 확인할 질문 3~5개 (규칙 기반) */
export function consultQuestions(answers: MentorMapAnswers): string[] {
  const q: string[] = [];
  const level = answers.school_level as SchoolLevel;
  const s = answers.student_answers;
  const p = answers.parent_answers;

  if (!isProvided(answers.school_name) || !isProvided(answers.grade)) {
    q.push('학교명과 학년을 확인해 학사 일정을 함께 정리합니다.');
  }
  if (answers.subjects.length > 2) {
    q.push(`희망 과목이 ${answers.subjects.length}개입니다. 먼저 시작할 과목 순서를 함께 정합니다.`);
  }
  if (isProvided(s['s_hard_moment'])) {
    q.push(`학생이 어려움을 느낀다고 전한 순간(${displayValue(s['s_hard_moment'])})에 대해 구체적인 상황을 여쭤봅니다.`);
  }
  if (isProvided(p['p_worry'])) {
    q.push(`보호자께서 마음 쓰인다고 하신 부분(${displayValue(p['p_worry'])})을 언제부터 관찰하셨는지 확인합니다.`);
  }
  const scoreProvided = Object.values(answers.score_info).some((v) => isProvided(v as string | string[]));
  if (!scoreProvided) {
    q.push('최근 성적 관련 정보가 미입력 상태입니다. 확인 가능한 자료가 있는지 여쭤봅니다.');
  }
  if (level === 'high') {
    q.push('내신과 모의고사 중 이번 학기에 우선할 방향을 함께 정합니다.');
  } else if (level === 'middle') {
    q.push('다음 시험까지 남은 기간과 준비 시작 시점을 함께 확인합니다.');
  } else {
    q.push('학습 시작과 마무리를 돕는 가정에서의 방식과 학원 지원 범위를 나눕니다.');
  }
  if (isProvided(answers.free_note)) {
    q.push('마지막에 남겨주신 이야기를 상담에서 먼저 다룹니다.');
  }
  return q.slice(0, 5);
}

/** 학생/학부모 관점 비교 (갈등·위험 점수 없음) */
export interface PerspectiveDiff {
  topic: string;
  student: string;
  parent: string;
  differs: boolean;
}

const DIFF_TOPICS: { topic: string; studentKey: string; parentKey: string }[] = [
  { topic: '학습 시작·자기주도', studentKey: 's_start', parentKey: 'p_self' },
  { topic: '시험 준비 방식', studentKey: 's_exam_start', parentKey: 'p_examprep' },
  { topic: '학습 관련 대화', studentKey: 's_teacher', parentKey: 'p_conflict' },
  { topic: '최근 성적 흐름', studentKey: 's_change', parentKey: 'p_change' },
  { topic: '도움받고 싶은 방식', studentKey: 's_want_help', parentKey: 'p_wish' },
];

export function perspectiveDiffs(answers: MentorMapAnswers): PerspectiveDiff[] {
  if (answers.author_type !== 'both') return [];
  const out: PerspectiveDiff[] = [];
  for (const t of DIFF_TOPICS) {
    const sv = displayValue(answers.student_answers[t.studentKey]);
    const pv = displayValue(answers.parent_answers[t.parentKey]);
    if (sv === NOT_PROVIDED && pv === NOT_PROVIDED) continue;
    out.push({ topic: t.topic, student: sv, parent: pv, differs: sv !== pv && sv !== NOT_PROVIDED && pv !== NOT_PROVIDED });
  }
  return out;
}

/** 소통 선호 요약 (고/중/저 점수화 금지) */
export function commSummary(answers: MentorMapAnswers): string[] {
  const c = answers.comm_pref;
  const lines: string[] = [];
  if (isProvided(c['c_frequency'])) lines.push(`안내 주기: ${displayValue(c['c_frequency'])}`);
  if (isProvided(c['c_instant'])) lines.push(`즉시 안내 희망: ${displayValue(c['c_instant'])}`);
  if (isProvided(c['c_order'])) lines.push(`소통 순서: ${displayValue(c['c_order'])}`);
  if (isProvided(c['c_detail'])) lines.push(`상세 수준: ${displayValue(c['c_detail'])}`);
  if (lines.length === 0) lines.push('소통 선호는 미입력 상태입니다. 상담에서 함께 정합니다.');
  return lines;
}

export function maskPhone(phone: string): string {
  const d = (phone || '').replace(/\D/g, '');
  if (d.length < 7) return '***';
  return `${d.slice(0, 3)}-****-${d.slice(-4)}`;
}

export function perspectiveLabel(p: Perspective): string {
  return p === 'student' ? '학생' : '보호자';
}
