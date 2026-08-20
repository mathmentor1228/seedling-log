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

const GROUPS: Array<{ type: SafetyViolation; patterns: RegExp[] }> = [
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
