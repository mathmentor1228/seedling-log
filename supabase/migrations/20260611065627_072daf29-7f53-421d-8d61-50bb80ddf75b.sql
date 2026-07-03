
-- Add new columns to private_messages
ALTER TABLE public.private_messages
  ADD COLUMN IF NOT EXISTS category_tags text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS link_urls text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS assignee text;

-- Tag preset table (customizable)
CREATE TABLE IF NOT EXISTS public.private_channel_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL UNIQUE,
  color text NOT NULL DEFAULT 'slate',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.private_channel_tags TO authenticated;
GRANT ALL ON public.private_channel_tags TO service_role;

ALTER TABLE public.private_channel_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "channel pair manage tags"
  ON public.private_channel_tags
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND lower(p.email) IN ('engmentor0201@gmail.com','assistanteng99@gmail.com')
    )
    OR public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND lower(p.email) IN ('engmentor0201@gmail.com','assistanteng99@gmail.com')
    )
    OR public.has_role(auth.uid(), 'admin')
  );

-- Seed default presets
INSERT INTO public.private_channel_tags (label, color, sort_order) VALUES
  ('노션이전숙제입력','violet',10),
  ('숙제채점','amber',20),
  ('매쓰홀릭교재입력','pink',30),
  ('테스트지인쇄','blue',40),
  ('비표작업','stone',50),
  ('단어감독','emerald',60),
  ('단어채점','emerald',70),
  ('파일링','slate',80),
  ('재시험관리','slate',90),
  ('구글드라이브>기출작업파일분류','yellow',100),
  ('제본','slate',110),
  ('테스트 채점','slate',120),
  ('신규 입학테스트','emerald',130),
  ('테스트 감독 및 채점','emerald',140),
  ('이면지분류','pink',150),
  ('기타작업','red',160),
  ('노션 단어 결과 기록','violet',170),
  ('영어 단어 시험지&답안지 파일 작업','pink',180),
  ('책검사&플래그잇','blue',190),
  ('단어결과기록','emerald',200),
  ('기준점수미만재시험감독','red',210),
  ('단어점수기입','emerald',220)
ON CONFLICT (label) DO NOTHING;
