import { ReactNode, useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { getDefaultDashboardPath, useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
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

  // TEACHER-NAV-SIMPLIFY-V1: 교사에게는 최대 3그룹으로 간소화된 메뉴만 노출
  // (라우트/코드는 그대로 유지하고 사이드바 표시만 정리)
  if (role === 'teacher') {
    return [
      {
        label: '오늘 업무',
        items: [
          { label: '수업 마감', href: '/lessons/close', icon: <ClipboardCheck className="w-4 h-4" /> },
          { label: '대시보드', href: dashboardHref, icon: <LayoutDashboard className="w-4 h-4" /> },
          { label: '시간표', href: '/timetable', icon: <Calendar className="w-4 h-4" /> },
          { label: '수업 기록 조회', href: '/lessons', icon: <ClipboardList className="w-4 h-4" /> },
          { label: '조교요청', href: '/assistant-requests', icon: <UserCheck className="w-4 h-4" /> },
        ],
      },
      {
        label: '수업 자료',
        items: [
          { label: '교재 관리', href: '/textbooks', icon: <BookCopy className="w-4 h-4" /> },
          { label: '단어시험관리', href: '/vocab-test', icon: <BookOpenCheck className="w-4 h-4" /> },
          { label: '내신 보드', href: '/exam-board', icon: <ClipboardCheck className="w-4 h-4" /> },
          { label: '내신 자료실', href: '/exam-archive', icon: <School className="w-4 h-4" /> },
          ...visibleSubjects,
        ],
      },
      {
        label: '리포트',
        items: [
          { label: '리포트 현황', href: '/reports/status', icon: <FileBarChart className="w-4 h-4" /> },
          { label: '내신 성적 추이', href: '/exam-trends', icon: <TrendingUp className="w-4 h-4" /> },
        ],
      },
    ];
  }

  // ADMIN-NAV-REGROUP-V1: 원장/관리자·조교 메뉴를 사용 목적 기준 4그룹 + 기타로 정돈
  // (URL·권한·기능은 그대로 유지, 배치와 그룹명만 변경)
  return [

    { label: '대시보드', href: dashboardHref, icon: <LayoutDashboard className="w-4 h-4" /> },
    { label: '시간표', href: '/timetable', icon: <Calendar className="w-4 h-4" /> },
    {
      label: '오늘 운영',
      items: [
        { label: '수업 기록', href: '/lessons', icon: <ClipboardList className="w-4 h-4" /> },
        { label: '일일 현황', href: '/admin/daily', icon: <CalendarDays className="w-4 h-4" />, adminOnly: true },
        { label: '출석부', href: '/admin/attendance-book', icon: <ClipboardList className="w-4 h-4" />, adminOnly: true },
        { label: '조교요청', href: '/assistant-requests', icon: <ClipboardCheck className="w-4 h-4" />, allowedRoles: ['admin', 'teacher', 'assistant'] },
        { label: '행정 업무', href: '/admin/office', icon: <Briefcase className="w-4 h-4" />, allowedRoles: ['admin'], allowedEmails: ['bfkor8810@naver.com'] },
      ],
    },
    {
      label: '학습 관리',
      items: [
        { label: '수업 계획', href: '/plan', icon: <BookOpenCheck className="w-4 h-4" />, allowedRoles: ['admin', 'teacher'] },
        { label: '교재 관리', href: '/textbooks', icon: <BookCopy className="w-4 h-4" />, allowedRoles: ['admin', 'teacher'] },
        { label: '단어시험관리', href: '/vocab-test', icon: <BookOpenCheck className="w-4 h-4" />, allowedRoles: ['admin', 'teacher', 'assistant'] },
        { label: '내신 보드', href: '/exam-board', icon: <ClipboardCheck className="w-4 h-4" />, allowedRoles: ['admin', 'teacher'] },
        { label: '내신 자료실', href: '/exam-archive', icon: <School className="w-4 h-4" /> },
        { label: '내신 성적 추이', href: '/exam-trends', icon: <TrendingUp className="w-4 h-4" />, allowedRoles: ['admin', 'teacher'] },
      ],
    },
    ...materialGroup,
    {
      label: '학생·행정',
      items: [
        { label: '학생 관리', href: '/students', icon: <Users className="w-4 h-4" />, allowedRoles: ['admin'], allowedEmails: ['bfkor8810@naver.com'] },
        { label: '반 관리', href: '/classes', icon: <BookOpen className="w-4 h-4" />, allowedRoles: ['admin'] },
        { label: '사용자 관리', href: '/admin/users', icon: <UserCog className="w-4 h-4" />, allowedRoles: ['admin'] },
        { label: '수강료 관리', href: '/admin/tuition', icon: <Wallet className="w-4 h-4" />, allowedRoles: ['admin'], allowedEmails: ['bfkor8810@naver.com'] },
        { label: '수입 관리', href: '/admin/income', icon: <TrendingUp className="w-4 h-4" />, allowedRoles: ['admin'] },
        { label: '근무시간', href: '/work-logs', icon: <Clock className="w-4 h-4" />, allowedRoles: ['admin', 'assistant'] },
      ],
    },
    {
      label: '리포트·분석',
      items: [
        { label: '주간 리포트', href: '/reports', icon: <FileBarChart className="w-4 h-4" />, adminOnly: true },
        { label: '리포트 현황', href: '/reports/status', icon: <FileBarChart className="w-4 h-4" />, allowedRoles: ['admin', 'teacher'] },
        { label: '통계', href: '/stats', icon: <BarChart3 className="w-4 h-4" />, adminOnly: true },
        { label: '원장 보고', href: '/admin/briefing', icon: <FileBarChart2 className="w-4 h-4" />, adminOnly: true },
        { label: '원장 보고서', href: '/admin/report', icon: <FileText className="w-4 h-4" />, adminOnly: true },
        { label: '데이터 점검', href: '/admin/data-quality', icon: <AlertTriangle className="w-4 h-4" />, adminOnly: true },
      ],
    },
    {
      label: '기타',
      items: [
        { label: '조교', href: '/assistant', icon: <UserCheck className="w-4 h-4" />, allowedRoles: ['admin', 'teacher', 'assistant'] },
        { label: '개념 퀴즈', href: '/math-concepts', icon: <Brain className="w-4 h-4" />, allowedRoles: ['admin', 'teacher', 'assistant'] },
        { label: '특강 신청 현황', href: '/admin/intensive-applications', icon: <ClipboardList className="w-4 h-4" />, adminOnly: true },
        { label: '학부모 설문', href: '/admin/parent-learning-feedback', icon: <ClipboardList className="w-4 h-4" />, adminOnly: true },
        { label: '영어팀 채널', href: '/private-channel', icon: <MessageCircle className="w-4 h-4" />, allowedRoles: ['admin'], allowedEmails: ['engmentor0201@gmail.com', 'assistanteng99@gmail.com'] },
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

  // Check if a group contains the active route (for auto-open)
  const groupContainsActive = (group: NavGroup) =>
    group.items.some(item => location.pathname === item.href);

  const isGroupOpen = (group: NavGroup) =>
    openGroups[group.label] !== undefined ? openGroups[group.label] : groupContainsActive(group);

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
        title={sidebarCollapsed ? item.label : undefined}
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
            {filteredEntries.map((entry) => {
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