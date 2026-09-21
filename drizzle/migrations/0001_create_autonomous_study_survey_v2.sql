-- AUTONOMOUS-STUDY-SURVEY-V1: 추석 연휴 자습 희망 시간 조사
-- 학생들은 실명으로 여러 시간대 중복 신청 가능, 관리자가 집계 후 오픈할 타임 결정

create table public.autonomous_study_surveys (
  id uuid primary key default gen_random_uuid(),
  student_name text not null,
  grade text not null,
  phone text,
  survey_date date not null,
  start_time time without time zone not null,
  end_time time without time zone not null,
  is_test boolean default false,
  created_at timestamp with time zone default now()
);

-- 중복 제출 방지: 동일 학생(이름+학년+연락처)이 같은 날짜·시간대를 여러 번 신청할 수 없음
create unique index autonomous_study_surveys_unique_slot
  on public.autonomous_study_surveys (student_name, grade, coalesce(phone, ''), survey_date, start_time, end_time);

-- Data API 접근 권한 (Supabase 기본 권한 없음)
grant select, insert on public.autonomous_study_surveys to anon;
grant select on public.autonomous_study_surveys to authenticated;
grant all on public.autonomous_study_surveys to service_role;

alter table public.autonomous_study_surveys enable row level security;

-- 익명 설문 제출 허용
CREATE POLICY "Anon can submit autonomous study survey"
  ON public.autonomous_study_surveys
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- 익명 사용자에게는 집계 정보만 노출 (직접 SELECT 불가)
CREATE POLICY "Anon cannot read raw survey rows"
  ON public.autonomous_study_surveys
  FOR SELECT
  TO anon
  USING (false);

-- 로그인한 직원은 원본 응답 확인
CREATE POLICY "Authenticated staff can read survey responses"
  ON public.autonomous_study_surveys
  FOR SELECT
  TO authenticated
  USING (true);

-- 인원 집계용 helper
CREATE OR REPLACE FUNCTION public.autonomous_study_survey_counts(
  _from_date date,
  _to_date date
)
RETURNS TABLE (
  survey_date date,
  start_time time without time zone,
  end_time time without time zone,
  count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  select
    s.survey_date,
    s.start_time,
    s.end_time,
    count(*)::bigint as count
  from public.autonomous_study_surveys s
  where s.survey_date between _from_date and _to_date
    and s.is_test = false
  group by s.survey_date, s.start_time, s.end_time
  order by s.survey_date, s.start_time;
$$;

grant execute on function public.autonomous_study_survey_counts(date, date) to anon;
grant execute on function public.autonomous_study_survey_counts(date, date) to authenticated;
