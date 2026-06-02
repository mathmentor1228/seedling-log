-- AUTOVOCA-SPRINT2: 학생별 "학습 강화 기능" ON/OFF 플래그
-- 오토보카 스타일 신기능(오늘의 단어·스트릭/잔디·단어 숙련도·SM-2 복습·배지)을
-- 학생 단위로 켜고 끌 수 있게 한다. 기존 프로세스 보존을 위해 기본값 OFF(false).
-- 담당 선생님이 VocabSettingsPanel에서 학생별로 켠다.

ALTER TABLE public.vocab_settings
  ADD COLUMN IF NOT EXISTS enhanced_features_enabled BOOLEAN NOT NULL DEFAULT false;
