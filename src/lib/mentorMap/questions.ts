// MENTOR-MAP-V1: 작성자(3) × 학교급(3) 적응형 문항 정의 (순수 데이터/함수)
// 금지: 진단·판정·능력 추정 표현, '문제가 있다' 전제, 유도형 문구.
import {
  type AuthorType,
  type Question,
  type QuestionSection,
  type SchoolLevel,
  type SubjectKey,
  UNKNOWN_LABEL,
  UNKNOWN_VALUE,
} from './types';

const opt = (...labels: string[]) => labels.map((l) => ({ value: l, label: l }));

const withUnknown = (q: Question): Question =>
  q.allowUnknown && q.options
    ? { ...q, options: [...q.options, { value: UNKNOWN_VALUE, label: UNKNOWN_LABEL }] }
    : q;

/** 학생 관점 문항 */
const STUDENT_QUESTIONS: Record<SchoolLevel, Question[]> = {
  elementary: [
    { id: 's_interest', text: '요즘 공부할 때 마음은 어떤 편이야?', type: 'single', allowUnknown: true, options: opt('재미있을 때가 많아요', '그저 그래요', '좀 지루해요', '어렵게 느껴져요') },
    { id: 's_start', text: '숙제나 공부를 혼자 시작하는 건 어때?', type: 'single', allowUnknown: true, options: opt('혼자 잘 시작해요', '누가 말해주면 시작해요', '시작이 오래 걸려요') },
    { id: 's_read', text: '글을 읽고 무슨 뜻인지 파악하는 건 어때?', type: 'single', allowUnknown: true, options: opt('대체로 잘 돼요', '길어지면 헷갈려요', '천천히 읽으면 괜찮아요') },
    { id: 's_hw', text: '숙제할 때 가장 자주 있는 일은?', type: 'multi', allowUnknown: true, options: opt('시간이 오래 걸려요', '모르는 문제가 있어요', '빨리 끝내고 싶어요', '어렵지 않아요') },
    { id: 's_ask', text: '모르는 걸 선생님에게 물어보는 건 어때?', type: 'single', allowUnknown: true, options: opt('편하게 물어봐요', '조금 망설여져요', '거의 못 물어봐요') },
    { id: 's_fav', text: '자신 있는 과목이 있다면 골라줘', type: 'multi', optional: true, allowUnknown: true, options: opt('수학', '영어', '국어', '과학', '사회/역사') },
    { id: 's_help', text: '도움을 더 받고 싶은 과목이 있다면?', type: 'multi', optional: true, allowUnknown: true, options: opt('수학', '영어', '국어', '과학', '사회/역사') },
  ],
  middle: [
    { id: 's_exam_exp', text: '최근 내신 시험을 준비해 본 경험은 어떤 편이었나요?', type: 'single', allowUnknown: true, options: opt('계획대로 준비했어요', '계획은 세웠지만 잘 지키지 못했어요', '준비 방법을 잘 몰랐어요', '아직 경험이 적어요') },
    { id: 's_exam_start', text: '시험 준비는 보통 언제부터 시작하나요?', type: 'single', allowUnknown: true, options: opt('3주 전쯤', '2주 전쯤', '1주 전쯤', '시험 직전') },
    { id: 's_hard_subject', text: '요즘 특히 시간이 더 필요한 과목은?', type: 'multi', allowUnknown: true, options: opt('수학', '영어', '국어', '과학', '사회/역사') },
    { id: 's_written', text: '서술형 문항은 어떤 편인가요?', type: 'single', allowUnknown: true, options: opt('생각을 쓰는 게 편해요', '아는데 쓰기가 어려워요', '무엇을 써야 할지 막막해요') },
    { id: 's_wrong', text: '틀린 문제는 보통 어떻게 하나요?', type: 'single', allowUnknown: true, options: opt('다시 풀어봐요', '해설만 읽어요', '넘어가는 편이에요') },
    { id: 's_plan', text: '공부 계획을 세우고 실행하는 건 어떤가요?', type: 'single', allowUnknown: true, options: opt('세우고 지키는 편', '세우지만 잘 못 지켜요', '계획 없이 그때그때') },
  ],
  high: [
    { id: 's_track', text: '요즘 더 신경 쓰이는 쪽은 어디인가요?', type: 'single', allowUnknown: true, options: opt('내신', '모의고사', '둘 다', '아직 정하지 못함') },
    { id: 's_change', text: '최근 성적 변화에 대해 본인이 느끼는 점은?', type: 'single', allowUnknown: true, options: opt('올라가는 흐름', '비슷하게 유지', '내려가는 흐름', '과목마다 달라요') },
    { id: 's_time', text: '평일 자기 학습 시간은 보통 어느 정도인가요?', type: 'single', allowUnknown: true, options: opt('1시간 미만', '1~2시간', '2~4시간', '4시간 이상') },
    { id: 's_priority', text: '지금 가장 먼저 정리하고 싶은 것은?', type: 'multi', allowUnknown: true, options: opt('개념 정리', '문제 풀이량', '오답 관리', '시간 관리', '선택과목 전략') },
    { id: 's_career', text: '진로나 선택과목 방향은 어느 정도 정해졌나요?', type: 'single', allowUnknown: true, options: opt('구체적으로 정해짐', '대략적인 방향만', '아직 탐색 중') },
    { id: 's_balance', text: '학교 시험과 수능 대비의 균형은 어떤가요?', type: 'single', allowUnknown: true, options: opt('둘 다 챙기는 편', '내신 위주', '수능 위주', '균형 잡기가 어려움') },
  ],
};

/** 학부모 관점 문항 */
const PARENT_QUESTIONS: Record<SchoolLevel, Question[]> = {
  elementary: [
    { id: 'p_basic', text: '기초 학습(읽기·연산 등)에 대해 요즘 어떻게 보고 계신가요?', type: 'single', allowUnknown: true, options: opt('무난해 보입니다', '일부 영역이 신경 쓰입니다', '전반적으로 도움이 필요해 보입니다') },
    { id: 'p_habit', text: '학습 습관에서 가장 눈에 띄는 부분은?', type: 'multi', allowUnknown: true, options: opt('스스로 시작하기', '앉아 있는 시간', '숙제 마무리', '정리 정돈', '특별히 없음') },
    { id: 'p_emotion', text: '공부와 관련한 정서 반응은 어떤 편인가요?', type: 'single', allowUnknown: true, options: opt('편안한 편', '가끔 부담스러워함', '자주 힘들어함') },
    { id: 'p_conflict', text: '가정에서 학습으로 인한 갈등은 어느 정도인가요?', type: 'single', allowUnknown: true, options: opt('거의 없음', '가끔 있음', '자주 있음') },
    { id: 'p_feedback', text: '학원에서 어떤 피드백을 받고 싶으신가요?', type: 'multi', allowUnknown: true, options: opt('수업 중 모습', '숙제 수행', '이해한 부분', '정서적 반응', '가정 지도 방법') },
  ],
  middle: [
    { id: 'p_adapt', text: '내신 체제 적응에 대해 어떻게 보고 계신가요?', type: 'single', allowUnknown: true, options: opt('잘 적응하는 편', '적응 중', '어려워하는 편') },
    { id: 'p_volume', text: '현재 학습량에 대한 생각은?', type: 'single', allowUnknown: true, options: opt('적당함', '조금 부족함', '많이 부족함', '오히려 과함') },
    { id: 'p_self', text: '자기주도 학습은 어느 정도라고 보시나요?', type: 'single', allowUnknown: true, options: opt('스스로 하는 편', '확인이 필요함', '함께 봐줘야 함') },
    { id: 'p_subject', text: '자신감이 낮아 보이는 과목이 있다면?', type: 'multi', optional: true, allowUnknown: true, options: opt('수학', '영어', '국어', '과학', '사회/역사') },
    { id: 'p_examprep', text: '시험 준비 방식에 대해 아시는 대로 알려주세요', type: 'single', allowUnknown: true, options: opt('계획적으로 준비', '벼락치기 편', '방법을 어려워함') },
    { id: 'p_conflict', text: '학습 관련 부모-자녀 대화는 어떤 편인가요?', type: 'single', allowUnknown: true, options: opt('편안하게 나눔', '가끔 부딪힘', '대화가 어려움') },
    { id: 'p_expect', text: '학원 관리에서 기대하시는 부분은?', type: 'multi', allowUnknown: true, options: opt('진도 관리', '숙제 관리', '시험 대비', '학습 습관', '소통·피드백') },
  ],
  high: [
    { id: 'p_change', text: '최근 성적 변화에 대해 어떻게 보고 계신가요?', type: 'single', allowUnknown: true, options: opt('상승 흐름', '유지', '하락 흐름', '과목별로 다름') },
    { id: 'p_career', text: '진로·선택과목 관련 상황은?', type: 'single', allowUnknown: true, options: opt('방향이 정해짐', '고민 중', '정보가 더 필요함') },
    { id: 'p_strategy', text: '내신과 수능 대비 비중은 어떻게 생각하시나요?', type: 'single', allowUnknown: true, options: opt('내신 우선', '수능 우선', '균형', '상담에서 논의하고 싶음') },
    { id: 'p_time', text: '시간 관리에서 신경 쓰이는 부분은?', type: 'multi', allowUnknown: true, options: opt('학습 시작 시간', '집중 지속', '과목 배분', '휴식·수면', '특별히 없음') },
    { id: 'p_role', text: '학원에 기대하시는 역할은?', type: 'multi', allowUnknown: true, options: opt('개념 정리', '문제 풀이 훈련', '내신 대비', '학습 관리·점검', '진로·전략 상담') },
  ],
};

/** 고민·요구 문항 */
const STUDENT_VOICE: Question[] = [
  { id: 's_hard_moment', text: '공부하면서 가장 힘들다고 느끼는 순간은?', type: 'multi', allowUnknown: true, options: opt('시작할 때', '모르는 부분이 나올 때', '시간이 부족할 때', '결과가 기대와 다를 때', '특별히 없음') },
  { id: 's_want_help', text: '어떤 방식의 도움이 가장 편할까요?', type: 'multi', allowUnknown: true, options: opt('처음부터 차근차근 설명', '문제로 직접 확인', '자주 물어볼 수 있는 분위기', '계획을 같이 세우기') },
  { id: 's_teacher', text: '선생님에게 바라는 점이 있다면?', type: 'multi', allowUnknown: true, options: opt('천천히 설명해주기', '자주 확인해주기', '스스로 할 시간 주기', '칭찬·격려') },
  { id: 's_goal', text: '이번에 이루고 싶은 목표를 골라주세요', type: 'multi', optional: true, allowUnknown: true, options: opt('내용 이해하기', '숙제 스스로 하기', '시험 준비 방법 익히기', '자신감 회복') },
];

const PARENT_VOICE: Question[] = [
  { id: 'p_worry', text: '요즘 가장 마음이 쓰이는 모습은?', type: 'multi', allowUnknown: true, options: opt('학습 시작', '집중 유지', '이해도', '시험 준비', '정서·자신감', '특별히 없음') },
  { id: 'p_wish', text: '학원에서 우선 도움받고 싶은 부분은?', type: 'multi', allowUnknown: true, options: opt('개념 이해', '숙제·복습 관리', '시험 대비', '학습 습관', '정기적인 소통') },
  { id: 'p_home', text: '가정에서의 부담이 있다면 알려주세요', type: 'multi', optional: true, allowUnknown: true, options: opt('학습 시간 관리', '갈등 상황', '정보 부족', '특별히 없음') },
  { id: 'p_topic', text: '상담에서 꼭 나누고 싶은 내용이 있다면?', type: 'multi', optional: true, allowUnknown: true, options: opt('과목별 방향', '시험 준비 계획', '학습 습관', '진로', '소통 방식') },
];

/** 소통 선호 (점수화하지 않음) */
export const COMM_QUESTIONS: Question[] = [
  { id: 'c_frequency', text: '학습 소식을 어느 정도 주기로 받아보고 싶으신가요?', type: 'single', options: opt('수업마다 간단히', '주 1회 요약', '시험 전후', '중요한 변화가 있을 때만') },
  { id: 'c_instant', text: '바로 알려드렸으면 하는 상황을 골라주세요', type: 'multi', optional: true, options: opt('결석·지각', '숙제 미완료', '시험 결과', '반복되는 어려움') },
  { id: 'c_order', text: '소통 순서는 어떤 방식이 좋을까요?', type: 'single', options: opt('학생에게 먼저, 이후 보호자 요약', '학생·보호자 동시 안내', '보호자에게 우선 안내') },
  { id: 'c_detail', text: '원하는 안내 상세 수준은?', type: 'single', options: opt('핵심만 짧게', '적당한 설명', '가능한 자세히') },
];

/** 성적 정보 (선택 입력, 미입력은 0이 아님) */
export function scoreQuestions(level: SchoolLevel): Question[] {
  if (level === 'elementary') {
    return [
      { id: 'g_recent_unit', text: '최근 학교에서 배운 단원 중 신경 쓰이는 부분이 있다면?', type: 'text', optional: true },
      { id: 'g_school_eval', text: '학교 평가(단원평가 등) 경험은?', type: 'single', optional: true, allowUnknown: true, options: opt('종종 있었어요', '거의 없었어요') },
    ];
  }
  if (level === 'middle') {
    return [
      { id: 'g_recent_score', text: '최근 시험 점수대(선택 입력)', type: 'single', optional: true, allowUnknown: true, options: opt('90점 이상', '80점대', '70점대', '60점대', '60점 미만') },
      { id: 'g_achievement', text: '성취도(A~E)를 알고 계시면 선택해주세요', type: 'single', optional: true, allowUnknown: true, options: opt('A', 'B', 'C', 'D', 'E') },
      { id: 'g_subject_feel', text: '과목별 체감 난이도가 높은 과목', type: 'multi', optional: true, allowUnknown: true, options: opt('수학', '영어', '국어', '과학', '사회/역사') },
    ];
  }
  return [
    { id: 'g_naeshin_score', text: '내신 점수대(선택 입력)', type: 'single', optional: true, allowUnknown: true, options: opt('90점 이상', '80점대', '70점대', '70점 미만') },
    { id: 'g_naeshin_grade', text: '내신 등급대(선택 입력)', type: 'single', optional: true, allowUnknown: true, options: opt('1~2등급', '3~4등급', '5~6등급', '7등급 이하') },
    { id: 'g_mock_grade', text: '모의고사 등급대(선택 입력)', type: 'single', optional: true, allowUnknown: true, options: opt('1~2등급', '3~4등급', '5~6등급', '7등급 이하') },
  ];
}

/** 과목별 추가 문항 (학교급 맥락에 따라 다르게) */
const SUBJECT_BANK: Record<SubjectKey, Record<SchoolLevel, Question[]>> = {
  '수학': {
    elementary: [
      { id: 'math_concept', text: '수학에서 새 내용을 배울 때 어떤가요?', type: 'single', allowUnknown: true, options: opt('설명을 들으면 이해돼요', '한 번 더 들으면 이해돼요', '설명이 어렵게 느껴져요') },
      { id: 'math_calc', text: '계산할 때 자주 있는 일은?', type: 'single', allowUnknown: true, options: opt('실수가 거의 없어요', '가끔 실수해요', '자주 실수해요') },
      { id: 'math_start', text: '문제를 읽고 풀이를 시작하는 건 어떤가요?', type: 'single', allowUnknown: true, options: opt('바로 시작해요', '조금 생각이 필요해요', '어디서부터 할지 모르겠어요') },
    ],
    middle: [
      { id: 'math_concept', text: '개념 이해는 어느 정도라고 느끼나요?', type: 'single', allowUnknown: true, options: opt('수업에서 대부분 이해', '복습하면 이해', '다시 설명이 필요함') },
      { id: 'math_process', text: '풀이 과정을 쓰는 것은 어떤가요?', type: 'single', allowUnknown: true, options: opt('과정을 적는 편', '답만 적는 편', '과정 쓰기가 어려움') },
      { id: 'math_retry', text: '오답은 다시 풀어보나요?', type: 'single', allowUnknown: true, options: opt('다시 풀어봄', '해설만 확인', '넘어가는 편') },
      { id: 'math_naeshin', text: '학교 내신 수학에서 신경 쓰이는 부분은?', type: 'multi', allowUnknown: true, options: opt('서술형', '심화 문항', '시간 부족', '단원별 편차') },
    ],
    high: [
      { id: 'math_concept', text: '개념과 문제 적용 사이에서 어려운 지점은?', type: 'multi', allowUnknown: true, options: opt('개념 자체', '유형 적용', '복합 문항', '풀이 속도') },
      { id: 'math_process', text: '서술형·풀이 과정 표현은 어떤가요?', type: 'single', allowUnknown: true, options: opt('논리적으로 정리됨', '식은 쓰지만 설명 부족', '정리가 어려움') },
      { id: 'math_track', text: '내신과 모의고사 중 더 보완하고 싶은 쪽은?', type: 'single', allowUnknown: true, options: opt('내신', '모의고사', '둘 다') },
    ],
  },
  '영어': {
    elementary: [
      { id: 'eng_word', text: '영어 단어 외우기는 어떤가요?', type: 'single', allowUnknown: true, options: opt('잘 외워요', '금방 잊어버려요', '외우는 게 힘들어요') },
      { id: 'eng_read', text: '영어 문장을 읽고 뜻을 아는 건?', type: 'single', allowUnknown: true, options: opt('대체로 알아요', '단어는 알지만 문장은 어려워요', '어렵게 느껴져요') },
      { id: 'eng_listen', text: '영어 듣기는 어떤가요?', type: 'single', allowUnknown: true, options: opt('편해요', '보통이에요', '어려워요') },
    ],
    middle: [
      { id: 'eng_word', text: '어휘 학습은 어떤 편인가요?', type: 'single', allowUnknown: true, options: opt('꾸준히 하는 편', '시험 전에만', '방법을 잘 모름') },
      { id: 'eng_grammar', text: '문법은 어떤가요?', type: 'single', allowUnknown: true, options: opt('설명 가능', '문제는 풀지만 설명은 어려움', '전반적으로 어려움') },
      { id: 'eng_reading', text: '독해에서 걸리는 부분은?', type: 'multi', allowUnknown: true, options: opt('어휘', '문장 구조', '시간', '주제 파악') },
      { id: 'eng_school', text: '학교 시험 대비(본문·부교재)는 어떻게 하고 있나요?', type: 'single', allowUnknown: true, options: opt('본문 정리까지 함', '문제 위주', '방법을 모름') },
    ],
    high: [
      { id: 'eng_reading', text: '독해에서 보완하고 싶은 부분은?', type: 'multi', allowUnknown: true, options: opt('구문 분석', '어휘', '시간 관리', '오답 유형') },
      { id: 'eng_write', text: '서술형·문장쓰기는 어떤가요?', type: 'single', allowUnknown: true, options: opt('무난함', '문장은 쓰지만 감점이 있음', '어려움') },
      { id: 'eng_track', text: '내신 본문 학습과 모의고사 중 우선순위는?', type: 'single', allowUnknown: true, options: opt('내신 본문', '모의고사', '둘 다') },
    ],
  },
  '국어': {
    elementary: [
      { id: 'kor_read', text: '글을 읽는 속도는 어떤가요?', type: 'single', allowUnknown: true, options: opt('편하게 읽어요', '천천히 읽어요', '읽기가 부담돼요') },
      { id: 'kor_meaning', text: '읽은 내용을 설명하는 건 어떤가요?', type: 'single', allowUnknown: true, options: opt('잘 설명해요', '조금 어려워요', '많이 어려워요') },
    ],
    middle: [
      { id: 'kor_read', text: '지문 독해에서 어려운 부분은?', type: 'multi', allowUnknown: true, options: opt('속도', '내용 파악', '어휘', '특별히 없음') },
      { id: 'kor_grammar', text: '문법(국어) 학습은 어떤가요?', type: 'single', allowUnknown: true, options: opt('정리되어 있음', '부분적으로 알고 있음', '어려움') },
      { id: 'kor_literature', text: '문학 작품 정리는 어떻게 하고 있나요?', type: 'single', allowUnknown: true, options: opt('스스로 정리', '수업 필기 위주', '정리를 어려워함') },
      { id: 'kor_written', text: '서술형 답안 작성은 어떤가요?', type: 'single', allowUnknown: true, options: opt('무난함', '핵심어 빠짐', '작성이 어려움') },
    ],
    high: [
      { id: 'kor_read', text: '독해에서 시간이 더 필요한 영역은?', type: 'multi', allowUnknown: true, options: opt('독서(비문학)', '문학', '언어와 매체', '화법과 작문') },
      { id: 'kor_time', text: '시험에서 시간 관리는 어떤가요?', type: 'single', allowUnknown: true, options: opt('여유 있음', '빠듯함', '자주 부족함') },
      { id: 'kor_track', text: '내신과 모의고사 중 우선 보완하고 싶은 쪽은?', type: 'single', allowUnknown: true, options: opt('내신', '모의고사', '둘 다') },
    ],
  },
  '과학': {
    elementary: [
      { id: 'sci_term', text: '과학 용어는 어떤가요?', type: 'single', allowUnknown: true, options: opt('익숙해요', '가끔 헷갈려요', '어려워요') },
      { id: 'sci_exp', text: '실험이나 관찰 활동은 어떤가요?', type: 'single', allowUnknown: true, options: opt('재미있어요', '보통이에요', '어렵게 느껴져요') },
    ],
    middle: [
      { id: 'sci_concept', text: '개념 사이의 연결은 어떤가요?', type: 'single', allowUnknown: true, options: opt('연결해서 이해함', '단원별로 따로 기억', '연결이 어려움') },
      { id: 'sci_calc', text: '계산이 들어간 단원은 어떤가요?', type: 'single', allowUnknown: true, options: opt('무난함', '연습이 더 필요', '어려움') },
      { id: 'sci_data', text: '그래프·자료·실험 해석은 어떤가요?', type: 'single', allowUnknown: true, options: opt('무난함', '가끔 헷갈림', '어려움') },
      { id: 'sci_memory', text: '암기 내용 유지에 대해서는?', type: 'single', allowUnknown: true, options: opt('오래 기억', '시험 후 잊음', '외우기 어려움') },
    ],
    high: [
      { id: 'sci_concept', text: '개념 연결과 문제 적용 중 어려운 쪽은?', type: 'single', allowUnknown: true, options: opt('개념 연결', '문제 적용', '둘 다') },
      { id: 'sci_data', text: '자료 해석 문항은 어떤가요?', type: 'single', allowUnknown: true, options: opt('무난함', '시간이 걸림', '어려움') },
      { id: 'sci_track', text: '내신과 모의고사 중 우선순위는?', type: 'single', allowUnknown: true, options: opt('내신', '모의고사', '둘 다') },
    ],
  },
  '사회/역사': {
    elementary: [
      { id: 'soc_interest', text: '사회·역사 내용을 읽을 때 어떤가요?', type: 'single', allowUnknown: true, options: opt('흥미로워요', '보통이에요', '어렵게 느껴져요') },
      { id: 'soc_memory', text: '배운 내용을 기억하는 건 어떤가요?', type: 'single', allowUnknown: true, options: opt('잘 기억해요', '금방 잊어요', '외우기 힘들어요') },
    ],
    middle: [
      { id: 'soc_concept', text: '핵심 개념 정리는 어떤가요?', type: 'single', allowUnknown: true, options: opt('스스로 정리', '수업 필기 위주', '정리가 어려움') },
      { id: 'soc_flow', text: '시대 흐름·인과 관계 이해는?', type: 'single', allowUnknown: true, options: opt('흐름으로 이해', '사건별로 기억', '연결이 어려움') },
      { id: 'soc_data', text: '자료(지도·도표) 해석은 어떤가요?', type: 'single', allowUnknown: true, options: opt('무난함', '가끔 헷갈림', '어려움') },
      { id: 'soc_written', text: '서술형 답안은 어떤가요?', type: 'single', allowUnknown: true, options: opt('무난함', '핵심어 빠짐', '작성이 어려움') },
    ],
    high: [
      { id: 'soc_concept', text: '선택과목 개념 정리는 어떤가요?', type: 'single', allowUnknown: true, options: opt('정리되어 있음', '부분적', '정리가 필요함') },
      { id: 'soc_data', text: '자료 해석 문항은 어떤가요?', type: 'single', allowUnknown: true, options: opt('무난함', '시간이 걸림', '어려움') },
      { id: 'soc_track', text: '내신과 모의고사 중 우선순위는?', type: 'single', allowUnknown: true, options: opt('내신', '모의고사', '둘 다') },
    ],
  },
};

/** 여러 과목 선택 시 상세 분기는 상위 2과목까지만 */
export const MAX_DETAILED_SUBJECTS = 2;

export function needsPrioritySelection(subjects: string[]): boolean {
  return subjects.length > MAX_DETAILED_SUBJECTS;
}

export function detailedSubjects(subjects: string[], priority: string[]): string[] {
  if (subjects.length <= MAX_DETAILED_SUBJECTS) return subjects.slice(0, MAX_DETAILED_SUBJECTS);
  return priority.filter((s) => subjects.includes(s)).slice(0, MAX_DETAILED_SUBJECTS);
}

export function subjectQuestions(subject: string, level: SchoolLevel): Question[] {
  const bank = SUBJECT_BANK[subject as SubjectKey];
  if (!bank) return [];
  return bank[level].map(withUnknown);
}

/** 작성자 유형에 따른 관점 목록 */
export function perspectivesFor(author: AuthorType): ('student' | 'parent')[] {
  if (author === 'both') return ['student', 'parent'];
  return [author];
}

/** 작성자 × 학교급 별 섹션 구성 */
export function buildSections(author: AuthorType, level: SchoolLevel): QuestionSection[] {
  const sections: QuestionSection[] = [];
  for (const p of perspectivesFor(author)) {
    if (p === 'student') {
      sections.push({
        id: 'student_core',
        title: '학생이 전하는 이야기',
        description: '정답이 없는 질문이에요. 지금 느끼는 대로 골라주세요.',
        perspective: 'student',
        questions: STUDENT_QUESTIONS[level].map(withUnknown),
      });
      sections.push({
        id: 'student_voice',
        title: '학생이 바라는 것',
        perspective: 'student',
        questions: STUDENT_VOICE.map(withUnknown),
      });
    } else {
      sections.push({
        id: 'parent_core',
        title: '보호자가 전하는 이야기',
        description: '관찰하신 모습 그대로 알려주시면 됩니다.',
        perspective: 'parent',
        questions: PARENT_QUESTIONS[level].map(withUnknown),
      });
      sections.push({
        id: 'parent_voice',
        title: '보호자의 요청',
        perspective: 'parent',
        questions: PARENT_VOICE.map(withUnknown),
      });
    }
  }
  return sections;
}

/** 예상 문항 수 (기본 10~14문항 범위 확인용) */
export function baseQuestionCount(author: AuthorType, level: SchoolLevel): number {
  return buildSections(author, level).reduce((n, s) => n + s.questions.length, 0);
}
