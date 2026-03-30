import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import {
  LogOut, CheckCircle, Clock, XCircle, Users, AlertTriangle, Loader2, RefreshCw,
} from 'lucide-react';
import { ProtectedRoute } from '@/components/ProtectedRoute';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface PatternAlert {
  id: string;
  type: string;
  description: string;
  priority: string;
  created_date: string;
  resolved: boolean;
  student_id: string | null;
}

interface Classroom {
  id: string;
  name: string;
  capacity: number;
  is_active: boolean;
  manager_name: string;
}

interface AttendanceLog {
  id: string;
  student_id: string | null;
  student_name: string | null;
  room_id: string | null;
  date: string;
  checked_in_at: string | null;
  checked_out_at: string | null;
}

interface HourlyData {
  hour: string;
  actual: number;
  predicted: number;
}

/* ------------------------------------------------------------------ */
/*  Live Clock                                                         */
/* ------------------------------------------------------------------ */
function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const fmt = now.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  const time = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  return (
    <div className="text-right">
      <p className="text-xs text-gray-400">{fmt}</p>
      <p className="text-lg font-mono font-bold text-white tabular-nums">{time}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Stat Card                                                          */
/* ------------------------------------------------------------------ */
function StatCard({ label, value, sub, color, icon: Icon }: {
  label: string; value: string; sub?: string; color: string;
  icon: React.ElementType;
}) {
  const colorMap: Record<string, string> = {
    green: 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/30 text-emerald-400',
    orange: 'from-amber-500/20 to-amber-500/5 border-amber-500/30 text-amber-400',
    red: 'from-red-500/20 to-red-500/5 border-red-500/30 text-red-400',
    blue: 'from-blue-500/20 to-blue-500/5 border-blue-500/30 text-blue-400',
  };
  const c = colorMap[color] ?? colorMap.blue;
  return (
    <Card className={`bg-gradient-to-br ${c} border backdrop-blur-sm`}>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-xs text-gray-300">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
          {sub && <p className="text-[10px] text-gray-400">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Floating Classroom Bubble                                          */
/* ------------------------------------------------------------------ */
function ClassroomBubble({ name, count, capacity, blink }: {
  name: string; count: number; capacity: number; blink: boolean;
}) {
  const pct = capacity > 0 ? count / capacity : 0;
  const bg = pct >= 0.9 ? 'bg-red-500' : pct >= 0.7 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div
      className={`w-14 h-14 rounded-full flex flex-col items-center justify-center text-white text-[10px] font-bold shadow-lg
        ${bg} ${blink ? 'animate-pulse ring-2 ring-red-400' : ''}`}
      title={name}
    >
      <span className="truncate max-w-[44px] leading-tight">{name}</span>
      <span className="text-[9px] font-mono">{count}/{capacity}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Dashboard Content                                             */
/* ------------------------------------------------------------------ */
function PrincipalContent() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  // Data state
  const [alerts, setAlerts] = useState<PatternAlert[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [alertTab, setAlertTab] = useState('학생패턴');

  // Modal
  const [selectedClassroom, setSelectedClassroom] = useState<Classroom | null>(null);

  const today = useMemo(() => new Date().toISOString().split('T')[0], []);

  /* ---------- fetch helpers ---------- */
  const fetchAll = useCallback(async () => {
    const [alertRes, classRes, logRes] = await Promise.all([
      supabase.from('pattern_alerts').select('*').order('created_date', { ascending: false }).limit(50),
      supabase.from('classrooms').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('attendance_logs').select('*').eq('date', today),
    ]);
    if (alertRes.data) setAlerts(alertRes.data as PatternAlert[]);
    if (classRes.data) setClassrooms(classRes.data as Classroom[]);
    if (logRes.data) setLogs(logRes.data as AttendanceLog[]);
    setLoading(false);
  }, [today]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /* ---------- real-time ---------- */
  useEffect(() => {
    const ch = supabase
      .channel('principal-dash')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_logs' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pattern_alerts' }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchAll]);

  /* ---------- derived stats ---------- */
  const checkedIn = logs.filter(l => l.checked_in_at && !l.checked_out_at);
  const checkedOut = logs.filter(l => l.checked_out_at);
  const totalStudents = logs.length || 1;
  const attendanceRate = Math.round(((checkedIn.length + checkedOut.length) / totalStudents) * 100);

  // Late = checked in 10+ min after first slot (simplified: checked_in_at hour >= 15 and minute >= 10 proxy)
  const lateCount = logs.filter(l => {
    if (!l.checked_in_at) return false;
    const t = new Date(l.checked_in_at);
    return t.getMinutes() > 10; // simplified heuristic
  }).length;

  const absentCount = logs.filter(l => !l.checked_in_at).length;

  // Room usage
  const totalRoomCap = classrooms.reduce((s, c) => s + c.capacity, 0) || 1;
  const totalRoomUsed = checkedIn.length;
  const roomUsage = Math.round((totalRoomUsed / totalRoomCap) * 100);

  // Room counts map
  const roomCounts = useMemo(() => {
    const m: Record<string, number> = {};
    checkedIn.forEach(l => {
      if (l.room_id) m[l.room_id] = (m[l.room_id] ?? 0) + 1;
    });
    return m;
  }, [checkedIn]);

  // Blink detection: students checked in > 30 min ago still not checked out
  const blinkRooms = useMemo(() => {
    const now = Date.now();
    const rooms = new Set<string>();
    checkedIn.forEach(l => {
      if (l.checked_in_at && l.room_id) {
        const diff = (now - new Date(l.checked_in_at).getTime()) / 60000;
        if (diff >= 30) rooms.add(l.room_id);
      }
    });
    return rooms;
  }, [checkedIn]);

  /* ---------- hourly chart data ---------- */
  const hourlyData: HourlyData[] = useMemo(() => {
    const hours = Array.from({ length: 9 }, (_, i) => 14 + i); // 14~22
    const counts: Record<number, number> = {};
    logs.forEach(l => {
      if (l.checked_in_at) {
        const h = new Date(l.checked_in_at).getHours();
        if (h >= 14 && h <= 22) counts[h] = (counts[h] ?? 0) + 1;
      }
    });
    return hours.map(h => ({
      hour: `${h}:00`,
      actual: counts[h] ?? 0,
      predicted: Math.round((counts[h] ?? 0) * (0.9 + Math.random() * 0.2)), // placeholder
    }));
  }, [logs]);

  /* ---------- filtered alerts ---------- */
  const filteredAlerts = alerts.filter(a => {
    if (alertTab === '학생패턴') return a.type?.includes('학생') || a.student_id;
    if (alertTab === '강의실패턴') return a.type?.includes('강의실') || a.type?.includes('room');
    return a.type?.includes('트렌드') || a.type?.includes('trend');
  });

  /* ---------- resolve alert ---------- */
  const resolveAlert = async (id: string) => {
    await supabase.from('pattern_alerts').update({ resolved: true, resolved_at: new Date().toISOString() } as any).eq('id', id);
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, resolved: true } : a));
  };

  // Students in selected classroom modal
  const modalStudents = useMemo(() => {
    if (!selectedClassroom) return [];
    return checkedIn.filter(l => l.room_id === selectedClassroom.id);
  }, [selectedClassroom, checkedIn]);

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0A0A0F' }}>
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    );
  }

  const priorityColor: Record<string, string> = {
    '높음': 'bg-red-500/20 text-red-400 border-red-500/40',
    '중간': 'bg-amber-500/20 text-amber-400 border-amber-500/40',
    '낮음': 'bg-blue-500/20 text-blue-400 border-blue-500/40',
  };

  return (
    <div className="min-h-screen text-gray-100" style={{ background: '#0A0A0F' }}>
      {/* ===== HEADER ===== */}
      <header className="sticky top-0 z-30 border-b border-white/5 bg-[#0A0A0F]/80 backdrop-blur-xl px-4 md:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">S</span>
          </div>
          <div>
            <h1 className="text-base font-bold text-white">원장 대시보드</h1>
            <p className="text-[10px] text-gray-500">SeedlingLog</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <LiveClock />
          <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white hover:bg-white/10" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-1.5" />
            로그아웃
          </Button>
        </div>
      </header>

      <main className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
        {/* ===== STATS ROW ===== */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={CheckCircle} label="전체 출석률" value={`${attendanceRate}%`} sub={`${checkedIn.length + checkedOut.length}/${totalStudents}명 출석`} color="green" />
          <StatCard icon={Clock} label="지각" value={`${lateCount}명`} sub="오늘 기준" color="orange" />
          <StatCard icon={XCircle} label="결석" value={`${absentCount}명`} sub="미등원 학생" color="red" />
          <StatCard icon={Users} label="자습실 이용률" value={`${roomUsage}%`} sub={`${totalRoomUsed}/${totalRoomCap}석 사용 중`} color="blue" />
        </div>

        {/* ===== MAIN GRID ===== */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* LEFT: Pattern Alerts */}
          <Card className="bg-white/[0.03] border-white/10 text-gray-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-white">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                이상 패턴 감지
                <Badge variant="outline" className="ml-auto text-[10px] border-white/20 text-gray-400">
                  {alerts.filter(a => !a.resolved).length}건 미해결
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <Tabs value={alertTab} onValueChange={setAlertTab}>
                <TabsList className="bg-white/5 border border-white/10 mb-3 h-8">
                  {['학생패턴', '강의실패턴', '트렌드'].map(t => (
                    <TabsTrigger key={t} value={t} className="text-xs data-[state=active]:bg-white/10 data-[state=active]:text-white text-gray-400">
                      {t}
                    </TabsTrigger>
                  ))}
                </TabsList>
                <TabsContent value={alertTab} className="mt-0">
                  <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                    {filteredAlerts.length === 0 && (
                      <p className="text-xs text-gray-500 py-8 text-center">감지된 패턴이 없습니다</p>
                    )}
                    {filteredAlerts.map(a => (
                      <div
                        key={a.id}
                        className={`p-3 rounded-lg border ${a.resolved ? 'opacity-40 border-white/5 bg-white/[0.01]' : 'border-white/10 bg-white/[0.03]'}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge className={`text-[10px] px-1.5 py-0 ${priorityColor[a.priority] ?? priorityColor['낮음']}`}>
                                {a.priority}
                              </Badge>
                              <span className="text-[10px] text-gray-500">{a.type}</span>
                            </div>
                            <p className="text-xs text-gray-300 leading-relaxed">{a.description}</p>
                            <p className="text-[10px] text-gray-600 mt-1">
                              {new Date(a.created_date).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                          {!a.resolved && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-[10px] text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 h-7 px-2 shrink-0"
                              onClick={() => resolveAlert(a.id)}
                            >
                              해결 완료
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* RIGHT: Congestion Prediction Chart */}
          <Card className="bg-white/[0.03] border-white/10 text-gray-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
                <BarChart className="w-4 h-4 text-blue-400" />
                혼잡도 예측
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={hourlyData} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="hour" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} />
                  <Tooltip
                    contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', fontSize: 12 }}
                    labelStyle={{ color: '#9ca3af' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
                  <Bar dataKey="actual" name="실제 인원" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="predicted" name="예측 인원" fill="#8b5cf6" radius={[4, 4, 0, 0]} opacity={0.6} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* ===== CLASSROOM GRID ===== */}
        <div>
          <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-400" />
            강의실 현황
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {classrooms.map(cr => {
              const count = roomCounts[cr.id] ?? 0;
              const pct = cr.capacity > 0 ? (count / cr.capacity) * 100 : 0;
              const barColor = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500';
              return (
                <Card
                  key={cr.id}
                  className="bg-white/[0.03] border-white/10 cursor-pointer hover:bg-white/[0.06] transition-colors"
                  onClick={() => setSelectedClassroom(cr)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-white truncate">{cr.name}</p>
                      <span className="text-[10px] text-gray-400 font-mono">{count}/{cr.capacity}</span>
                    </div>
                    <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                    <p className="text-[10px] text-gray-500 mt-1.5">{cr.manager_name || '담당 미지정'}</p>
                  </CardContent>
                </Card>
              );
            })}
            {classrooms.length === 0 && (
              <p className="text-xs text-gray-500 col-span-full text-center py-8">등록된 강의실이 없습니다</p>
            )}
          </div>
        </div>
      </main>

      {/* ===== FLOATING BUBBLES ===== */}
      <div className="fixed bottom-4 right-4 z-40 flex flex-col gap-2 items-end">
        {classrooms.slice(0, 6).map(cr => {
          const count = roomCounts[cr.id] ?? 0;
          return (
            <ClassroomBubble
              key={cr.id}
              name={cr.name}
              count={count}
              capacity={cr.capacity}
              blink={blinkRooms.has(cr.id)}
            />
          );
        })}
      </div>

      {/* ===== CLASSROOM MODAL ===== */}
      <Dialog open={!!selectedClassroom} onOpenChange={() => setSelectedClassroom(null)}>
        <DialogContent className="bg-[#12121a] border-white/10 text-gray-100 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">{selectedClassroom?.name} — 학생 현황</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {modalStudents.length === 0 && (
              <p className="text-xs text-gray-500 text-center py-6">현재 입실 중인 학생이 없습니다</p>
            )}
            {modalStudents.map(s => {
              const mins = s.checked_in_at ? Math.round((Date.now() - new Date(s.checked_in_at).getTime()) / 60000) : 0;
              return (
                <div key={s.id} className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.04] border border-white/5">
                  <div>
                    <p className="text-xs font-medium text-white">{s.student_name || '이름 없음'}</p>
                    <p className="text-[10px] text-gray-500">
                      입실: {s.checked_in_at ? new Date(s.checked_in_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }) : '-'}
                    </p>
                  </div>
                  <Badge className={`text-[10px] ${mins >= 30 ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'}`}>
                    {mins}분 체류
                  </Badge>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page wrapper with auth guard                                       */
/* ------------------------------------------------------------------ */
export default function PrincipalDashboard() {
  return (
    <ProtectedRoute allowedRoles={['admin']} noLayout>
      <PrincipalContent />
    </ProtectedRoute>
  );
}
