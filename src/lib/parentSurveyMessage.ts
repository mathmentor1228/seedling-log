export const PUBLISHED_ORIGIN = 'https://seedling-log.lovable.app';

export const surveyUrl = (token: string) => `${PUBLISHED_ORIGIN}/parent/survey?token=${token}`;

export const buildSurveyKakaoMessage = (link: string) =>
  `[더멘토학원] 수업기록, 어떻게 받아보실까요 (1분 소요)\n\n선생님이 매 수업 뒤 아이의 수업 내용과 숙제, 이해도를 기록하고 있습니다. 그 기록이 학부모 웹페이지에 쌓여만 있어서, 필요하신 만큼 닿게 하려고 여쭙습니다.\n\n매 수업 뒤 짧게 받고 싶은 분, 주 1회 모아 보고 싶은 분, 필요할 때 직접 확인하고 싶은 분이 다 다릅니다. 학원이 임의로 정하지 않고 학부모님이 고르시면 좋겠습니다.\n\n세 가지 중 하나만 고르시면 됩니다. 실제로 어떤 메시지를 받게 되는지 화면에서 미리 보실 수 있습니다.\n\n설문 마지막에는 아이의 학습 성과를 학원 홍보에 활용해도 될지도 함께 여쭙습니다. 선택 항목이라 동의하지 않으셔도 됩니다.\n\n학원 공지는 기존처럼 카카오톡으로 보내드립니다. 응답하지 않으셔도 불이익은 없고, 수업기록은 지금처럼 웹페이지에서 확인하실 수 있습니다.\n\n${link}`;

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
