// EXAM-RESULT-STAFF-VIEW-V1: Staff tab for reviewing student-submitted exam results
import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, FileImage, Search, Download, GraduationCap, ChevronDown, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

const EXAM_TYPE_LABELS: Record<string, string> = {
  midterm: '중간고사', final: '기말고사', performance: '수행평가', other: '기타',
};
const EXAM_TYPE_COLORS: Record<string, string> = {
  midterm: 'bg-destructive/10 text-destructive border-destructive/20',
  final: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  performance: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  other: 'bg-muted text-muted-foreground',
};

interface Photo { id: string; storage_path: string; signedUrl?: string | null; }
interface Result {
  id: string;
  student_id: string;
  school_name: string;
  subject: string;
  exam_type: string;
  expected_score: number | null;
  note: string | null;
  exam_date: string | null;
  submitted_at: string;
  student_name?: string;
  student_grade?: string | null;
  photos: Photo[];
}

interface Props {
  schoolName: string;
}

export function StudentSubmissionsTab({ schoolName }: Props) {
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<Result[]>([]);
  const [search, setSearch] = useState('');
  const [examTypeFilter, setExamTypeFilter] = useState<string>('all');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [previewPhotos, setPreviewPhotos] = useState<Photo[] | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: rows, error } = await supabase
          .from('student_exam_results')
          .select('*, student_exam_result_photos(id, storage_path, sort_order)')
          .eq('school_name', schoolName)
          .order('submitted_at', { ascending: false });
        if (error) throw error;

        const studentIds = Array.from(new Set((rows || []).map((r: any) => r.student_id)));
        const { data: students } = studentIds.length > 0
          ? await supabase.from('students').select('id, name, grade').in('id', studentIds)
          : { data: [] as any[] };
        const studentMap = new Map((students || []).map((s: any) => [s.id, s]));

        const enriched = await Promise.all((rows || []).map(async (r: any) => {
          const photos = await Promise.all((r.student_exam_result_photos || [])
            .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))
            .map(async (p: any) => {
              const { data: signed } = await supabase.storage.from('exam-results').createSignedUrl(p.storage_path, 3600);
              return { ...p, signedUrl: signed?.signedUrl };
            }));
          const s = studentMap.get(r.student_id);
          return {
            ...r,
            student_name: s?.name || '알 수 없음',
            student_grade: s?.grade || null,
            photos,
          } as Result;
        }));
        if (!cancelled) setResults(enriched);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [schoolName]);

  const filtered = useMemo(() => {
    return results.filter(r => {
      if (examTypeFilter !== 'all' && r.exam_type !== examTypeFilter) return false;
      if (subjectFilter !== 'all' && r.subject !== subjectFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        if (!r.student_name?.toLowerCase().includes(q) && !r.subject.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [results, search, examTypeFilter, subjectFilter]);

  const subjectOptions = useMemo(() => Array.from(new Set(results.map(r => r.subject))), [results]);

  // Group by student
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
      student_grade: items[0].student_grade,
      items,
    }));
  }, [filtered]);

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
        <Select value={subjectFilter} onValueChange={setSubjectFilter}>
          <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 과목</SelectItem>
            {subjectOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
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
            const isOpen = expanded[g.student_id] !== false; // default open
            return (
              <Card key={g.student_id}>
                <CardContent className="p-3">
                  <button
                    onClick={() => setExpanded(p => ({ ...p, [g.student_id]: !isOpen }))}
                    className="w-full flex items-center gap-2 mb-2 hover:bg-muted/50 rounded p-1 -m-1"
                  >
                    {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    <span className="font-semibold text-sm">{g.student_name}</span>
                    {g.student_grade && <Badge variant="outline" className="text-[10px] h-4 px-1.5">{g.student_grade}학년</Badge>}
                    <Badge className="text-[10px] h-4 px-1.5 ml-auto bg-primary/10 text-primary border-0">{g.items.length}건</Badge>
                  </button>
                  {isOpen && (
                    <div className="space-y-1.5 pl-5">
                      {g.items.map(r => (
                        <div key={r.id} className="flex items-start gap-2 p-2 rounded border bg-card/50">
                          <div className="flex gap-1 flex-shrink-0">
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
                              <Badge className={`text-[10px] h-4 px-1.5 border ${EXAM_TYPE_COLORS[r.exam_type] || ''}`}>
                                {EXAM_TYPE_LABELS[r.exam_type]}
                              </Badge>
                              {r.expected_score != null && (
                                <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                                  예상 {r.expected_score}점
                                </Badge>
                              )}
                              <span className="text-[10px] text-muted-foreground ml-auto">
                                {format(new Date(r.submitted_at), 'M/d HH:mm', { locale: ko })}
                              </span>
                            </div>
                            {r.exam_date && (
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                시험일: {format(new Date(r.exam_date), 'yyyy-MM-dd')}
                              </p>
                            )}
                            {r.note && (
                              <p className="text-xs mt-1 text-muted-foreground whitespace-pre-wrap">{r.note}</p>
                            )}
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
    </div>
  );
}
