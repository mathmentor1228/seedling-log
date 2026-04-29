// EXAM-RESULT-STAFF-V2: Staff tab — review, edit, lock score, generate PDF, staff upload
import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, FileImage, Search, FileText, ChevronDown, ChevronRight, GraduationCap, Lock, Unlock, Pencil, Trash2, Upload, Download, Plus, ListOrdered } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { generateExamResultPdf, buildPdfTitle } from '@/lib/examResultPdf';
import { compressImage } from '@/lib/imageCompression';
import { getCachedSignedUrl } from '@/lib/signedUrlCache';

const EXAM_TYPE_LABELS: Record<string, string> = {
  midterm: '중간고사', final: '기말고사', performance: '수행평가', other: '기타',
};
const EXAM_TYPE_COLORS: Record<string, string> = {
  midterm: 'bg-destructive/10 text-destructive border-destructive/20',
  final: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  performance: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  other: 'bg-muted text-muted-foreground',
};

const formatStudentGrade = (grade: string | null | undefined, schoolLevel?: string | null) => {
  const value = String(grade ?? '').trim();
  if (!value) return '';
  if (/^(초|중|고)\s*\d+$/.test(value)) return value.replace(/\s+/g, '');
  const numeric = value.match(/\d+/)?.[0];
  if (!numeric) return value.replace(/학년/g, '');
  if (value.includes('초') || schoolLevel?.includes('초') || schoolLevel === 'elementary') return `초${numeric}`;
  if (value.includes('중') || schoolLevel?.includes('중') || schoolLevel === 'middle') return `중${numeric}`;
  if (value.includes('고') || schoolLevel?.includes('고') || schoolLevel === 'high') return `고${numeric}`;
  return value.replace(/학년/g, '');
};

const toAbsoluteGrade = (grade: string | null | undefined, schoolLevel: string | null | undefined) => {
  const value = String(grade ?? '').trim();
  const level = String(schoolLevel ?? '').trim();
  const numeric = Number(value.match(/\d+/)?.[0]);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  if (value.includes('고')) return numeric + 9;
  if (value.includes('중')) return numeric + 6;
  if (value.includes('초')) return numeric;
  if (level === 'high' || level.includes('고')) return numeric + 9;
  if (level === 'middle' || level.includes('중')) return numeric + 6;
  return numeric;
};

const formatAbsoluteGrade = (absoluteGrade: number | null) => {
  if (!absoluteGrade || absoluteGrade < 1) return '';
  if (absoluteGrade <= 6) return `초${absoluteGrade}`;
  if (absoluteGrade <= 9) return `중${absoluteGrade - 6}`;
  if (absoluteGrade <= 12) return `고${absoluteGrade - 9}`;
  return '';
};

const getGradeAtExamYear = (student: any, examYear: number | null, fallback: string | null | undefined) => {
  if (!examYear) return formatStudentGrade(fallback, student?.school_level) || null;
  const currentAbsoluteGrade = toAbsoluteGrade(student?.grade, student?.school_level);
  if (!currentAbsoluteGrade) return formatStudentGrade(fallback, student?.school_level) || null;
  const currentYear = new Date().getFullYear();
  return formatAbsoluteGrade(currentAbsoluteGrade - (currentYear - examYear)) || formatStudentGrade(fallback, student?.school_level) || null;
};

interface Photo { id: string; storage_path: string; signedUrl?: string | null; }
interface PdfRow { id: string; display_title: string; signedUrl?: string | null; generated_at: string; generated_by_name?: string | null; }
interface Result {
  id: string;
  student_id: string;
  school_name: string;
  subject: string;
  exam_type: string;
  expected_score: number | null;
  actual_score: number | null;
  score_locked: boolean;
  exam_year: number | null;
  exam_period: string | null;
  grade_at_exam: string | null;
  note: string | null;
  exam_date: string | null;
  submitted_at: string;
  is_staff_upload: boolean;
  uploaded_by_staff_name: string | null;
  student_name?: string;
  student_grade?: string | null;
  student_current_grade?: string | null;
  student_enrollment_status?: string | null;
  photos: Photo[];
  pdfs: PdfRow[];
}

interface Props { schoolName: string; }

export function StudentSubmissionsTab({ schoolName }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<Result[]>([]);
  const [search, setSearch] = useState('');
  const [examTypeFilter, setExamTypeFilter] = useState<string>('all');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [previewPhotos, setPreviewPhotos] = useState<Photo[] | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editTarget, setEditTarget] = useState<Result | null>(null);
  const [lockTarget, setLockTarget] = useState<Result | null>(null);
  const [bulkConverting, setBulkConverting] = useState(false);
  const [staffUploadOpen, setStaffUploadOpen] = useState(false);
  const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});
  const [sortingIds, setSortingIds] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: rows, error } = await supabase
        .from('student_exam_results')
        .select('*, student_exam_result_photos(id, storage_path, sort_order), student_exam_result_pdfs(id, storage_path, display_title, generated_at, generated_by_name)')
        .eq('school_name', schoolName)
        .order('submitted_at', { ascending: false });
      if (error) throw error;

      const studentIds = Array.from(new Set((rows || []).map((r: any) => r.student_id)));
      const { data: students } = studentIds.length > 0
        ? await supabase.from('students').select('id, name, grade, school_level, enrollment_status').in('id', studentIds)
        : { data: [] as any[] };
      const studentMap = new Map((students || []).map((s: any) => [s.id, s]));

      const enriched = await Promise.all((rows || []).map(async (r: any) => {
        const photos = await Promise.all((r.student_exam_result_photos || [])
          .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))
          .map(async (p: any) => {
            const signedUrl = await getCachedSignedUrl('exam-results', p.storage_path, 3600);
            return { ...p, signedUrl };
          }));
        const pdfs = await Promise.all((r.student_exam_result_pdfs || [])
          .sort((a: any, b: any) => new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime())
          .map(async (p: any) => {
            const signedUrl = await getCachedSignedUrl('exam-results', p.storage_path, 3600);
            return { ...p, signedUrl };
          }));
        const s = studentMap.get(r.student_id);
        return {
          ...r,
          student_name: s?.name || '알 수 없음',
          student_grade: getGradeAtExamYear(s, r.exam_year, r.grade_at_exam),
          student_current_grade: formatStudentGrade(s?.grade, s?.school_level) || null,
          student_enrollment_status: s?.enrollment_status || null,
          photos, pdfs,
        } as Result;
      }));
      setResults(enriched);
    } catch (e: any) {
      toast({ title: '불러오기 실패', description: e?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [schoolName, toast]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => results.filter(r => {
    const q = search.trim().toLowerCase();
    if (!q && r.student_enrollment_status === '퇴원') return false;
    if (yearFilter !== 'all') {
      if (yearFilter === 'unknown') {
        if (r.exam_year != null) return false;
      } else if (r.exam_year !== Number(yearFilter)) return false;
    }
    if (examTypeFilter !== 'all' && r.exam_type !== examTypeFilter) return false;
    if (subjectFilter !== 'all' && r.subject !== subjectFilter) return false;
    if (q) {
      if (!r.student_name?.toLowerCase().includes(q) && !r.subject.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [results, search, examTypeFilter, subjectFilter, yearFilter]);

  const subjectOptions = useMemo(() => Array.from(new Set(results.map(r => r.subject))), [results]);
  const yearOptions = useMemo(() => (
    Array.from(new Set(results.map(r => r.exam_year).filter((year): year is number => year != null)))
      .sort((a, b) => b - a)
  ), [results]);
  const hasUnknownYear = useMemo(() => results.some(r => r.exam_year == null), [results]);

  const grouped = useMemo(() => {
    const map = new Map<string, Result[]>();
    filtered.forEach(r => {
      const list = map.get(r.student_id) || [];
      list.push(r);
      map.set(r.student_id, list);
    });
    return Array.from(map.entries()).map(([sid, items]) => ({
      student_id: sid,
      student_name: items[0].student_name!,
      student_current_grade: items[0].student_current_grade,
      items,
    }));
  }, [filtered]);

  const setBusy = (id: string, b: boolean) => setBusyIds(prev => ({ ...prev, [id]: b }));
  const setSorting = (id: string, b: boolean) => setSortingIds(prev => ({ ...prev, [id]: b }));

  const handleSortPhotos = async (r: Result) => {
    if (r.photos.length <= 1) return;
    setSorting(r.id, true);
    try {
      const { data, error } = await supabase.functions.invoke('student-exam-results', {
        body: { action: 'sort_photos', result_id: r.id },
      });
      if (error || data?.error) throw new Error(error?.message || data?.error);
      toast({ title: '사진 순서 정렬 완료', description: 'AI가 인식한 첫 문항 번호 기준으로 정렬했습니다.' });
      await load();
    } catch (e: any) {
      toast({ title: '사진 정렬 실패', description: e?.message || '기존 순서를 유지합니다.', variant: 'destructive' });
    } finally {
      setSorting(r.id, false);
    }
  };

  const handleConvertToPdf = async (r: Result, silent = false) => {
    if (!r.photos.length) {
      if (!silent) toast({ title: '사진이 없어 PDF 변환 불가', variant: 'destructive' });
      return null;
    }
    setBusy(r.id, true);
    try {
      const urls = r.photos.map(p => p.signedUrl).filter(Boolean) as string[];
      const { blob, title } = await generateExamResultPdf({
        studentName: r.student_name || '학생',
        schoolName: r.school_name,
        examYear: r.exam_year,
        examDate: r.exam_date,
        submittedAt: r.submitted_at,
        examType: r.exam_type,
        examPeriod: r.exam_period,
        subject: r.subject,
        imageUrls: urls,
      });
      const dataUrl = await new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result as string);
        reader.onerror = () => rej(reader.error);
        reader.readAsDataURL(blob);
      });
      const { data, error } = await supabase.functions.invoke('student-exam-results', {
        body: { action: 'register_pdf', result_id: r.id, pdf: { dataUrl, title, pageCount: urls.length } },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!silent) toast({ title: 'PDF 생성 완료', description: title });
      return { title, signedUrl: data.signedUrl as string };
    } catch (e: any) {
      if (!silent) toast({ title: 'PDF 변환 실패', description: e?.message, variant: 'destructive' });
      return null;
    } finally {
      setBusy(r.id, false);
    }
  };

  const handleBulkConvert = async () => {
    const targets = filtered.filter(r => r.photos.length > 0 && r.pdfs.length === 0);
    if (targets.length === 0) {
      toast({ title: '변환할 항목이 없습니다', description: 'PDF가 아직 없는 사진 제출본만 일괄 변환됩니다.' });
      return;
    }
    if (!confirm(`${targets.length}건을 일괄 PDF 변환할까요?`)) return;
    setBulkConverting(true);
    let ok = 0, fail = 0;
    for (const r of targets) {
      const res = await handleConvertToPdf(r, true);
      if (res) ok++; else fail++;
    }
    setBulkConverting(false);
    toast({ title: '일괄 변환 완료', description: `성공 ${ok}건 / 실패 ${fail}건` });
    load();
  };

  const handleDeletePdf = async (pdfId: string) => {
    if (!confirm('이 PDF를 삭제할까요?')) return;
    const { error } = await supabase.functions.invoke('student-exam-results', {
      body: { action: 'delete_pdf', pdf_id: pdfId },
    });
    if (error) toast({ title: '삭제 실패', variant: 'destructive' });
    else { toast({ title: 'PDF 삭제됨' }); load(); }
  };

  const handleDelete = async (r: Result) => {
    if (!confirm(`${r.student_name} ${r.subject} 제출본을 삭제할까요?`)) return;
    const { error } = await supabase.functions.invoke('student-exam-results', {
      body: { action: 'staff_delete', result_id: r.id },
    });
    if (error) toast({ title: '삭제 실패', variant: 'destructive' });
    else { toast({ title: '삭제됨' }); load(); }
  };

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="학생/과목 검색" className="pl-7 h-8 text-xs" />
        </div>
        <Select value={examTypeFilter} onValueChange={setExamTypeFilter}>
          <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 시험</SelectItem>
            {Object.entries(EXAM_TYPE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 연도</SelectItem>
            {yearOptions.map(year => <SelectItem key={year} value={String(year)}>{year}년</SelectItem>)}
            {hasUnknownYear && <SelectItem value="unknown">연도 미지정</SelectItem>}
          </SelectContent>
        </Select>
        <Select value={subjectFilter} onValueChange={setSubjectFilter}>
          <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 과목</SelectItem>
            {subjectOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => setStaffUploadOpen(true)}>
          <Plus className="w-3.5 h-3.5" /> 직접 업로드
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={handleBulkConvert} disabled={bulkConverting}>
          {bulkConverting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
          일괄 PDF 변환
        </Button>
        <span className="text-xs text-muted-foreground ml-auto">총 {filtered.length}건 / 학생 {grouped.length}명</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : grouped.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          <GraduationCap className="w-8 h-8 mx-auto mb-2 opacity-30" />
          제출된 내신 결과가 없습니다.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {grouped.map(g => {
            const isOpen = expanded[g.student_id] !== false;
            return (
              <Card key={g.student_id}>
                <CardContent className="p-3">
                  <button
                    onClick={() => setExpanded(p => ({ ...p, [g.student_id]: !isOpen }))}
                    className="w-full flex items-center gap-2 mb-2 hover:bg-muted/50 rounded p-1 -m-1"
                  >
                    {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    <span className="font-semibold text-sm">{g.student_name}</span>
                    {g.student_current_grade && <Badge variant="outline" className="text-[10px] h-4 px-1.5">{g.student_current_grade}</Badge>}
                    <Badge className="text-[10px] h-4 px-1.5 ml-auto bg-primary/10 text-primary border-0">{g.items.length}건</Badge>
                  </button>
                  {isOpen && (
                    <div className="space-y-1.5 pl-5">
                      {g.items.map(r => (
                        <div key={r.id} className="flex items-start gap-2 p-2 rounded border bg-card/50">
                          <div className="relative flex gap-1 flex-shrink-0">
                            {sortingIds[r.id] && (
                              <div className="absolute inset-0 z-10 rounded bg-background/80 flex items-center justify-center">
                                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                              </div>
                            )}
                            {r.photos.slice(0, 2).map(p => (
                              p.signedUrl ? (
                                <button key={p.id} onClick={() => setPreviewPhotos(r.photos)}
                                  className="w-12 h-12 rounded overflow-hidden border hover:ring-2 hover:ring-primary">
                                  <img src={p.signedUrl} alt="" className="w-full h-full object-cover" />
                                </button>
                              ) : (
                                <div key={p.id} className="w-12 h-12 rounded bg-muted flex items-center justify-center">
                                  <FileImage className="w-4 h-4 text-muted-foreground" />
                                </div>
                              )
                            ))}
                            {r.photos.length > 2 && (
                              <button onClick={() => setPreviewPhotos(r.photos)}
                                className="w-12 h-12 rounded border bg-muted text-xs font-medium hover:bg-muted/80">
                                +{r.photos.length - 2}
                              </button>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-medium text-sm">{r.subject}</span>
                              <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                                {r.exam_year ? `${r.exam_year}년` : '연도 미지정'}
                              </Badge>
                              {formatStudentGrade(r.student_grade) && (
                                <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                                  {formatStudentGrade(r.student_grade)}
                                </Badge>
                              )}
                              <Badge className={`text-[10px] h-4 px-1.5 border ${EXAM_TYPE_COLORS[r.exam_type] || ''}`}>
                                {EXAM_TYPE_LABELS[r.exam_type]}
                              </Badge>
                              {r.expected_score != null && (
                                <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                                  {r.score_locked && <Lock className="w-2.5 h-2.5 mr-0.5 inline" />}
                                  예상 {r.expected_score}점
                                </Badge>
                              )}
                              {r.actual_score != null && (
                                <Badge className="text-[10px] h-4 px-1.5 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-0">
                                  실제 {r.actual_score}점
                                </Badge>
                              )}
                              {r.is_staff_upload && (
                                <Badge variant="outline" className="text-[10px] h-4 px-1.5">교직원 업로드</Badge>
                              )}
                              <span className="text-[10px] text-muted-foreground ml-auto">
                                {format(new Date(r.submitted_at), 'M/d HH:mm', { locale: ko })}
                              </span>
                            </div>
                            {r.exam_date && (
                              <p className="text-[10px] text-muted-foreground mt-0.5">시험일: {format(new Date(r.exam_date), 'yyyy-MM-dd')}</p>
                            )}
                            {r.note && <p className="text-xs mt-1 text-muted-foreground whitespace-pre-wrap">{r.note}</p>}
                            {r.pdfs.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {r.pdfs.map(p => (
                                  <span key={p.id} className="inline-flex items-center gap-1 text-[10px] bg-muted/80 rounded px-1.5 py-0.5">
                                    <FileText className="w-3 h-3" />
                                    <a href={p.signedUrl || '#'} target="_blank" rel="noreferrer" className="underline truncate max-w-[200px]">{p.display_title}</a>
                                    <button onClick={() => handleDeletePdf(p.id)} className="text-destructive hover:opacity-70"><Trash2 className="w-2.5 h-2.5" /></button>
                                  </span>
                                ))}
                              </div>
                            )}
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] gap-1" onClick={() => handleConvertToPdf(r)} disabled={busyIds[r.id] || r.photos.length === 0}>
                                {busyIds[r.id] ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />} PDF 변환
                              </Button>
                              {r.photos.length > 1 && (
                                <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] gap-1" onClick={() => handleSortPhotos(r)} disabled={sortingIds[r.id]}>
                                  {sortingIds[r.id] ? <Loader2 className="w-3 h-3 animate-spin" /> : <ListOrdered className="w-3 h-3" />}
                                  순서 재정렬
                                </Button>
                              )}
                              <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] gap-1" onClick={() => setLockTarget(r)}>
                                {r.score_locked ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                                {r.score_locked ? '잠금해제/실제점수' : '점수 확정'}
                              </Button>
                              <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] gap-1" onClick={() => setEditTarget(r)}>
                                <Pencil className="w-3 h-3" /> 수정
                              </Button>
                              <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] gap-1 text-destructive hover:text-destructive" onClick={() => handleDelete(r)}>
                                <Trash2 className="w-3 h-3" /> 삭제
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Photo preview */}
      <Dialog open={!!previewPhotos} onOpenChange={() => setPreviewPhotos(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>시험지 사진</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {previewPhotos?.map(p => (
              p.signedUrl && (
                <a key={p.id} href={p.signedUrl} target="_blank" rel="noreferrer" className="block">
                  <img src={p.signedUrl} alt="" className="w-full rounded border" />
                </a>
              )
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {editTarget && <EditDialog result={editTarget} onClose={() => setEditTarget(null)} onSaved={() => { setEditTarget(null); load(); }} />}
      {lockTarget && <LockDialog result={lockTarget} onClose={() => setLockTarget(null)} onSaved={() => { setLockTarget(null); load(); }} />}
      {staffUploadOpen && <StaffUploadDialog defaultSchool={schoolName} onClose={() => setStaffUploadOpen(false)} onSaved={() => { setStaffUploadOpen(false); load(); }} />}
    </div>
  );
}

// ---- Edit dialog ----
function EditDialog({ result, onClose, onSaved }: { result: Result; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [school, setSchool] = useState(result.school_name);
  const [subject, setSubject] = useState(result.subject);
  const [examType, setExamType] = useState(result.exam_type);
  const [score, setScore] = useState(result.expected_score?.toString() || '');
  const [examDate, setExamDate] = useState(result.exam_date || '');
  const [note, setNote] = useState(result.note || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const { data, error } = await supabase.functions.invoke('student-exam-results', {
      body: {
        action: 'staff_update', result_id: result.id,
        patch: {
          school_name: school, subject, exam_type: examType,
          expected_score: score === '' ? null : Number(score),
          exam_date: examDate || null, note: note || null,
        },
      },
    });
    setSaving(false);
    if (error || data?.error) {
      toast({ title: '저장 실패', description: error?.message || data?.error, variant: 'destructive' });
      return;
    }
    toast({ title: '수정되었습니다' });
    onSaved();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>제출 정보 수정</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <div><Label className="text-xs">학교명</Label><Input value={school} onChange={e => setSchool(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">과목</Label><Input value={subject} onChange={e => setSubject(e.target.value)} /></div>
            <div><Label className="text-xs">시험 종류</Label>
              <Select value={examType} onValueChange={setExamType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(EXAM_TYPE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">예상 점수</Label><Input type="number" min={0} max={100} step={0.5} value={score} onChange={e => setScore(e.target.value)} /></div>
            <div><Label className="text-xs">시험일</Label><Input type="date" value={examDate} onChange={e => setExamDate(e.target.value)} /></div>
          </div>
          <div><Label className="text-xs">메모</Label><Textarea rows={2} value={note} onChange={e => setNote(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>취소</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}저장</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- Lock score dialog ----
function LockDialog({ result, onClose, onSaved }: { result: Result; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [actual, setActual] = useState(result.actual_score?.toString() || '');
  const [busy, setBusy] = useState(false);

  const lock = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('student-exam-results', {
      body: { action: 'lock_score', result_id: result.id, actual_score: actual === '' ? null : Number(actual) },
    });
    setBusy(false);
    if (error || data?.error) { toast({ title: '확정 실패', description: error?.message || data?.error, variant: 'destructive' }); return; }
    toast({ title: '점수 확정 완료' });
    onSaved();
  };
  const unlock = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('student-exam-results', { body: { action: 'unlock_score', result_id: result.id } });
    setBusy(false);
    if (error || data?.error) { toast({ title: '해제 실패', variant: 'destructive' }); return; }
    toast({ title: '잠금 해제됨' });
    onSaved();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{result.score_locked ? '실제점수 입력 / 잠금 해제' : '예상점수 확정'}</DialogTitle></DialogHeader>
        <div className="space-y-2 text-sm">
          <p className="text-xs text-muted-foreground">{result.student_name} · {result.subject}</p>
          <p className="text-xs">예상점수: <b>{result.expected_score ?? '-'}</b> 점</p>
          <div>
            <Label className="text-xs">실제 점수 (선택)</Label>
            <Input type="number" min={0} max={100} step={0.5} value={actual} onChange={e => setActual(e.target.value)} placeholder="예: 92" />
          </div>
          <p className="text-[11px] text-muted-foreground">확정 시 학생은 해당 항목을 삭제/수정할 수 없습니다.</p>
        </div>
        <DialogFooter className="gap-1">
          {result.score_locked && <Button variant="outline" onClick={unlock} disabled={busy}>잠금 해제</Button>}
          <Button variant="ghost" onClick={onClose}>닫기</Button>
          <Button onClick={lock} disabled={busy}>{busy && <Loader2 className="w-4 h-4 animate-spin mr-1" />}{result.score_locked ? '실제점수 저장' : '확정'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- Staff upload dialog ----
function StaffUploadDialog({ defaultSchool, onClose, onSaved }: { defaultSchool: string; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [students, setStudents] = useState<any[]>([]);
  const [picked, setPicked] = useState<any | null>(null);
  const [school, setSchool] = useState(defaultSchool);
  const [subject, setSubject] = useState('');
  const [examType, setExamType] = useState('midterm');
  const [score, setScore] = useState('');
  const [examDate, setExamDate] = useState('');
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<Array<{ name: string; dataUrl: string }>>([]);
  const [pdfFile, setPdfFile] = useState<{ name: string; dataUrl: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const doSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    const { data, error } = await supabase.functions.invoke('student-exam-results', {
      body: { action: 'staff_search_students', query: query.trim() },
    });
    setSearching(false);
    if (error) { toast({ title: '검색 실패', variant: 'destructive' }); return; }
    setStudents(data?.students || []);
  };

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files; if (!list?.length) return;
    const next: Array<{ name: string; dataUrl: string }> = [];
    for (const f of Array.from(list).slice(0, 15)) {
      try {
        const compressed = await compressImage(f, 1600, 1600, 0.85);
        const dataUrl = await new Promise<string>((res, rej) => {
          const reader = new FileReader();
          reader.onload = () => res(reader.result as string);
          reader.onerror = () => rej(reader.error);
          reader.readAsDataURL(compressed);
        });
        next.push({ name: f.name, dataUrl });
      } catch (err) { console.error(err); }
    }
    setPhotos(prev => [...prev, ...next].slice(0, 15));
    e.target.value = '';
  };

  const handlePdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    if (f.type !== 'application/pdf') { toast({ title: 'PDF 파일만 가능', variant: 'destructive' }); return; }
    const dataUrl = await new Promise<string>((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => res(reader.result as string);
      reader.onerror = () => rej(reader.error);
      reader.readAsDataURL(f);
    });
    setPdfFile({ name: f.name, dataUrl });
    e.target.value = '';
  };

  const submit = async () => {
    if (!picked) { toast({ title: '학생을 먼저 선택해주세요', variant: 'destructive' }); return; }
    if (!school || !subject) { toast({ title: '학교/과목 필수', variant: 'destructive' }); return; }
    if (photos.length === 0 && !pdfFile) { toast({ title: '사진 또는 PDF 1개 이상 첨부', variant: 'destructive' }); return; }
    setSaving(true);
    let pdfPayload: any = null;
    if (pdfFile) {
      const title = buildPdfTitle({
        studentName: picked.name, schoolName: school, examDate: examDate || null,
        submittedAt: new Date().toISOString(), examType, examPeriod: null, subject, imageUrls: [],
      });
      pdfPayload = { dataUrl: pdfFile.dataUrl, title };
    }
    const { data, error } = await supabase.functions.invoke('student-exam-results', {
      body: {
        action: 'staff_create', student_id: picked.id, school_name: school, subject, exam_type: examType,
        expected_score: score, exam_date: examDate || null, note, photos, pdf: pdfPayload,
      },
    });
    setSaving(false);
    if (error || data?.error) { toast({ title: '업로드 실패', description: error?.message || data?.error, variant: 'destructive' }); return; }
    toast({ title: '업로드 완료' });
    onSaved();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>교직원 직접 업로드</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {!picked ? (
            <div className="space-y-2">
              <Label className="text-xs">학생 검색 (이름 또는 학교)</Label>
              <div className="flex gap-1">
                <Input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && doSearch()} placeholder="예: 김민수" />
                <Button onClick={doSearch} disabled={searching} size="sm">{searching ? <Loader2 className="w-4 h-4 animate-spin" /> : '검색'}</Button>
              </div>
              <div className="max-h-48 overflow-y-auto border rounded">
                {students.map(s => (
                  <button key={s.id} onClick={() => { setPicked(s); if (s.school) setSchool(s.school); }}
                    className="w-full text-left px-2 py-1.5 hover:bg-muted text-xs flex items-center gap-2">
                    <span className="font-medium">{s.name}</span>
                    <span className="text-muted-foreground">{s.school || '-'}</span>
                    {s.grade && <Badge variant="outline" className="text-[10px] h-4">{s.grade}학년</Badge>}
                  </button>
                ))}
                {students.length === 0 && <p className="text-xs text-muted-foreground p-2">검색 결과 없음</p>}
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between bg-muted/50 p-2 rounded">
                <span className="text-sm font-medium">{picked.name} <span className="text-xs text-muted-foreground">({picked.school})</span></span>
                <Button size="sm" variant="ghost" onClick={() => setPicked(null)}>변경</Button>
              </div>
              <div><Label className="text-xs">학교명</Label><Input value={school} onChange={e => setSchool(e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">과목</Label><Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="예: 수학-미적분1" /></div>
                <div><Label className="text-xs">시험 종류</Label>
                  <Select value={examType} onValueChange={setExamType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(EXAM_TYPE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">예상 점수</Label><Input type="number" min={0} max={100} value={score} onChange={e => setScore(e.target.value)} /></div>
                <div><Label className="text-xs">시험일</Label><Input type="date" value={examDate} onChange={e => setExamDate(e.target.value)} /></div>
              </div>
              <div><Label className="text-xs">메모</Label><Textarea rows={2} value={note} onChange={e => setNote(e.target.value)} /></div>
              <div>
                <Label className="text-xs">시험지 사진 (최대 15장)</Label>
                <Input type="file" accept="image/*" multiple onChange={handleFiles} />
                {photos.length > 0 && <p className="text-[10px] text-muted-foreground mt-1">선택됨: {photos.length}장</p>}
              </div>
              <div>
                <Label className="text-xs">또는 PDF 파일 직접 업로드</Label>
                <Input type="file" accept="application/pdf" onChange={handlePdf} />
                {pdfFile && <p className="text-[10px] text-muted-foreground mt-1">📄 {pdfFile.name}</p>}
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>취소</Button>
          <Button onClick={submit} disabled={saving || !picked}>{saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}업로드</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
