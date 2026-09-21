// ADMIN-AUTONOMOUS-STUDY-SURVEY-V1: 추석 연휴 자습 희망 시간 조사 관리자 집계
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2, Download, Users, CalendarClock } from 'lucide-react';

const SURVEY_DATES = ['2026-09-24', '2026-09-25', '2026-09-26'];
const START_HOUR = 9;
const END_HOUR = 19;
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

interface ResponseRow {
  id: string;
  student_name: string;
  grade: string;
  phone: string | null;
  survey_date: string;
  start_time: string;
  end_time: string;
  created_at: string;
}

function formatDate(d: string) {
  const dt = new Date(`${d}T00:00:00`);
  return `${dt.getMonth() + 1}월 ${dt.getDate()}일 (${DAYS[dt.getDay()]})`;
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function timeLabel(h: number) {
  return `${pad(h)}:00~${pad(h + 1)}:00`;
}

export default function AdminAutonomousStudySurveyPage() {
  const [rows, setRows] = useState<ResponseRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('autonomous-study-survey', {
      body: { action: 'admin_list' },
    });
    if (error || data?.error) {
      toast.error(data?.error || '조회에 실패했습니다.');
      setLoading(false);
      return;
    }
    setRows(data?.rows || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    rows.forEach(r => {
      const k = `${r.survey_date}|${r.start_time.slice(0, 5)}|${r.end_time.slice(0, 5)}`;
      map[k] = (map[k] || 0) + 1;
    });
    return map;
  }, [rows]);

  const studentSelections = useMemo(() => {
    const map: Record<string, string[]> = {};
    rows.forEach(r => {
      const label = `${formatDate(r.survey_date)} ${r.start_time.slice(0, 5)}~${r.end_time.slice(0, 5)}`;
      const name = `${r.student_name}(${r.grade})`;
      if (!map[label]) map[label] = [];
      if (!map[label].includes(name)) map[label].push(name);
    });
    return map;
  }, [rows]);

  function downloadCsv() {
    const header = ['이름', '학년', '연락처', '날짜', '시작', '종료', '접수시간'];
    const lines = rows.map(r => [
      r.student_name,
      r.grade,
      r.phone || '',
      r.survey_date,
      r.start_time.slice(0, 5),
      r.end_time.slice(0, 5),
      new Date(r.created_at).toLocaleString('ko-KR'),
    ]);
    const csv = [header, ...lines].map(line => line.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `추석자습신청현황_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">추석 연휴 자습 신청 현황</h1>
          <p className="text-sm text-muted-foreground">2026년 9월 24일(목) ~ 26일(토)</p>
        </div>
        <Button variant="outline" onClick={downloadCsv}>
          <Download className="w-4 h-4 mr-2" />
          CSV 다운로드
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {SURVEY_DATES.map(date => {
          const dayRows = rows.filter(r => r.survey_date === date);
          const uniqueStudents = new Set(dayRows.map(r => `${r.student_name}|${r.grade}`));
          return (
            <Card key={date}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{formatDate(date)}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  응답 학생 {uniqueStudents.size}명 · 슬롯 {dayRows.length}개
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {SURVEY_DATES.map(date => (
        <Card key={date}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarClock className="w-4 h-4" />
              {formatDate(date)} 시간대별 신청 현황
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i).map(hour => {
                const k = `${date}|${pad(hour)}:00|${pad(hour + 1)}:00`;
                const count = counts[k] || 0;
                const label = `${formatDate(date)} ${timeLabel(hour)}`;
                const names = studentSelections[label] || [];
                return (
                  <div key={k} className="border rounded-lg p-3 space-y-1">
                    <div className="font-medium text-sm">{timeLabel(hour)}</div>
                    <Badge variant={count > 0 ? 'default' : 'secondary'} className="text-xs">
                      {count}명
                    </Badge>
                    {names.length > 0 && (
                      <div className="text-xs text-muted-foreground truncate" title={names.join(', ')}>
                        {names.join(', ')}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">전체 응답 목록</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">아직 응답이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b">
                  <tr className="text-left text-muted-foreground">
                    <th className="py-2">이름</th>
                    <th className="py-2">학년</th>
                    <th className="py-2">연락처</th>
                    <th className="py-2">날짜</th>
                    <th className="py-2">시간</th>
                    <th className="py-2">접수시간</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2">{r.student_name}</td>
                      <td className="py-2">{r.grade}</td>
                      <td className="py-2">{r.phone || '-'}</td>
                      <td className="py-2">{formatDate(r.survey_date)}</td>
                      <td className="py-2">{r.start_time.slice(0, 5)}~{r.end_time.slice(0, 5)}</td>
                      <td className="py-2">{new Date(r.created_at).toLocaleString('ko-KR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
