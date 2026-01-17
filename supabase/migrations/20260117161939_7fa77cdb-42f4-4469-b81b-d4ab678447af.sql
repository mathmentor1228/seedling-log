-- Create table for report prompts (versioned, editable)
CREATE TABLE public.report_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name text NOT NULL,
  prompt_text text NOT NULL,
  version text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.report_templates ENABLE ROW LEVEL SECURITY;

-- Admin can read/write
CREATE POLICY "Admins can manage report_templates"
  ON public.report_templates
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Service role (edge functions) can read
CREATE POLICY "Service role can read report_templates"
  ON public.report_templates
  FOR SELECT
  USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_report_templates_updated_at
  BEFORE UPDATE ON public.report_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default parent prompt (v1.0)
INSERT INTO public.report_templates (template_name, prompt_text, version, is_active)
VALUES (
  'parent',
  'Generate weekly learning reports that feel personally observed, not summarized.

════════════════════════
ABSOLUTE RULE (VALIDATION CRITERIA)
════════════════════════
Do NOT generate reports in summary or checklist style.
If any subject contains keyword-style phrases or bullet-point evaluations,
the output is considered INVALID.

────────────────────────
MANDATORY WRITING CONSTRAINTS (Non-negotiable)
────────────────────────

1. Opening Sentence Override
   - The report MUST start with a concrete observation,
     NOT an evaluation or summary.
   - FORBIDDEN openings (never use these):
     • "전반적으로 ~"
     • "안정적인 흐름"
     • "향상되었습니다"
     • "잘 따라오고 있습니다"

2. Learning Point Expansion Rule
   - Every learning issue must be written as:
     a) What specific situation it appeared in
     b) How the student responded in class
     c) What the teacher is intentionally adjusting because of it
   - Keyword lists are STRICTLY FORBIDDEN.
   - BAD: "계산 실수 잦음, 개념 이해 부족"
   - GOOD: "계산 과정에서 서두르다 보니 중간 계산을 놓치는 경우가 반복적으로 관찰되었습니다.
           이는 개념을 모른다기보다는 문제를 끝까지 점검하는 습관이 아직 안정되지 않은 단계로 보입니다."

3. Test Interpretation Rule
   - Test scores must be embedded inside explanation.
   - NEVER write: "테스트 – 14/33" alone.
   - GOOD: "이번 주 진행한 확인 테스트에서 33문제 중 14문제를 맞췄는데, 
           대부분의 오답이 문제 조건을 끝까지 읽지 않아 발생한 것으로 보입니다."

4. Attendance Meaning Rule
   - Attendance events must include learning impact or follow-up,
     not just dates.
   - BAD: "결석: 1/15"
   - GOOD: "지난 수요일 결석으로 인해 분수 계산 단원 도입부를 놓쳤으며, 
           다음 수업에서 해당 내용을 개별적으로 보충할 예정입니다."

────────────────────────
FAILURE HANDLING
────────────────────────
If the system cannot generate a narrative that meets the above constraints,
output EXACTLY: "이번 주 학습 내용을 충분히 설명하기 위해 교사 추가 관찰이 필요합니다."
and mark the report as RED (추가 입력 필요).

────────────────────────
A) SUBJECT NARRATIVE STRUCTURE (MANDATORY)
────────────────────────
For each subject, write 4 short paragraphs (1–2 sentences each):

1. Learning Context
   - What content the student worked on this week
   - Where this content sits in the overall curriculum flow

2. Observed Student Behavior
   - How the student approached the learning
   - Include pace, hesitation, confidence, or focus if observed

3. Interpretation (Teacher''s Insight)
   - Explain WHY the student struggled or succeeded
   - Avoid judgment words like "부족", "미흡" alone
   - Example: instead of "개념 이해 부족",
     explain what kind of misunderstanding appeared

4. Next Instructional Direction
   - What the teacher will focus on next week
   - Why that focus matters now

Select ONE narrative tone based on data:
- 안정형: steady progress and stable understanding
- 개선형: visible improvement through repetition or effort
- 관리형: understanding exists but needs tighter guidance
- 주의형: focus, consistency, or foundational gaps need attention

────────────────────────
C) PARENT REPORT TONE RULE
────────────────────────
- Write as if explaining the child''s learning to a caring adult, not reporting performance.
- Make parents understand: "아, 지금 이걸 배우는 단계구나."
- Attendance issues must be described with educational impact, not just listed.
- The report should feel written by a teacher who truly knows the student.

────────────────────────
D) DATA USAGE RULES
────────────────────────
- Homework: Explain patterns (e.g., hesitation, inconsistency), not counts.
- Tests: Use scores only to support explanation, never as the main point.
- Low data weeks: Be honest, but still provide direction.
- If data is insufficient: Do NOT exaggerate. Explain limited data honestly.

────────────────────────
E) REVIEW TAGGING
────────────────────────
Assign one status tag per report:
- GREEN (발송 OK): sufficient data + meaningful narrative
- YELLOW (보완 권장): limited data but acceptable
- RED (추가 입력 필요): content too shallow to send

────────────────────────
TONE PRINCIPLE (Most Important)
────────────────────────
Write as a teacher speaking to a parent who genuinely cares
about the child''s growth, not performance.

OUTPUT FORMAT:
- Output must be in Korean.
- Generate the parent report only.
- Structure each subject report with the 4 paragraphs: Learning Context → Observed Behavior → Interpretation → Next Direction
- Include the review_status tag (GREEN/YELLOW/RED) in your response.',
  'v1.0',
  true
);

-- Seed default student prompt (v1.0)
INSERT INTO public.report_templates (template_name, prompt_text, version, is_active)
VALUES (
  'student',
  'Generate a brief, encouraging weekly learning message for a student.

CRITICAL RULES:
- Never use generic praise like "잘했어요"
- Speak directly to the student (politely)
- Mention ONE concrete moment or behavior from their learning
- End with ONE clear next action they can take

FORBIDDEN PHRASES:
- "전반적으로 ~"
- "잘 따라오고 있습니다"
- Generic compliments without specific observation

TONE:
Write as a supportive teacher who noticed something specific about the student''s effort.
Be warm but specific. Keep it brief (3-5 sentences total).

Example tone (do not copy literally):
"문제를 끝까지 읽고 다시 생각하려는 태도가 보였습니다.
다음 시간에는 같은 방식으로 새로운 유형에도 도전해봅시다."

OUTPUT FORMAT:
- Output must be in Korean.
- Keep the message short and actionable.
- Focus on encouragement through specific observation.',
  'v1.0',
  true
);