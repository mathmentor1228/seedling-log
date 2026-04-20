// STUDENT-EXAM-RESULT-V1: Student card to upload exam result photos with metadata
import { useState, useEffect, useCallback } from 'react';
import { useStudentAuth } from '@/lib/studentAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { FileImage, Loader2, Plus, Trash2, Upload, X, GraduationCap } from 'lucide-react';
import { compressImage } from '@/lib/imageCompression';

const EXAM_TYPES = [
  { value: 'midterm', label: '중간고사' },
  { value: 'final', label: '기말고사' },
  { value: 'performance', label: '수행평가' },
  { value: 'other', label: '기타' },
];

const SUBJECTS = ['국어', '영어', '수학', '사회', '과학', '한국사', '기타'];

interface ExamResult {
  id: string;
  school_name: string;
  subject: string;
  exam_type: string;
  expected_score: number | null;
  note: string | null;
  exam_date: string | null;
  submitted_at: string;
  photos: Array<{ id: string; signedUrl: string | null }>;
}

export function ExamResultSubmitCard() {
  const { student } = useStudentAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<ExamResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [school, setSchool] = useState('');
  const [subject, setSubject] = useState('');
  const [examType, setExamType] = useState('midterm');
  const [score, setScore] = useState('');
  const [note, setNote] = useState('');
  const [examDate, setExamDate] = useState('');
  const [files, setFiles] = useState<Array<{ name: string; dataUrl: string }>>([]);

  const fetchResults = useCallback(async () => {
    if (!student) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('student-exam-results', {
        body: { action: 'list', student_id: student.id, student_token: student.token },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResults(data?.results || []);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [student]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  useEffect(() => {
    if (open && student?.school) setSchool(student.school);
  }, [open, student]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list || list.length === 0) return;
    const newFiles: Array<{ name: string; dataUrl: string }> = [];
    for (const f of Array.from(list).slice(0, 10)) {
      try {
        const compressed = await compressImage(f, 1600, 0.82);
        const dataUrl = await new Promise<string>((res, rej) => {
          const reader = new FileReader();
          reader.onload = () => res(reader.result as string);
          reader.onerror = () => rej(reader.error);
          reader.readAsDataURL(compressed);
        });
        newFiles.push({ name: f.name, dataUrl });
      } catch (err) {
        console.error('compress err', err);
      }
    }
    setFiles(prev => [...prev, ...newFiles].slice(0, 10));
    e.target.value = '';
  };

  const handleSubmit = async () => {
    if (!student) return;
    if (!school.trim()) { toast({ title: '학교명을 입력해주세요', variant: 'destructive' }); return; }
    if (!subject) { toast({ title: '과목을 선택해주세요', variant: 'destructive' }); return; }
    if (files.length === 0) { toast({ title: '시험지 사진을 1장 이상 업로드해주세요', variant: 'destructive' }); return; }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('student-exam-results', {
        body: {
          action: 'create',
          student_id: student.id,
          student_token: student.token,
          school_name: school.trim(),
          subject,
          exam_type: examType,
          expected_score: score,
          note,
          exam_date: examDate || null,
          photos: files,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: '제출 완료', description: '담당 선생님께 자료가 전달되었습니다.' });
      // Reset
      setSubject('');
      setExamType('midterm');
      setScore('');
      setNote('');
      setExamDate('');
      setFiles([]);
      setOpen(false);
      fetchResults();
    } catch (e: any) {
      toast({ title: '제출 실패', description: e?.message || '오류가 발생했습니다.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!student) return;
    if (!confirm('이 제출 자료를 삭제할까요?')) return;
    try {
      const { data, error } = await supabase.functions.invoke('student-exam-results', {
        body: { action: 'delete', student_id: student.id, student_token: student.token, result_id: id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: '삭제되었습니다' });
      fetchResults();
    } catch (e: any) {
      toast({ title: '삭제 실패', description: e?.message, variant: 'destructive' });
    }
  };

  return (
    <Card className="border-primary/20">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <GraduationCap className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">내신 결과 제출</h3>
              <p className="text-[11px] text-muted-foreground">학교 시험 결과를 사진으로 업로드</p>
            </div>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1">
                <Plus className="w-4 h-4" /> 제출
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>내신 시험 결과 제출</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 pt-2">
                <div>
                  <Label className="text-xs">학교명 *</Label>
                  <Input value={school} onChange={e => setSchool(e.target.value)} placeholder="예: 한밭중학교" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">과목 *</Label>
                    <Select value={subject} onValueChange={setSubject}>
                      <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                      <SelectContent>
                        {SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">시험 종류 *</Label>
                    <Select value={examType} onValueChange={setExamType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {EXAM_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">예상 점수</Label>
                    <Input type="number" min={0} max={100} step={0.5} value={score}
                      onChange={e => setScore(e.target.value)} placeholder="예: 85" />
                  </div>
                  <div>
                    <Label className="text-xs">시험일</Label>
                    <Input type="date" value={examDate} onChange={e => setExamDate(e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">메모 (자유 코멘트)</Label>
                  <Textarea rows={2} value={note} onChange={e => setNote(e.target.value)}
                    placeholder="어려웠던 단원, 컨디션 등" />
                </div>
                <div>
                  <Label className="text-xs">시험지 사진 * (최대 10장)</Label>
                  <Input type="file" accept="image/*" multiple onChange={handleFileChange} />
                  {files.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      {files.map((f, i) => (
                        <div key={i} className="relative aspect-square rounded border overflow-hidden bg-muted">
                          <img src={f.dataUrl} alt={f.name} className="w-full h-full object-cover" />
                          <button type="button" onClick={() => setFiles(files.filter((_, idx) => idx !== i))}
                            className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-0.5">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <Button onClick={handleSubmit} disabled={submitting} className="w-full">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                  제출하기
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : results.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">아직 제출한 자료가 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {results.slice(0, 5).map(r => (
              <div key={r.id} className="flex items-center gap-2 p-2 rounded-md border bg-card">
                {r.photos[0]?.signedUrl ? (
                  <img src={r.photos[0].signedUrl} alt="" className="w-12 h-12 rounded object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded bg-muted flex items-center justify-center">
                    <FileImage className="w-5 h-5 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium text-xs">{r.subject}</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                      {EXAM_TYPES.find(t => t.value === r.exam_type)?.label}
                    </Badge>
                    {r.expected_score != null && (
                      <Badge className="text-[10px] px-1.5 py-0 h-4 bg-primary/10 text-primary border-0">
                        예상 {r.expected_score}점
                      </Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {r.school_name} · {new Date(r.submitted_at).toLocaleDateString('ko-KR')}
                    {r.photos.length > 1 && ` · 사진 ${r.photos.length}장`}
                  </p>
                </div>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDelete(r.id)}>
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
