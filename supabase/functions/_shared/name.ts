// 학생 이름 호칭 헬퍼 — 학부모·학생 문안에서 성을 떼고 다정하게 부르기 위해 쓴다.
// 예) 김민준 → 민준 / 민준이는 / 민준아,  황지우 → 지우 / 지우는 / 지우야
// '박채원_E' 처럼 구분용 접미사가 붙은 이름은 접미사를 먼저 뗀다.

const COMPOUND_SURNAMES = ['남궁', '독고', '동방', '사공', '서문', '선우', '제갈', '황보', '어금', '장곡', '강전'];

function isHangul(ch: string): boolean {
  const c = ch.charCodeAt(0);
  return c >= 0xac00 && c <= 0xd7a3;
}

/** 성을 뗀 이름. 한글 3~4글자만 성을 뗀다(4글자는 복성일 때 두 글자). 2글자·외국 이름은 그대로. */
export function givenName(fullName: string | null | undefined): string {
  const raw = (fullName || '').trim().replace(/\s+/g, '').replace(/_.*$/, '');
  if (!raw || !isHangul(raw[0])) return raw;
  if (raw.length <= 2) return raw;
  if (raw.length === 4 && COMPOUND_SURNAMES.some((s) => raw.startsWith(s))) return raw.slice(2);
  if (raw.length === 3 || raw.length === 4) return raw.slice(1);
  return raw;
}

/** 마지막 글자에 받침이 있는가 */
export function hasFinalConsonant(word: string): boolean {
  if (!word) return false;
  const c = word.charCodeAt(word.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return false;
  return (c - 0xac00) % 28 !== 0;
}

/** 학부모 문안 주어형: 민준이는 / 지우는 */
export function nameTopic(fullName: string | null | undefined): string {
  const g = givenName(fullName);
  if (!g) return '아이는';
  return hasFinalConsonant(g) ? `${g}이는` : `${g}는`;
}

/** 학생 문안 호격: 민준아 / 지우야 */
export function nameVocative(fullName: string | null | undefined): string {
  const g = givenName(fullName);
  if (!g) return '';
  return hasFinalConsonant(g) ? `${g}아` : `${g}야`;
}
