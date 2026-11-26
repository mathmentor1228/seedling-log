# Current task (2026-11-25 학부모 출결 알림톡)
- [x] 담당 교사 대시보드에서 학생별 ‘지각’·‘등원 전’ 알림톡 문구 확인 및 발송 UI
- [x] 실제 알림톡 발송 — 템플릿 승인 완료, 자동 연결
- [x] 발송 실패 사유 표시 및 중복 발송 방지, 학부모 알림 기록 연결
- [x] 원장 계정 실제 화면에서 두 문구·받는 사람·발송 잠금 확인, 비로그인 401 및 원장 미리보기 확인, 문구 테스트 4개 통과

# Earlier task (2026-11-24 요청서 #36 B)
- [x] #36 B: 확인 필요 배너(납부액≠청구)·원비 변경 반영(그 달부터 미리보기)·이 금액으로 청구 수정(accept_payment_amount, 되돌리기 시험 확인)·행정업무 원비 수납 카드 수납 상세 링크
- [ ] #36 A·C: 수집기 쪽 작업 — 이 프로젝트 밖(원장 수집기 코드)

# Earlier task (2026-11-17 요청서 #32 V2 · #33 · #34)
- [x] #32 V2: 미납 탭 기간 선택·납부기한 기준 미납·결제일 기준 결제내역·퇴원/휴학 배지 (미리보기 17행/32행, 달력 17명 일치)
- [x] #33: 자동취소 트리거(되돌리기 시험으로 동작 확인)·기존 정리 0건·퇴원 당월 배지·자동취소 안내
- [x] #34: apply_fee_change(되돌리기 시험 확인)·원비 변경 미리보기(김혜원 1건 530,000→600,000, 저장 안 함)·달력 반영 버튼·일괄 생성은 이미 현재 원비 사용
- [x] #34: 교재 관리 운영설정 아래로 이동·고정핀 저장 실패 처리/최신 정보 읽기/터치 표시 (고정·해제 새로고침 후 유지 확인)

# Previous tasks
- [x] Exclude pre-2026-10 months from unpaid judgement using recorded non-canceled payments only; authenticated September preview confirms 88 students/92 payments/36,355,000 won and zero unpaid, October keeps 17 unpaid/partial, historical billing controls hidden, Park Seojeong September 127,500 preserved and unpaid only from October, income September matches; 88 tests passed and build OK, no data/backend changes or publishing.
- [x] Add existing test-result viewing and editing to dashboard inline lesson entries; canonical slots 1/2 and legacy result fallbacks, changed-field saves preserving metadata/submitted state, refresh without clearing lesson edits, and visible read/conflict errors; authenticated display/edit/refresh and 872px/390px layout checked without saving real results, isolated persistence tests run, no backend changes or publishing.
- [x] Verify October 26 reupload: SQL byte-identical to existing migration; live function and authenticated reads confirm October 525,000, November 600,000, one override and November billing 600,000; 87 November bills/no inactive students and read-only recalculation comparison 0 changes; required UI/types inspected, November row and October no-unpaid UI verified, 13 tests passed with no runtime errors; no duplicate migration, record edits, function deployment, secrets, or publishing.
- [x] Keep calendar-roster names pinned horizontally; add independent exact-source/bank filtering, paid-only and recent 7/30-day views sorted by latest actual payment with matching payment details; 58 tests passed and authenticated read-only UI verified 87 students, 43 paid students, 12 recent records, kiosk/bank filters, empty 출결버스 (no alias assumed), reset/detail and sticky names at 870px/390px; no ledger writes, backend changes, or publishing.
- [x] Verify the latest reuploaded monthly-fee fixing request: SQL byte-identical to applied migration; authenticated reads confirm October 525,000, November 600,000, one November override, November billing 600,000, 87 rows with no inactive students, and recalculation 0 changes; existing required UI/types inspected and 28 tests passed; no duplicate migration, student record writes, runtime errors, or publishing.
- [x] Show scheduled tuition dates alongside actual payment dates and early/on-time/late day differences in the monthly roster, payment history, daily records, and student details; persisted due dates take precedence with labelled current-setting fallback, split payments stay individual; 50 tests passed and authenticated read-only checks verified 87 students, 65 payments, 20 payment dates, student search/detail, 768px layout and no runtime errors; no record writes, backend changes, or publishing.
- [x] Add read-only date-grouped imported tuition payments with student, amount, billing month, source, and recorded/review/canceled status; 24 tests passed, authenticated UI reads verified 65 records across 20 payment dates and one registration date, student search/detail, date/state filters and review-queue navigation, no narrow-screen overflow or runtime errors; no payment writes, backend changes, or publishing.
- [x] Recheck the reuploaded monthly fee fixing request: SQL matches applied migration byte-for-byte; authenticated reads confirm October 525,000, November 600,000, November billing 600,000, 87 rows/no inactive students, and the recalculation button reports 0 changes; the fixed-fee section shows one row and next-month default; 28 tests passed, no duplicate migration, record changes, or publishing.
- [x] Add sorting choices to the filtered tuition payment list and show scheduled tuition collection dates; 27 targeted tests passed and authenticated read-only checks verified 87 students, search, 44 unpaid/partial students, date/name/fee sorting, calendar-day selection, and desktop/narrow layouts; no records changed or publishing.
- [x] Apply student monthly fee fixing and its UI — original SQL applied byte-for-byte, generated types refreshed, override save/reload/delete verified using a zero-fee teacher test account and cleaned up, and 34 targeted tests passed; no publishing or function deployments.
- [x] Add tuition main-tab student search, payment-status filters, and reset; verified 87 live students (44 unpaid/partial, 43 paid), detail opening, and narrow-screen display without changing payment data.
- [x] Implement tuition ledger shared month/fee rules and one-row-per-student billing generation.
- [x] Add student payment details, receipts/bulk print, and review queue.
- [x] Add receipt numbering and verify historical backfill, October paid status, and November generation (87 student rows; no 휴학 students).
- [x] Resolve 유나린 November fee mismatch — authenticated monthly fee reads confirm October 525,000 and November 600,000; October has no unpaid month, November billing is 600,000, and the November recalculation button reports 0 changed across 87 student rows with no 휴학 students.
- [x] Add inline title, description, and assignee correction to new-registration office task details.
- [x] Verify correction save/cancel and reload readback on a real registration task with unchanged contents; only task fields are updated.
- [x] Allow choosing question-by-question analysis or overall teacher comment for individual exam submission.
- [x] Show parents the published subject analysis materials together with the submitted individual feedback.
- [x] Validate submission rules, both teacher inputs, and existing published parent feedback without changing real student records.
- [ ] Verify a new submission through parent readback — blocked because this would submit/publish real student feedback; no real records changed during checks.