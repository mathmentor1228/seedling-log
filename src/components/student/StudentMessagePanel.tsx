import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Copy, CheckCircle2, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { TEACHERS } from '@/lib/constants';

interface StudentLite {
  id: string;
  name: string;
  school_level: string | null;
  grade_year: number | null;
  grade: string | null;
  created_at: string;
  notes: string | null;
}

interface Props {
  student: StudentLite;
  onCopyParentLink: () => void;
}

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

export function StudentMessagePanel({ student, onCopyParentLink }: Props) {
  const [subjects, setSubjects] = useState<string[]>([]);
  const [teachers, setTeachers] = useState<string[]>([]);
  const [monthlyFee, setMonthlyFee] = useState<number>(0);
  const [classTime, setClassTime] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [copiedType, setCopiedType] = useState<'parent' | 'student' | null>(null);
  const [editParent, setEditParent] = useState<string | null>(null);
  const [editStudent, setEditStudent] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        // Subject-Teacher mapping
        const { data: sst } = await supabase
          .from('student_subject_teachers')
          .select('subject, teacher_id, profiles:teacher_id(full_name)')
          .eq('student_id', student.id);
        const subjs = Array.from(new Set((sst || []).map((r: any) => r.subject).filter(Boolean)));
        const tchrs = Array.from(new Set(
          (sst || [])
            .map((r: any) => r.profiles?.full_name)
            .filter(Boolean)
        ));

        // Tuition sum
        const { data: courses } = await supabase
          .from('student_courses')
          .select('monthly_fee, is_active')
          .eq('student_id', student.id);
        const fee = (courses || [])
          .filter((c: any) => c.is_active !== false)
          .reduce((s: number, c: any) => s + (Number(c.monthly_fee) || 0), 0);

        // Class time from slot assignments
        const { data: slots } = await supabase
          .from('room_assignments')
          .select('day_of_week, start_time, end_time')
          .eq('student_id', student.id);
        const times = (slots || [])
          .sort((a: any, b: any) => (a.day_of_week - b.day_of_week) || String(a.start_time).localeCompare(b.start_time))
          .map((s: any) => {
            const day = DAY_LABELS[s.day_of_week] || '';
            const start = String(s.start_time || '').slice(0, 5);
            const end = String(s.end_time || '').slice(0, 5);
            return `${day}요일 ${start}~${end}`;
          });

        if (!mounted) return;
        setSubjects(subjs);
        setTeachers(tchrs);
        setMonthlyFee(fee);
        setClassTime(times.join(', '));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [student.id]);

  // Parse fallback data from student.notes (populated at registration time)
  const parseFromNotes = (label: RegExp): string => {
    const notes = student.notes || '';
    for (const line of notes.split(/\r?\n/)) {
      if (label.test(line)) return line.replace(label, '').trim().replace(/^[:：]\s*/, '');
    }
    return '';
  };
  const notesSubjects = parseFromNotes(/^수강\s*과목\s*[:：]?/);
  const notesTeachers = parseFromNotes(/^(담당(자|\s*선생님)?)\s*[:：]?/);
  const notesClassTime = parseFromNotes(/^수업\s*시간\s*[:：]?/);

  const level = student.school_level || (student.grade || '').replace(/\d+/g, '') || '';
  const gradeLabel = student.school_level && student.grade_year
    ? `${student.school_level}${student.grade_year}`
    : (student.grade || '');
  const subjectsText = (subjects.length ? subjects.join(', ') : notesSubjects) || '-';
  const teachersText = (teachers.length ? teachers.join(', ') : notesTeachers) || '-';
  const effectiveClassTime = classTime || notesClassTime;
  const teacherNames = teachers.length ? teachers : notesTeachers.split(/[,\s/·]+/).filter(Boolean);
  const classroomLines = teacherNames
    .map((name) => {
      const t = TEACHERS.find((tt) => tt.name === name || tt.name.replace(/\(.*\)/, '') === name);
      return t ? `• ${t.name} 선생님: ${t.room}` : null;
    })
    .filter(Boolean) as string[];
  const startDate = new Date(student.created_at);

  const parentMessage = `안녕하세요, 학부모님.

${student.name} 학생의 등록이 완료되었습니다.

📋 수업 안내
• 수강 과목: ${subjectsText}
• 담당 선생님: ${teachersText}
• 수업 시작일: ${format(startDate, 'yyyy년 M월 d일 (EEE)', { locale: ko })}
• 수업 시간: ${effectiveClassTime || '-'}
${classroomLines.length ? `\n🏫 강의실 안내\n${classroomLines.join('\n')}\n` : ''}
준비물 및 기타 안내사항은 첫 수업 시 안내드리겠습니다.
${monthlyFee > 0 ? `\n📍원비안내\n\n${level}등 ${subjectsText} ${monthlyFee.toLocaleString()}원\n\n신한 110-265-698329(황은지)\n\n카드결제 가능합니다.\n\n앱결제도 가능합니다.` : ''}

믿고 맡겨주신만큼,
세심하게 신경쓰겠습니다.
편안한 하루 되세요^^`;

  const studentPageUrl = `${window.location.origin}/student`;
  const studentMessage = `안녕 ${student.name}!

📋 수업 안내
• 수강 과목: ${subjectsText}
• 담당 선생님: ${teachersText}
• 수업 시작일: ${format(startDate, 'yyyy년 M월 d일 (EEE)', { locale: ko })}
• 수업 시간: ${classTime || '-'}
${classroomLines.length ? `\n🏫 강의실 안내\n${classroomLines.join('\n')}\n` : ''}
📱 학생 로그인 페이지
${studentPageUrl}

멘토쌤이야. 앞으로 잘해보자!`;

  const handleCopy = async (type: 'parent' | 'student') => {
    try {
      const text = type === 'parent' ? (editParent ?? parentMessage) : (editStudent ?? studentMessage);
      await navigator.clipboard.writeText(text);
      setCopiedType(type);
      toast.success(type === 'parent' ? '학부모 문자 복사됨' : '학생 문자 복사됨');
      setTimeout(() => setCopiedType(null), 2000);
    } catch {
      toast.error('복사에 실패했습니다');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <MessageSquare className="w-3.5 h-3.5" />
        등록 정보 기반으로 자동 생성됩니다. 필요 시 수정 후 복사하세요.
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-medium text-foreground">📩 학부모 안내 문자</label>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleCopy('parent')} disabled={loading}>
            {copiedType === 'parent' ? <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-500" /> : <Copy className="w-3 h-3 mr-1" />}
            {copiedType === 'parent' ? '복사됨' : '복사'}
          </Button>
        </div>
        <Textarea
          value={editParent ?? parentMessage}
          onChange={(e) => setEditParent(e.target.value)}
          rows={10}
          className="text-xs font-mono"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-medium text-foreground">📩 학생 안내 문자</label>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleCopy('student')} disabled={loading}>
            {copiedType === 'student' ? <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-500" /> : <Copy className="w-3 h-3 mr-1" />}
            {copiedType === 'student' ? '복사됨' : '복사'}
          </Button>
        </div>
        <Textarea
          value={editStudent ?? studentMessage}
          onChange={(e) => setEditStudent(e.target.value)}
          rows={8}
          className="text-xs font-mono"
        />
      </div>

      <Button variant="outline" size="sm" className="w-full" onClick={onCopyParentLink}>
        학부모 포털 링크 복사 (별도)
      </Button>
    </div>
  );
}
