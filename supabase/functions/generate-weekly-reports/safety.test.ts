// 순수 validator 테스트 (운영 DB 접근 없음)
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { scanSafety, neutralParentTemplate } from './safety.ts';

Deno.test('횟수 노출은 실패', () => {
  const r = scanSafety('이번 주 총 3회 수업을 진행했습니다.', { hasLessonData: true });
  assertEquals(r.pass, false);
  assertEquals(r.violations.includes('COUNT_EXPOSURE'), true);
});

Deno.test('미래 약속형은 실패', () => {
  const r = scanSafety('다음 주에는 부족한 부분을 반드시 보완하겠습니다.', { hasLessonData: true });
  assertEquals(r.pass, false);
  assertEquals(r.violations.includes('FUTURE_PROMISE'), true);
});

Deno.test('절대어는 실패', () => {
  const r = scanSafety('항상 완벽하게 과제를 해옵니다.', { hasLessonData: true });
  assertEquals(r.pass, false);
  assertEquals(r.violations.includes('ABSOLUTE_TERM'), true);
});

Deno.test('비교 표현은 실패', () => {
  const r = scanSafety('다른 학생들보다 이해가 빠른 편입니다.', { hasLessonData: true });
  assertEquals(r.pass, false);
  assertEquals(r.violations.includes('COMPARISON'), true);
});

Deno.test('성격 단정은 실패', () => {
  const r = scanSafety('의욕이 없고 집중력이 없는 모습이 이어집니다.', { hasLessonData: true });
  assertEquals(r.pass, false);
  assertEquals(r.violations.includes('TRAIT_ASSERTION'), true);
});

Deno.test('데이터 없는데 평가 단정은 실패', () => {
  const r = scanSafety('이번 주도 성실히 잘 하고 있습니다.', { hasLessonData: false });
  assertEquals(r.pass, false);
  assertEquals(r.violations.includes('EVAL_WITHOUT_DATA'), true);
});

Deno.test('정상 관찰형 문안은 통과', () => {
  const text =
    '이번 주 수업에서는 함수 단원의 기본 개념을 다뤘고, 풀이 과정을 정리하는 과정에서 스스로 확인하려는 모습이 보였습니다. 응용 문제에서는 조건을 옮겨 적는 부분을 조금 더 지켜볼 부분으로 두고 있습니다.';
  const r = scanSafety(text, { hasLessonData: true });
  assertEquals(r.pass, true, r.violations.join(','));
});

Deno.test('중립 템플릿 자체는 검증을 통과', () => {
  const withData = neutralParentTemplate('[더멘토] 주간 학습 리포트', true);
  const noData = neutralParentTemplate('[더멘토] 주간 학습 리포트', false);
  assertEquals(scanSafety(withData, { hasLessonData: true }).pass, true);
  assertEquals(scanSafety(noData, { hasLessonData: false }).pass, true);
});
