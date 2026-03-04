import { ReactNode, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
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
  UserCog,
  Calendar,
  ClipboardCheck,
  UserCheck,
  BarChart3,
  FileBarChart2,
  FileText,
  CalendarDays,
  BookOpenCheck,
  ChevronDown,
  School
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { TeamNotesBoard } from '@/components/TeamNotesBoard';
import { AcademyCalendar } from '@/components/AcademyCalendar';

interface AppLayoutProps {
  children: ReactNode;
}

interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
  adminOnly?: boolean;
  allowedRoles?: ('admin' | 'teacher' | 'assistant')[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

type NavEntry = NavItem | NavGroup;

function isGroup(entry: NavEntry): entry is NavGroup {
  return 'items' in entry;
}

const navStructure: NavEntry[] = [
  { label: '대시보드', href: '/dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
  { label: '시간표', href: '/timetable', icon: <Calendar className="w-4 h-4" /> },
  {
    label: '수업',
    items: [
      { label: '수업 기록', href: '/lessons', icon: <ClipboardList className="w-4 h-4" /> },
      { label: '시험', href: '/vocab-test', icon: <BookOpenCheck className="w-4 h-4" />, allowedRoles: ['admin', 'teacher', 'assistant'] },
      { label: '내신 자료실', href: '/exam-archive', icon: <School className="w-4 h-4" /> },
    ],
  },
  {
    label: '조교',
    items: [
      { label: '조교', href: '/assistant', icon: <UserCheck className="w-4 h-4" />, allowedRoles: ['admin', 'teacher', 'assistant'] },
      { label: '조교요청', href: '/assistant-requests', icon: <ClipboardCheck className="w-4 h-4" />, allowedRoles: ['admin', 'teacher', 'assistant'] },
    ],
  },
  {
    label: '관리',
    items: [
      { label: '학생 관리', href: '/students', icon: <Users className="w-4 h-4" />, adminOnly: true },
      { label: '반 관리', href: '/classes', icon: <BookOpen className="w-4 h-4" />, adminOnly: true },
    ],
  },
  {
    label: '리포트',
    items: [
      { label: '주간 리포트', href: '/reports', icon: <FileBarChart className="w-4 h-4" />, adminOnly: true },
      { label: '리포트 현황', href: '/reports/status', icon: <FileBarChart className="w-4 h-4" />, allowedRoles: ['admin', 'teacher'] },
    ],
  },
  {
    label: '원장',
    items: [
      { label: '통계', href: '/stats', icon: <BarChart3 className="w-4 h-4" />, adminOnly: true },
      { label: '일일 현황', href: '/admin/daily', icon: <CalendarDays className="w-4 h-4" />, adminOnly: true },
      { label: '원장 보고', href: '/admin/briefing', icon: <FileBarChart2 className="w-4 h-4" />, adminOnly: true },
      { label: '원장 보고서', href: '/admin/report', icon: <FileText className="w-4 h-4" />, adminOnly: true },
    ],
  },
  { label: '사용자 관리', href: '/admin/users', icon: <UserCog className="w-4 h-4" />, adminOnly: true },
];

export function AppLayout({ children }: AppLayoutProps) {
  const { user, role, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const toggleGroup = (label: string) => {
    setOpenGroups(prev => ({ ...prev, [label]: !prev[label] }));
  };

  const canSeeItem = (item: NavItem): boolean => {
    if (item.allowedRoles) return !!(role && item.allowedRoles.includes(role));
    return !item.adminOnly || role === 'admin';
  };

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

  // Show shared components (TeamNotesBoard, AcademyCalendar) on dashboard route only
  const isDashboard = location.pathname === '/dashboard';

  const renderNavItem = (item: NavItem, indent = false) => {
    const isActive = location.pathname === item.href;
    return (
      <Link
        key={item.href}
        to={item.href}
        onClick={() => setSidebarOpen(false)}
        className={cn(
          "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
          indent && "pl-8",
          isActive
            ? "bg-sidebar-accent text-sidebar-foreground font-medium"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
        )}
      >
        {item.icon}
        <span>{item.label}</span>
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
      </header>

      {/* Sidebar */}
      <aside 
        className={cn(
          "fixed top-0 left-0 h-full w-56 bg-sidebar z-40 transition-transform duration-200 lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="h-14 px-4 flex items-center gap-2.5 border-b border-sidebar-border">
            {/* Logo Mark: Square with "M" */}
            <div className="w-8 h-8 bg-sidebar-foreground rounded flex items-center justify-center flex-shrink-0">
              <span className="text-sidebar-background font-bold text-base">M</span>
            </div>
            <div className="min-w-0">
              <h1 className="font-semibold text-sidebar-foreground text-sm tracking-tight">MENTOR LOG</h1>
              <p className="text-[10px] text-sidebar-foreground/60 truncate">더멘토학원 학습·운영 관리</p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
            {filteredEntries.map((entry) => {
              if (isGroup(entry)) {
                const open = isGroupOpen(entry);
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

          {/* User section */}
          <div className="p-3 border-t border-sidebar-border">
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
      <main className="lg:ml-56 min-h-screen pt-14 lg:pt-0">
        <div className="p-4 lg:p-6 max-w-7xl">
          {/* Shared dashboard components: Comment Board + Calendar */}
          {isDashboard && (
            <div className="space-y-5 mb-6">
              <TeamNotesBoard />
              <AcademyCalendar />
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}