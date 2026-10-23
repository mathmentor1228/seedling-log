# Architecture rules

- Store optional exam grade-cutoff notes in `exam_analysis_reports.grade_cutoffs` as nullable free text, and preserve them during AI autofill so manually recorded thresholds are not overwritten.
- Both student exam-paper upload entry points use `prepareExamPaperUpload` before encoding and size validation so photo compression and output MIME/extension stay consistent while PDFs remain unchanged.
- Office registration-task corrections update only the task title, description, and assignee; never infer student-record or teacher-assignment changes from free text, because task notes are not structured enrollment data.
- Individual exam feedback stores its selected method on the analysis; shared validation supports independent item/comment submissions, and parent responses expose only published feedback and parent-safe subject materials to preserve review boundaries.
- Tuition ledger uses student_monthly_fee for authoritative monthly totals, payment billing_month with linked fallback and cancellation-aware sums, and paginated reads that fail visibly; this prevents divergent prices and false unpaid states.
- Tuition details and receipt dialogs live as siblings in a shared provider; printing mounts a dedicated body portal so only receipts print and no nested Dialog conflicts occur.
- Receipt numbering is transaction-locked by paid-date year and derived from preserved ledger rows; assigned numbers are immutable and canceled payments are retained to avoid numbering gaps.
- Tuition calendar search and status filters share a pure UI-only filter for calendar counts and student rows; they consume existing monthly ledger status without recalculating fees or writing records.
- Student monthly fee overrides remain separate from course fee and enrollment history; display applicability follows the authoritative monthly fee function, while pending billing repricing conditionally rechecks status and original amounts to preserve concurrent payments and edits.