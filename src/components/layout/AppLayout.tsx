import { ReactNode, useState, useEffect, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { getDefaultDashboardPath, useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  LayoutDashboard, 
  Users, 
  BookOpen, 
  ClipboardList, 
  FileBarChart,
  
  LogOut,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  UserCog,
  Calendar,
  CalendarDays,
  ClipboardCheck,
  UserCheck,
  BarChart3,
  FileBarChart2,
  FileText,
  BookOpenCheck,
  ChevronDown,
  School,
  FolderOpen,
  Briefcase,
  BookCopy,
  Brain,
  Wallet,
  TrendingUp,
  MessageCircle,
  Clock,
  AlertTriangle,
  Compass,
  Search,
  X as XIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { TeamNotesBoard } from '@/components/TeamNotesBoard';
import { AcademyCalendar } from '@/components/AcademyCalendar';
import { AdminOfficeBell } from '@/components/admin/AdminOfficeBell';
import { BrandFooter } from '@/components/layout/BrandFooter';
import { FloatingAttendanceWidget } from '@/components/layout/FloatingAttendanceWidget';
import { AttendanceAlertWatcher } from '@/components/layout/AttendanceAlertWatcher';
import { SystemAnnouncementBar } from '@/components/layout/SystemAnnouncementBar';

interface AppLayoutProps {
  children: ReactNode;
}

interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
  /** 모호한 명칭 구분용 1줄 설명 (툴팁) */
  description?: string;
  adminOnly?: boolean;
  allowedRoles?: ('admin' | 'teacher' | 'assistant')[];
  allowedEmails?: string[];
  allowedSubjects?: string[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
  /** 보관 그룹: 기본 접힘 · 활성 라우트여도 자동으로 열리지 않음 */
  archive?: boolean;
}

type NavEntry = NavItem | NavGroup;

function isGroup(entry: NavEntry): entry is NavGroup {
  return 'items' in entry;
}

const SUBJECT_KEY_MAP: Record<string, string> = {
  '수학': 'math',
  '영어': 'english',
  '국어': 'korean',
  '과학': 'science',
};

// Teacher name → list of subjects they can access
const TEACHER_MULTI_SUBJECT_MAP: Record<string, string[]> = {
  '최윤기': ['수학', '과학'],
  '민희': ['영어'],
  '미정': ['영어'],
  '이재진': ['영어'],
  '김은수': ['영어'],
  '준희': ['국어'],
  '이나연': ['수학'],
  '함유빈': ['수학'],
};

const getNavStructure = (assignedSubject: string | null, role: string | null, userEmail: string | null, fullName: string | null): NavEntry[] => {
  const dashboardHref = getDefaultDashboardPath(role);
  const allSubjects = [
    { label: '수학', href: '/materials/math', icon: <FolderOpen className="w-4 h-4" /> },
    { label: '영어', href: '/materials/english', icon: <FolderOpen className="w-4 h-4" /> },
    { label: '국어', href: '/materials/korean', icon: <FolderOpen className="w-4 h-4" /> },
    { label: '과학', href: '/materials/science', icon: <FolderOpen className="w-4 h-4" /> },
  ];

  // Admin/assistant sees all subjects
  // Teacher: check multi-subject map first, then fallback to assigned_subject
  let visibleSubjects = allSubjects;
  if (role === 'teacher') {
    // Find matching subjects from teacher name map
    const matchedSubjects: string[] = [];
    if (fullName) {
      for (const [nameKey, subjects] of Object.entries(TEACHER_MULTI_SUBJECT_MAP)) {
        if (fullName.includes(nameKey)) {
          matchedSubjects.push(...subjects);
        }
      }
    }
    // Fallback to assignedSubject if no name match
    if (matchedSubjects.length === 0 && assignedSubject) {
      matchedSubjects.push(assignedSubject);
    }
    const uniqueSubjects = [...new Set(matchedSubjects)];
    visibleSubjects = allSubjects.filter(s => 
      uniqueSubjects.some(sub => s.href === `/materials/${SUBJECT_KEY_MAP[sub] || ''}`)
    );
  } else if (role !== 'admin' && role !== 'assistant') {
    visibleSubjects = [];
  }

  const materialGroup: NavEntry[] = visibleSubjects.length > 0
    ? [{
        label: '과목 자료실',
        items: visibleSubjects,
      }]
    : [];

  // TEACHER-NAV-FLOW-V2: 오늘 수업 → 수업 기록 → 학생 → 시험/자료 순서
  // (URL·권한·기능은 그대로 유지, 표시 순서와 명칭만 정리)
  if (role === 'teacher') {
    return [
      { label: '오늘 수업', href: dashboardHref, icon: <LayoutDashboard className="w-4 h-4" />, description: '선택한 수업일 마감 + 오늘 실시간 출결' },
      { label: '수업 마감', href: '/lessons/close', icon: <ClipboardCheck className="w-4 h-4" />, description: '출결·이해도·숙제를 한 번에 마감' },
      { label: '수업 기록 조회', href: '/lessons', icon: <ClipboardList className="w-4 h-4" />, description: '저장된 수업일지 조회 · 학생 카르테 진입' },
      { label: '리포트 발송 현황', href: '/reports/status', icon: <FileBarChart className="w-4 h-4" />, description: '주간 리포트 작성·발송 확인' },
      { label: '학교분석·상담자료', href: '/school-analysis', icon: <School className="w-4 h-4" />, description: '학교알리미 공개 통계 기반 상담자료' },
      { label: '시간표', href: '/timetable', icon: <Calendar className="w-4 h-4" /> },
      {
        label: '학생·수업 준비',
        items: [
          { label: '수업 계획(커리큘럼)', href: '/plan', icon: <BookOpenCheck className="w-4 h-4" />, description: '반별 진도 설계·학생별 시작 진도' },
          { label: '교재 관리', href: '/textbooks', icon: <BookCopy className="w-4 h-4" />, description: '교재 주문·배부' },
          { label: '조교 요청·업무', href: '/assistant-requests', icon: <UserCheck className="w-4 h-4" />, description: '조교 업무 요청 생성과 처리 상태 확인' },
        ],
      },
      {
        label: '시험·자료',
        items: [
          { label: '내신 보드', href: '/exam-board', icon: <ClipboardCheck className="w-4 h-4" />, description: '학교별 내신 일정·성적 입력' },
          { label: '내신 자료실', href: '/exam-archive', icon: <School className="w-4 h-4" />, description: '학교별 기출·학사자료 보관함' },
          { label: '내신 성적 추이', href: '/exam-trends', icon: <TrendingUp className="w-4 h-4" />, description: '학생별 성적 변화 그래프' },
          { label: '단어시험지 제작', href: '/vocab-generator', icon: <BookOpenCheck className="w-4 h-4" />, description: '문서 업로드로 단어시험지 생성·인쇄' },
          ...visibleSubjects,
        ],
      },
      {
        label: '기타/보관 기능',
        archive: true,
        items: [
          { label: '단어시험 관리', href: '/vocab-test', icon: <BookOpenCheck className="w-4 h-4" />, description: '보관후보 · 대표 기능: 단어시험지 제작' },
          { label: '개념 퀴즈', href: '/math-concepts', icon: <Brain className="w-4 h-4" />, description: '보관 · 대표 기능: 수업 마감' },
          { label: '문제 조회', href: '/quiz-lookup', icon: <Brain className="w-4 h-4" />, description: '보관 · 대표 기능: 수학 자료실' },
          { label: '문제 일괄 업로드', href: '/quiz-bulk-upload', icon: <Brain className="w-4 h-4" />, description: '보관 · 대표 기능: 문제 조회' },
          { label: '자습·클리닉 관리', href: '/study-sessions', icon: <Clock className="w-4 h-4" />, description: '보관 · 대표 기능: 시간표' },
          { label: '빠른 수업일지 입력', href: '/lessons/quick', icon: <ClipboardList className="w-4 h-4" />, description: '보관 · 대표 기능: 수업 마감' },
        ],
      },
    ];
  }

  // ADMIN-NAV-FLOW-V2: 오늘 운영 → 학생·수업 → 소통·리포트 → 분석·관리 → 기타/보관
  // (URL·권한·기능은 그대로 유지, 배치와 명칭만 변경)
  return [

    { label: '대시보드', href: dashboardHref, icon: <LayoutDashboard className="w-4 h-4" />, description: '오늘 조치가 필요한 항목 우선 표시' },
    { label: '시간표', href: '/timetable', icon: <Calendar className="w-4 h-4" /> },
    {
      label: '오늘 운영',
      items: [
        { label: '일일 운영 현황', href: '/admin/daily', icon: <CalendarDays className="w-4 h-4" />, description: '오늘 등원·수업·미처리 업무 종합', adminOnly: true },
        { label: '미마감 관리', href: '/admin/unclosed', icon: <AlertTriangle className="w-4 h-4" />, description: '강사별 미마감 수업일지 집계', adminOnly: true },
        { label: '조교 요청·업무', href: '/assistant-requests', icon: <ClipboardCheck className="w-4 h-4" />, description: '요청 생성·배정과 조교 업무 처리 상태', allowedRoles: ['admin', 'teacher', 'assistant'] },
      ],
    },
    {
      label: '학생·반',
      items: [
        { label: '상담·등록', href: '/admin/admissions', icon: <UserCheck className="w-4 h-4" />, description: '상담 예약·사전정보·등록 전환·인계 흐름', allowedRoles: ['admin'] },
        { label: '학생 관리', href: '/students', icon: <Users className="w-4 h-4" />, description: '학생 등록·수정·반 배정 · 학생 카르테 진입', allowedRoles: ['admin'], allowedEmails: ['bfkor8810@naver.com'] },
        { label: '반 관리', href: '/classes', icon: <BookOpen className="w-4 h-4" />, description: '반 생성·명단·시간표 연결', allowedRoles: ['admin'] },
        { label: '수업 계획(커리큘럼)', href: '/plan', icon: <BookOpenCheck className="w-4 h-4" />, description: '반별 진도 설계·학생별 시작 진도', allowedRoles: ['admin', 'teacher'] },
        { label: '교재 관리', href: '/textbooks', icon: <BookCopy className="w-4 h-4" />, description: '교재 주문·입고·배부·교재비', allowedRoles: ['admin', 'teacher'] },
      ],
    },
    {
      label: '수업·출결',
      items: [
        { label: '수업 마감', href: '/lessons/close', icon: <ClipboardCheck className="w-4 h-4" />, description: '출결·이해도·숙제를 한 번에 마감', allowedRoles: ['admin', 'teacher'] },
        { label: '수업 기록 조회', href: '/lessons', icon: <ClipboardList className="w-4 h-4" />, description: '저장된 수업일지 조회' },
        { label: '출석부', href: '/admin/attendance-book', icon: <ClipboardList className="w-4 h-4" />, description: '월 단위 출결 대장', adminOnly: true },
        { label: '주간 수업 점검', href: '/admin/briefing', icon: <FileBarChart2 className="w-4 h-4" />, description: '주차별 수업일지 검수·휴원일 관리', adminOnly: true },
      ],
    },
    {
      label: '리포트·상담',
      items: [
        { label: '주간 리포트 생성', href: '/reports', icon: <FileBarChart className="w-4 h-4" />, description: '주차별 리포트 초안 생성·검수', adminOnly: true },
        { label: '리포트 발송 현황', href: '/reports/status', icon: <FileBarChart className="w-4 h-4" />, description: '작성·발송 확인 기록', allowedRoles: ['admin', 'teacher'] },
        { label: '학교분석·상담자료', href: '/school-analysis', icon: <School className="w-4 h-4" />, description: '학교알리미 공개 통계 기반 상담자료', allowedRoles: ['admin', 'teacher'] },
        { label: '멘토맵 상담관리', href: '/admin/mentor-map', icon: <Compass className="w-4 h-4" />, description: '신규 상담 신청·맞춤 학습방향 제안서', allowedRoles: ['admin', 'teacher'] },
        { label: '학부모 설문', href: '/admin/parent-learning-feedback', icon: <ClipboardList className="w-4 h-4" />, description: '학습정보 전달 설문 발송·응답', adminOnly: true },
        { label: '행정 업무', href: '/admin/office', icon: <Briefcase className="w-4 h-4" />, description: '행정 업무 게시판·팀 메모', allowedRoles: ['admin'], allowedEmails: ['bfkor8810@naver.com'] },
      ],
    },
    {
      label: '시험·자료',
      items: [
        { label: '내신 보드', href: '/exam-board', icon: <ClipboardCheck className="w-4 h-4" />, description: '학교별 내신 일정·성적 입력', allowedRoles: ['admin', 'teacher'] },
        { label: '내신 자료실', href: '/exam-archive', icon: <School className="w-4 h-4" />, description: '학교별 기출·학사자료 보관함' },
        { label: '내신 성적 추이', href: '/exam-trends', icon: <TrendingUp className="w-4 h-4" />, description: '학생별 성적 변화 그래프', allowedRoles: ['admin', 'teacher'] },
        { label: '단어시험지 제작', href: '/vocab-generator', icon: <BookOpenCheck className="w-4 h-4" />, description: '문서 업로드로 단어시험지 생성·인쇄', allowedRoles: ['admin', 'teacher'] },
      ],
    },
    ...materialGroup,
    {
      label: '운영설정',
      items: [
        { label: '사용자 관리', href: '/admin/users', icon: <UserCog className="w-4 h-4" />, description: '직원 계정·역할 관리', allowedRoles: ['admin'] },
        { label: '수강료 관리', href: '/admin/tuition', icon: <Wallet className="w-4 h-4" />, description: '월 청구 생성·미납 관리', allowedRoles: ['admin'], allowedEmails: ['bfkor8810@naver.com'] },
        { label: '수입 관리', href: '/admin/income', icon: <TrendingUp className="w-4 h-4" />, description: '월별 수입 집계', allowedRoles: ['admin'] },
        { label: '근무시간', href: '/work-logs', icon: <Clock className="w-4 h-4" />, description: '조교 근무 기록', allowedRoles: ['admin', 'assistant'] },
        { label: '특강 신청 현황', href: '/admin/intensive-applications', icon: <ClipboardList className="w-4 h-4" />, description: '방학 특강 신청 접수', adminOnly: true },
        { label: '운영 통계', href: '/stats', icon: <BarChart3 className="w-4 h-4" />, description: '학생·수업·숙제 지표 통계', adminOnly: true },
        { label: '원장 KPI 보고서', href: '/admin/report', icon: <FileText className="w-4 h-4" />, description: 'KPI·운영 변경 이력·학부모 열람 현황', adminOnly: true },
        { label: '데이터 점검', href: '/admin/data-quality', icon: <AlertTriangle className="w-4 h-4" />, description: '기술 전용 · 학생-반 연결 등 구조 이상 감사', adminOnly: true },
        { label: '기능 지도', href: '/admin/feature-map', icon: <LayoutDashboard className="w-4 h-4" />, description: '기술 전용 · 핵심/보조/보관후보 분류와 사용 신호', adminOnly: true },
      ],
    },
    {
      label: '기타/보관 기능',
      archive: true,
      items: [
        { label: '단어시험 관리', href: '/vocab-test', icon: <BookOpenCheck className="w-4 h-4" />, description: '보관후보 · 대표 기능: 단어시험지 제작', allowedRoles: ['admin', 'teacher', 'assistant'] },
        { label: '개념 퀴즈', href: '/math-concepts', icon: <Brain className="w-4 h-4" />, description: '보관 · 대표 기능: 수업 마감', allowedRoles: ['admin', 'teacher', 'assistant'] },
        { label: '문제 조회', href: '/quiz-lookup', icon: <Brain className="w-4 h-4" />, description: '보관 · 대표 기능: 수학 자료실', allowedRoles: ['admin', 'teacher'] },
        { label: '문제 일괄 업로드', href: '/quiz-bulk-upload', icon: <Brain className="w-4 h-4" />, description: '보관 · 대표 기능: 문제 조회', allowedRoles: ['admin', 'teacher'] },
        { label: '자습·클리닉 관리', href: '/study-sessions', icon: <Clock className="w-4 h-4" />, description: '보관 · 대표 기능: 시간표', allowedRoles: ['admin', 'teacher', 'assistant'] },
        { label: '빠른 수업일지 입력', href: '/lessons/quick', icon: <ClipboardList className="w-4 h-4" />, description: '보관 · 대표 기능: 수업 마감', allowedRoles: ['admin', 'teacher'] },
        { label: '영어팀 채널', href: '/private-channel', icon: <MessageCircle className="w-4 h-4" />, description: '영어팀 전용 메시지', allowedRoles: ['admin'], allowedEmails: ['engmentor0201@gmail.com', 'assistanteng99@gmail.com'] },
      ],
    },
  ];

};

export function AppLayout({ children }: AppLayoutProps) {
  const { user, role, assignedSubject, fullName, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [navQuery, setNavQuery] = useState('');

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  // Global textbook order notifications
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('global-textbook-orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'textbook_orders' }, (payload) => {
        const newOrder = payload.new as any;
        if (role === 'admin' && newOrder.requested_by !== user.id) {
          toast.info(`📋 ${newOrder.requested_by_name || '선생님'}이 "${newOrder.textbook_name}" 교재를 신청했습니다`, { duration: 8000 });
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'textbook_orders' }, (payload) => {
        const updated = payload.new as any;
        if (updated.status === '입고완료' && updated.requested_by === user.id) {
          toast.success(`📦 "${updated.textbook_name}" 교재가 입고 완료되었습니다!`, { duration: 8000 });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, role]);

  // Teacher notifications (vocab test results, etc.)
  useEffect(() => {
    if (!user || role === 'admin') return;
    const channel = supabase
      .channel('teacher-notifications-' + user.id)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'teacher_notifications',
        filter: `teacher_id=eq.${user.id}`,
      }, (payload) => {
        const notif = payload.new as any;
        if (notif.notification_type === 'vocab_test_result') {
          toast.info(notif.title, { description: notif.message, duration: 10000 });
        } else {
          toast.info(notif.title, { duration: 6000 });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, role]);

  const toggleGroup = (label: string) => {
    setOpenGroups(prev => ({ ...prev, [label]: !prev[label] }));
  };

  const canSeeItem = (item: NavItem): boolean => {
    const email = (user?.email || '').trim().toLowerCase();
    // If allowedEmails is set, grant access if email matches (regardless of role)
    if (item.allowedEmails?.some((allowedEmail) => allowedEmail.trim().toLowerCase() === email)) return true;
    if (item.allowedRoles) {
      const roleMatch = !!(role && item.allowedRoles.includes(role));
      // If allowedSubjects is set, teachers must also match subject
      if (item.allowedSubjects && role === 'teacher') {
        return roleMatch && !!(assignedSubject && item.allowedSubjects.includes(assignedSubject));
      }
      return roleMatch;
    }
    return !item.adminOnly || role === 'admin';
  };

  const navStructure = getNavStructure(assignedSubject, role, user?.email || null, fullName);

  // Auto-open groups containing the active route
  const getFilteredEntries = () => {
    return navStructure.map(entry => {
      if (isGroup(entry)) {
        const filtered = entry.items.filter(canSeeItem);
        if (filtered.length === 0) return null;
        return { ...entry, items: filtered };
      }
      return canSeeItem(entry) ? entry : null;
    }).filter(Boolean) as NavEntry[];
  };

  const filteredEntries = getFilteredEntries();

  // Flat list for quick search across all visible menu items
  const searchableItems = useMemo(() => {
    const items: (NavItem & { groupLabel?: string })[] = [];
    filteredEntries.forEach((entry) => {
      if (isGroup(entry)) {
        entry.items.forEach((item) => items.push({ ...item, groupLabel: entry.label }));
      } else {
        items.push(entry);
      }
    });
    return items;
  }, [filteredEntries]);

  const normalizedQuery = navQuery.trim().toLowerCase().replace(/\s+/g, '');
  const searchResults = useMemo(() => {
    if (!normalizedQuery) return [];
    return searchableItems.filter(item => {
      const hay = (item.label + (item.description || '') + (item.groupLabel || '')).toLowerCase().replace(/\s+/g, '');
      return hay.includes(normalizedQuery);
    });
  }, [searchableItems, normalizedQuery]);

  // Check if a group contains the active route (for auto-open)
  const groupContainsActive = (group: NavGroup) =>
    group.items.some(item => location.pathname === item.href);

  const isGroupOpen = (group: NavGroup) => {
    if (openGroups[group.label] !== undefined) return openGroups[group.label];
    // 보관 그룹은 새로고침·로그인·활성 라우트와 무관하게 항상 기본 접힘
    if (group.archive) return false;
    return groupContainsActive(group);
  };

  // Show shared components (TeamNotesBoard, AcademyCalendar) on dashboard routes
  const isDashboard = location.pathname === '/dashboard' || location.pathname === '/teacher';
  const isWideWorkspace = location.pathname === '/exam-archive' || location.pathname === '/timetable';

  const renderNavItem = (item: NavItem, indent = false) => {
    const isActive = location.pathname === item.href;
    return (
      <Link
        key={item.href}
        to={item.href}
        onClick={() => setSidebarOpen(false)}
        title={sidebarCollapsed ? item.label : item.description}
        className={cn(
          "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
          indent && !sidebarCollapsed && "pl-8",
          sidebarCollapsed && "justify-center px-2",
          isActive
            ? "bg-sidebar-accent text-sidebar-foreground font-medium"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
        )}
      >
        {item.icon}
        {!sidebarCollapsed && <span>{item.label}</span>}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-sidebar border-b border-sidebar-border z-50 px-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-sidebar-accent rounded-md transition-colors text-sidebar-foreground"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="flex items-center gap-2.5">
            {/* Logo Mark */}
            <div className="w-7 h-7 bg-sidebar-foreground rounded flex items-center justify-center">
              <span className="text-sidebar-background font-bold text-sm">M</span>
            </div>
            <span className="font-semibold text-sidebar-foreground text-sm">MENTOR LOG</span>
          </div>
        </div>
        <AdminOfficeBell />
      </header>

      {/* Sidebar */}
      <aside 
        className={cn(
          "fixed top-0 left-0 h-full bg-sidebar z-40 transition-all duration-200 lg:translate-x-0",
          sidebarCollapsed ? "w-14" : "w-56",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="h-14 px-3 flex items-center gap-2.5 border-b border-sidebar-border">
            {/* Logo Mark: Square with "M" */}
            <div className="w-8 h-8 bg-sidebar-foreground rounded flex items-center justify-center flex-shrink-0">
              <span className="text-sidebar-background font-bold text-base">M</span>
            </div>
            {!sidebarCollapsed && (
              <div className="min-w-0 flex-1">
                <h1 className="font-semibold text-sidebar-foreground text-sm tracking-tight">MENTOR LOG</h1>
                <p className="text-[10px] text-sidebar-foreground/60 truncate">더멘토학원 학습·운영 관리</p>
              </div>
            )}
            {!sidebarCollapsed && (
              <div className="hidden lg:block">
                <AdminOfficeBell />
              </div>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
            {/* Menu search */}
            {!sidebarCollapsed && (
              <div className="px-1 pb-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-sidebar-foreground/40" />
                  <Input
                    type="text"
                    placeholder="메뉴 검색"
                    value={navQuery}
                    onChange={(e) => setNavQuery(e.target.value)}
                    className={cn(
                      "h-8 pl-8 pr-7 text-xs bg-sidebar-accent/40 border-sidebar-border/30 text-sidebar-foreground placeholder:text-sidebar-foreground/40 focus-visible:ring-primary/60 focus-visible:ring-1 focus-visible:ring-offset-0"
                    )}
                  />
                  {navQuery && (
                    <button
                      onClick={() => setNavQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-sidebar-foreground/40 hover:text-sidebar-foreground"
                      aria-label="검색어 지우기"
                    >
                      <XIcon className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {navQuery && (
                  <div className="mt-1 space-y-0.5">
                    {searchResults.length === 0 ? (
                      <p className="px-2 py-2 text-[11px] text-sidebar-foreground/50 text-center">
                        검색 결과 없음
                      </p>
                    ) : (
                      searchResults.map((item) => (
                        <Link
                          key={item.href}
                          to={item.href}
                          onClick={() => { setSidebarOpen(false); setNavQuery(''); }}
                          title={item.description}
                          className={cn(
                            "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                            location.pathname === item.href
                              ? "bg-sidebar-accent text-sidebar-foreground font-medium"
                              : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                          )}
                        >
                          {item.icon}
                          <span className="flex-1 truncate">{item.label}</span>
                        </Link>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            {!navQuery && filteredEntries.map((entry) => {
              if (isGroup(entry)) {
                const open = isGroupOpen(entry);
                if (sidebarCollapsed) {
                  // In collapsed mode, show first item's icon as group representative
                  return (
                    <div key={entry.label} className="space-y-0.5">
                      {entry.items.map(item => renderNavItem(item))}
                    </div>
                  );
                }
                return (
                  <div key={entry.label}>
                    <button
                      onClick={() => toggleGroup(entry.label)}
                      className="flex items-center justify-between w-full px-3 py-2 rounded-md text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50 hover:text-sidebar-foreground/70 transition-colors"
                    >
                      <span>{entry.label}</span>
                      <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", open && "rotate-180")} />
                    </button>
                    {open && (
                      <div className="space-y-0.5 mt-0.5">
                        {entry.items.map(item => renderNavItem(item, true))}
                      </div>
                    )}
                  </div>
                );
              }
              return renderNavItem(entry as NavItem);
            })}
          </nav>

          {/* Collapse toggle (desktop only) */}
          <div className="hidden lg:flex justify-center py-2 border-t border-sidebar-border">
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="p-1.5 rounded-md text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
              title={sidebarCollapsed ? '메뉴 펼치기' : '메뉴 접기'}
            >
              {sidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
          </div>

          {/* User section */}
          <div className="p-2 border-t border-sidebar-border">
            {!sidebarCollapsed ? (
              <>
                <div className="flex items-center gap-2.5 mb-3 px-1">
                  <div className="w-8 h-8 bg-sidebar-accent rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-medium text-sidebar-foreground">
                      {user?.email?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-sidebar-foreground truncate">{user?.email}</p>
                    <p className="text-[10px] text-sidebar-foreground/60 capitalize">{role || 'No role'}</p>
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="w-full justify-start gap-2 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent h-8 text-xs" 
                  onClick={handleSignOut}
                >
                  <LogOut className="w-3.5 h-3.5" />
                  로그아웃
                </Button>
              </>
            ) : (
              <button
                onClick={handleSignOut}
                title="로그아웃"
                className="w-full flex justify-center p-2 rounded-md text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className={cn("min-h-screen pt-14 lg:pt-0 flex flex-col transition-all duration-200", sidebarCollapsed ? "lg:ml-14" : "lg:ml-56")}>
        <SystemAnnouncementBar />
        <main className="flex-1">
          <div className={cn('mx-auto', isWideWorkspace ? 'max-w-none p-3 lg:p-4' : 'max-w-7xl p-5 lg:p-8')}>
            {/* TEACHER-PRIORITY-V1: /teacher는 페이지 내부 보조 영역에서 직접 렌더 */}
            {isDashboard && location.pathname !== '/teacher' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-6">
                <TeamNotesBoard />
                <AcademyCalendar />
              </div>
            )}
            {children}
          </div>
        </main>
        <BrandFooter />
      </div>

      {/* Floating attendance widget for assistant/admin */}
      <FloatingAttendanceWidget />

      {/* 15분 경과 미출석 팝업 알림 (원장/담당 선생님) */}
      <AttendanceAlertWatcher />
    </div>
  );
}
