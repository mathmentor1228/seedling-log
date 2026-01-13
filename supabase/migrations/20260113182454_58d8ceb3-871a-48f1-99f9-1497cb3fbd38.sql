-- A) Create curriculum_map table
CREATE TABLE IF NOT EXISTS public.curriculum_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject TEXT NOT NULL,
  school_level TEXT NOT NULL,
  curriculum_version TEXT NOT NULL,
  course TEXT NOT NULL,
  unit_key TEXT NOT NULL,
  unit_title TEXT NOT NULL,
  flow_summary TEXT NOT NULL,
  next_unit_key TEXT NULL,
  next_summary TEXT NULL,
  keywords TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT curriculum_map_unique UNIQUE(subject, curriculum_version, course, unit_key)
);

-- Enable RLS
ALTER TABLE public.curriculum_map ENABLE ROW LEVEL SECURITY;

-- Public read access (curriculum data is reference data)
CREATE POLICY "Anyone can view curriculum map"
  ON public.curriculum_map FOR SELECT
  USING (true);

-- Only admins can modify
CREATE POLICY "Admins can manage curriculum map"
  ON public.curriculum_map FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- B) Add curriculum tagging columns to lesson_records
ALTER TABLE public.lesson_records 
  ADD COLUMN IF NOT EXISTS curriculum_version TEXT NULL,
  ADD COLUMN IF NOT EXISTS course TEXT NULL,
  ADD COLUMN IF NOT EXISTS curriculum_unit_key TEXT NULL;

-- C) Seed MATH curriculum data

-- Middle School (중등)
INSERT INTO public.curriculum_map (subject, school_level, curriculum_version, course, unit_key, unit_title, flow_summary, next_unit_key, next_summary)
VALUES
  -- 중1
  ('수학', '중등', 'middle', '중1', 'mid1-nat', '자연수와 정수', '초등 산술에서 음수 개념으로 확장. 정수의 사칙연산 기초.', 'mid1-rat', '유리수로 확장하여 분수/소수 연산 다룸'),
  ('수학', '중등', 'middle', '중1', 'mid1-rat', '유리수', '정수에서 유리수로 확장. 분수와 소수의 연산.', 'mid1-eq', '문자와 식 도입으로 방정식 기초 학습'),
  ('수학', '중등', 'middle', '중1', 'mid1-eq', '문자와 식', '변수 개념 도입. 일차식과 등식의 성질.', 'mid1-lin', '일차방정식 풀이로 연결'),
  ('수학', '중등', 'middle', '중1', 'mid1-lin', '일차방정식', '등식의 성질을 활용한 일차방정식 풀이.', 'mid1-coord', '좌표평면 도입으로 기하 연결'),
  ('수학', '중등', 'middle', '중1', 'mid1-coord', '좌표평면과 그래프', '순서쌍과 좌표평면 이해. 정비례/반비례 그래프.', 'mid1-geo', '기본 도형으로 기하 시작'),
  ('수학', '중등', 'middle', '중1', 'mid1-geo', '기본 도형', '점, 선, 면, 각의 성질. 작도와 합동.', 'mid1-stat', '자료 정리와 통계 기초'),
  ('수학', '중등', 'middle', '중1', 'mid1-stat', '통계', '도수분포표, 히스토그램, 대푯값.', NULL, NULL),
  
  -- 중2
  ('수학', '중등', 'middle', '중2', 'mid2-expr', '식의 계산', '단항식/다항식 연산. 지수법칙 기초.', 'mid2-ineq', '부등식으로 확장'),
  ('수학', '중등', 'middle', '중2', 'mid2-ineq', '부등식', '일차부등식과 연립부등식 풀이.', 'mid2-sys', '연립방정식으로 확장'),
  ('수학', '중등', 'middle', '중2', 'mid2-sys', '연립방정식', '이원일차연립방정식 풀이. 가감법/대입법.', 'mid2-func', '함수 개념 도입'),
  ('수학', '중등', 'middle', '중2', 'mid2-func', '일차함수', '함수의 정의와 일차함수 그래프.', 'mid2-tri', '삼각형 성질로 기하 심화'),
  ('수학', '중등', 'middle', '중2', 'mid2-tri', '삼각형의 성질', '삼각형의 합동조건, 이등변삼각형.', 'mid2-quad', '사각형으로 확장'),
  ('수학', '중등', 'middle', '중2', 'mid2-quad', '사각형의 성질', '평행사변형, 여러 사각형의 성질.', 'mid2-prob', '확률 기초'),
  ('수학', '중등', 'middle', '중2', 'mid2-prob', '확률', '경우의 수와 확률의 기본 개념.', NULL, NULL),
  
  -- 중3
  ('수학', '중등', 'middle', '중3', 'mid3-sqrt', '제곱근과 실수', '무리수 도입. 실수 체계 완성.', 'mid3-factor', '인수분해로 연결'),
  ('수학', '중등', 'middle', '중3', 'mid3-factor', '다항식의 곱셈과 인수분해', '곱셈공식과 인수분해 공식.', 'mid3-quad-eq', '이차방정식 풀이 준비'),
  ('수학', '중등', 'middle', '중3', 'mid3-quad-eq', '이차방정식', '인수분해/근의 공식을 이용한 풀이.', 'mid3-quad-func', '이차함수로 확장'),
  ('수학', '중등', 'middle', '중3', 'mid3-quad-func', '이차함수', '이차함수 그래프와 최댓값/최솟값.', 'mid3-sim', '닮음으로 기하 심화'),
  ('수학', '중등', 'middle', '중3', 'mid3-sim', '도형의 닮음', '닮음비와 닮음 조건.', 'mid3-pyth', '피타고라스 정리'),
  ('수학', '중등', 'middle', '중3', 'mid3-pyth', '피타고라스 정리', '직각삼각형의 성질과 응용.', 'mid3-trig', '삼각비로 연결'),
  ('수학', '중등', 'middle', '중3', 'mid3-trig', '삼각비', 'sin, cos, tan의 정의와 활용.', 'mid3-circle', '원의 성질'),
  ('수학', '중등', 'middle', '중3', 'mid3-circle', '원의 성질', '원주각, 접선, 원과 직선.', 'mid3-stat2', '통계 심화'),
  ('수학', '중등', 'middle', '중3', 'mid3-stat2', '통계(심화)', '상관관계, 산점도.', NULL, NULL),

  -- High 2022: 공통수학1
  ('수학', '고등', '2022', '공통수학1', 'h22-c1-poly', '다항식', '다항식 연산과 나머지정리, 인수분해 심화.', 'h22-c1-eq', '방정식과 부등식으로 연결'),
  ('수학', '고등', '2022', '공통수학1', 'h22-c1-eq', '방정식과 부등식', '이차방정식, 이차부등식, 연립방정식.', 'h22-c1-coord', '도형의 방정식 준비'),
  ('수학', '고등', '2022', '공통수학1', 'h22-c1-coord', '도형의 방정식', '점, 직선, 원의 방정식.', NULL, NULL),

  -- High 2022: 공통수학2
  ('수학', '고등', '2022', '공통수학2', 'h22-c2-set', '집합과 명제', '집합 연산과 논리적 사고력.', 'h22-c2-func', '함수 개념으로 연결'),
  ('수학', '고등', '2022', '공통수학2', 'h22-c2-func', '함수', '합성함수, 역함수, 유리/무리함수.', 'h22-c2-exp', '지수함수로 확장'),
  ('수학', '고등', '2022', '공통수학2', 'h22-c2-exp', '지수함수와 로그함수', '지수/로그의 성질과 그래프.', 'h22-c2-trig', '삼각함수로 확장'),
  ('수학', '고등', '2022', '공통수학2', 'h22-c2-trig', '삼각함수', '호도법, 삼각함수 그래프, 삼각방정식.', NULL, NULL),

  -- High 2022: 대수
  ('수학', '고등', '2022', '대수', 'h22-alg-seq', '수열', '등차/등비수열, 수열의 합, 수학적 귀납법.', 'h22-alg-mat', '행렬로 확장'),
  ('수학', '고등', '2022', '대수', 'h22-alg-mat', '행렬', '행렬의 연산과 활용.', NULL, NULL),

  -- High 2022: 미적분1
  ('수학', '고등', '2022', '미적분1', 'h22-calc1-lim', '수열의 극한', '수열의 수렴과 발산, 극한의 성질.', 'h22-calc1-ser', '급수로 확장'),
  ('수학', '고등', '2022', '미적분1', 'h22-calc1-ser', '급수', '무한급수, 등비급수.', 'h22-calc1-diff', '미분으로 연결'),
  ('수학', '고등', '2022', '미적분1', 'h22-calc1-diff', '미분', '함수의 극한, 도함수, 미분법.', 'h22-calc1-app', '미분 활용'),
  ('수학', '고등', '2022', '미적분1', 'h22-calc1-app', '미분의 활용', '접선, 극대극소, 최적화.', 'h22-calc1-int', '적분으로 연결'),
  ('수학', '고등', '2022', '미적분1', 'h22-calc1-int', '적분', '부정적분, 정적분, 적분의 활용.', NULL, NULL),

  -- High 2022: 기하
  ('수학', '고등', '2022', '기하', 'h22-geo-conic', '이차곡선', '포물선, 타원, 쌍곡선.', 'h22-geo-vec', '벡터로 확장'),
  ('수학', '고등', '2022', '기하', 'h22-geo-vec', '평면벡터', '벡터의 연산과 내적.', 'h22-geo-space', '공간으로 확장'),
  ('수학', '고등', '2022', '기하', 'h22-geo-space', '공간도형과 공간좌표', '공간좌표, 공간벡터.', NULL, NULL),

  -- High 2015: 미적분(2015)
  ('수학', '고등', '2015', '미적분(2015)', 'h15-calc-lim', '수열의 극한', '수열의 수렴발산, 극한의 성질.', 'h15-calc-ser', '급수로 확장'),
  ('수학', '고등', '2015', '미적분(2015)', 'h15-calc-ser', '급수', '무한급수, 등비급수의 합.', 'h15-calc-diff', '미분으로 연결'),
  ('수학', '고등', '2015', '미적분(2015)', 'h15-calc-diff', '여러 가지 함수의 미분', '지수/로그/삼각함수 미분.', 'h15-calc-app', '미분 활용'),
  ('수학', '고등', '2015', '미적분(2015)', 'h15-calc-app', '미분의 활용', '극대극소, 속도와 가속도.', 'h15-calc-int', '적분으로 연결'),
  ('수학', '고등', '2015', '미적분(2015)', 'h15-calc-int', '여러 가지 함수의 적분', '치환적분, 부분적분.', 'h15-calc-intapp', '적분 활용'),
  ('수학', '고등', '2015', '미적분(2015)', 'h15-calc-intapp', '적분의 활용', '넓이, 부피, 속도.', NULL, NULL),

  -- High 2015: 확률과통계(2015)
  ('수학', '고등', '2015', '확률과통계(2015)', 'h15-stat-count', '경우의 수', '순열, 조합, 이항정리.', 'h15-stat-prob', '확률로 연결'),
  ('수학', '고등', '2015', '확률과통계(2015)', 'h15-stat-prob', '확률', '조건부확률, 독립사건.', 'h15-stat-dist', '분포로 연결'),
  ('수학', '고등', '2015', '확률과통계(2015)', 'h15-stat-dist', '확률분포', '이산/연속 확률분포, 이항분포.', 'h15-stat-norm', '정규분포'),
  ('수학', '고등', '2015', '확률과통계(2015)', 'h15-stat-norm', '정규분포', '정규분포와 표준화.', 'h15-stat-est', '통계적 추정'),
  ('수학', '고등', '2015', '확률과통계(2015)', 'h15-stat-est', '통계적 추정', '모평균 추정, 신뢰구간.', NULL, NULL)
ON CONFLICT (subject, curriculum_version, course, unit_key) DO NOTHING;