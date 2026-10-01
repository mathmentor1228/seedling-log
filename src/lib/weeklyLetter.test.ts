import { describe, expect, it } from 'vitest';
import {
  buildFactsCard, buildUserPrompt, cleanLine, collectMaterial, composeParentMessage, formatHeader,
  homeworkCompletionRate, isRealRange, parseLetterJson, skipReason, validateParentLetter, validateStudentNote,
  type LessonRow,
} from '../../supabase/functions/generate-weekly-letter/letter.ts';

const VERBATIM = ['t-english'];

const lesson = (o: Partial<LessonRow> = {}): LessonRow => ({
  id: 'l1', student_id: 's1', subject: '수학', lesson_date: '2026-09-22', teacher_id: 't-math', teacher_display_name: '황은지',
  lesson_range: '수학1 p.42~55', notes: null, parent_direct_message: null, learning_issues_note: null, next_lesson_goal: null,
  homework_check_note: null, homework_status: 'completed', test_result: 'none', test_result_text: null, test_title: null, test_name: null,
  understanding_score: 4, attendance_status: ['정상등원'], weekly_summary: null, weekly_summary_week: null,
  ...o,
});

describe('재료 수집', () => {
  it('진도만 있고 선생님 말이 없으면 편지를 만들지 않는다', () => {
    const m = collectMaterial([lesson(), lesson({ id: 'l2', lesson_date: '2026-09-24' })], VERBATIM, '2026-09-21');
    expect(m.totalLessons).toBe(2);
    expect(m.lines).toHaveLength(0);
    expect(skipReason(m)).toBe('no_teacher_note');
  });

  it('수업이 없으면 no_lessons', () => {
    expect(skipReason(collectMaterial([], VERBATIM, '2026-09-21'))).toBe('no_lessons');
  });

  it('학부모께 한 줄이 있으면 편지 가능, 시스템 태그는 뗀다', () => {
    const m = collectMaterial([lesson({ notes: '[보충 시간: 15:00] 기울기 읽기를 세 번 만에 스스로 맞췄어요' })], VERBATIM, '2026-09-21');
    expect(skipReason(m)).toBeNull();
    expect(m.lines[0]).toMatchObject({ subject: '수학', date: '9/22', kind: '학부모께 한 줄', text: '기울기 읽기를 세 번 만에 스스로 맞췄어요' });
  });

  it('다음 수업 방향만 있는 것은 선생님 말로 치지 않는다', () => {
    const m = collectMaterial([lesson({ next_lesson_goal: '기울기·절편 다시' })], VERBATIM, '2026-09-21');
    expect(m.lines).toHaveLength(1);
    expect(skipReason(m)).toBe('no_teacher_note');
  });

  it('원문 그대로 싣는 선생님의 메모는 AI 재료에서 빼고 코멘트는 verbatim으로 모은다', () => {
    const m = collectMaterial([
      lesson({ id: 'e1', subject: '영어', teacher_id: 't-english', teacher_display_name: '이재진', notes: '학부모께 비공개 메모', weekly_summary: '이번 주 독해 지문에서 주제문 찾기를 연습했습니다.', weekly_summary_week: '2026-09-21' }),
      lesson({ id: 'e2', subject: '영어', teacher_id: 't-english', teacher_display_name: '이재진', lesson_date: '2026-09-24', weekly_summary: '이번 주 독해 지문에서 주제문 찾기를 연습했습니다.', weekly_summary_week: '2026-09-21' }),
    ], VERBATIM, '2026-09-21');
    expect(m.lines).toHaveLength(0);
    expect(m.verbatim).toHaveLength(1);
    expect(m.verbatim[0]).toMatchObject({ subject: '영어', teacher: '이재진' });
    expect(skipReason(m)).toBeNull();
  });

  it('숙제·테스트·결석을 과목별 사실로 모은다', () => {
    const m = collectMaterial([
      lesson({ homework_status: 'completed', test_result: 'pass', test_title: '단원평가' }),
      lesson({ id: 'l2', lesson_date: '2026-09-24', homework_status: 'partial', attendance_status: ['무단결석'], lesson_range: '수학1 p.56~60' }),
    ], VERBATIM, '2026-09-21');
    const s = m.subjects[0];
    expect(s.ranges).toEqual(['수학1 p.42~55']); // 결석한 날의 진도는 카드에 올리지 않는다
    expect(s.homework).toEqual(['완료', '부분']);
    expect(s.tests).toEqual(['단원평가 통과']);
    expect(s.absences).toBe(1);
    expect(homeworkCompletionRate(m)).toBe(75);
  });
});

describe('진도 칸 오염 (2026-10-02 첫 생성에서 발견)', () => {
  it('결석 사유·안내문은 진도로 치지 않는다', () => {
    expect(isRealRange('수학1 p.42~55')).toBe(true);
    expect(isRealRange('결석 사유: 가족 사정으로 인한 결석')).toBe(false);
    expect(isRealRange('보충수업 예정')).toBe(false);
    expect(isRealRange('시험기간으로 수업이 없습니다')).toBe(false);
  });
  it('결석한 날의 진도와 사유 문구는 카드에 나오지 않는다', () => {
    const m = collectMaterial([
      lesson({ notes: '기울기 읽기를 세 번 만에 맞췄어요' }),
      lesson({ id: 'e1', subject: '영어', lesson_date: '2026-09-24', lesson_range: '결석 사유: 가족 사정으로 인한 결석', attendance_status: ['인정결석'], homework_status: 'none_assigned' }),
      lesson({ id: 'e2', subject: '영어', lesson_date: '2026-09-26', lesson_range: '문제 풀이 (6모, 9모), 보충수업 예정' }),
    ], VERBATIM, '2026-09-21');
    const card = buildFactsCard(m);
    expect(card).not.toContain('결석 사유');
    expect(card).not.toContain('보충수업 예정');
    expect(card).toContain('영어 · 숙제 모두 해옴 · 결석 있음');
  });
});

describe('사실 카드·헤더·합성', () => {
  it('수업 횟수와 이해도 숫자는 카드에 쓰지 않는다', () => {
    const m = collectMaterial([
      lesson({ notes: '기울기 읽기를 세 번 만에 맞췄어요', homework_status: 'completed', test_result: 'pass', test_title: '단원평가' }),
      lesson({ id: 'l2', lesson_date: '2026-09-24', homework_status: 'partial' }),
    ], VERBATIM, '2026-09-21');
    const card = buildFactsCard(m);
    expect(card).toContain('수학 · 진도 수학1 p.42~55 · 숙제 일부만 해온 날 있음 · 단원평가 통과');
    expect(card).not.toMatch(/\d+회/);
    expect(card).not.toMatch(/\/5/);
  });

  it('헤더는 성을 떼고 기간을 붙인다', () => {
    expect(formatHeader('김민준', '2026-09-21', '2026-09-26')).toBe('[더멘토] 민준 주간 학습 편지 (9/21~9/26)');
  });

  it('최종 문안 = 헤더 + 편지 + 기록 카드 + 원문 코멘트', () => {
    const m = collectMaterial([
      lesson({ notes: '기울기 읽기를 세 번 만에 맞췄어요' }),
      lesson({ id: 'e1', subject: '영어', teacher_id: 't-english', teacher_display_name: '이재진', weekly_summary: '주제문 찾기 연습.', weekly_summary_week: '2026-09-21' }),
    ], VERBATIM, '2026-09-21');
    const out = composeParentMessage('김민준', '2026-09-21', '2026-09-26', '민준이는 이번 주 기울기 읽기를 세 번째 시도에서 스스로 맞혔습니다.', m);
    const parts = out.split('\n\n');
    expect(parts[0]).toBe('[더멘토] 민준 주간 학습 편지 (9/21~9/26)');
    expect(parts[1]).toContain('민준이는');
    expect(out).toContain('이번 주 기록');
    expect(out).toContain('💬 영어 이재진\n주제문 찾기 연습.');
  });

  it('프롬프트에 호칭 두 형태와 선생님 말이 들어간다', () => {
    const m = collectMaterial([lesson({ notes: '기울기 읽기를 세 번 만에 맞췄어요' })], VERBATIM, '2026-09-21');
    const p = buildUserPrompt('김민준', '2026-09-21', '2026-09-26', m);
    expect(p).toContain('주어형 "민준이는"');
    expect(p).toContain('호격 "민준아"');
    expect(p).toContain('[수학 9/22 · 학부모께 한 줄] 기울기 읽기를 세 번 만에 맞췄어요');
  });
});

describe('검증', () => {
  const good = '민준이는 이번 주 수학에서 일차함수 그래프 해석을 다뤘고, 세 번째 시도에서 스스로 맞게 풀었습니다. 그래프를 보고 어떤 개념을 적용할지 고르는 데 시간이 걸렸습니다. 식과 그림을 오가는 첫 단원이라 처음엔 대부분 이렇게 고르는 데 오래 걸리곤 합니다. 다음 수업에서는 기울기와 절편을 그래프에서 바로 읽는 연습부터 다시 봅니다. 가정에서 숙제 시작 시간을 한 번 물어봐 주시면 감사하겠습니다.';

  it('목표 문안은 통과한다', () => {
    expect(validateParentLetter(good, '김민준')).toEqual({ ok: true, violations: [] });
  });

  it('지어낸 장면·뭉뚱그린 말·약속형·결론짓는 말은 걸린다', () => {
    const bad = good.replace('스스로 맞게 풀었습니다', '연필을 굴리며 고민했습니다').replace('다시 봅니다', '다시 보겠습니다') + ' 전반적으로 연산이 부족합니다.';
    const v = validateParentLetter(bad, '김민준').violations;
    expect(v).toContain('SCENE:연필');
    expect(v).toContain('VAGUE:전반적으로');
    expect(v.some(x => x.startsWith('PROMISE:'))).toBe(true);
    expect(v.some(x => x.startsWith('JUDGEMENT:'))).toBe(true);
  });

  it('성을 붙이거나 횟수·점수를 쓰면 걸린다', () => {
    const v = validateParentLetter(good.replace('민준이는', '김민준이는') + ' 수업 3회 이해도 4/5였습니다.', '김민준').violations;
    expect(v).toContain('SURNAME_USED');
    expect(v).toContain('COUNT_EXPOSURE');
    expect(v).toContain('SCORE_EXPOSURE');
  });

  it('너무 짧거나 이름이 없으면 걸린다', () => {
    expect(validateParentLetter('짧다.', '김민준').violations).toEqual(expect.arrayContaining(['TOO_SHORT', 'NAME_MISSING']));
  });

  it('학생 메모 검증', () => {
    expect(validateStudentNote('민준아, 이번 주 기울기 읽기를 세 번 만에 네 힘으로 맞혔지. 다음 시간엔 절편까지 같이 보자. 🌱', '김민준').ok).toBe(true);
    expect(validateStudentNote('짧아', '김민준').ok).toBe(false);
  });

  it('학생 메모에 존댓말이 섞이거나 꾸짖으면 걸린다 (2026-10-02 첫 생성에서 발견)', () => {
    const v = validateStudentNote('민준아, 숙제 정확도를 높이는 것이 필요해. 주말 특강에 나오지 않은 점은 아쉬워. 다음 수업에서는 국어 내신 보강을 같이 진행합니다. 🌱', '김민준').violations;
    expect(v).toContain('HONORIFIC_MIX');
    expect(v).toContain('SCOLDING:아쉬워');
  });

  it("학부모 편지에 '지난주'를 쓰면 걸린다", () => {
    expect(validateParentLetter(good.replace('이번 주', '지난주'), '김민준').violations).toContain('LAST_WEEK_WORDING');
  });
});

describe('JSON 파싱·정리', () => {
  it('코드펜스가 있어도 파싱한다', () => {
    const j = parseLetterJson('```json\n{"parent_letter":"a","student_note":"b"}\n```');
    expect(j).toEqual({ parent_letter: 'a', student_note: 'b' });
  });
  it('필드가 없으면 null', () => {
    expect(parseLetterJson('{"x":1}')).toBeNull();
  });
  it('cleanLine은 대괄호 태그와 공백을 정리한다', () => {
    expect(cleanLine('  [보충 선생님: 김은수]  오늘  잘함 ')).toBe('오늘 잘함');
  });
});
