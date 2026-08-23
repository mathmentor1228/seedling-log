import { describe, expect, it } from 'vitest';
import {
  baseQuestionCount,
  buildSections,
  detailedSubjects,
  needsPrioritySelection,
  perspectivesFor,
  scoreQuestions,
  subjectQuestions,
} from './questions';
import {
  commSummary,
  consultQuestions,
  containsForbidden,
  displayValue,
  isProvided,
  maskPhone,
  NOT_PROVIDED,
  perspectiveDiffs,
  toObservationItems,
} from './rules';
import { buildProposal, buildStudentSummary, resolveSchoolRef, toSlides } from './proposal';
import { EMPTY_ANSWERS, LEVEL_LABEL, UNKNOWN_VALUE, type MentorMapAnswers } from './types';

const base = (o: Partial<MentorMapAnswers> = {}): MentorMapAnswers => ({ ...EMPTY_ANSWERS, ...o });

describe('적응형 분기', () => {
  it('작성자 3 × 학교급 3 = 6가지 조합 모두 섹션이 생성된다', () => {
    const authors = ['student', 'parent', 'both'] as const;
    const levels = ['elementary', 'middle', 'high'] as const;
    let combos = 0;
    for (const a of authors) {
      for (const l of levels) {
        const sections = buildSections(a, l);
        expect(sections.length).toBeGreaterThan(0);
        expect(sections.every((s) => s.questions.length > 0)).toBe(true);
        combos += 1;
      }
    }
    expect(combos).toBe(9);
    expect(Object.keys(LEVEL_LABEL)).toHaveLength(3);
  });

  it('함께 작성은 학생·학부모 두 관점을 모두 포함한다', () => {
    expect(perspectivesFor('both')).toEqual(['student', 'parent']);
    const sections = buildSections('both', 'middle');
    expect(sections.some((s) => s.perspective === 'student')).toBe(true);
    expect(sections.some((s) => s.perspective === 'parent')).toBe(true);
  });

  it('단일 관점 기본 문항 수는 10~14 범위', () => {
    for (const l of ['elementary', 'middle', 'high'] as const) {
      expect(baseQuestionCount('student', l)).toBeGreaterThanOrEqual(10);
      expect(baseQuestionCount('student', l)).toBeLessThanOrEqual(14);
      expect(baseQuestionCount('parent', l)).toBeGreaterThanOrEqual(9);
      expect(baseQuestionCount('parent', l)).toBeLessThanOrEqual(14);
    }
  });

  it('선택형 문항에는 잘 모르겠음 선택지가 붙는다', () => {
    const q = buildSections('student', 'middle')[0].questions[0];
    expect(q.options?.some((o) => o.value === UNKNOWN_VALUE)).toBe(true);
  });

  it('같은 과목도 학교급에 따라 문항이 다르다', () => {
    const e = subjectQuestions('수학', 'elementary').map((q) => q.text).join('|');
    const h = subjectQuestions('수학', 'high').map((q) => q.text).join('|');
    expect(e).not.toEqual(h);
    for (const s of ['수학', '영어', '국어', '과학', '사회/역사']) {
      for (const l of ['elementary', 'middle', 'high'] as const) {
        const qs = subjectQuestions(s, l);
        expect(qs.length).toBeGreaterThanOrEqual(2);
        expect(qs.length).toBeLessThanOrEqual(4);
      }
    }
  });

  it('알 수 없는 과목은 빈 배열', () => {
    expect(subjectQuestions('제2외국어', 'middle')).toEqual([]);
  });

  it('과목 3개 이상이면 우선순위 선택이 필요하고 상위 2과목만 상세 분기', () => {
    expect(needsPrioritySelection(['수학', '영어'])).toBe(false);
    expect(needsPrioritySelection(['수학', '영어', '국어'])).toBe(true);
    expect(detailedSubjects(['수학', '영어', '국어'], ['국어', '영어'])).toEqual(['국어', '영어']);
    expect(detailedSubjects(['수학', '영어'], [])).toEqual(['수학', '영어']);
    // 우선순위에 없는 과목은 상세 분기 대상이 아니다
    expect(detailedSubjects(['수학', '영어', '국어'], ['과학'])).toEqual([]);
  });

  it('성적 문항은 모두 선택 입력이다', () => {
    for (const l of ['elementary', 'middle', 'high'] as const) {
      expect(scoreQuestions(l).every((q) => q.optional)).toBe(true);
    }
  });
});

describe('미입력 처리', () => {
  it('미입력은 0이 아니라 미입력으로 표시된다', () => {
    expect(displayValue(undefined)).toBe(NOT_PROVIDED);
    expect(displayValue('')).toBe(NOT_PROVIDED);
    expect(displayValue([])).toBe(NOT_PROVIDED);
    expect(isProvided(undefined)).toBe(false);
    expect(displayValue('0')).toBe('0');
    expect(displayValue(UNKNOWN_VALUE)).toBe('잘 모르겠음(응답)');
    expect(displayValue([UNKNOWN_VALUE])).toBe('잘 모르겠음(응답)');
    expect(displayValue(['수학', '영어'])).toBe('수학, 영어');
  });
});

describe('관찰 항목 변환', () => {
  it('과목 응답을 판정이 아니라 관찰 항목으로 바꾼다', () => {
    const a = base({
      school_level: 'middle',
      subjects: ['수학'],
      subject_answers: { math_calc: '자주 실수해요', math_retry: '넘어가는 편' },
    });
    const items = toObservationItems(a);
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items.every((i) => i.subject === '수학')).toBe(true);
    const text = items.map((i) => `${i.reported} ${i.observe}`).join(' ');
    expect(containsForbidden(text)).toEqual([]);
  });

  it('응답이 없어도 과목별 기본 관찰 항목을 1개 제공한다', () => {
    const items = toObservationItems(base({ subjects: ['영어'], school_level: 'high' }));
    expect(items).toHaveLength(1);
    expect(items[0].observe).toContain('첫 수업');
  });
});

describe('상담 확인 질문', () => {
  it('3~5개를 생성하고 금지 표현이 없다', () => {
    const a = base({
      school_level: 'high',
      subjects: ['수학', '영어', '국어'],
      priority_subjects: ['수학', '영어'],
      student_answers: { s_hard_moment: ['시간이 부족할 때'] },
      parent_answers: { p_worry: ['집중 유지'] },
    });
    const qs = consultQuestions(a);
    expect(qs.length).toBeGreaterThanOrEqual(3);
    expect(qs.length).toBeLessThanOrEqual(5);
    expect(containsForbidden(qs.join(' '))).toEqual([]);
  });

  it('0건 응답에서도 안전하게 동작한다', () => {
    const qs = consultQuestions(base({ school_level: 'elementary' }));
    expect(qs.length).toBeGreaterThanOrEqual(3);
  });
});

describe('관점 차이', () => {
  it('함께 작성일 때만 비교하고 다름을 표시한다', () => {
    const a = base({
      author_type: 'both',
      school_level: 'high',
      student_answers: { s_change: '비슷하게 유지' },
      parent_answers: { p_change: '하락 흐름' },
    });
    const d = perspectiveDiffs(a);
    const topic = d.find((x) => x.topic === '최근 성적 흐름');
    expect(topic?.differs).toBe(true);
    expect(perspectiveDiffs({ ...a, author_type: 'parent' })).toEqual([]);
  });

  it('한쪽만 입력이면 차이로 표시하지 않는다', () => {
    const a = base({ author_type: 'both', parent_answers: { p_change: '유지' } });
    const d = perspectiveDiffs(a);
    expect(d.find((x) => x.topic === '최근 성적 흐름')?.differs).toBe(false);
  });
});

describe('소통 선호', () => {
  it('점수화하지 않고 문장으로 요약한다', () => {
    const lines = commSummary(base({ comm_pref: { c_frequency: '주 1회 요약', c_detail: '핵심만 짧게' } }));
    expect(lines).toContain('안내 주기: 주 1회 요약');
    expect(lines.join(' ')).not.toMatch(/관여도|점수|고\/중\/저/);
  });
  it('미입력이면 상담에서 정한다고 안내한다', () => {
    expect(commSummary(base())[0]).toContain('미입력');
  });
});

describe('학교 공개 통계 연결', () => {
  it('정확히 일치할 때만 연결하고 한계를 명시한다', () => {
    const hit = resolveSchoolRef('신길고등학교', 'high');
    expect(hit.linked).toBe(true);
    expect(hit.limitation).toContain('보장하지 않습니다');
    expect(resolveSchoolRef('신길고등학교', 'middle').linked).toBe(false);
    expect(resolveSchoolRef('', 'high').linked).toBe(false);
    expect(resolveSchoolRef('없는학교', 'middle').message).toContain('준비 중');
  });
});


describe('제안서 변환', () => {
  const rich = base({
    student_name: '김테스트',
    author_type: 'both',
    school_level: 'middle',
    contact_phone: '01012345678',
    school_name: '테스트중학교',
    grade: '2학년',
    subjects: ['수학', '영어'],
    subject_answers: { math_calc: '가끔 실수해요', eng_word: '금방 잊어버려요' },
    student_answers: { s_hard_moment: ['모르는 부분이 나올 때'] },
    parent_answers: { p_worry: ['이해도'] },
    comm_pref: { c_frequency: '주 1회 요약' },
    free_note: '수업 분위기를 알고 싶습니다.',
  });

  it('6영역 view-model과 6장 슬라이드를 만든다', () => {
    const vm = buildProposal(rich, new Date('2026-08-23T00:00:00Z'));
    expect(vm.cover.fileNameHint).toBe('MENTOR_MAP_김테스트_2026-08-23.pdf');
    expect(vm.heard.length).toBeGreaterThan(0);
    expect(vm.facts.some((f) => f.label === '상담 희망 과목')).toBe(true);
    expect(vm.schoolRef.linked).toBe(false);
    expect(vm.strengths.length).toBeGreaterThanOrEqual(3);
    const slides = toSlides(vm);
    expect(slides).toHaveLength(6);
    expect(slides.map((s) => s.no)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('제안서 전체 문안에 금지 표현이 없다', () => {
    const vm = buildProposal(rich);
    const all = JSON.stringify(vm) + JSON.stringify(toSlides(vm));
    expect(containsForbidden(all)).toEqual([]);
    expect(all).not.toContain('보장');
  });

  it('입력이 거의 없어도 제안서가 생성되고 미입력을 구분한다', () => {
    const vm = buildProposal(base({ student_name: '무입력', school_level: 'elementary' }));
    expect(vm.facts.some((f) => !f.provided && f.value === NOT_PROVIDED)).toBe(true);
    expect(toSlides(vm)).toHaveLength(6);
  });

  it('아주 긴 이름도 처리한다', () => {
    const vm = buildProposal(base({ student_name: '가'.repeat(40), school_level: 'high' }));
    expect(vm.cover.studentName).toHaveLength(40);
  });

  it('학생용 요약은 학부모용과 내용이 다르다', () => {
    const vm = buildProposal(rich);
    const ss = buildStudentSummary(rich);
    expect(ss.heard.length).toBeGreaterThan(0);
    expect(JSON.stringify(ss)).not.toEqual(JSON.stringify(vm));
    expect(containsForbidden(JSON.stringify(ss))).toEqual([]);
  });
});

describe('개인정보 표시', () => {
  it('전화번호는 기본 마스킹된다', () => {
    expect(maskPhone('01012345678')).toBe('010-****-5678');
    expect(maskPhone('123')).toBe('***');
  });
});
