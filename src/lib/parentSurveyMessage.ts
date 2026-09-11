export const PUBLISHED_ORIGIN = 'https://seedling-log.lovable.app';

export const surveyUrl = (token: string) => `${PUBLISHED_ORIGIN}/parent/survey?token=${token}`;

export const buildSurveyKakaoMessage = (link: string) =>
  `[더멘토학원] 아이의 학습 상황, 전달방법을 선택해주세요. (1분 소요)\n\n안녕하세요. 멘토입니다.\n선생님이 매 수업 뒤 아이의 수업 내용과 숙제, 이해도를 기록하고 있습니다.\n아이들의 학습 진행과정을 보다 편하게 받아보실 수 있도록,\n선택하는 설문조사입니다.\n\n선택하지 않으신 경우, 기존 방법과 동일하게\n학부모 웹페이지에서 확인하시면 됩니다.\n학원 공지는 기존과 같이 카카오톡으로 보내드릴 예정입니다.\n\n체계적인 학습 관리체계를 위하여 함께 고민해주시면\n감사하겠습니다 ^^\n\n${link}`;

export async function fetchParentToken(studentId: string): Promise<string> {
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parent-portal?action=generate`,
    {
      method: 'POST',
      headers: {
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ student_id: studentId }),
    }
  );
  const result = await res.json();
  if (!res.ok || result.error) throw new Error(result.error || '링크 생성 실패');
  return result.token as string;
}
