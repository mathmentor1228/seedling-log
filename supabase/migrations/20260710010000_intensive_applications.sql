-- INTENSIVE-APPLY-V1: 여름방학 특강 신청서 — 공개 페이지에서 학부모가 직접 제출
CREATE TABLE IF NOT EXISTS public.intensive_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_name text NOT NULL,
  grade text NOT NULL,
  expectations text[] NOT NULL DEFAULT '{}',
  wishes text,
  consent_agreed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.intensive_applications ENABLE ROW LEVEL SECURITY;

-- 공개 신청 폼 — 로그인 없이 누구나 제출 가능 (동의 체크 안 하면 앱단에서 제출 막음)
CREATE POLICY "Anyone can submit an intensive application"
ON public.intensive_applications FOR INSERT
WITH CHECK (consent_agreed = true);

-- 조회·관리는 원장만
CREATE POLICY "Admins can view intensive applications"
ON public.intensive_applications FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete intensive applications"
ON public.intensive_applications FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));
