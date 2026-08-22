// FEATURE-MAP-V1
// 운영 기능 카탈로그 (읽기 전용 문서화 목적)
// - tier: 핵심(core) / 필요 시(asNeeded) / 보관(archive)
// - 분류 근거는 "해당 기능이 생성·수정하는 테이블의 최근 레코드/최근 생성일"만 사용한다.
//   UI 클릭 로그가 없으므로 클릭 사용량은 추정하지 않는다.

export type FeatureTier = 'core' | 'asNeeded' | 'archive';
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
}

export const FEATURE_MAP: FeatureEntry[] = [
  // ── 오늘 운영 ───────────────────────────────────────────
  { href: '/principal', label: '원장 대시보드', description: '오늘 처리해야 할 미마감·출결 이상만 모아 보는 첫 화면', tier: 'core', roles: ['admin'], hasEntryPoint: true, signalTable: 'lesson_records', signalColumn: 'created_at' },
  { href: '/teacher', label: '강사 대시보드', description: '선택한 수업일 마감 + 오늘 실시간 출결', tier: 'core', roles: ['teacher'], hasEntryPoint: true, signalTable: 'lesson_records', signalColumn: 'created_at' },
  { href: '/assistant', label: '조교 대시보드', description: '조교 당일 업무 화면', tier: 'core', roles: ['assistant'], hasEntryPoint: true, signalTable: 'assistant_tasks', signalColumn: 'created_at' },
  { href: '/lessons/close', label: '수업 마감', description: '오늘/과거 수업일의 출결·이해도·숙제를 한 번에 마감', tier: 'core', roles: ['admin', 'teacher'], hasEntryPoint: true, signalTable: 'lesson_records', signalColumn: 'created_at' },
  { href: '/lessons', label: '수업 기록 조회', description: '저장된 수업일지를 날짜·반·학생·상태로 조회', tier: 'core', roles: ['admin', 'teacher', 'assistant'], hasEntryPoint: true, signalTable: 'lesson_records', signalColumn: 'created_at' },
  { href: '/timetable', label: '시간표', description: '요일·시간대별 반/강의실 배치와 출결 탭', tier: 'core', roles: ['admin', 'teacher', 'assistant'], hasEntryPoint: true, signalTable: 'class_schedules', signalColumn: 'created_at' },
  { href: '/admin/daily', label: '일일 운영 현황', description: '오늘 등원·수업·미처리 업무 종합 현황', tier: 'core', roles: ['admin'], hasEntryPoint: true, signalTable: 'attendance_logs', signalColumn: 'created_at' },
  { href: '/admin/attendance-book', label: '출석부', description: '월 단위 출결 원장(대장) 조회', tier: 'core', roles: ['admin'], hasEntryPoint: true, signalTable: 'attendance_logs', signalColumn: 'created_at' },
  { href: '/admin/unclosed', label: '미마감 관리', description: '강사별 미마감 수업일지 집계와 안내문 복사', tier: 'core', roles: ['admin'], hasEntryPoint: true, signalTable: 'lesson_records', signalColumn: 'created_at' },
  { href: '/admin/data-quality', label: '데이터 점검', description: '학생-반 연결·중복 반 등 구조 이상 점검(확인 기준선 기반)', tier: 'core', roles: ['admin'], hasEntryPoint: true, signalTable: 'data_quality_acks', signalColumn: 'created_at' },

  // ── 학생·수업 ───────────────────────────────────────────
  { href: '/students', label: '학생 관리', description: '학생 등록·수정·반 배정', tier: 'core', roles: ['admin'], hasEntryPoint: true, signalTable: 'class_students', signalColumn: 'created_at' },
  { href: '/classes', label: '반 관리', description: '반 생성·명단·시간표 연결', tier: 'core', roles: ['admin'], hasEntryPoint: true, signalTable: 'classes', signalColumn: 'created_at' },
  { href: '/plan', label: '수업 계획(커리큘럼)', description: '반별 진도 설계와 학생별 시작 진도 관리', tier: 'core', roles: ['admin', 'teacher'], hasEntryPoint: true, signalTable: 'plan_sessions', signalColumn: 'created_at' },
  { href: '/plan/overview', label: '수업 계획 개요', description: '전체 계획 진행 상황 요약(수업 계획 하위 화면)', tier: 'asNeeded', roles: ['admin', 'teacher'], hasEntryPoint: false, signalTable: 'plan_designs', signalColumn: 'created_at', note: '/plan 내부에서 진입' },
  { href: '/lessons/batch', label: '일괄 수업일지 작성', description: '여러 학생 수업일지를 한 화면에서 입력', tier: 'asNeeded', roles: ['admin', 'teacher'], hasEntryPoint: false, signalTable: 'lesson_records', signalColumn: 'created_at', note: '수업 마감과 목적 중복' },
  { href: '/lessons/quick', label: '빠른 수업일지 입력', description: '최소 항목만 빠르게 입력', tier: 'archive', roles: ['admin', 'teacher'], hasEntryPoint: false, signalTable: 'lesson_records', signalColumn: 'created_at', note: '수업 마감과 목적 중복 · 진입점 없음' },
  { href: '/study-sessions', label: '자습·클리닉 관리', description: '자습/클리닉/테스트 세션 기록', tier: 'archive', roles: ['admin', 'teacher', 'assistant'], hasEntryPoint: false, signalTable: 'self_study_records', signalColumn: 'created_at', note: '최근 90일 기록 0건' },
  { href: '/exam-prep', label: '시험대비 편성', description: '내신 대비 특별 시간표 편성', tier: 'asNeeded', roles: ['admin', 'teacher'], hasEntryPoint: false, signalTable: 'exam_prep_enrollments', signalColumn: 'created_at', note: '시험기간 전용' },

  // ── 소통·리포트 ─────────────────────────────────────────
  { href: '/reports', label: '주간 리포트 생성', description: '주차별 학생·학부모 리포트 초안 생성/검수', tier: 'core', roles: ['admin'], hasEntryPoint: true, signalTable: 'weekly_reports', signalColumn: 'generated_at' },
  { href: '/reports/status', label: '리포트 발송 현황', description: '생성된 리포트의 주차별 작성·발송 상태 확인', tier: 'core', roles: ['admin', 'teacher'], hasEntryPoint: true, signalTable: 'weekly_reports', signalColumn: 'generated_at' },
  { href: '/admin/parent-learning-feedback', label: '학부모 설문', description: '학습정보 전달 설문 발송·응답 확인', tier: 'asNeeded', roles: ['admin'], hasEntryPoint: true, signalTable: 'parent_learning_feedback', signalColumn: 'submitted_at' },
  { href: '/private-channel', label: '영어팀 채널', description: '영어팀 전용 메시지 채널', tier: 'archive', roles: ['admin'], hasEntryPoint: true, signalTable: 'private_messages', signalColumn: 'created_at', note: '메시지 0건' },

  // ── 시험·자료 ───────────────────────────────────────────
  { href: '/exam-board', label: '내신 보드', description: '학교별 내신 일정·목표·성적 입력 보드', tier: 'asNeeded', roles: ['admin', 'teacher'], hasEntryPoint: true, signalTable: 'student_exam_results', signalColumn: 'created_at' },
  { href: '/exam-board/principal', label: '내신 방향 설정', description: '원장 지시사항 보드(내신 보드 하위)', tier: 'asNeeded', roles: ['admin'], hasEntryPoint: false, signalTable: 'student_exam_results', signalColumn: 'created_at', note: '/exam-board 내부에서 진입' },
  { href: '/exam-archive', label: '내신 자료실', description: '학교별 기출·학사자료 보관함', tier: 'asNeeded', roles: ['admin', 'teacher', 'assistant'], hasEntryPoint: true, signalTable: 'school_exam_archives', signalColumn: 'created_at' },
  { href: '/exam-trends', label: '내신 성적 추이', description: '학생별 시험 성적 변화 그래프', tier: 'asNeeded', roles: ['admin', 'teacher'], hasEntryPoint: true, signalTable: 'student_exam_results', signalColumn: 'created_at' },
  { href: '/exam-review', label: '시험 오답 리뷰', description: '시험 문항별 오답 분석·코멘트', tier: 'asNeeded', roles: ['admin', 'teacher'], hasEntryPoint: false, signalTable: 'exam_reviews', signalColumn: 'created_at' },
  { href: '/textbooks', label: '교재 관리', description: '교재 주문·입고·배부·교재비 청구', tier: 'core', roles: ['admin', 'teacher'], hasEntryPoint: true, signalTable: 'textbook_distributions', signalColumn: 'created_at' },
  { href: '/vocab-test', label: '단어시험 관리', description: '단어시험 배정·결과 확인', tier: 'archive', roles: ['admin', 'teacher', 'assistant'], hasEntryPoint: true, signalTable: 'vocab_test_assignments', signalColumn: 'created_at', note: '최근 90일 배정 0건' },
  { href: '/vocab-generator', label: '단어시험지 제작', description: '문서 업로드로 단어시험지 생성', tier: 'archive', roles: ['admin', 'teacher'], hasEntryPoint: false, signalTable: 'vocab_generated_tests', signalColumn: 'created_at', note: '단어시험 관리와 함께 사용' },
  { href: '/math-concepts', label: '개념 퀴즈', description: 'AI 개념 퀴즈 생성·배정', tier: 'archive', roles: ['admin', 'teacher', 'assistant'], hasEntryPoint: true, signalTable: 'math_concept_quizzes', signalColumn: 'created_at', note: '최근 90일 0건' },
  { href: '/quiz-bulk-upload', label: '문제 일괄 업로드', description: '수학 문제 대량 등록', tier: 'archive', roles: ['admin', 'teacher'], hasEntryPoint: false, signalTable: 'math_questions', signalColumn: 'created_at', note: '최근 90일 0건' },
  { href: '/quiz-lookup', label: '문제 조회', description: '등록된 문제 검색', tier: 'archive', roles: ['admin', 'teacher'], hasEntryPoint: false, signalTable: 'math_questions', signalColumn: 'created_at', note: '최근 90일 0건' },
  { href: '/materials/math', label: '수학 자료실', description: '과목별 수업 자료 폴더', tier: 'asNeeded', roles: ['admin', 'teacher', 'assistant'], hasEntryPoint: true, signalTable: 'material_files', signalColumn: 'created_at' },
  { href: '/materials/english', label: '영어 자료실', description: '과목별 수업 자료 폴더', tier: 'asNeeded', roles: ['admin', 'teacher', 'assistant'], hasEntryPoint: true, signalTable: 'material_files', signalColumn: 'created_at' },
  { href: '/materials/korean', label: '국어 자료실', description: '과목별 수업 자료 폴더', tier: 'asNeeded', roles: ['admin', 'teacher', 'assistant'], hasEntryPoint: true, signalTable: 'material_files', signalColumn: 'created_at' },
  { href: '/materials/science', label: '과학 자료실', description: '과목별 수업 자료 폴더', tier: 'asNeeded', roles: ['admin', 'teacher', 'assistant'], hasEntryPoint: true, signalTable: 'material_files', signalColumn: 'created_at' },

  // ── 분석·관리 ───────────────────────────────────────────
  { href: '/stats', label: '운영 통계', description: '학생·수업·숙제 지표 통계', tier: 'asNeeded', roles: ['admin'], hasEntryPoint: true },
  { href: '/admin/briefing', label: '주간 수업 점검', description: '주차별 수업일지 검수와 휴원일 관리', tier: 'asNeeded', roles: ['admin'], hasEntryPoint: true, signalTable: 'lesson_records', signalColumn: 'created_at', note: '이전 명칭 "원장 보고"' },
  { href: '/admin/report', label: '원장 KPI 보고서', description: 'KPI·운영 변경 이력·학부모 열람 현황', tier: 'asNeeded', roles: ['admin'], hasEntryPoint: true, signalTable: 'ops_changelog', signalColumn: 'created_at', note: '이전 명칭 "원장 보고서"' },
  { href: '/students/:studentId/karte', label: '학생 카르테', description: '학생 1명의 수업·출결·숙제·리포트 통합 뷰', tier: 'core', roles: ['admin'], hasEntryPoint: false, signalTable: 'lesson_records', signalColumn: 'created_at', note: '학생 목록/대시보드에서 진입' },
  { href: '/admin/users', label: '사용자 관리', description: '직원 계정·역할 관리', tier: 'asNeeded', roles: ['admin'], hasEntryPoint: true, signalTable: 'profiles', signalColumn: 'created_at', note: '사용량 무관 계정관리 필수 기능' },
  { href: '/admin/tuition', label: '수강료 관리', description: '월 청구 생성·미납 관리', tier: 'asNeeded', roles: ['admin'], hasEntryPoint: true, signalTable: 'billing_schedules', signalColumn: 'created_at', note: '행정 필수 기능' },
  { href: '/admin/income', label: '수입 관리', description: '월별 수입 집계', tier: 'asNeeded', roles: ['admin'], hasEntryPoint: true, signalTable: 'payment_records', signalColumn: 'created_at', note: '행정 필수 기능' },
  { href: '/work-logs', label: '근무시간', description: '조교 근무 기록', tier: 'asNeeded', roles: ['admin', 'assistant'], hasEntryPoint: true, signalTable: 'assistant_work_logs', signalColumn: 'created_at', note: '급여 산정 필수' },
  { href: '/admin/office', label: '행정 업무', description: '행정 업무 게시판', tier: 'asNeeded', roles: ['admin'], hasEntryPoint: true, signalTable: 'admin_office_tasks', signalColumn: 'created_at' },
  { href: '/assistant-requests', label: '조교 요청', description: '강사가 조교에게 업무 요청', tier: 'asNeeded', roles: ['admin', 'teacher', 'assistant'], hasEntryPoint: true, signalTable: 'assistant_tasks', signalColumn: 'created_at' },
  { href: '/assistant-tasks', label: '조교 업무 보드', description: '조교 업무 전체 보드', tier: 'archive', roles: ['admin', 'teacher', 'assistant'], hasEntryPoint: true, signalTable: 'assistant_tasks', signalColumn: 'created_at', note: '조교 요청 화면과 데이터·목적 중복' },
  { href: '/admin/intensive-applications', label: '특강 신청 현황', description: '방학 특강 신청 접수 현황', tier: 'asNeeded', roles: ['admin'], hasEntryPoint: true, signalTable: 'intensive_applications', signalColumn: 'created_at', note: '방학 시즌 전용' },
  { href: '/admin/feature-map', label: '기능 지도', description: '역할별 핵심/필요 시/보관 기능과 사용 신호(읽기 전용)', tier: 'asNeeded', roles: ['admin'], hasEntryPoint: true },
  { href: '/dashboard', label: '대시보드(역할 자동 이동)', description: '역할별 기본 대시보드로 리디렉션', tier: 'asNeeded', roles: ['admin', 'teacher', 'assistant'], hasEntryPoint: false, note: '기존 북마크 호환용' },
];

export const TIER_LABEL: Record<FeatureTier, string> = {
  core: '핵심',
  asNeeded: '필요 시',
  archive: '보관',
};

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
