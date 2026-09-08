// WEEKLY-REPORT-SAFETY-V1
// 학부모/학생에게 노출 가능한 모든 텍스트에 대한 서버측 문안 검증기.
// 순수 함수만 포함한다(운영 DB 접근 없음) → 단위 테스트 가능.

export type SafetyViolation =
  | 'NO_RECORD_CLAIM'
  | 'COUNT_EXPOSURE'
  | 'FUTURE_PROMISE'
  | 'ABSOLUTE_TERM'
  | 'COMPARISON'
  | 'TRAIT_ASSERTION'
  | 'ANXIETY'
  | 'HARSH_TONE'
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
  /(하|드리|진행하|보완하|채우|올리|시키|만들|지도하|안내하|이어가|살펴보|점검하|확인하)겠습니다/,
  /(드리겠|가겠습니다|나가겠습니다|하겠어요)/,
  // WEEKLY-REPORT-SAFETY-V2: 앞 동사와 무관하게 '~할 예정입니다 / 계획입니다' 전면 차단
  /(예정|계획)\s*(입니다|이에요|이며|이고|이라|입니다만)/,
  /(목표로\s*(하고\s*있|합니다)|목표입니다)/,
  /반드시\s*\S*(하|되)겠/,
  /보장(합니다|해\s*드리)/,
  /약속(드립니다|합니다)/,
  /(다음\s*주|앞으로|향후|이후)\s*[^.]{0,30}(하겠|드리겠|할\s*것입니다|진행합니다|이어갑니다|계속합니다)/,
];

// 3) 절대어
const ABSOLUTE_TERM_PATTERNS: RegExp[] = [
  /(항상|늘\s*변함없이|절대|무조건|전혀|완벽(하게|한|히)?|100\s*%|언제나)/,
];

// 4) 학생 간 비교
const COMPARISON_PATTERNS: RegExp[] = [
  /(다른\s*(학생|친구|아이)들?|또래|친구들|반\s*평균|평균\s*보다|상위권\s*학생들)\s*(보다|에\s*비해|와\s*비교|과\s*비교|대비|만큼|처럼|수준)/,
  // WEEKLY-REPORT-SAFETY-V2: 집단 비교 기준어 자체를 차단
  /(또래|동학년|같은\s*반\s*(학생|친구)|반\s*평균|학년\s*평균|상위권|중위권|하위권)/,
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


// 7) WEEKLY-REPORT-TONE-V3: 직접적인 질책·낙인·실망 표현(완곡 표현으로 대체되어야 함)
const HARSH_TONE_PATTERNS: RegExp[] = [
  /(문제가\s*(많|심각|큽)|태도가\s*(좋지\s*않|불량)|실망(스럽|입니다|했습니다)|한심|형편없|엉망|기대에\s*못\s*미(칩니다|쳤습니다)|나태|안일)/,
  /(제대로\s*(하지\s*않|안\s*하)|전혀\s*\S*지\s*않습니다|하려는\s*의지가\s*보이지\s*않)/,
  /(반성|각성|분발)(이\s*필요합니다|해야\s*합니다)/,
];

// 8) WEEKLY-REPORT-NORECORD-V1: "관찰/기록이 없다"는 식으로 교사가 지켜보지 않았다는 인상을 주는 표현 전면 차단
const NO_RECORD_CLAIM_PATTERNS: RegExp[] = [
  /(관찰|수업|학습|특이사항|코멘트|기록|일지)\s*(기록)?\s*(이|가)?\s*(없|남아\s*있지\s*않|부족해서|많지\s*않아서)/,
  /(작성하기가|말씀드리기(가)?|얘기해주기(가)?|설명드리기(가)?)\s*(조금\s*)?(어렵|힘들)/,
  /(떠올려\s*봤어|떠올려\s*보았)/,
  /(별다른|특별히\s*남겨둘\s*만한)\s*\S*\s*(없|않)/,
];

const GROUPS: Array<{ type: SafetyViolation; patterns: RegExp[] }> = [
  { type: 'NO_RECORD_CLAIM', patterns: NO_RECORD_CLAIM_PATTERNS },
  { type: 'COUNT_EXPOSURE', patterns: COUNT_EXPOSURE_PATTERNS },
  { type: 'FUTURE_PROMISE', patterns: FUTURE_PROMISE_PATTERNS },
  { type: 'ABSOLUTE_TERM', patterns: ABSOLUTE_TERM_PATTERNS },
  { type: 'COMPARISON', patterns: COMPARISON_PATTERNS },
  { type: 'TRAIT_ASSERTION', patterns: TRAIT_ASSERTION_PATTERNS },
  { type: 'ANXIETY', patterns: ANXIETY_PATTERNS },
  { type: 'HARSH_TONE', patterns: HARSH_TONE_PATTERNS },
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

// ============================================================
// WEEKLY-REPORT-SOFTEN-V1
// 중립 템플릿으로 통째로 되돌리기 전에, 흔한 '약속형/절대어/불안어' 어미만
// 관찰·방향성 표현으로 부드럽게 바꾼다. 사실 관계는 바꾸지 않는다.
// 예) "보완하겠습니다" → "보완하려 합니다", "완벽하게" → "충분히"
// ============================================================
const SOFTEN_RULES: Array<[RegExp, string]> = [
  // 약속형 어미 → 방향성 표현
  [/겠습니다/g, '려 합니다'],
  [/겠어요/g, '려 해요'],
  [/보장(합니다|해\s*드립니다|해\s*드리겠)/g, '살펴보려 합니다'],
  [/약속(드립니다|합니다)/g, '신경 쓰려 합니다'],
  [/(할|진행할|이어갈|보완할)\s*(예정|계획)\s*(입니다|이에요|이며|이고|이라)/g, '살펴볼 부분으로 두고 있습니다'],
  [/(예정|계획)\s*(입니다|이에요|이며|이고|이라)/g, '살펴볼 부분으로 두고 있습니다'],
  [/목표로\s*(하고\s*있습니다|합니다)/g, '중점을 두고 보려 합니다'],
  [/목표입니다/g, '중점을 두고 보려 합니다'],
  [/진행합니다/g, '진행하려 합니다'],
  [/이어갑니다/g, '이어가려 합니다'],
  [/계속합니다/g, '이어가려 합니다'],
  [/할\s*것입니다/g, '살펴보려 합니다'],
  [/반드시\s*/g, ''],
  // 절대어 → 완곡 표현
  [/항상|언제나|늘\s*변함없이/g, '대체로'],
  [/무조건/g, '대체로'],
  [/절대\s*/g, '좀처럼 '],
  [/전혀\s*/g, '아직 '],
  [/100\s*%/g, '대부분'],
  [/완벽하게|완벽히/g, '충분히'],
  [/완벽한/g, '탄탄한'],
  [/완벽합니다/g, '충분히 자리 잡았습니다'],
  // 불안 유발 표현 → 관찰 표현
  [/심각합니다/g, '유의해서 볼 부분입니다'],
  [/심각한/g, '유의해서 볼'],
  [/심각해집니다/g, '유의해서 볼 부분입니다'],
  [/위험한\s*수준/g, '유의가 필요한 상황'],
  [/위험합니다/g, '유의가 필요합니다'],
  [/이대로라면/g, '지금 흐름에서는'],
];

/** 저장 직전 완곡화. 규칙에 없는 위반은 그대로 남아 기존 fallback이 처리한다. */
export function softenExternalText(text: string): string {
  let out = text || '';
  for (const [re, to] of SOFTEN_RULES) out = out.replace(re, to);
  return out.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n');
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

// ============================================================
// WEEKLY-REPORT-NEUTRAL-FACTS-V1
// 중립 문안도 비어 보이지 않도록, 해당 기간의 숙제 이행률·테스트 결과·이해도를
// 숫자 노출 없이 정성 표현으로 담는다. 짧게(3~5문장) 유지한다.
// ============================================================
export interface ReportFacts {
  hasLessonData: boolean;
  subjects?: string[];
  homeworkRate?: number | null;   // 0~100
  understandingAvg?: number | null; // 1~5
  testAvgScore?: number | null;   // 0~100
  hasTestRecords?: boolean;
}

function homeworkSentence(rate: number | null | undefined): string | null {
  if (rate === null || rate === undefined) return null;
  if (rate >= 90) return '과제는 기한에 맞춰 대체로 잘 챙겨 온 흐름이 확인됩니다.';
  if (rate >= 70) return '과제는 대체로 이행되었고, 일부 회차에서는 마무리가 조금 덜 된 부분이 남았습니다.';
  if (rate >= 40) return '과제 이행은 절반 남짓 확인되어, 꾸준함이 이어지는지 조금 더 지켜볼 부분입니다.';
  return '기록상 과제가 남는 경우가 잦아, 학습 리듬이 자리 잡는지 유의 깊게 살필 부분으로 두고 있습니다.';
}

function testSentence(avg: number | null | undefined, hasTests?: boolean): string | null {
  if (avg === null || avg === undefined) {
    return hasTests ? '수업 중 확인 테스트는 진행되었으나 점수로 남은 기록은 제한적이었습니다.' : null;
  }
  if (avg >= 85) return '확인 테스트에서는 안정적인 결과가 이어졌습니다.';
  if (avg >= 70) return '확인 테스트는 대체로 기준선을 지켰고, 일부 단원은 보완이 필요한 모습이었습니다.';
  return '확인 테스트에서는 기준선에 못 미친 부분이 있어, 해당 단원은 반복해서 살펴볼 지점으로 두고 있습니다.';
}

function understandingSentence(avg: number | null | undefined): string | null {
  if (avg === null || avg === undefined) return null;
  if (avg >= 4) return '수업 중 이해 정도는 비교적 안정적으로 유지되었습니다.';
  if (avg >= 3) return '수업 중 이해 정도는 무난한 편이었고, 단원에 따라 편차가 보였습니다.';
  return '수업 중 이해 정도는 단원에 따라 어려움이 보여, 기본 개념을 다시 짚어 볼 부분이 있습니다.';
}

/** 사실 기반 중립 학부모 문안. 근거가 하나도 없으면 null → 기존 중립 템플릿 사용. */
export function factualParentTemplate(header: string, facts: ReportFacts): string | null {
  if (!facts.hasLessonData) return null;
  const body = [
    understandingSentence(facts.understandingAvg),
    homeworkSentence(facts.homeworkRate),
    testSentence(facts.testAvgScore, facts.hasTestRecords),
  ].filter(Boolean) as string[];
  if (body.length === 0 && (facts.subjects || []).length === 0) return null;
  if (body.length === 0) {
    body.push('수업 기록상 진행 흐름은 이어졌고, 세부 이해 정도와 과제 흐름은 조금 더 살펴볼 부분으로 두고 있습니다.');
  }

  const subjects = (facts.subjects || []).filter(Boolean);
  const lead = subjects.length > 0
    ? `이번 기간에는 ${subjects.join('·')} 수업 기록을 바탕으로 학습 흐름을 정리했습니다.`
    : '이번 기간에 남은 수업 기록을 바탕으로 학습 흐름을 정리했습니다.';
  const tail = '전반적인 흐름이 안정적으로 이어지는지 조금 더 지켜보며, 필요한 부분은 수업 중에 함께 짚어 보려 합니다.';

  return `${header}\n\n${lead} ${body.join(' ')}\n\n${tail}`;
}

/** 사실 기반 중립 학생 문안(짧게). */
export function factualStudentTemplate(facts: ReportFacts): string | null {
  if (!facts.hasLessonData) return null;
  const parts: string[] = [];
  if (typeof facts.homeworkRate === 'number') {
    parts.push(
      facts.homeworkRate >= 70
        ? '과제는 대체로 잘 챙겼어요.'
        : '과제를 챙기는 리듬을 조금만 더 붙여 보면 좋겠어요.'
    );
  }
  if (typeof facts.testAvgScore === 'number') {
    parts.push(
      facts.testAvgScore >= 85
        ? '확인 테스트 결과도 안정적으로 이어졌어요.'
        : '확인 테스트에서 아쉬웠던 단원은 다음 수업에서 다시 짚어 봐요.'
    );
  }
  if (parts.length === 0) return null;
  return parts.join(' ');
}


// generate-ai-report에 함께 전달하는 생성 규칙(프롬프트 강화용)
export const CONTENT_SAFETY_RULES = [
  '학부모/학생 문안과 subject_breakdown 등 외부 노출 텍스트에 실제 수업 횟수, 일지 수, 기록 수를 숫자로 쓰지 말 것.',
  '구체적인 미래 실행 계획, 약속, 보장 표현 금지. 대신 "유의 깊게 살필 부분", "조금 더 지켜볼 부분"처럼 관찰 방향만 서술.',
  '성격·태도·의도 단정, 학생 간 비교, 항상/절대/완벽 등 절대어, 불안을 유발하는 표현 금지.',
  '제출 완료된 수업 기록이 없으면 긍정·부정 평가를 만들지 말고 데이터 부족과 관찰 필요를 명시할 것.',
  // WEEKLY-REPORT-TONE-V3
  '문단 구조는 "확인된 기록 → 부담 없는 해석 → 유의 깊게 살필 지점" 순서를 지킬 것.',
  '직접적인 평가·질책·낙인 대신 관찰 범위를 제한한 완곡 표현을 쓸 것. 예: "기록상 일부 시기에", "조금 더 지켜볼 필요가 있습니다", "안정적으로 이어지는지 살펴볼 부분입니다".',
  '완곡하게 쓰되 확인된 기록보다 좋게 포장하거나 어려운 지점을 숨기지 말 것.',
  // WEEKLY-REPORT-GROUNDEDNESS-V1
  '수업일지·연결 숙제·시험 결과 원문에 명시되지 않은 행동, 표정, 몸짓, 도구, 교실 장면, 감정, 대화, 동기를 절대 만들어 내지 말 것.',
  '"연필을 굴리며", "고개를 끄덕였다", "눈빛이 달라졌다", "친구와 웃었다", "끝까지 붙잡고 있었다" 같은 서사적 장면 묘사 금지.',
  '문장을 예쁘게 만들기 위한 감각 묘사나 소설식 디테일 금지. 원문에 있는 사실만 요약·정리할 것.',
];

// ============================================================
// WEEKLY-REPORT-GROUNDEDNESS-V1
// 원문(수업일지/숙제/시험 기록)에 없는 구체 장면·행동·감정·동기 서술 차단
// ============================================================

const norm = (s: string) => (s || '').replace(/\s+/g, '');

// 각 항목: 문안에서 탐지할 정규식 + 원문에 있어야 인정되는 근거 토큰들
const SCENE_MARKERS: Array<{ re: RegExp; evidence: string[] }> = [
  { re: /연필|샤프|볼펜|지우개|필기구/, evidence: ['연필', '샤프', '볼펜', '지우개', '필기구'] },
  { re: /책상|의자|칠판|교실\s*(안|뒤|앞)|자리에\s*앉/, evidence: ['책상', '의자', '칠판', '교실', '자리에앉'] },
  { re: /고개를\s*(끄덕|갸웃|숙)/, evidence: ['고개'] },
  { re: /눈빛|눈을\s*(반짝|크게)|시선을/, evidence: ['눈빛', '눈을', '시선'] },
  { re: /표정|미간|얼굴이\s*(밝|굳)/, evidence: ['표정', '미간', '얼굴'] },
  { re: /웃(었|으며|음|는\s*모습)|미소|울먹|눈물|한숨/, evidence: ['웃', '미소', '울먹', '눈물', '한숨'] },
  { re: /손을\s*들|손가락|어깨|몸을\s*(기울|앞으로)|자세를\s*고쳐/, evidence: ['손을들', '손가락', '어깨', '몸을', '자세'] },
  { re: /중얼|속삭|말을\s*건네|대화를\s*나누|친구와|짝꿍|옆자리/, evidence: ['중얼', '속삭', '말을건네', '대화', '친구', '짝꿍', '옆자리'] },
  { re: /뿌듯|설레|신나|기뻐|즐거워|짜증|초조|긴장한\s*모습|불안해하/, evidence: ['뿌듯', '설레', '신나', '기뻐', '즐거', '짜증', '초조', '긴장', '불안'] },
  { re: /끝까지\s*붙잡|끝까지\s*놓지\s*않|한참을\s*들여다|골똘히|물끄러미/, evidence: ['끝까지', '한참', '골똘', '물끄러미'] },
  { re: /(하고\s*싶어\s*했|하기\s*싫어했|스스로\s*원해|의욕적으로|마음을\s*먹)/, evidence: ['하고싶', '싫어', '원해', '의욕', '마음'] },
];

function sentencesOf(text: string): string[] {
  return (text || '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function scanGroundedness(
  text: string,
  evidence: string
): { pass: boolean; ungroundedSentences: string[]; markers: string[] } {
  const ev = norm(evidence);
  const ungrounded: string[] = [];
  const markers = new Set<string>();

  for (const sentence of sentencesOf(text)) {
    for (const m of SCENE_MARKERS) {
      if (!m.re.test(sentence)) continue;
      const supported = m.evidence.some((k) => ev.includes(k));
      if (!supported) {
        ungrounded.push(sentence);
        markers.add(m.re.source.slice(0, 24));
        break;
      }
    }
  }

  return { pass: ungrounded.length === 0, ungroundedSentences: ungrounded, markers: [...markers] };
}

// 지원되지 않는 장면 문장을 제거한 중립 관찰 문안 반환.
// 남은 본문이 너무 짧으면 null → 호출부에서 중립 템플릿 fallback.
export function stripUngroundedSentences(
  text: string,
  evidence: string,
  minLength = 60
): string | null {
  const { pass, ungroundedSentences } = scanGroundedness(text, evidence);
  if (pass) return text;
  const drop = new Set(ungroundedSentences);
  const kept = (text || '')
    .split('\n')
    .map((line) =>
      sentencesOf(line)
        .filter((s) => !drop.has(s))
        .join(' ')
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return norm(kept).length >= minLength ? kept : null;
}
