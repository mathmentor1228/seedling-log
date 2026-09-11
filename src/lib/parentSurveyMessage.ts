export const PUBLISHED_ORIGIN = 'https://seedling-log.lovable.app';

export const surveyUrl = (token: string) => `${PUBLISHED_ORIGIN}/parent/survey?token=${token}`;

export const buildSurveyKakaoMessage = (link: string) =>
  `[더멘토학원] 아이의 학습 상황, 어떻게 전해드릴까요 (1분 소요)\n\n선생님이 매 수업 뒤 아이의 수업 내용과 숙제, 이해도를 기록하고 있습니다.\n\n그 기록을 학부모님께 조금 더 편하게, 조금 더 도움이 되게 전해드리고 싶습니다. 1분이면 되니 잠시 관심을 부탁드립니다. 골라주신 방식에 맞춰 전해드리겠습니다.\n\n세 가지 중 하나만 고르시면 됩니다. 어떤 메시지를 받게 되는지 화면에서 미리 보실 수 있습니다.\n\n선택하지 않으셔도 괜찮습니다. 지금처럼 학부모 웹페이지에서 확인하시면 되고, 학원 공지는 기존과 같이 카카오톡으로 보내드립니다.\n\n${link}`;

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
