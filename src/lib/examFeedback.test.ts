import { describe, expect, it } from 'vitest';
import { feedbackError, feedbackText } from './examFeedback';

describe('individual exam feedback methods', () => {
  it('allows overall comment without wrong-answer checks', () => {
    expect(feedbackError('comment', '이번 시험은 개념 이해가 좋았습니다. 다음에는 검산을 연습합니다.', [])).toBeNull();
    expect(feedbackError('comment', '', [])).not.toBeNull();
  });
  it('requires a reason for each checked wrong question', () => {
    expect(feedbackError('items', '', [{ item_number: 5, reason_tags: [], memo: '' }])).not.toBeNull();
    expect(feedbackError('items', '', [{ item_number: 5, reason_tags: [], memo: '조건 해석 오류' }])).toBeNull();
    expect(feedbackError('items', '', [{ item_number: 5, reason_tags: ['reading'], memo: null }])).toBeNull();
  });
  it('submits question reasons without requiring an overall comment', () => {
    expect(feedbackText('items', '', [{ item_number: 5, reason_tags: ['reading'], memo: '부호 조건 누락' }], () => '조건 해석')).toBe('5번: 조건 해석 · 부호 조건 누락');
    expect(feedbackError('items', '', [])).toBeNull();
  });
});