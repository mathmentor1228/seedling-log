
-- Enable realtime for math_questions and math_answers tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.math_questions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.math_answers;
