import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface Props {
  schoolName: string;
  archives: any[];
  onRefetch: () => void;
}

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => currentYear - i);
const SEMESTERS = ['1학기', '2학기'];
const EXAM_TYPES = ['중간고사', '기말고사', '기타'];
const SUBJECTS = ['수학', '영어', '국어', '과학', '사회', '수학(대수)', '수학(기하)', '수학(미적분)', '수학(확률과통계)', '영어I', '영어II', '공통', '기타'];
const SCHOOL_LEVELS = ['초', '중', '고'];
const DIFFICULTY_LEVELS = ['매우 쉬움', '쉬움', '보통', '어려움', '매우 어려움'];
const STATUS_OPTIONS = [
  { value: '자료수집전', label: '자료수집전', color: 'bg-muted text-muted-foreground' },
  { value: '자료수집완료', label: '자료수집완료', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
  { value: '시험대비중', label: '시험 D-Day', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' },
  { value: '시험완료', label: '시험완료', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
  { value: '시험분석요망', label: '분석요망', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
  { value: '시험분석완료', label: '분석완료', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' },
];

const MATH_COURSES = ['공통수학1', '공통수학2', '대수', '미적분I', '미적분II', '확률과통계', '기하'];
const ENGLISH_COURSES = ['영어I', '영어II', '영어회화', '영어독해와작문'];
const OTHER_COURSES = ['국어I', '국어II', '문학', '독서', '화법과작문', '언어와매체'];

const DEFAULT_FORM = {
  school_level: '중',
  grade_year: 1,
  subject: '수학',
  course_name: '',
  academic_year: currentYear,
  semester: '1학기',
  exam_type: '중간고사',
  textbook_publisher: '',
  exam_scope: '',
  notes: '',
  exam_date_start: '',
  exam_date_end: '',
  post_exam_analysis: '',
  status: '자료수집전',
  performance_assessment_info: '',
  grade_ratio: '',
  difficulty_level: '',
  exam_analysis_detail: '',
  exam_average_score: '',
  academy_prep_notes: '',
};

function getStatusBadge(status: string) {
  const opt = STATUS_OPTIONS.find(s => s.value === status) || STATUS_OPTIONS[0];
  return <Badge className={`text-[10px] ${opt.color} border-0`}>{opt.label}</Badge>;
}

export function ArchiveTab({ schoolName, archives, onRefetch }: Props) {
  const { user } = useAuth();
  const [yearFilter, setYearFilter] = useState('all');
  const [semFilter, setSemFilter] = useState('all');
  const [examTypeFilter, setExamTypeFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...DEFAULT_FORM });

  const schoolArchives = archives.filter(a => {
    if (a.school_name !== schoolName) return false;
    if (yearFilter !== 'all' && a.academic_year?.toString() !== yearFilter) return false;
    if (semFilter !== 'all' && a.semester !== semFilter) return false;
    if (examTypeFilter !== 'all' && a.exam_type !== examTypeFilter) return false;
    return true;
  });

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...DEFAULT_FORM });
    setDialogOpen(true);
  };

  const openEdit = (a: any) => {
    setEditingId(a.id);
    setForm({
      school_level: a.school_level || '중',
      grade_year: a.grade_year || 1,
      subject: a.subject || '수학',
      course_name: a.course_name || '',
      academic_year: a.academic_year || currentYear,
      semester: a.semester || '1학기',
      exam_type: a.exam_type || '중간고사',
      textbook_publisher: a.textbook_publisher || '',
      exam_scope: a.exam_scope || '',
      notes: a.notes || '',
      exam_date_start: a.exam_date_start || '',
      exam_date_end: a.exam_date_end || '',
      post_exam_analysis: a.post_exam_analysis || '',
      status: a.status || '자료수집전',
      performance_assessment_info: a.performance_assessment_info || '',
      grade_ratio: a.grade_ratio || '',
      difficulty_level: a.difficulty_level || '',
      exam_analysis_detail: a.exam_analysis_detail || '',
      exam_average_score: a.exam_average_score != null ? String(a.exam_average_score) : '',
      academy_prep_notes: a.academy_prep_notes || '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const payload: any = {
      school_name: schoolName,
      school_level: form.school_level,
      grade_year: form.grade_year,
      subject: form.subject,
      course_name: form.course_name || null,
      academic_year: form.academic_year,
      semester: form.semester,
      exam_type: form.exam_type,
      textbook_publisher: form.textbook_publisher || null,
      exam_scope: form.exam_scope || null,
      notes: form.notes || null,
      exam_date_start: form.exam_date_start || null,
      exam_date_end: form.exam_date_end || null,
      post_exam_analysis: form.post_exam_analysis || null,
      status: form.status,
      performance_assessment_info: form.performance_assessment_info || null,
      grade_ratio: form.grade_ratio || null,
      difficulty_level: form.difficulty_level || null,
      exam_analysis_detail: form.exam_analysis_detail || null,
      exam_average_score: form.exam_average_score ? parseFloat(form.exam_average_score) : null,
      academy_prep_notes: form.academy_prep_notes || null,
      updated_at: new Date().toISOString(),
    };

    if (editingId) {
      const { error } = await (supabase as any).from('school_exam_archives').update(payload).eq('id', editingId);
      if (error) { toast.error('수정 실패'); return; }
      toast.success('자료 수정 완료');
    } else {
      const DEFAULT_EXAM_SUBJECTS = ['수학', '영어', '국어', '과학'];
      const isExam = ['중간고사', '기말고사'].includes(payload.exam_type);
      const insertRows = isExam
        ? DEFAULT_EXAM_SUBJECTS.map(subj => ({ ...payload, subject: subj, created_by: user?.id }))
        : [{ ...payload, created_by: user?.id }];
      const { error } = await (supabase as any).from('school_exam_archives').insert(insertRows);
      if (error) { toast.error('생성 실패'); console.error(error); return; }
      toast.success(isExam ? `자료 생성 완료 (${DEFAULT_EXAM_SUBJECTS.join('/')} ${insertRows.length}건)` : '자료 생성 완료');
    }
    setDialogOpen(false);
    onRefetch();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return;
    await (supabase as any).from('school_exam_archives').delete().eq('id', id);
    toast.success('삭제 완료');
    onRefetch();
  };

  const handleQuickStatus = async (id: string, status: string) => {
    await (supabase as any).from('school_exam_archives').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    toast.success('상태 변경 완료');
    onRefetch();
  };

  const F = (key: string, value: any) => setForm(p => ({ ...p, [key]: value }));

  return (
    <div className="space-y-4">
      {/* Filters + Add button */}
      <div className="flex gap-2 flex-wrap items-center">
        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger className="h-8 w-[100px] text-xs"><SelectValue placeholder="연도" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 연도</SelectItem>
            {YEARS.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={semFilter} onValueChange={setSemFilter}>
          <SelectTrigger className="h-8 w-[100px] text-xs"><SelectValue placeholder="학기" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 학기</SelectItem>
            {SEMESTERS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={examTypeFilter} onValueChange={setExamTypeFilter}>
          <SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue placeholder="시험유형" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 유형</SelectItem>
            {EXAM_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button size="sm" className="gap-1 text-xs" onClick={openCreate}>
          <Plus className="w-3.5 h-3.5" /> 내신자료 추가
        </Button>
      </div>

      {/* Archive list */}
      {schoolArchives.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">등록된 내신 자료가 없습니다</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {schoolArchives.map(a => (
            <Card key={a.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="outline" className="text-[10px]">{a.grade_year}학년</Badge>
                    <Badge variant="secondary" className="text-[10px]">{a.subject}</Badge>
                    {a.course_name && <Badge variant="outline" className="text-[10px] text-muted-foreground">{a.course_name}</Badge>}
                    <Badge className="text-[10px] bg-primary/10 text-primary border-0">{a.exam_type}</Badge>
                    {a.status && getStatusBadge(a.status)}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground mr-1">{a.academic_year} {a.semester}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(a)}>
                      <Pencil className="w-3 h-3 text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDelete(a.id)}>
                      <Trash2 className="w-3 h-3 text-muted-foreground" />
                    </Button>
                  </div>
                </div>

                {(a.exam_date_start || a.exam_date_end) && (
                  <p className="text-xs text-muted-foreground">
                    📅 시험기간: {a.exam_date_start ? format(parseISO(a.exam_date_start), 'MM/dd') : '?'}
                    {a.exam_date_end ? ` ~ ${format(parseISO(a.exam_date_end), 'MM/dd')}` : ''}
                  </p>
                )}

                {a.textbook_publisher && (
                  <p className="text-xs text-muted-foreground">📚 교과서: {a.textbook_publisher}</p>
                )}

                {a.exam_scope && (
                  <p className="text-xs text-muted-foreground truncate">📝 범위: {a.exam_scope}</p>
                )}

                {a.grade_ratio && (
                  <p className="text-xs text-muted-foreground">⚖️ 평가비율: {a.grade_ratio}</p>
                )}

                {a.performance_assessment_info && (
                  <p className="text-xs text-muted-foreground truncate">📋 수행평가: {a.performance_assessment_info}</p>
                )}

                {/* Quick status change */}
                <div className="flex gap-1 flex-wrap pt-1">
                  {STATUS_OPTIONS.filter(s => s.value !== a.status).slice(0, 3).map(s => (
                    <button
                      key={s.value}
                      className={`text-[9px] px-1.5 py-0.5 rounded ${s.color} cursor-pointer hover:opacity-80`}
                      onClick={() => handleQuickStatus(a.id, s.value)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? '내신자료 수정' : '내신자료 추가'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            {/* Row 1: 학교구분, 학년, 과목 */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">학교구분</Label>
                <Select value={form.school_level} onValueChange={v => F('school_level', v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SCHOOL_LEVELS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">학년</Label>
                <Select value={String(form.grade_year)} onValueChange={v => F('grade_year', parseInt(v))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1,2,3].map(g => <SelectItem key={g} value={String(g)}>{g}학년</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">과목</Label>
                <Select value={form.subject} onValueChange={v => F('subject', v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 세부 과정명 (고등에서만 표시) */}
            {form.school_level === '고' && (
              <div>
                <Label className="text-xs">세부 과정명</Label>
                <div className="flex gap-2">
                  <Select value={form.course_name || 'custom'} onValueChange={v => F('course_name', v === 'custom' ? '' : v)}>
                    <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="과정 선택" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="custom">직접 입력</SelectItem>
                      {(form.subject.startsWith('수학') ? MATH_COURSES :
                        form.subject.startsWith('영어') ? ENGLISH_COURSES :
                        form.subject.startsWith('국어') ? OTHER_COURSES : [...MATH_COURSES, ...ENGLISH_COURSES, ...OTHER_COURSES]
                      ).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {(!form.course_name || !([...MATH_COURSES, ...ENGLISH_COURSES, ...OTHER_COURSES].includes(form.course_name))) && (
                    <Input
                      value={form.course_name}
                      onChange={e => F('course_name', e.target.value)}
                      placeholder="예: 공통수학1, 미적분I"
                      className="h-8 text-xs flex-1"
                    />
                  )}
                </div>
              </div>
            )}

            {/* Row 2: 연도, 학기, 시험유형 */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">연도</Label>
                <Select value={String(form.academic_year)} onValueChange={v => F('academic_year', parseInt(v))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">학기</Label>
                <Select value={form.semester} onValueChange={v => F('semester', v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SEMESTERS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">시험유형</Label>
                <Select value={form.exam_type} onValueChange={v => F('exam_type', v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EXAM_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 3: 시험기간 */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">시험 시작일</Label>
                <Input type="date" value={form.exam_date_start} onChange={e => F('exam_date_start', e.target.value)} className="h-8 text-xs" />
              </div>
              <div>
                <Label className="text-xs">시험 종료일</Label>
                <Input type="date" value={form.exam_date_end} onChange={e => F('exam_date_end', e.target.value)} className="h-8 text-xs" />
              </div>
            </div>

            {/* 교과서/출판사 */}
            <div>
              <Label className="text-xs">교과서/출판사</Label>
              <Input value={form.textbook_publisher} onChange={e => F('textbook_publisher', e.target.value)} placeholder="예: 미래엔 수학1" className="h-8 text-xs" />
            </div>

            {/* 시험범위 */}
            <div>
              <Label className="text-xs">시험범위</Label>
              <Textarea value={form.exam_scope} onChange={e => F('exam_scope', e.target.value)} placeholder="시험 범위를 입력하세요" className="text-xs min-h-[60px]" />
            </div>

            {/* 평가비율 */}
            <div>
              <Label className="text-xs">평가비율</Label>
              <Input value={form.grade_ratio} onChange={e => F('grade_ratio', e.target.value)} placeholder="예: 지필60%/수행40%" className="h-8 text-xs" />
            </div>

            {/* 수행평가 정보 */}
            <div>
              <Label className="text-xs">수행평가 정보</Label>
              <Textarea value={form.performance_assessment_info} onChange={e => F('performance_assessment_info', e.target.value)} placeholder="수행평가 상세" className="text-xs min-h-[50px]" />
            </div>

            {/* 상태, 난이도 */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">상태</Label>
                <Select value={form.status} onValueChange={v => F('status', v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">난이도</Label>
                <Select value={form.difficulty_level || 'none'} onValueChange={v => F('difficulty_level', v === 'none' ? '' : v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">미선택</SelectItem>
                    {DIFFICULTY_LEVELS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 평균점수 */}
            <div>
              <Label className="text-xs">평균 점수</Label>
              <Input type="number" value={form.exam_average_score} onChange={e => F('exam_average_score', e.target.value)} placeholder="예: 72.5" className="h-8 text-xs" />
            </div>

            {/* 학원 준비 메모 */}
            <div>
              <Label className="text-xs">학원 준비 메모</Label>
              <Textarea value={form.academy_prep_notes} onChange={e => F('academy_prep_notes', e.target.value)} className="text-xs min-h-[50px]" />
            </div>

            {/* 시험 후 분석 */}
            <div>
              <Label className="text-xs">시험 후 분석</Label>
              <Textarea value={form.post_exam_analysis} onChange={e => F('post_exam_analysis', e.target.value)} className="text-xs min-h-[50px]" />
            </div>

            {/* 기타 메모 */}
            <div>
              <Label className="text-xs">기타 메모</Label>
              <Textarea value={form.notes} onChange={e => F('notes', e.target.value)} className="text-xs min-h-[50px]" />
            </div>

            <Button className="w-full" onClick={handleSave}>
              {editingId ? '수정 완료' : '저장'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
