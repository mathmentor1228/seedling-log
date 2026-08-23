// FEATURE-MAP-V2 (미사용·중복 기능 정리 2차)
// 운영 기능 카탈로그 (읽기 전용 문서화 목적)
// - tier: 핵심(core) / 보조(asNeeded) / 보관후보(archive) / 기술전용(technical)
// - 분류 근거는 "해당 기능이 생성·수정하는 테이블의 최근 레코드/최근 생성일"만 사용한다.
//   UI 클릭 로그가 없으므로 클릭 사용량은 추정하지 않는다.
// - audit: 2026-08-22 읽기 전용 SELECT 스냅샷(최근 90일 건수 / 마지막 기록일).
//   저빈도라도 법정·정산·계정·설정처럼 필수인 기능은 보관후보로 내리지 않는다.

export type FeatureTier = 'core' | 'asNeeded' | 'archive' | 'technical';
export type FeatureRole = 'admin' | 'teacher' | 'assistant';

export interface FeatureEntry {
  /** 화면 라우트 (App.tsx 에 실제 존재해야 함) */
  href: string;
  /** 통일된 메뉴 명칭 */
  label: string;
  /** 모호한 명칭에 대한 1줄 설명 */
  description: string;
  tier: FeatureTier;
  roles: FeatureRole[];
  /** 사이드바/대시보드에서 진입 가능한지 */
  hasEntryPoint: boolean;
  /** 사용 신호로 사용하는 테이블 (없으면 신호 없음) */
  signalTable?: string;
  /** 사용 신호 기준 시각 컬럼 */
  signalColumn?: string;
  /** 중복·주의 메모 */
  note?: string;
  /** 통합으로 이 대표 화면에 흡수된 이전 URL (삭제하지 않고 redirect) */
  compatHrefs?: string[];
  /** 보관 기능의 대표 대체 기능 */
  supersededBy?: { href: string; label: string };
  /** 2026-08-22 읽기 전용 감사 스냅샷 */
  audit?: { c90: number; lastAt: string | null };
  /** 사이드바에서 내린 경우의 접근 경로 안내 */
  accessPath?: string;
  /** 저빈도지만 필수(정산·계정·법정)여서 보관후보에서 제외 */
  essentialLowUse?: boolean;
}


export const FEATURE_MAP: FeatureEntry[] = [
  // ── 오늘 운영 ───────────────────────────────────────────
  { href: '/principal', label: '원장 대시보드', description: '오늘 처리해야 할 미마감·출결 이상만 모아 보는 첫 화면', tier: 'core', roles: ['admin'], hasEntryPoint: true, signalTable: 'lesson_records', signalColumn: 'created_at', audit: { c90: 3488, lastAt: '2026-08-22' } },
  { href: '/teacher', label: '강사 대시보드', description: '선택한 수업일 마감 + 오늘 실시간 출결', tier: 'core', roles: ['teacher'], hasEntryPoint: true, signalTable: 'lesson_records', signalColumn: 'created_at' },
  { href: '/assistant', label: '조교 대시보드', description: '조교 당일 업무 화면', tier: 'core', roles: ['assistant'], hasEntryPoint: true, signalTable: 'assistant_tasks', signalColumn: 'created_at' },
  { href: '/lessons/close', label: '수업 마감', description: '오늘/과거 수업일의 출결·이해도·숙제를 한 번에 마감', tier: 'core', roles: ['admin', 'teacher'], hasEntryPoint: true, signalTable: 'lesson_records', signalColumn: 'created_at' },
  { href: '/lessons', label: '수업 기록 조회', description: '저장된 수업일지를 날짜·반·학생·상태로 조회', tier: 'core', roles: ['admin', 'teacher', 'assistant'], hasEntryPoint: true, signalTable: 'lesson_records', signalColumn: 'created_at' },
  { href: '/timetable', label: '시간표', description: '요일·시간대별 반/강의실 배치와 출결 탭', tier: 'core', roles: ['admin', 'teacher', 'assistant'], hasEntryPoint: true, signalTable: 'class_schedules', signalColumn: 'created_at' },
  { href: '/admin/daily', label: '일일 운영 현황', description: '오늘 등원·수업·미처리 업무 종합 현황', tier: 'core', roles: ['admin'], hasEntryPoint: true, signalTable: 'attendance_logs', signalColumn: 'created_at' },
  { href: '/admin/attendance-book', label: '출석부', description: '월 단위 출결 원장(대장) 조회', tier: 'core', roles: ['admin'], hasEntryPoint: true, signalTable: 'attendance_logs', signalColumn: 'created_at' },
  { href: '/admin/unclosed', label: '미마감 관리', description: '강사별 미마감 수업일지 집계와 안내문 복사', tier: 'core', roles: ['admin'], hasEntryPoint: true, signalTable: 'lesson_records', signalColumn: 'created_at' },
  { href: '/admin/data-quality', label: '데이터 점검', description: '학생-반 연결·중복 반 등 구조 이상 점검(확인 기준선 기반)', tier: 'technical', roles: ['admin'], hasEntryPoint: true, signalTable: 'data_quality_acks', signalColumn: 'created_at', audit: { c90: 18, lastAt: '2026-08-22' }, note: '기술 전용 · 원장(admin)만 사용하는 구조 감사 화면' },

  // ── 학생·수업 ───────────────────────────────────────────
  { href: '/students', label: '학생 관리', description: '학생 등록·수정·반 배정', tier: 'core', roles: ['admin'], hasEntryPoint: true, signalTable: 'class_students', signalColumn: 'created_at' },
  { href: '/classes', label: '반 관리', description: '반 생성·명단·시간표 연결', tier: 'core', roles: ['admin'], hasEntryPoint: true, signalTable: 'classes', signalColumn: 'created_at' },
  { href: '/plan', label: '수업 계획(커리큘럼)', description: '반별 진도 설계와 학생별 시작 진도 관리', tier: 'core', roles: ['admin', 'teacher'], hasEntryPoint: true, signalTable: 'plan_sessions', signalColumn: 'created_at' },
  { href: '/plan/overview', label: '수업 계획 개요', description: '전체 계획 진행 상황 요약(수업 계획 하위 화면)', tier: 'asNeeded', roles: ['admin', 'teacher'], hasEntryPoint: false, signalTable: 'plan_designs', signalColumn: 'created_at', note: '/plan 내부에서 진입' },
  { href: '/lessons/batch', label: '일괄 수업일지 작성', description: '여러 학생 수업일지를 한 화면에서 입력', tier: 'asNeeded', roles: ['admin', 'teacher'], hasEntryPoint: false, signalTable: 'lesson_records', signalColumn: 'created_at', note: '수업 마감과 목적 중복', supersededBy: { href: '/lessons/close', label: '수업 마감' } },
  { href: '/lessons/quick', label: '빠른 수업일지 입력', description: '최소 항목만 빠르게 입력', tier: 'archive', roles: ['admin', 'teacher'], hasEntryPoint: false, signalTable: 'lesson_records', signalColumn: 'created_at', audit: { c90: 3488, lastAt: '2026-08-22' }, note: '수업 마감과 목적 중복 · 사이드바 보관 그룹에서만 노출', accessPath: '/lessons/quick 직접 URL 유지', supersededBy: { href: '/lessons/close', label: '수업 마감' } },
  { href: '/study-sessions', label: '자습·클리닉 관리', description: '자습/클리닉/테스트 세션 기록', tier: 'archive', roles: ['admin', 'teacher', 'assistant'], hasEntryPoint: false, signalTable: 'self_study_records', signalColumn: 'created_at', audit: { c90: 0, lastAt: null }, note: '최근 90일 기록 0건 · self_study_records/study_sessions 모두 0건', accessPath: '/study-sessions 직접 URL 유지', supersededBy: { href: '/timetable', label: '시간표' } },
  { href: '/exam-prep', label: '시험대비 편성', description: '내신 대비 특별 시간표 편성', tier: 'asNeeded', roles: ['admin', 'teacher'], hasEntryPoint: false, signalTable: 'exam_prep_enrollments', signalColumn: 'created_at', note: '시험기간 전용' },

  // ── 소통·리포트 ─────────────────────────────────────────
  { href: '/reports', label: '주간 리포트 생성', description: '주차별 학생·학부모 리포트 초안 생성/검수', tier: 'core', roles: ['admin'], hasEntryPoint: true, signalTable: 'weekly_reports', signalColumn: 'generated_at' },
  { href: '/reports/status', label: '리포트 발송 현황', description: '생성된 리포트의 주차별 작성·발송 상태 확인', tier: 'core', roles: ['admin', 'teacher'], hasEntryPoint: true, signalTable: 'weekly_reports', signalColumn: 'generated_at' },
  { href: '/school-analysis', label: '학교분석·상담자료', description: '학교알리미 공개 통계(정적 데이터) 기반 상담자료·인쇄', tier: 'asNeeded', roles: ['admin', 'teacher'], hasEntryPoint: true },
  { href: '/admin/parent-learning-feedback', label: '학부모 설문', description: '학습정보 전달 설문 발송·응답 확인', tier: 'asNeeded', roles: ['admin'], hasEntryPoint: true, signalTable: 'parent_learning_feedback', signalColumn: 'submitted_at', audit: { c90: 0, lastAt: null }, note: '응답 0건이지만 최근 도입한 발송 기능 · 삭제 검토 대상 아님(재확인 필요)' },
  { href: '/private-channel', label: '영어팀 채널', description: '영어팀 전용 메시지 채널', tier: 'archive', roles: ['admin'], hasEntryPoint: true, signalTable: 'private_messages', signalColumn: 'created_at', audit: { c90: 0, lastAt: null }, note: '메시지 0건', accessPath: '/private-channel 직접 URL 유지', supersededBy: { href: '/admin/office', label: '행정 업무' } },

  // ── 시험·자료 ───────────────────────────────────────────
  { href: '/exam-board', label: '내신 보드', description: '학교별 내신 일정·목표·성적 입력 보드', tier: 'asNeeded', roles: ['admin', 'teacher'], hasEntryPoint: true, signalTable: 'student_exam_results', signalColumn: 'created_at' },
  { href: '/exam-board/principal', label: '내신 방향 설정', description: '원장 지시사항 보드(내신 보드 하위)', tier: 'asNeeded', roles: ['admin'], hasEntryPoint: false, signalTable: 'student_exam_results', signalColumn: 'created_at', note: '/exam-board 내부에서 진입' },
  { href: '/exam-archive', label: '내신 자료실', description: '학교별 기출·학사자료 보관함', tier: 'asNeeded', roles: ['admin', 'teacher', 'assistant'], hasEntryPoint: true, signalTable: 'school_exam_archives', signalColumn: 'created_at' },
  { href: '/exam-trends', label: '내신 성적 추이', description: '학생별 시험 성적 변화 그래프', tier: 'asNeeded', roles: ['admin', 'teacher'], hasEntryPoint: true, signalTable: 'student_exam_results', signalColumn: 'created_at' },
  { href: '/exam-review', label: '시험 오답 리뷰', description: '시험 문항별 오답 분석·코멘트', tier: 'asNeeded', roles: ['admin', 'teacher'], hasEntryPoint: false, signalTable: 'exam_reviews', signalColumn: 'created_at' },
  { href: '/textbooks', label: '교재 관리', description: '교재 주문·입고·배부·교재비 청구', tier: 'core', roles: ['admin', 'teacher'], hasEntryPoint: true, signalTable: 'textbook_distributions', signalColumn: 'created_at' },
  { href: '/vocab-test', label: '단어시험 관리', description: '단어시험 배정·결과 확인', tier: 'archive', roles: ['admin', 'teacher', 'assistant'], hasEntryPoint: true, signalTable: 'vocab_test_assignments', signalColumn: 'created_at', audit: { c90: 0, lastAt: '2026-05-11' }, note: '최근 90일 배정 0건(총 47건) · 시험지 제작만 사용 중', accessPath: '/admin/feature-map 보관 영역 또는 /vocab-test 직접 URL', supersededBy: { href: '/vocab-generator', label: '단어시험지 제작' } },
  { href: '/vocab-generator', label: '단어시험지 제작', description: '문서(PDF/워드/한글) 업로드로 단어시험지 생성·인쇄', tier: 'asNeeded', roles: ['admin', 'teacher'], hasEntryPoint: true, signalTable: 'vocab_generated_tests', signalColumn: 'created_at', audit: { c90: 20, lastAt: '2026-08-12' }, note: '최근 90일 20건 실사용 확인 → 보관에서 보조로 복귀' },
  { href: '/math-concepts', label: '개념 퀴즈', description: 'AI 개념 퀴즈 생성·배정', tier: 'archive', roles: ['admin', 'teacher', 'assistant'], hasEntryPoint: true, signalTable: 'math_concept_quizzes', signalColumn: 'created_at', audit: { c90: 0, lastAt: '2026-04-18' }, note: '최근 90일 0건(총 38건 보존)', accessPath: '/math-concepts 직접 URL 유지', supersededBy: { href: '/lessons/close', label: '수업 마감' } },
  { href: '/quiz-bulk-upload', label: '문제 일괄 업로드', description: '수학 문제 대량 등록', tier: 'archive', roles: ['admin', 'teacher'], hasEntryPoint: false, signalTable: 'math_questions', signalColumn: 'created_at', audit: { c90: 0, lastAt: '2026-03-31' }, note: '최근 90일 0건', accessPath: '/quiz-bulk-upload 직접 URL 유지', supersededBy: { href: '/quiz-lookup', label: '문제 조회' } },
  { href: '/quiz-lookup', label: '문제 조회', description: '등록된 문제 검색', tier: 'archive', roles: ['admin', 'teacher'], hasEntryPoint: false, signalTable: 'math_questions', signalColumn: 'created_at', audit: { c90: 0, lastAt: '2026-03-31' }, note: '최근 90일 0건', accessPath: '/quiz-lookup 직접 URL 유지', supersededBy: { href: '/materials/math', label: '수학 자료실' } },
  { href: '/materials/math', label: '수학 자료실', description: '과목별 수업 자료 폴더', tier: 'asNeeded', roles: ['admin', 'teacher', 'assistant'], hasEntryPoint: true, signalTable: 'material_files', signalColumn: 'created_at' },
  { href: '/materials/english', label: '영어 자료실', description: '과목별 수업 자료 폴더', tier: 'asNeeded', roles: ['admin', 'teacher', 'assistant'], hasEntryPoint: true, signalTable: 'material_files', signalColumn: 'created_at' },
  { href: '/materials/korean', label: '국어 자료실', description: '과목별 수업 자료 폴더', tier: 'asNeeded', roles: ['admin', 'teacher', 'assistant'], hasEntryPoint: true, signalTable: 'material_files', signalColumn: 'created_at' },
  { href: '/materials/science', label: '과학 자료실', description: '과목별 수업 자료 폴더', tier: 'asNeeded', roles: ['admin', 'teacher', 'assistant'], hasEntryPoint: true, signalTable: 'material_files', signalColumn: 'created_at' },

  // ── 분석·관리 ───────────────────────────────────────────
  { href: '/stats', label: '운영 통계', description: '학생·수업·숙제 지표 통계', tier: 'asNeeded', roles: ['admin'], hasEntryPoint: true },
  { href: '/admin/briefing', label: '주간 수업 점검', description: '주차별 수업일지 검수와 휴원일 관리', tier: 'asNeeded', roles: ['admin'], hasEntryPoint: true, signalTable: 'lesson_records', signalColumn: 'created_at', note: '이전 명칭 "원장 보고"' },
  { href: '/admin/report', label: '원장 KPI 보고서', description: 'KPI·운영 변경 이력·학부모 열람 현황', tier: 'asNeeded', roles: ['admin'], hasEntryPoint: true, signalTable: 'ops_changelog', signalColumn: 'created_at', note: '이전 명칭 "원장 보고서"' },
  { href: '/students/:studentId/karte', label: '학생 카르테', description: '학생 1명의 수업·출결·숙제·리포트·상담 통합 뷰와 상담 기록 추가', tier: 'core', roles: ['admin', 'teacher'], hasEntryPoint: false, signalTable: 'lesson_records', signalColumn: 'created_at', audit: { c90: 3488, lastAt: '2026-08-22' }, note: '학생 목록·원장 대시보드에서 학생 단건 진입 · 팀메모(총 46건) 조회 경로', accessPath: '/students 목록 → 학생 카르테' },
  { href: '/admin/users', label: '사용자 관리', description: '직원 계정·역할 관리', tier: 'asNeeded', roles: ['admin'], hasEntryPoint: true, signalTable: 'profiles', signalColumn: 'created_at', audit: { c90: 3, lastAt: '2026-07-22' }, essentialLowUse: true, note: '계정·권한 관리 필수 · 사용량 무관' },
  { href: '/admin/tuition', label: '수강료 관리', description: '월 청구 생성·미납 관리', tier: 'asNeeded', roles: ['admin'], hasEntryPoint: true, signalTable: 'billing_schedules', signalColumn: 'created_at', audit: { c90: 0, lastAt: null }, essentialLowUse: true, note: '정산 필수 · 저빈도(월 단위)라 보관후보 제외' },
  { href: '/admin/income', label: '수입 관리', description: '월별 수입 집계', tier: 'asNeeded', roles: ['admin'], hasEntryPoint: true, signalTable: 'payment_records', signalColumn: 'created_at', audit: { c90: 0, lastAt: null }, essentialLowUse: true, note: '정산 필수 · 저빈도(월 단위)라 보관후보 제외' },
  { href: '/work-logs', label: '근무시간', description: '조교 근무 기록', tier: 'asNeeded', roles: ['admin', 'assistant'], hasEntryPoint: true, signalTable: 'assistant_work_logs', signalColumn: 'created_at', audit: { c90: 33, lastAt: '2026-08-10' }, essentialLowUse: true, note: '급여 산정 필수' },
  { href: '/admin/office', label: '행정 업무', description: '행정 업무 게시판', tier: 'asNeeded', roles: ['admin'], hasEntryPoint: true, signalTable: 'admin_office_tasks', signalColumn: 'created_at' },
  { href: '/assistant-requests', label: '조교 요청·업무', description: '강사→조교 업무 요청 생성과 조교의 업무 처리·상태 변경을 역할별로 한 화면에서 처리', tier: 'asNeeded', roles: ['admin', 'teacher', 'assistant'], hasEntryPoint: true, signalTable: 'assistant_tasks', signalColumn: 'created_at', compatHrefs: ['/assistant-tasks'], audit: { c90: 1, lastAt: '2026-06-19' }, essentialLowUse: true, note: '이전 조교 업무 보드(/assistant-tasks) 통합 · 조교 역할 필수' },
  { href: '/admin/intensive-applications', label: '특강 신청 현황', description: '방학 특강 신청 접수 현황', tier: 'asNeeded', roles: ['admin'], hasEntryPoint: true, signalTable: 'intensive_applications', signalColumn: 'created_at', audit: { c90: 17, lastAt: '2026-07-23' }, essentialLowUse: true, note: '방학 시즌 전용(저빈도 필수)' },
  { href: '/admin/feature-map', label: '기능 지도', description: '역할별 핵심/보조/보관후보/기술전용 분류와 사용 신호(읽기 전용)', tier: 'technical', roles: ['admin'], hasEntryPoint: true, note: '기술 전용 · 보관후보 기능의 접근 경로도 이 화면에서 제공' },
  { href: '/dashboard', label: '대시보드(역할 자동 이동)', description: '역할별 기본 대시보드로 리디렉션', tier: 'asNeeded', roles: ['admin', 'teacher', 'assistant'], hasEntryPoint: false, note: '기존 북마크 호환용' },
];

export const TIER_LABEL: Record<FeatureTier, string> = {
  core: '핵심',
  asNeeded: '보조',
  archive: '보관후보',
  technical: '기술 전용',
};

/**
 * 삭제 검토 후보 (2026-08-22 감사).
 * 실제 삭제·숨김은 하지 않는다. 원장 확인 후 별도 작업으로만 진행한다.
 */
export const DELETION_REVIEW_CANDIDATES: { name: string; reason: string; access: string }[] = [
  { name: 'plan_student_retros (테이블)', reason: '총 0건 · 화면 진입점 없음', access: '코드상 참조만 유지' },
  { name: 'parent_learning_feedback (응답)', reason: '응답 0건 · 발송 기능은 최근 도입', access: '/admin/parent-learning-feedback (메뉴 유지)' },
  { name: 'private_messages / 영어팀 채널', reason: '메시지 0건', access: '/private-channel (보관 그룹)' },
  { name: 'self_study_records · study_sessions', reason: '최근 90일 0건', access: '/study-sessions (보관 그룹)' },
  { name: 'math_questions · math_concept_quizzes', reason: '최근 90일 0건', access: '/quiz-lookup · /math-concepts (보관 그룹)' },
  { name: 'vocab_test_assignments', reason: '최근 90일 0건(총 47건 보존)', access: '/vocab-test (보관 그룹)' },
  { name: '학생 미연결 팀메모(team_notes 46건)', reason: 'student_id 연결 0건 · 자유입력', access: '/admin/office 및 강사 대시보드 메모 영역 · 삭제 금지' },
];

export function featuresForRole(role: FeatureRole): FeatureEntry[] {
  return FEATURE_MAP.filter((f) => f.roles.includes(role));
}

export function featuresByTier(role: FeatureRole, tier: FeatureTier): FeatureEntry[] {
  return featuresForRole(role).filter((f) => f.tier === tier);
}

/** 라우트 문자열을 App.tsx 의 path 패턴과 비교 가능한 형태로 정규화 */
export function normalizeRoutePath(path: string): string {
  return path.replace(/:[^/]+/g, ':param');
}

/** 사용 신호 조회 대상(중복 제거) */
export function signalTables(): { table: string; column: string }[] {
  const seen = new Map<string, { table: string; column: string }>();
  for (const f of FEATURE_MAP) {
    if (f.signalTable && f.signalColumn && !seen.has(f.signalTable)) {
      seen.set(f.signalTable, { table: f.signalTable, column: f.signalColumn });
    }
  }
  return [...seen.values()];
}
