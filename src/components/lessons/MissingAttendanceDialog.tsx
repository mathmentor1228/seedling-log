// Lets teachers add attendance for students missed on a past date.
// Lists teacher's subject students NOT yet in attendance_logs for the date.
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, UserPlus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  fetchStudentsByIds,
  fetchTeacherStudentIds,
  groupStudentsByGrade,
  getStudentGroupLabel,
  sortStudents,
} from '@/components/lessons/studentSelection';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  teacherId: string;
  subject: string;
  date: string;
  onDone: () => void;
}

interface Row {
  id: string;
  name: string;
  school: string | null;
  school_level: string | null;
  grade_year: number | null;
}

export function MissingAttendanceDialog({ open, onOpenChange, teacherId, subject, date, onDone }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open || !teacherId || !subject || !date) return;
    (async () => {
      setLoading(true);
      try {
        const teacherIds = await fetchTeacherStudentIds(teacherId, subject);
        const { data: att } = await supabase
          .from('attendance_logs')
          .select('student_id')
          .eq('date', date)
          .in('student_id', teacherIds);
        const attendedIds = new Set<string>((att || []).map((r: any) => r.student_id).filter(Boolean));
        const missingIds = teacherIds.filter(id => !attendedIds.has(id));
        const list = await fetchStudentsByIds(missingIds);
        setRows(sortStudents(list) as Row[]);
        setSelected(new Set());
      } catch (e: any) {
        toast({ title: '로드 실패', description: e.message, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    })();
  }, [open, teacherId, subject, date, toast]);

  function toggle(id: string) {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function save() {
    if (selected.size === 0) return;
    setSaving(true);
    try {
      const checkedAt = `${date}T09:00:00+09:00`;
      const inserts = rows.filter(r => selected.has(r.id)).map(r => ({
        student_id: r.id,
        student_name: r.name,
        date,
        checked_in_at: checkedAt,
        recorded_by: teacherId,
      }));
      const { error } = await supabase.from('attendance_logs').insert(inserts);
      if (error) throw error;
      toast({ title: `${inserts.length}명 출석 추가 완료` });
      onDone();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: '저장 실패', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  const grouped = groupStudentsByGrade(rows as any);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <UserPlus className="w-4 h-4 text-primary" />
            출석 누락 학생 추가 <span className="text-xs text-muted-foreground">({date})</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto -mx-2 px-2">
          {loading ? (
            <div className="p-8 flex items-center justify-center text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> 로딩...
            </div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              누락된 학생이 없습니다. 모두 출석되어 있어요.
            </div>
          ) : (
            <div className="space-y-3">
              {grouped.map(([key, gs]) => (
                <div key={key}>
                  <div className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-2">
                    {getStudentGroupLabel(key)}
                    <Badge variant="secondary" className="text-[10px]">{gs.length}명</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(gs as Row[]).map(s => (
                      <label key={s.id}
                        className="flex items-center gap-2 p-2 border rounded-md cursor-pointer hover:bg-muted/40 text-sm">
                        <input type="checkbox" checked={selected.has(s.id)}
                          onChange={() => toggle(s.id)} className="rounded" />
                        <span className="font-medium truncate">{s.name}</span>
                        <span className="text-[10px] text-muted-foreground truncate">{s.school || ''}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} size="sm">취소</Button>
          <Button onClick={save} disabled={saving || selected.size === 0} size="sm">
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <UserPlus className="w-4 h-4 mr-1" />}
            {selected.size}명 출석 추가
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
