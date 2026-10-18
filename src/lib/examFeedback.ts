export type FeedbackMethod = 'items' | 'comment';
export interface FeedbackItem { item_number: number; reason_tags: string[]; memo: string | null }

export function feedbackError(method: FeedbackMethod, text: string, items: FeedbackItem[]): string | null {
  if (method === 'comment' && text.trim().length < 20) return '전체 코멘트를 20자 이상 적어주세요.';
  if (method === 'items' && items.some(item => !item.reason_tags.some(tag => tag.trim()) && !item.memo?.trim())) return '틀린 문항마다 이유를 선택하거나 적어주세요.';
  return null;
}

export function feedbackText(method: FeedbackMethod, text: string, items: FeedbackItem[], label: (code: string) => string): string {
  if (method === 'comment') return text.trim();
  const detail = items.length ? items.map(item => `${item.item_number}번: ${[...item.reason_tags.map(label), item.memo?.trim()].filter(Boolean).join(' · ')}`).join('\n') : '틀린 문항이 없습니다.';
  return [detail, text.trim()].filter(Boolean).join('\n\n');
}