import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Bell, CheckCircle2, Clock, MapPin, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

/* ═══════ Types ═══════ */
interface StudentInfo {
  id: string;
  name: string;
  parent_name: string | null;
  status: string | null;
  school: string | null;
}

interface Notification {
  id: string;
  type: string;
  message: string;
  timestamp: string;
  is_read: boolean;
}

interface AttendanceLog {
  checked_in_at: string | null;
  checked_out_at: string | null;
  room_id: string | null;
  student_name: string | null;
}

/* ═══════ Helpers ═══════ */
const STATUS_MAP: Record<string, { label: string; color: string; bgClass: string }> = {
  '미등원': { label: '미등원', color: 'hsl(var(--muted-foreground))', bgClass: 'bg-muted text-muted-foreground' },
  '등원': { label: '등원', color: 'hsl(var(--primary))', bgClass: 'bg-primary/10 text-primary border border-primary/20' },
  '입실': { label: '수업 중', color: 'hsl(var(--success))', bgClass: 'bg-success/10 text-success border border-success/20' },
  '퇴실': { label: '퇴실 완료', color: 'hsl(var(--muted-foreground))', bgClass: 'bg-secondary text-secondary-foreground border border-border' },
  '결석': { label: '결석', color: 'hsl(var(--destructive))', bgClass: 'bg-destructive/10 text-destructive border border-destructive/20' },
};

const NOTI_STYLE: Record<string, { borderClass: string; dotClass: string; icon: typeof Bell }> = {
  '지각': { borderClass: 'border-l-warning', dotClass: 'bg-warning', icon: Clock },
  '결석': { borderClass: 'border-l-destructive', dotClass: 'bg-destructive', icon: AlertTriangle },
  '무단조퇴': { borderClass: 'border-l-destructive', dotClass: 'bg-destructive animate-pulse', icon: AlertTriangle },
  '보강확정': { borderClass: 'border-l-success', dotClass: 'bg-success', icon: CheckCircle2 },
};
const DEFAULT_NOTI_STYLE = { borderClass: 'border-l-primary', dotClass: 'bg-primary', icon: Bell };

/* ═══════ Main Component ═══════ */
export default function ParentNotifications() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [student, setStudent] = useState<StudentInfo | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [latestLog, setLatestLog] = useState<AttendanceLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  // Update document title with unread count
  useEffect(() => {
    document.title = unreadCount > 0
      ? `(${unreadCount}) 알림 — 더멘토학원`
      : '알림 — 더멘토학원';
  }, [unreadCount]);

  const fetchData = useCallback(async () => {
    if (!token) return;

    // Look up student by parent_token
    const { data: studentData, error: studentErr } = await supabase
      .from('students')
      .select('id, name, parent_name, status, school')
      .eq('parent_token', token)
      .maybeSingle();

    if (studentErr || !studentData) {
      setError('유효하지 않은 접근입니다.');
      setLoading(false);
      return;
    }
    setStudent(studentData);

    // Fetch notifications
    const { data: notiData } = await supabase
      .from('parent_notifications')
      .select('id, type, message, timestamp, is_read')
      .eq('student_id', studentData.id)
      .order('timestamp', { ascending: false })
      .limit(50);

    setNotifications(notiData || []);

    // Fetch latest attendance log
    const today = new Date().toISOString().split('T')[0];
    const { data: logData } = await supabase
      .from('attendance_logs')
      .select('checked_in_at, checked_out_at, room_id, student_name')
      .eq('student_id', studentData.id)
      .eq('date', today)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    setLatestLog(logData);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Real-time subscriptions
  useEffect(() => {
    if (!student) return;

    const channel = supabase
      .channel('parent-noti-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'parent_notifications', filter: `student_id=eq.${student.id}` },
        () => fetchData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'students', filter: `id=eq.${student.id}` },
        (payload) => {
          if (payload.new && typeof payload.new === 'object' && 'status' in payload.new) {
            setStudent(prev => prev ? { ...prev, status: (payload.new as any).status } : prev);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance_logs', filter: `student_id=eq.${student.id}` },
        () => fetchData()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [student?.id, fetchData]);

  const markAsRead = async (id: string) => {
    await supabase
      .from('parent_notifications')
      .update({ is_read: true })
      .eq('id', id);

    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, is_read: true } : n)
    );
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">잘못된 접근입니다. 링크를 확인해주세요.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !student) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-destructive">{error || '학생 정보를 찾을 수 없습니다.'}</p>
      </div>
    );
  }

  const currentStatus = STATUS_MAP[student.status || '미등원'] || STATUS_MAP['미등원'];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b bg-card px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold text-foreground">
              {student.parent_name || student.name} 학부모님
            </h1>
            <p className="text-xs text-muted-foreground">더멘토학원 알림</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={currentStatus.bgClass}>
              {currentStatus.label}
            </Badge>
            {unreadCount > 0 && (
              <Badge variant="destructive" className="rounded-full text-[10px] min-w-[20px] h-5 flex items-center justify-center">
                {unreadCount}
              </Badge>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-4">
        {/* Current Status Card */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold"
                style={{
                  backgroundColor: `${currentStatus.color}20`,
                  color: currentStatus.color,
                }}
              >
                {student.name.charAt(0)}
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">{student.name}</p>
                {student.school && (
                  <p className="text-xs text-muted-foreground">{student.school}</p>
                )}
                <div className="flex items-center gap-2 mt-1.5">
                  <Badge className={`${currentStatus.bgClass} text-xs`}>
                    {currentStatus.label}
                  </Badge>
                  {latestLog?.room_id && (
                    <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                      <MapPin className="w-3 h-3" />
                      {latestLog.room_id}
                    </span>
                  )}
                </div>
              </div>
            </div>
            {latestLog?.checked_in_at && (
              <div className="mt-3 pt-3 border-t text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                등원 시각: {format(new Date(latestLog.checked_in_at), 'HH:mm')}
                {latestLog.checked_out_at && (
                  <span className="ml-2">
                    · 퇴실: {format(new Date(latestLog.checked_out_at), 'HH:mm')}
                  </span>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Notifications List */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <Bell className="w-4 h-4" />
              알림
            </h2>
            {unreadCount > 0 && (
              <span className="text-xs text-muted-foreground">{unreadCount}개 읽지 않음</span>
            )}
          </div>

          {notifications.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Bell className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">아직 알림이 없습니다</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {notifications.map((noti) => {
                const style = NOTI_STYLE[noti.type] || DEFAULT_NOTI_STYLE;
                const IconComp = style.icon;
                return (
                  <Card
                    key={noti.id}
                    className={`border-l-4 ${style.borderClass} cursor-pointer transition-all hover:shadow-md ${
                      !noti.is_read ? 'bg-primary/[0.03]' : 'opacity-70'
                    }`}
                    onClick={() => !noti.is_read && markAsRead(noti.id)}
                  >
                    <CardContent className="p-3 flex items-start gap-3">
                      <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${style.dotClass}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {noti.type}
                          </Badge>
                          {!noti.is_read && (
                            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                          )}
                        </div>
                        <p className="text-sm text-foreground leading-relaxed">{noti.message}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {format(new Date(noti.timestamp), 'MM/dd HH:mm')}
                        </p>
                      </div>
                      <IconComp className="w-4 h-4 shrink-0 text-muted-foreground mt-0.5" />
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
