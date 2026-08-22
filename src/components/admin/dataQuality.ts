// DATA-QUALITY-V1 — 운영 데이터 무결성 판정 (순수 함수, 읽기 전용)
// DB write 없음. 판정 기준은 각 finding.basis에 명시한다.

export type Severity = 'critical' | 'check' | 'info';

export interface DQStudent { id: string; enrollment_status: string | null }
export interface DQClass { id: string; name: string | null; subject: string | null; teacher_id: string | null }
export interface DQSchedule {
  id: string; class_id: string | null; teacher_id: string | null;
  day_of_week: number | null; start_time: string | null; end_time: string | null; is_active: boolean | null;
}
export interface DQClassStudent { class_id: string | null; student_id: string | null }
export interface DQLesson {
  id: string; lesson_date: string; class_id: string | null; teacher_id: string | null;
  student_id: string | null; submitted: boolean | null;
}
export interface DQProfile { id: string; full_name: string | null; is_active: boolean | null }
export interface DQRole { user_id: string; role: string }
export interface DQSubjectTeacher { student_id: string | null; subject: string | null; teacher_id: string | null }
export interface DQHomework { id: string; student_id: string | null; assigned_date: string | null; lesson_record_id: string | null }
export interface DQReport { id: string; student_id: string | null; week_start: string | null; total_lessons: number | null }

export interface DataQualityInput {
  students: DQStudent[];
  classes: DQClass[];
  schedules: DQSchedule[];
  classStudents: DQClassStudent[];
  lessons: DQLesson[];
  profiles: DQProfile[];
  roles: DQRole[];
  subjectTeachers: DQSubjectTeacher[];
  homework: DQHomework[];
  reports: DQReport[];
  lessonWindowDays: number;
  reportWindowDays: number;
}

export interface DQFinding {
  id: string;
  title: string;
  severity: Severity;
  basis: string;          // 판정 기준·기간·데이터 원천
  groupCount: number;     // 원인 그룹 수
  recordCount: number;    // 영향 레코드 수
  groupUnit: string;      // 그룹 단위 명칭
  recordUnit: string;     // 레코드 단위 명칭
  samples: string[];      // 개인정보 없는 대표 값 (반명/날짜 등)
  link?: { label: string; href: string };
  note?: string;
}

const ACTIVE_ENROLL = ['재학', '재등원'];

const norm = (v: string | null | undefined) => (v || '').trim().toLowerCase();
const uniq = (arr: string[]) => Array.from(new Set(arr));

export function buildFindings(input: DataQualityInput): DQFinding[] {
  const {
    students, classes, schedules, classStudents, lessons,
    profiles, roles, subjectTeachers, homework, reports,
    lessonWindowDays, reportWindowDays,
  } = input;

  const activeClassIds = new Set(
    schedules.filter((s) => s.is_active && s.class_id).map((s) => s.class_id as string),
  );
  const activeClasses = classes.filter((c) => activeClassIds.has(c.id));
  const classById = new Map(classes.map((c) => [c.id, c]));
  const studentById = new Map(students.map((s) => [s.id, s]));
  const activeStudents = students.filter((s) => ACTIVE_ENROLL.includes(s.enrollment_status || ''));
  const withdrawnIds = new Set(students.filter((s) => s.enrollment_status === '퇴원').map((s) => s.id));
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const roleUserIds = new Set(roles.map((r) => r.user_id));

  const memberByClass = new Map<string, Set<string>>();
  for (const cs of classStudents) {
    if (!cs.class_id || !cs.student_id) continue;
    if (!memberByClass.has(cs.class_id)) memberByClass.set(cs.class_id, new Set());
    memberByClass.get(cs.class_id)!.add(cs.student_id);
  }
  const classesOfStudent = new Map<string, string[]>();
  for (const cs of classStudents) {
    if (!cs.class_id || !cs.student_id) continue;
    const arr = classesOfStudent.get(cs.student_id) || [];
    arr.push(cs.class_id);
    classesOfStudent.set(cs.student_id, arr);
  }

  const cname = (id: string | null | undefined) =>
    (id && classById.get(id)?.name) || '(반 미지정)';
  const out: DQFinding[] = [];
  const lessonBasis = `lesson_records · 최근 ${lessonWindowDays}일(KST)`;

  // ── 즉시 수정 필요 ──────────────────────────────────────────
  const noTeacher = activeClasses.filter((c) => !c.teacher_id);
  out.push({
    id: 'class_no_teacher',
    title: '활성 반인데 담당 강사 없음',
    severity: 'critical',
    basis: 'classes.teacher_id is null · 활성 시간표가 있는 반',
    groupCount: noTeacher.length,
    recordCount: noTeacher.length,
    groupUnit: '반',
    recordUnit: '반',
    samples: noTeacher.slice(0, 5).map((c) => c.name || c.id.slice(0, 8)),
    link: { label: '반 관리 열기', href: '/classes' },
  });

  const badSched = schedules.filter(
    (s) => s.is_active && (s.day_of_week === null || !s.start_time || !s.end_time ||
      (!!s.start_time && !!s.end_time && s.end_time <= s.start_time)),
  );
  out.push({
    id: 'schedule_invalid',
    title: '활성 시간표의 요일/시간 누락 또는 종료≤시작',
    severity: 'critical',
    basis: 'class_schedules.is_active = true',
    groupCount: uniq(badSched.map((s) => s.class_id || 'none')).length,
    recordCount: badSched.length,
    groupUnit: '반',
    recordUnit: '시간표',
    samples: uniq(badSched.map((s) => cname(s.class_id))).slice(0, 5),
    link: { label: '시간표 열기', href: '/timetable' },
  });

  const dupLinks = Array.from(
    classStudents.reduce((m, cs) => {
      if (!cs.class_id || !cs.student_id) return m;
      const k = `${cs.class_id}|${cs.student_id}`;
      m.set(k, (m.get(k) || 0) + 1);
      return m;
    }, new Map<string, number>()),
  ).filter(([, n]) => n > 1);
  out.push({
    id: 'class_student_duplicate',
    title: '학생-반 중복 연결',
    severity: 'critical',
    basis: 'class_students의 (class_id, student_id) 중복 행',
    groupCount: dupLinks.length,
    recordCount: dupLinks.reduce((s, [, n]) => s + n - 1, 0),
    groupUnit: '연결',
    recordUnit: '중복 행',
    samples: dupLinks.slice(0, 5).map(([k]) => cname(k.split('|')[0])),
    link: { label: '반 관리 열기', href: '/classes' },
  });

  const brokenLessons = lessons.filter((l) => !l.student_id || !l.teacher_id);
  out.push({
    id: 'lesson_missing_ref',
    title: '수업일지의 학생/강사 참조 누락',
    severity: 'critical',
    basis: `${lessonBasis} · student_id 또는 teacher_id is null`,
    groupCount: uniq(brokenLessons.map((l) => l.lesson_date)).length,
    recordCount: brokenLessons.length,
    groupUnit: '수업일',
    recordUnit: '기록',
    samples: uniq(brokenLessons.map((l) => l.lesson_date)).slice(0, 5),
    link: { label: '수업 기록 조회', href: '/lessons' },
  });

  // ── 확인 필요 ──────────────────────────────────────────────
  const stuNoClass = activeStudents.filter(
    (s) => !(classesOfStudent.get(s.id) || []).some((cid) => activeClassIds.has(cid)),
  );
  out.push({
    id: 'student_no_active_class',
    title: '재원 학생인데 활성 반 0개',
    severity: 'check',
    basis: 'students.enrollment_status in (재학, 재등원) · 활성 시간표가 있는 반 기준',
    groupCount: stuNoClass.length,
    recordCount: stuNoClass.length,
    groupUnit: '학생',
    recordUnit: '학생',
    samples: [],
    note: '개인정보 보호를 위해 명단은 표시하지 않습니다. 학생 관리에서 확인하세요.',
    link: { label: '학생 관리 열기', href: '/students' },
  });

  const sameKey = new Map<string, DQClass[]>();
  for (const c of activeClasses) {
    const k = `${norm(c.name)}|${c.subject || ''}|${c.teacher_id || ''}`;
    sameKey.set(k, [...(sameKey.get(k) || []), c]);
  }
  const dupClassGroups = Array.from(sameKey.values()).filter((g) => g.length > 1);
  out.push({
    id: 'class_duplicate_identical',
    title: '표시명·과목·강사가 모두 같은 활성 반 중복',
    severity: 'check',
    basis: 'classes(name, subject, teacher_id) 동일 · 활성 시간표 보유',
    groupCount: dupClassGroups.length,
    recordCount: dupClassGroups.reduce((s, g) => s + g.length, 0),
    groupUnit: '이름 그룹',
    recordUnit: '반',
    samples: dupClassGroups.slice(0, 5).map((g) => `${g[0].name || '(무명)'} ×${g.length}`),
    note: '시간대가 다르면 정상 분반일 수 있습니다. 시간표에서 근거를 확인하세요.',
    link: { label: '시간표 열기', href: '/timetable' },
  });

  const byName = new Map<string, DQClass[]>();
  for (const c of activeClasses) byName.set(norm(c.name), [...(byName.get(norm(c.name)) || []), c]);
  const nameOnly = Array.from(byName.values()).filter(
    (g) => g.length > 1 && new Set(g.map((c) => `${c.subject}|${c.teacher_id}`)).size > 1,
  );
  out.push({
    id: 'class_duplicate_name_only',
    title: '이름만 같고 과목/강사가 다른 활성 반',
    severity: 'info',
    basis: 'classes.name 동일 + (subject, teacher_id) 상이',
    groupCount: nameOnly.length,
    recordCount: nameOnly.reduce((s, g) => s + g.length, 0),
    groupUnit: '이름 그룹',
    recordUnit: '반',
    samples: nameOnly.slice(0, 5).map(
      (g) => `${g[0].name || '(무명)'}: ${uniq(g.map((c) => c.subject || '과목없음')).join('/')}`,
    ),
    note: '과목·강사가 다르면 정상입니다. 참고용으로만 표시합니다.',
    link: { label: '반 관리 열기', href: '/classes' },
  });

  const unclosedNoClass = lessons.filter((l) => !l.class_id && l.submitted === false);
  out.push({
    id: 'lesson_no_class_unclosed',
    title: '반 미지정 미마감 수업일지',
    severity: 'check',
    basis: `${lessonBasis} · class_id is null && submitted = false`,
    groupCount: uniq(unclosedNoClass.map((l) => l.lesson_date)).length,
    recordCount: unclosedNoClass.length,
    groupUnit: '수업일',
    recordUnit: '기록',
    samples: uniq(unclosedNoClass.map((l) => l.lesson_date)).slice(0, 5),
    note: '보충·클리닉 등 반 없이 생성된 기록일 수 있습니다. 마감 화면에서 확인하세요.',
    link: { label: '수업 기록 조회', href: '/lessons' },
  });

  const teacherMismatch = lessons.filter((l) => {
    const c = l.class_id ? classById.get(l.class_id) : null;
    return !!c?.teacher_id && !!l.teacher_id && c.teacher_id !== l.teacher_id;
  });
  out.push({
    id: 'lesson_teacher_mismatch',
    title: '수업일지 강사와 현재 반 담당 강사 불일치',
    severity: 'check',
    basis: `${lessonBasis} · lesson_records.teacher_id ≠ classes.teacher_id`,
    groupCount: uniq(teacherMismatch.map((l) => l.class_id || '')).length,
    recordCount: teacherMismatch.length,
    groupUnit: '반',
    recordUnit: '기록',
    samples: uniq(teacherMismatch.map((l) => cname(l.class_id))).slice(0, 5),
    note: '강사 인계 이후 과거 기록은 정상입니다(출처 보존). 최근 기록만 확인하세요.',
    link: { label: '반 관리 열기', href: '/classes' },
  });

  const notEnrolled = lessons.filter((l) => {
    if (!l.class_id || !l.student_id) return false;
    const st = studentById.get(l.student_id);
    if (!st || !ACTIVE_ENROLL.includes(st.enrollment_status || '')) return false;
    return !(memberByClass.get(l.class_id)?.has(l.student_id));
  });
  out.push({
    id: 'lesson_student_not_in_class',
    title: '수업일지 학생이 현재 반 명단에 없음',
    severity: 'check',
    basis: `${lessonBasis} · 재원 학생 & class_students 미연결`,
    groupCount: uniq(notEnrolled.map((l) => l.class_id || '')).length,
    recordCount: notEnrolled.length,
    groupUnit: '반',
    recordUnit: '기록',
    samples: uniq(notEnrolled.map((l) => cname(l.class_id))).slice(0, 5),
    note: '반 이동 후 명단이 갱신되지 않았을 수 있습니다.',
    link: { label: '반 관리 열기', href: '/classes' },
  });

  const withdrawnInActive = Array.from(withdrawnIds).filter(
    (id) => (classesOfStudent.get(id) || []).some((cid) => activeClassIds.has(cid)),
  );
  out.push({
    id: 'withdrawn_in_active_class',
    title: '퇴원 학생이 활성 반 명단에 남음',
    severity: 'check',
    basis: 'students.enrollment_status = 퇴원 & 활성 반 연결',
    groupCount: withdrawnInActive.length,
    recordCount: withdrawnInActive.length,
    groupUnit: '학생',
    recordUnit: '연결',
    samples: [],
    link: { label: '반 관리 열기', href: '/classes' },
  });

  const noRole = profiles.filter((p) => p.is_active && !roleUserIds.has(p.id));
  const roleNoProfile = roles.filter((r) => {
    const p = profileById.get(r.user_id);
    return !p || !p.is_active;
  });
  out.push({
    id: 'user_role_mismatch',
    title: '활성 사용자 역할 불일치',
    severity: 'check',
    basis: 'profiles.is_active & user_roles 대조',
    groupCount: (noRole.length ? 1 : 0) + (roleNoProfile.length ? 1 : 0),
    recordCount: noRole.length + roleNoProfile.length,
    groupUnit: '유형',
    recordUnit: '계정',
    samples: [
      ...(noRole.length ? [`역할 미지정 ${noRole.length}명`] : []),
      ...(roleNoProfile.length ? [`비활성/미존재 프로필에 역할 ${roleNoProfile.length}건`] : []),
    ],
    link: { label: '사용자 관리 열기', href: '/admin/users' },
  });

  const sstBad = subjectTeachers.filter((s) => {
    const p = s.teacher_id ? profileById.get(s.teacher_id) : null;
    return !p || !p.is_active;
  });
  out.push({
    id: 'subject_teacher_inactive',
    title: '과목 담당 매핑의 강사가 비활성/미존재',
    severity: 'check',
    basis: 'student_subject_teachers.teacher_id ↔ profiles.is_active',
    groupCount: uniq(sstBad.map((s) => s.teacher_id || 'none')).length,
    recordCount: sstBad.length,
    groupUnit: '강사',
    recordUnit: '매핑',
    samples: [],
    link: { label: '사용자 관리 열기', href: '/admin/users' },
  });

  // ── 참고 ───────────────────────────────────────────────────
  const emptyClasses = activeClasses.filter((c) => !(memberByClass.get(c.id)?.size));
  out.push({
    id: 'active_class_no_student',
    title: '활성 반인데 학생 0명',
    severity: 'info',
    basis: '활성 시간표 보유 반 · class_students 0건',
    groupCount: emptyClasses.length,
    recordCount: emptyClasses.length,
    groupUnit: '반',
    recordUnit: '반',
    samples: emptyClasses.slice(0, 5).map((c) => c.name || c.id.slice(0, 8)),
    link: { label: '반 관리 열기', href: '/classes' },
  });

  const archivedClasses = classes.filter((c) => !activeClassIds.has(c.id));
  out.push({
    id: 'class_no_active_schedule',
    title: '활성 시간표가 없는 반(보관 추정)',
    severity: 'info',
    basis: 'class_schedules.is_active 행 없음',
    groupCount: archivedClasses.length,
    recordCount: archivedClasses.length,
    groupUnit: '반',
    recordUnit: '반',
    samples: archivedClasses.slice(0, 5).map((c) => c.name || c.id.slice(0, 8)),
    link: { label: '반 관리 열기', href: '/classes' },
  });

  const hwNoLink = homework.filter((h) => !h.lesson_record_id);
  out.push({
    id: 'homework_no_lesson_link',
    title: '수업일지에 연결되지 않은 숙제',
    severity: 'info',
    basis: `homework_assignments · 최근 ${lessonWindowDays}일 · lesson_record_id is null`,
    groupCount: uniq(hwNoLink.map((h) => h.assigned_date || '')).length,
    recordCount: hwNoLink.length,
    groupUnit: '부여일',
    recordUnit: '숙제',
    samples: uniq(hwNoLink.map((h) => h.assigned_date || '')).slice(0, 5),
    link: { label: '수업 기록 조회', href: '/lessons' },
  });

  const orphanHw = homework.filter((h) => !h.student_id || !studentById.has(h.student_id));
  const orphanRep = reports.filter((r) => !r.student_id || !studentById.has(r.student_id));
  out.push({
    id: 'orphan_student_ref',
    title: '숙제/주간리포트의 학생 참조 이상',
    severity: orphanHw.length + orphanRep.length > 0 ? 'critical' : 'info',
    basis: `students 미존재 참조 · 숙제 ${lessonWindowDays}일 / 리포트 ${reportWindowDays}일`,
    groupCount: (orphanHw.length ? 1 : 0) + (orphanRep.length ? 1 : 0),
    recordCount: orphanHw.length + orphanRep.length,
    groupUnit: '유형',
    recordUnit: '레코드',
    samples: [
      ...(orphanHw.length ? [`숙제 ${orphanHw.length}건`] : []),
      ...(orphanRep.length ? [`주간리포트 ${orphanRep.length}건`] : []),
    ],
    link: { label: '리포트 현황 열기', href: '/reports/status' },
  });

  const emptyReports = reports.filter((r) => !r.total_lessons);
  out.push({
    id: 'report_zero_lessons',
    title: '수업 0건으로 생성된 주간리포트',
    severity: 'info',
    basis: `weekly_reports · 최근 ${reportWindowDays}일 · total_lessons 0/누락`,
    groupCount: uniq(emptyReports.map((r) => r.week_start || '')).length,
    recordCount: emptyReports.length,
    groupUnit: '주차',
    recordUnit: '리포트',
    samples: uniq(emptyReports.map((r) => r.week_start || '')).slice(0, 5),
    link: { label: '리포트 현황 열기', href: '/reports/status' },
  });

  return out;
}

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: '즉시 수정 필요',
  check: '확인 필요',
  info: '참고',
};

export const SEVERITY_ORDER: Severity[] = ['critical', 'check', 'info'];
