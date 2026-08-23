-- CONSULTATION-PIPELINE-V1
-- 상담 예정자는 재원생과 분리하고, 등록 확정 시에만 students로 연결한다.

CREATE TABLE IF NOT EXISTS public.consultation_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN (
    'requested', 'confirmed', 'intake_complete', 'consulted',
    'enrollment_pending', 'converted', 'on_hold', 'closed'
  )),
  student_name TEXT NOT NULL,
  guardian_name TEXT,
  guardian_phone TEXT NOT NULL,
  student_phone TEXT,
  school TEXT,
  school_level TEXT CHECK (school_level IS NULL OR school_level IN ('초', '중', '고')),
  grade_year INTEGER CHECK (grade_year IS NULL OR grade_year BETWEEN 1 AND 6),
  subjects TEXT[] NOT NULL DEFAULT '{}',
  learning_concern TEXT,
  referral_source TEXT,
  preferred_date DATE,
  preferred_time TEXT,
  appointment_at TIMESTAMPTZ,
  intake_submitted_at TIMESTAMPTZ,
  consultation_summary TEXT,
  outcome_note TEXT,
  converted_student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consultation_leads_status
  ON public.consultation_leads(status, preferred_date, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consultation_leads_phone
  ON public.consultation_leads(guardian_phone);

ALTER TABLE public.consultation_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage consultation leads"
  ON public.consultation_leads FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP TRIGGER IF EXISTS update_consultation_leads_updated_at ON public.consultation_leads;
CREATE TRIGGER update_consultation_leads_updated_at
  BEFORE UPDATE ON public.consultation_leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.consultation_leads IS
  '문의·예약·사전정보·상담·등록 전환을 잇는 상담 예정자 파이프라인';

-- 새 예약을 기존 관리자 업무함 알림으로 연결한다.
ALTER TABLE public.admin_office_tasks
  ADD COLUMN IF NOT EXISTS source_type TEXT,
  ADD COLUMN IF NOT EXISTS source_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_office_tasks_consultation_source
  ON public.admin_office_tasks(source_type, source_id)
  WHERE source_type = 'consultation_lead' AND source_id IS NOT NULL;
