# Architecture rules

- Store optional exam grade-cutoff notes in `exam_analysis_reports.grade_cutoffs` as nullable free text, and preserve them during AI autofill so manually recorded thresholds are not overwritten.
- Both student exam-paper upload entry points use `prepareExamPaperUpload` before encoding and size validation so photo compression and output MIME/extension stay consistent while PDFs remain unchanged.
- Individual exam feedback stores its selected method on the analysis; shared validation supports independent item/comment submissions, and parent responses expose only published feedback and parent-safe subject materials to preserve review boundaries.