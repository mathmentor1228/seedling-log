DO $$
DECLARE n int;
BEGIN
  UPDATE public.homework_assignments
  SET submitted_at = NULL, submission_image_url = NULL
  WHERE id = '4eeef8a8-c045-4da7-a0fd-f22c9e3d8bd7'
    AND submitted_at = '2026-08-20 04:14:27.778+00'
    AND check_status = 'unchecked'
    AND result IS NULL
    AND checked_at IS NULL
    AND coalesce(points_earned,0) = 0
    AND submission_image_url IS NOT NULL
    AND submission_audio_url IS NULL
    AND coalesce(submission_text,'') = '';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'expected exactly 1 row, got %', n;
  END IF;
END $$;