export const PUBLISHED_ORIGIN = 'https://seedling-log.lovable.app';

export const surveyUrl = (token: string) => `${PUBLISHED_ORIGIN}/parent/survey?token=${token}`;

export const buildSurveyKakaoMessage = (link: string) =>
  `[더멘토학원] 학부모님, 선생님이 매 수업 뒤 작성하는 우리 아이의 수업기록을 어떤 방식으로 받아보실지 선택해 주세요. 약 1분이 걸립니다.\n\n학원 공지는 기존처럼 카카오톡으로 보내드립니다. 설문에 응답하지 않으시면 아이의 개별 수업기록은 정기 카카오톡 전송 없이, 기존처럼 학부모 웹페이지에서 직접 확인하는 방식으로 유지됩니다.\n\n${link}`;

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
