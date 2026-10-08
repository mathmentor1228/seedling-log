// WEEKLY-COMMENT-V2: 선생님 주 1회 학생별 코멘트 작성 안내.
// 입력창(WeeklySummaryDialog)과 대시보드 위젯(WeeklySummaryWidget)이 같은 문구를 쓴다.
// 편지 함수(generate-weekly-letter)의 검증 규칙과 어긋나지 않게 유지할 것.

export interface WeeklyCommentQuestion {
  key: 'done' | 'stuck' | 'next';
  label: string;      // 칩에 보이는 짧은 이름
  question: string;   // 선생님에게 던지는 질문
  stem: string;       // 칩을 누르면 입력창에 들어가는 시작 문구
  example: string;    // 한 줄 예시
}

export const WEEKLY_COMMENT_QUESTIONS: WeeklyCommentQuestion[] = [
  {
    key: 'done',
    label: '해낸 것 하나',
    question: '이번 주 이 아이가 해낸 것, 전보다 나아진 것 하나',
    stem: '이번 주 ',
    example: '이번 주 인수분해에서 공통인수를 먼저 찾는 순서가 자리 잡았습니다.',
  },
  {
    key: 'stuck',
    label: '막힌 지점 하나',
    question: '어디까지는 되고, 어디서 시간이 걸리는지',
    stem: '~까지는 되는데, ',
    example: '일차방정식 세우기까지는 되는데, 이항에서 부호를 자주 놓칩니다.',
  },
  {
    key: 'next',
    label: '다음 주 같이 할 것',
    question: '다음 수업에서 학원이 먼저 다시 볼 것',
    stem: '다음 수업에서는 ',
    example: '다음 수업에서는 부호 바꾸는 자리만 따로 떼어 열 문제 다시 봅니다.',
  },
];

/** 짧게 보여줄 규칙. 편지 검증기가 걸러내는 표현과 같은 방향. */
export const WEEKLY_COMMENT_RULES: string[] = [
  '세 질문 중 하나만 써도 됩니다. 60~150자면 충분합니다.',
  '단원·문제·숙제처럼 기록에 남는 사실로 씁니다. "열심히 했다"보다 "무엇을 어디까지 했다".',
  '쓰지 않는 말: 못합니다·부족합니다·항상·전혀, 다른 아이와 비교, 표정·몸짓 묘사.',
  'AI가 학부모 말로 다듬어 주간 편지의 중심 문장이 됩니다. 원문 그대로 나가지 않습니다.',
];

export const WEEKLY_COMMENT_MIN_CHARS = 20;
export const WEEKLY_COMMENT_IDEAL_MAX_CHARS = 150;
