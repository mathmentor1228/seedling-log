// WEEKLY-REPORT-SAFETY-V1
// 학부모/학생에게 노출 가능한 모든 텍스트에 대한 서버측 문안 검증기.
// 순수 함수만 포함한다(운영 DB 접근 없음) → 단위 테스트 가능.

export type SafetyViolation =
  | 'COUNT_EXPOSURE'
  | 'FUTURE_PROMISE'
  | 'ABSOLUTE_TERM'
  | 'COMPARISON'
  | 'TRAIT_ASSERTION'
  | 'ANXIETY'
  | 'EVAL_WITHOUT_DATA';

// 1) 수업 횟수 / 일지 수 / 기록 수 직접 노출
const COUNT_EXPOSURE_PATTERNS: RegExp[] = [
  /\d+\s*(회|번|차시|교시|건)\s*(의\s*)?(수업|보강|일지|기록|출석|테스트|숙제|과제|클리닉)/,
  /(수업|보강|일지|기록|출석|테스트|숙제|과제|클리닉)\s*(을|를|이|가)?\s*\d+\s*(회|번|차시|교시|건)/,
  /(총|모두|합계)\s*\d+\s*(회|번|건|차시)/,
  /주\s*\d+\s*(회|번)\s*(수업|진행)/,
  /\d+\s*개의\s*(수업|일지|기록)/,
];

// 2) 구체적 미래 실행 계획 / 약속 / 보장
const FUTURE_PROMISE_PATTERNS: RegExp[] = [
  /(하|드리|진행하|보완하|채우|올리|시키|만들)겠습니다/,
  /(할|진행할|보완할|드릴)\s*(예정|계획)(입니다|이에요|이며)/,
  /반드시\s*\S*(하|되)겠/,
  /보장(합니다|해\s*드리)/,
  /약속(드립니다|합니다)/,
  /(다음\s*주|앞으로)\s*[^.]{0,20}(하겠|할\s*것입니다|진행합니다)/,
];

// 3) 절대어
const ABSOLUTE_TERM_PATTERNS: RegExp[] = [
  /(항상|늘\s*변함없이|절대|무조건|전혀|완벽(하게|한|히)?|100\s*%|언제나)/,
];

// 4) 학생 간 비교
const COMPARISON_PATTERNS: RegExp[] = [
  /(다른\s*(학생|친구|아이)들?|또래|반\s*평균|평균\s*보다|상위권\s*학생들)\s*(보다|에\s*비해|와\s*비교|과\s*비교|대비)/,
  /(보다|에\s*비해)\s*(뒤처|앞서|우수|부족)/,
];

// 5) 성격·태도·의도 단정
const TRAIT_ASSERTION_PATTERNS: RegExp[] = [
  /(성격|성향|기질|인성)(이|은|상)\s*\S*(합니다|입니다|해요|이다)/,
  /(게으르|불성실하|의욕이\s*없|의지가\s*약하|집중력이\s*없|산만합니다|무기력합니다|하기\s*싫어합니다)/,
  /(일부러|의도적으로)\s*\S*(합니다|했습니다)/,
];

// 6) 불안 유발 / 과도하게 직설적
const ANXIETY_PATTERNS: RegExp[] = [
  /(심각(한|합니다|해집니다)|위험(합니다|한\s*수준)|큰일|돌이킬\s*수\s*없|포기|가망|손을\s*놓|이대로라면\s*\S*(어렵|불가))/,
];

const GROUPS: Array<{ type: SafetyViolation; patterns: RegExp[] }> = [
  { type: 'COUNT_EXPOSURE', patterns: COUNT_EXPOSURE_PATTERNS },
  { type: 'FUTURE_PROMISE', patterns: FUTURE_PROMISE_PATTERNS },
  { type: 'ABSOLUTE_TERM', patterns: ABSOLUTE_TERM_PATTERNS },
  { type: 'COMPARISON', patterns: COMPARISON_PATTERNS },
  { type: 'TRAIT_ASSERTION', patterns: TRAIT_ASSERTION_PATTERNS },
  { type: 'ANXIETY', patterns: ANXIETY_PATTERNS },
];

export function scanSafety(
  text: string,
  opts: { hasLessonData: boolean } = { hasLessonData: true }
): { pass: boolean; violations: SafetyViolation[] } {
  const violations = new Set<SafetyViolation>();
  const target = text || '';

  for (const g of GROUPS) {
    if (g.patterns.some((p) => p.test(target))) violations.add(g.type);
  }

  // 데이터가 없는데 긍·부정 평가를 단정하는 경우
  if (!opts.hasLessonData) {
    const evaluative =
      /(잘\s*하고\s*있|성실히|우수(합니다|한)|향상(되었|됐)|안정적으로\s*\S*(합니다|했습니다)|부족(합니다|한\s*모습)|아쉬(웠습니다|운\s*모습))/;
    if (evaluative.test(target)) violations.add('EVAL_WITHOUT_DATA');
  }

  return { pass: violations.size === 0, violations: [...violations] };
}

// 위반 시 저장되는 안전 중립 템플릿
export function neutralParentTemplate(header: string, hasLessonData: boolean): string {
  if (!hasLessonData) {
    return `${header}

이번 주에는 학습 상황을 정리해 말씀드릴 만한 수업 기록이 확인되지 않았습니다. 학습 흐름을 판단하기에는 자료가 충분하지 않아, 현재 상태에 대한 평가는 남기지 않았습니다.

수업 참여 상황과 과제 진행은 조금 더 유의 깊게 살필 부분으로 두고 있습니다. 궁금하신 부분은 담당 선생님께 편하게 문의해 주세요.`;
  }

  return `${header}

이번 주 학습 내용은 담당 선생님이 남긴 기록을 바탕으로 정리하고 있습니다. 학부모님께 전해 드릴 문안은 표현을 다듬는 중입니다.

수업 중 이해 정도와 과제 흐름은 조금 더 지켜볼 부분으로 두고 있습니다.`;
}

export function neutralStudentTemplate(hasLessonData: boolean): string {
  return hasLessonData
    ? '이번 주 학습 내용은 선생님과 함께 다시 정리해 볼 부분이 있어요. 다음 수업에서 이어서 확인해 봐요.'
    : '이번 주에는 확인된 학습 기록이 많지 않았어요. 다음 수업에서 함께 상황을 정리해 봐요.';
}

// generate-ai-report에 함께 전달하는 생성 규칙(프롬프트 강화용)
export const CONTENT_SAFETY_RULES = [
  '학부모/학생 문안과 subject_breakdown 등 외부 노출 텍스트에 실제 수업 횟수, 일지 수, 기록 수를 숫자로 쓰지 말 것.',
  '구체적인 미래 실행 계획, 약속, 보장 표현 금지. 대신 "유의 깊게 살필 부분", "조금 더 지켜볼 부분"처럼 관찰 방향만 서술.',
  '성격·태도·의도 단정, 학생 간 비교, 항상/절대/완벽 등 절대어, 불안을 유발하는 표현 금지.',
  '제출 완료된 수업 기록이 없으면 긍정·부정 평가를 만들지 말고 데이터 부족과 관찰 필요를 명시할 것.',
];
