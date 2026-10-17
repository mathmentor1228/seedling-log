-- SHARE-CHANNEL-V1 (2026-10-17): 직원 자료·전달 채널
-- 카톡 대화창·구글드라이브로 흩어진 자료 공유를 앱 안 한 채널(/share)로 모은다.
--   share_posts          글 (제목·본문·태그 text[]·외부 링크 text[]·고정)
--   share_post_files     첨부 (비공개 버킷 share-files, 파일당 50MB)
--   share_post_comments  댓글
--   share_post_reads     읽음 (누가 언제 봤는지 → "읽음 n명")
-- 열람은 직원 전원(is_staff). 수정·삭제는 올린 사람 또는 원장. 고정은 원장만.
-- 기존 team_notes·material_files·private_messages 는 건드리지 않는다.

-- 1) 테이블 ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.share_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  body text,
  tags text[] NOT NULL DEFAULT '{}',
  links text[] NOT NULL DEFAULT '{}',
  pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.share_posts IS 'SHARE-CHANNEL-V1 직원 자료·전달 글';
CREATE INDEX IF NOT EXISTS idx_share_posts_created_at ON public.share_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_share_posts_pinned ON public.share_posts(pinned) WHERE pinned;
CREATE INDEX IF NOT EXISTS idx_share_posts_tags ON public.share_posts USING gin(tags);

CREATE TABLE IF NOT EXISTS public.share_post_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.share_posts(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  original_name text NOT NULL,
  mime_type text,
  file_size bigint,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.share_post_files IS 'SHARE-CHANNEL-V1 첨부 파일 (버킷 share-files, 경로 <uid>/<post_id>/<난수>.<ext>)';
CREATE INDEX IF NOT EXISTS idx_share_post_files_post ON public.share_post_files(post_id);

CREATE TABLE IF NOT EXISTS public.share_post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.share_posts(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.share_post_comments IS 'SHARE-CHANNEL-V1 댓글';
CREATE INDEX IF NOT EXISTS idx_share_post_comments_post ON public.share_post_comments(post_id, created_at);

CREATE TABLE IF NOT EXISTS public.share_post_reads (
  post_id uuid NOT NULL REFERENCES public.share_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
COMMENT ON TABLE public.share_post_reads IS 'SHARE-CHANNEL-V1 읽음 표시 (행 있음 = 읽음)';
CREATE INDEX IF NOT EXISTS idx_share_post_reads_user ON public.share_post_reads(user_id);

-- 2) updated_at 유지 + 고정(pinned)은 원장만 ---------------------------------
DROP TRIGGER IF EXISTS trg_share_posts_updated_at ON public.share_posts;
CREATE TRIGGER trg_share_posts_updated_at
  BEFORE UPDATE ON public.share_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.share_posts_guard_pin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.pinned AND NOT public.has_role(auth.uid(), 'admin') THEN
      NEW.pinned := false;
    END IF;
  ELSIF NEW.pinned IS DISTINCT FROM OLD.pinned AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION '고정은 원장만 바꿀 수 있습니다';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.share_posts_guard_pin() FROM public;

DROP TRIGGER IF EXISTS trg_share_posts_guard_pin ON public.share_posts;
CREATE TRIGGER trg_share_posts_guard_pin
  BEFORE INSERT OR UPDATE ON public.share_posts
  FOR EACH ROW EXECUTE FUNCTION public.share_posts_guard_pin();

-- 3) 읽지 않은 글 수 (사이드바 배지) — SECURITY INVOKER 라 RLS 그대로 적용 ---------
CREATE OR REPLACE FUNCTION public.share_unread_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT count(*)::int
  FROM public.share_posts p
  WHERE p.created_by <> auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM public.share_post_reads r
      WHERE r.post_id = p.id AND r.user_id = auth.uid()
    );
$$;
REVOKE ALL ON FUNCTION public.share_unread_count() FROM public;
GRANT EXECUTE ON FUNCTION public.share_unread_count() TO authenticated, service_role;

-- 4) RLS --------------------------------------------------------------------
ALTER TABLE public.share_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.share_post_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.share_post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.share_post_reads ENABLE ROW LEVEL SECURITY;

-- 글: 직원 열람 / 본인 작성 / 본인·원장 수정·삭제
DROP POLICY IF EXISTS "share_posts staff select" ON public.share_posts;
CREATE POLICY "share_posts staff select" ON public.share_posts
  FOR SELECT TO authenticated USING (public.is_staff());
DROP POLICY IF EXISTS "share_posts staff insert own" ON public.share_posts;
CREATE POLICY "share_posts staff insert own" ON public.share_posts
  FOR INSERT TO authenticated WITH CHECK (public.is_staff() AND created_by = auth.uid());
DROP POLICY IF EXISTS "share_posts owner or admin update" ON public.share_posts;
CREATE POLICY "share_posts owner or admin update" ON public.share_posts
  FOR UPDATE TO authenticated
  USING (public.is_staff() AND (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin')))
  WITH CHECK (public.is_staff() AND (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin')));
DROP POLICY IF EXISTS "share_posts owner or admin delete" ON public.share_posts;
CREATE POLICY "share_posts owner or admin delete" ON public.share_posts
  FOR DELETE TO authenticated
  USING (public.is_staff() AND (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin')));

-- 첨부: 직원 열람 / 글 주인·원장만 추가 / 올린 사람·글 주인·원장 삭제
DROP POLICY IF EXISTS "share_post_files staff select" ON public.share_post_files;
CREATE POLICY "share_post_files staff select" ON public.share_post_files
  FOR SELECT TO authenticated USING (public.is_staff());
DROP POLICY IF EXISTS "share_post_files post owner insert" ON public.share_post_files;
CREATE POLICY "share_post_files post owner insert" ON public.share_post_files
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_staff() AND uploaded_by = auth.uid() AND EXISTS (
      SELECT 1 FROM public.share_posts p
      WHERE p.id = post_id AND (p.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );
DROP POLICY IF EXISTS "share_post_files owner or admin delete" ON public.share_post_files;
CREATE POLICY "share_post_files owner or admin delete" ON public.share_post_files
  FOR DELETE TO authenticated
  USING (
    public.is_staff() AND (
      uploaded_by = auth.uid() OR public.has_role(auth.uid(), 'admin') OR EXISTS (
        SELECT 1 FROM public.share_posts p WHERE p.id = post_id AND p.created_by = auth.uid()
      )
    )
  );

-- 댓글: 직원 열람 / 본인 작성 / 본인·원장 삭제
DROP POLICY IF EXISTS "share_post_comments staff select" ON public.share_post_comments;
CREATE POLICY "share_post_comments staff select" ON public.share_post_comments
  FOR SELECT TO authenticated USING (public.is_staff());
DROP POLICY IF EXISTS "share_post_comments staff insert own" ON public.share_post_comments;
CREATE POLICY "share_post_comments staff insert own" ON public.share_post_comments
  FOR INSERT TO authenticated WITH CHECK (public.is_staff() AND created_by = auth.uid());
DROP POLICY IF EXISTS "share_post_comments owner or admin delete" ON public.share_post_comments;
CREATE POLICY "share_post_comments owner or admin delete" ON public.share_post_comments
  FOR DELETE TO authenticated
  USING (public.is_staff() AND (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin')));

-- 읽음: 직원 전원 열람(누가 읽었는지 표시) / 본인 것만 기록·갱신
DROP POLICY IF EXISTS "share_post_reads staff select" ON public.share_post_reads;
CREATE POLICY "share_post_reads staff select" ON public.share_post_reads
  FOR SELECT TO authenticated USING (public.is_staff());
DROP POLICY IF EXISTS "share_post_reads own insert" ON public.share_post_reads;
CREATE POLICY "share_post_reads own insert" ON public.share_post_reads
  FOR INSERT TO authenticated WITH CHECK (public.is_staff() AND user_id = auth.uid());
DROP POLICY IF EXISTS "share_post_reads own update" ON public.share_post_reads;
CREATE POLICY "share_post_reads own update" ON public.share_post_reads
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 5) 저장소 버킷 (비공개, 파일당 50MB, 형식 제한 없음: PDF·zip·hwp 모두) -------
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('share-files', 'share-files', false, 52428800)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "share-files staff select" ON storage.objects;
CREATE POLICY "share-files staff select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'share-files' AND public.is_staff());
DROP POLICY IF EXISTS "share-files staff insert own folder" ON storage.objects;
CREATE POLICY "share-files staff insert own folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'share-files' AND public.is_staff()
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
DROP POLICY IF EXISTS "share-files owner or admin delete" ON storage.objects;
CREATE POLICY "share-files owner or admin delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'share-files' AND (
      (storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin')
    )
  );

-- 6) Realtime (새 글·댓글·읽음이 열린 화면에 바로 반영) ------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['share_posts', 'share_post_files', 'share_post_comments', 'share_post_reads'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
