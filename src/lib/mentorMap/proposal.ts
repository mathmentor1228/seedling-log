// MENTOR-MAP-V1: '멘토맵 맞춤 학습방향 제안서' view-model (6영역) + 슬라이드 JSON
// 규칙: 입력된 사실만 사용, 성과 보장·능력 추정 금지, 공개통계는 정확히 일치할 때만 참조.
import { getDataset, listSchools } from '@/data/schoolAchievement';
import {
  commSummary,
  consultQuestions,
  displayValue,
  isProvided,
  NOT_PROVIDED,
  perspectiveDiffs,
  toObservationItems,
  type ObservationItem,
  type PerspectiveDiff,
} from './rules';
import { LEVEL_LABEL, type MentorMapAnswers, type SchoolLevel } from './types';

export const BRAND_NAME = 'MENTOR MAP | 멘토맵';
export const BRAND_SUBTITLE = '맞춤 학습방향 제안서';
export const BRAND_CORE = '먼저 듣고, 수업에서 이해하고, 함께 방향을 찾습니다.';
export const BRAND_NOTICE =
  '짧은 테스트로 학생을 판단하지 않습니다. 먼저 학생과 보호자의 이야기를 듣고, 수업 속 관찰을 통해 적절한 학습 방향을 함께 찾아갑니다.';

export interface HeardItem {
  from: '학생' | '보호자';
  text: string;
}

export interface FactItem {
  label: string;
  value: string;
  provided: boolean;
}

export interface SchoolRef {
  linked: boolean;
  message: string;
  schoolKey?: string;
  year?: number;
  subjectNote?: string;
  source?: string;
  collectedAt?: string;
  limitation: string;
}

export interface ProposalViewModel {
  cover: {
    brand: string;
    subtitle: string;
    core: string;
    notice: string;
    studentName: string;
    schoolLine: string;
    subjects: string;
    consultDate: string;
    fileNameHint: string;
  };
  heard: HeardItem[];
  facts: FactItem[];
  schoolRef: SchoolRef;
  strengths: string[];
  next: {
    consultQuestions: string[];
    observations: ObservationItem[];
    comm: string[];
  };
  diffs: PerspectiveDiff[];
}

function fmtDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 학교명이 공개 통계 데이터셋과 정확히 일치할 때만 연결 (추측 매핑 금지) */
export function resolveSchoolRef(schoolName: string, level: SchoolLevel | ''): SchoolRef {
  const limitation =
    '학교알리미 공개 통계는 학교 단위 분포 자료이며, 개별 학생의 결과를 예측하거나 보장하지 않습니다.';
  const name = (schoolName || '').trim();
  if (!name) {
    return { linked: false, message: '학교명이 입력되지 않아 공개 통계를 연결하지 않았습니다.', limitation };
  }
  const schools = listSchools();
  const match = schools.find((s) => s.name === name);
  if (!match) {
    return { linked: false, message: `‘${name}’ 공개 통계 준비 중입니다.`, limitation };
  }
  const year = Math.max(...match.years);
  const ds = getDataset(match.key, year);
  if (!ds) return { linked: false, message: '공개 통계 준비 중입니다.', limitation };
  if ((level === 'high' && ds.schoolLevel !== 'high') || (level === 'middle' && ds.schoolLevel !== 'middle')) {
    return { linked: false, message: '학교급이 공개 통계와 일치하지 않아 연결하지 않았습니다.', limitation };
  }
  return {
    linked: true,
    message: `${ds.schoolName} ${ds.year}학년도 공개 통계와 연결되었습니다.`,
    schoolKey: ds.schoolKey,
    year: ds.year,
    subjectNote: `총 ${ds.rows.length}개 교과 분포 자료`,
    source: ds.source,
    collectedAt: ds.collectedAt,
    limitation,
  };
}

/** 응답에 맞춰 더멘토 지원 방식 문구 선택 (실제 시스템에 있는 것만) */
export function selectStrengths(answers: MentorMapAnswers): string[] {
  const out: string[] = ['짧은 테스트로 학습 상태를 단정하지 않고, 먼저 이야기를 듣고 시작합니다.'];
  const subj = answers.subjects;
  if (subj.length > 0) {
    out.push(`선택하신 과목(${subj.join(', ')})은 담당 교사가 수업에서 학습 과정을 직접 확인합니다.`);
  }
  const allAnswers = { ...answers.student_answers, ...answers.parent_answers, ...answers.subject_answers };
  const joined = Object.values(allAnswers)
    .flatMap((v) => (Array.isArray(v) ? v : [v]))
    .filter((v): v is string => typeof v === 'string')
    .join(' ');

  if (/숙제|복습|넘어가|해설만/.test(joined)) {
    out.push('숙제와 복습 수행은 수업일지에 기록되어 다음 수업에서 이어서 확인합니다.');
  }
  if (/시험|내신|모의고사/.test(joined)) {
    out.push('학교 시험 일정에 맞춰 과목별 준비 범위를 수업 안에서 함께 정리합니다.');
  }
  if (/서술형/.test(joined)) {
    out.push('서술형 답안은 작성 과정을 함께 보며 표현 방식을 다듬습니다.');
  }
  if (Object.keys(answers.comm_pref).length > 0) {
    out.push('선택하신 소통 선호에 맞춰 안내 주기와 순서를 맞춰 드립니다.');
  }
  if (answers.school_name) {
    out.push('학교 공개 통계는 참고자료로만 사용하며, 학생 평가에 사용하지 않습니다.');
  }
  out.push('첫 2~4주 수업 관찰 후 학습 방향을 함께 조정합니다.');
  return out;
}

export function buildProposal(answers: MentorMapAnswers, consultDate = new Date()): ProposalViewModel {
  const level = (answers.school_level || 'middle') as SchoolLevel;
  const heard: HeardItem[] = [];
  const s = answers.student_answers;
  const p = answers.parent_answers;

  if (isProvided(s['s_hard_moment'])) heard.push({ from: '학생', text: `어려움을 느끼는 순간: ${displayValue(s['s_hard_moment'])}` });
  if (isProvided(s['s_want_help'])) heard.push({ from: '학생', text: `편하게 느끼는 도움 방식: ${displayValue(s['s_want_help'])}` });
  if (isProvided(s['s_goal'])) heard.push({ from: '학생', text: `이루고 싶은 목표: ${displayValue(s['s_goal'])}` });
  if (isProvided(p['p_worry'])) heard.push({ from: '보호자', text: `마음이 쓰이는 모습: ${displayValue(p['p_worry'])}` });
  if (isProvided(p['p_wish'])) heard.push({ from: '보호자', text: `우선 도움받고 싶은 부분: ${displayValue(p['p_wish'])}` });
  if (isProvided(p['p_topic'])) heard.push({ from: '보호자', text: `상담에서 나누고 싶은 내용: ${displayValue(p['p_topic'])}` });
  if (isProvided(answers.free_note)) {
    heard.push({ from: answers.author_type === 'parent' ? '보호자' : '학생', text: `직접 남겨주신 이야기: ${answers.free_note}` });
  }

  const facts: FactItem[] = [
    { label: '학교', value: displayValue(answers.school_name), provided: isProvided(answers.school_name) },
    { label: '학년', value: displayValue(answers.grade), provided: isProvided(answers.grade) },
    { label: '상담 희망 과목', value: displayValue(answers.subjects), provided: answers.subjects.length > 0 },
    { label: '상담 희망 방식', value: displayValue(answers.preferred_method), provided: isProvided(answers.preferred_method) },
    { label: '상담 희망 시간대', value: displayValue(answers.preferred_time), provided: isProvided(answers.preferred_time) },
  ];
  for (const [k, v] of Object.entries(answers.score_info)) {
    facts.push({ label: scoreLabel(k), value: displayValue(v as string | string[]), provided: isProvided(v as string | string[]) });
  }
  if (!Object.keys(answers.score_info).length) {
    facts.push({ label: '최근 성적 정보', value: NOT_PROVIDED, provided: false });
  }

  return {
    cover: {
      brand: BRAND_NAME,
      subtitle: BRAND_SUBTITLE,
      core: BRAND_CORE,
      notice: BRAND_NOTICE,
      studentName: answers.student_name || '학생',
      schoolLine: `${LEVEL_LABEL[level]} · ${displayValue(answers.school_name)} ${displayValue(answers.grade)}`.trim(),
      subjects: displayValue(answers.subjects),
      consultDate: fmtDate(consultDate),
      fileNameHint: `MENTOR_MAP_${answers.student_name || '학생'}_${fmtDate(consultDate)}.pdf`,
    },
    heard,
    facts,
    schoolRef: resolveSchoolRef(answers.school_name, answers.school_level as SchoolLevel | ''),
    strengths: selectStrengths(answers),
    next: {
      consultQuestions: consultQuestions(answers),
      observations: toObservationItems(answers),
      comm: commSummary(answers),
    },
    diffs: perspectiveDiffs(answers),
  };
}

function scoreLabel(key: string): string {
  const map: Record<string, string> = {
    g_recent_unit: '최근 단원',
    g_school_eval: '학교 평가 경험',
    g_recent_score: '최근 시험 점수대',
    g_achievement: '성취도',
    g_subject_feel: '체감 난이도 높은 과목',
    g_naeshin_score: '내신 점수대',
    g_naeshin_grade: '내신 등급대',
    g_mock_grade: '모의고사 등급대',
  };
  return map[key] ?? key;
}

/** 학생용 요약 (더 짧고 격려적, 유아적 표현 금지) */
export interface StudentSummary {
  title: string;
  heard: string[];
  firstSteps: string[];
  checkTogether: string[];
}

export function buildStudentSummary(answers: MentorMapAnswers): StudentSummary {
  const s = answers.student_answers;
  const heard: string[] = [];
  if (isProvided(s['s_hard_moment'])) heard.push(displayValue(s['s_hard_moment']));
  if (isProvided(s['s_goal'])) heard.push(`목표: ${displayValue(s['s_goal'])}`);
  if (isProvided(answers.free_note)) heard.push(answers.free_note);
  if (heard.length === 0) heard.push('선택형 응답으로 전해준 내용을 바탕으로 시작합니다.');

  const observations = toObservationItems(answers);
  const firstSteps = observations.slice(0, 3).map((o) => `${o.subject ?? ''} ${o.observe}`.trim());
  return {
    title: `${answers.student_name || '학생'}님이 들려준 이야기`,
    heard,
    firstSteps: firstSteps.length ? firstSteps : ['첫 수업에서 학습 과정을 함께 확인합니다.'],
    checkTogether: observations.map((o) => `${o.subject ?? ''}: ${o.observe}`),
  };
}

/** 향후 6장 PPT에 그대로 매핑 가능한 슬라이드 JSON (서버 파일 생성 없음) */
export interface ProposalSlide {
  no: number;
  title: string;
  bullets: string[];
}

export function toSlides(vm: ProposalViewModel): ProposalSlide[] {
  return [
    {
      no: 1,
      title: '상담 표지',
      bullets: [vm.cover.brand, vm.cover.subtitle, vm.cover.core, `${vm.cover.studentName} · ${vm.cover.schoolLine}`, `상담일 ${vm.cover.consultDate}`],
    },
    { no: 2, title: '우리가 먼저 들은 이야기', bullets: vm.heard.map((h) => `[${h.from}] ${h.text}`) },
    { no: 3, title: '현재 확인된 학습상황(입력된 사실)', bullets: vm.facts.map((f) => `${f.label}: ${f.value}`) },
    {
      no: 4,
      title: '학교·과목 공개 참고자료',
      bullets: vm.schoolRef.linked
        ? [vm.schoolRef.message, vm.schoolRef.subjectNote ?? '', `출처: ${vm.schoolRef.source ?? ''}`, vm.schoolRef.limitation].filter(Boolean)
        : [vm.schoolRef.message, vm.schoolRef.limitation],
    },
    { no: 5, title: '더멘토 해결 제안', bullets: vm.strengths },
    {
      no: 6,
      title: '상담 후 제안 및 수업 시작 후 확인할 부분',
      bullets: [...vm.next.consultQuestions, ...vm.next.observations.map((o) => `${o.subject ?? ''} 관찰: ${o.observe}`), ...vm.next.comm],
    },
  ];
}
