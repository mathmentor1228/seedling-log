// STUDENT-EXAM-RESULT-V2: Student card with expanded subjects + blur detection + batch capture
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
import { FileImage, Loader2, Plus, Trash2, Upload, X, GraduationCap, AlertTriangle, Camera, Lock } from 'lucide-react';
import { compressImage } from '@/lib/imageCompression';
import { detectBlur } from '@/lib/imageBlurDetect';

const EXAM_TYPES = [
  { value: 'midterm', label: '중간고사' },
  { value: 'final', label: '기말고사' },
  { value: 'performance', label: '수행평가' },
  { value: 'other', label: '기타' },
];

// 고등학생: 과목 세분화 (수학/국어/영어/과학)
const HIGH_SUBJECTS = [
  '국어-공통국어', '국어-문학', '국어-화법과작문',
  '영어-공통영어', '영어-영어독해와작문',
  '수학-공통수학1', '수학-공통수학2',
  '수학-대수', '수학-미적분1', '수학-미적분2', '수학-확통', '수학-기하',
  '과학-통합과학', '과학-생명', '과학-화학', '과학-물리', '과학-지구과학',
  '사회', '한국사', '기타',
];
const DEFAULT_SUBJECTS = ['국어', '영어', '수학', '사회', '과학', '한국사', '기타'];

function isHighSchool(student: any): boolean {
  // STUDENT-EXAM-SUBJECT-CLASSIFY-V2: derive from grade ('고1', '고2', '고3') or school_level
  const lvl = student?.school_level;
  if (typeof lvl === 'string' && lvl.startsWith('고')) return true;
  const grade = student?.grade;
  if (typeof grade === 'string' && grade.startsWith('고')) return true;
  return false;
}

function getSubjectsForStudent(student: any): string[] {
  return isHighSchool(student) ? HIGH_SUBJECTS : DEFAULT_SUBJECTS;
}

interface ExamResult {
  id: string;
  school_name: string;
  subject: string;
  exam_type: string;
  exam_year?: number | null;
  exam_period?: string | null;
  expected_score: number | null;
  actual_score?: number | null;
  score_locked?: boolean;
  note: string | null;
  exam_date: string | null;
  submitted_at: string;
  photos: Array<{ id: string; signedUrl: string | null }>;
}


interface FileItem {
  name: string;
  dataUrl: string;
  blurVariance: number;
  isBlurry: boolean;
}

export function ExamResultSubmitCard() {
  const { student } = useStudentAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<ExamResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [sortingResultId, setSortingResultId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState('');

  const [school, setSchool] = useState('');
  const [subject, setSubject] = useState('');
  const [examType, setExamType] = useState('midterm');
  const currentYear = new Date().getFullYear();
  const defaultPeriod = new Date().getMonth() + 1 <= 7 ? '1학기' : '2학기';
  const [examYear, setExamYear] = useState<string>(String(currentYear));
  const [examPeriod, setExamPeriod] = useState<string>(defaultPeriod);
  const [score, setScore] = useState('');
  const [note, setNote] = useState('');
  const [examDate, setExamDate] = useState('');
  const [files, setFiles] = useState<FileItem[]>([]);

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

  useEffect(() => { fetchResults(); }, [fetchResults]);
  useEffect(() => {
    if (open && student?.school) setSchool(student.school);
  }, [open, student]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list || list.length === 0) return;
    setAnalyzing(true);
    const newFiles: FileItem[] = [];
    let blurryCount = 0;
    const remainingSlots = Math.max(0, 15 - files.length);
    for (const f of Array.from(list).filter((file) => file.type.startsWith('image/')).slice(0, remainingSlots)) {
      try {
        // Detect blur on ORIGINAL before compression
        const blur = await detectBlur(f);
        if (blur.isBlurry) blurryCount++;
        const compressed = await compressImage(f, 1280, 1280, 0.72);
        const dataUrl = await new Promise<string>((res, rej) => {
          const reader = new FileReader();
          reader.onload = () => res(reader.result as string);
          reader.onerror = () => rej(reader.error);
          reader.readAsDataURL(compressed);
        });
        newFiles.push({ name: f.name, dataUrl, blurVariance: blur.variance, isBlurry: blur.isBlurry });
      } catch (err) {
        console.error('process err', err);
      }
    }
    setFiles(prev => [...prev, ...newFiles].slice(0, 15));
    setAnalyzing(false);
    e.target.value = '';
    if (newFiles.length === 0) {
      toast({ title: '사진을 처리하지 못했어요', description: 'JPG/PNG 사진으로 다시 선택해주세요.', variant: 'destructive' });
      return;
    }
    if (blurryCount > 0) {
      toast({
        title: `흔들림 감지: ${blurryCount}장`,
        description: '빨간색 표시된 사진은 다시 또렷하게 찍어 교체해주세요.',
        variant: 'destructive',
      });
    }
  };

  const handleSubmit = async () => {
    if (!student) return;
    if (!school.trim()) { toast({ title: '학교명을 입력해주세요', variant: 'destructive' }); return; }
    if (!subject) { toast({ title: '과목을 선택해주세요', variant: 'destructive' }); return; }
    if (files.length === 0) { toast({ title: '시험지 사진을 1장 이상 업로드해주세요', variant: 'destructive' }); return; }

    const blurry = files.filter(f => f.isBlurry);
    if (blurry.length > 0) {
      const ok = confirm(`흔들린 사진이 ${blurry.length}장 있습니다.\n그래도 제출하시겠습니까? (선생님이 확인하기 어려울 수 있어요)`);
      if (!ok) return;
    }

    setSubmitting(true);
    setUploadProgress('제출 정보 저장 중...');
    try {
      // STUDENT-EXAM-CHUNK-UPLOAD-V1: create row first WITHOUT photos to avoid
      // exceeding the edge function payload limit when uploading many photos.
      const { data: createData, error: createErr } = await supabase.functions.invoke('student-exam-results', {
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
          photos: [],
        },
      });
      if (createErr) throw createErr;
      if (createData?.error) throw new Error(createData.error);
      const resultId = createData?.id;
      if (!resultId) throw new Error('제출 ID를 받지 못했습니다.');

      // Upload photos in small chunks (1 per request) to keep each payload small
      const CHUNK = 1;
      let failed = 0;
      const uploadChunk = async (slice: FileItem[], startIndex: number) => {
        const payload = {
          action: 'add_photos',
          student_id: student.id,
          student_token: student.token,
          result_id: resultId,
          start_index: startIndex,
          photos: slice.map(f => ({ name: f.name, dataUrl: f.dataUrl })),
        };
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const { data: addData, error: addErr } = await supabase.functions.invoke('student-exam-results', { body: payload });
            if (addErr) throw addErr;
            if (addData?.error) throw new Error(addData.error);
            return true;
          } catch (err) {
            console.error('add_photos chunk failed', startIndex, `attempt ${attempt}`, err);
            if (attempt === 3) return false;
            await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
          }
        }
        return false;
      };

      for (let i = 0; i < files.length; i += CHUNK) {
        const slice = files.slice(i, i + CHUNK);
        setUploadProgress(`사진 업로드 중 ${Math.min(i + 1, files.length)} / ${files.length}`);
        const ok = await uploadChunk(slice, i);
        if (!ok) {
          failed += slice.length;
        }
      }

      if (files.length > 1) {
        setSortingResultId(resultId);
        setUploadProgress('AI가 사진 순서를 정렬하는 중...');
        const { data: sortData, error: sortErr } = await supabase.functions.invoke('student-exam-results', {
          body: { action: 'sort_photos', student_id: student.id, student_token: student.token, result_id: resultId },
        });
        if (sortErr || sortData?.error) {
          toast({ title: '사진 자동 정렬 실패', description: '제출은 완료됐고 기존 순서로 저장됐어요.', variant: 'destructive' });
        }
        setSortingResultId(null);
      }

      if (failed > 0) {
        toast({
          title: `사진 ${failed}장 업로드 실패`,
          description: '나머지는 저장됐어요. 실패한 장은 다시 업로드해주세요.',
          variant: 'destructive',
        });
      } else {
        toast({ title: '제출 완료', description: '담당 선생님께 자료가 전달되었습니다.' });
      }
      setSubject(''); setExamType('midterm'); setScore(''); setNote(''); setExamDate(''); setFiles([]);
      setOpen(false);
      fetchResults();
    } catch (e: any) {
      toast({ title: '제출 실패', description: e?.message || '오류가 발생했습니다.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
      setSortingResultId(null);
      setUploadProgress('');
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

              {/* Camera guide banner */}
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-[11px] text-amber-700 dark:text-amber-400 space-y-0.5">
                <div className="flex items-center gap-1 font-semibold">
                  <Camera className="w-3.5 h-3.5" /> 사진 촬영 가이드
                </div>
                <p>• 시험지 전체가 화면에 다 들어오게 찍어주세요</p>
                <p>• <b>흔들림 없이</b> 또렷하게 (자동 검사로 흔들림 감지 시 알려드려요)</p>
                <p>• 페이지마다 따로 찍어 한 번에 모아 올려도 됩니다 (최대 15장)</p>
              </div>

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
                        {getSubjectsForStudent(student).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
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
                  <Label className="text-xs">시험지 사진 * (최대 15장, 한 번에 모아 선택 가능)</Label>
                  <Input type="file" accept="image/*" multiple onChange={handleFileChange} disabled={analyzing} />
                  {analyzing && (
                    <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" /> 흔들림 검사 중...
                    </p>
                  )}
                  {uploadProgress && (
                    <p className="text-[10px] text-primary mt-1 flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" /> {uploadProgress}
                    </p>
                  )}
                  {files.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      {files.map((f, i) => (
                        <div key={i} className={`relative aspect-square rounded border-2 overflow-hidden ${f.isBlurry ? 'border-destructive' : 'border-border'} bg-muted`}>
                          <img src={f.dataUrl} alt={f.name} className="w-full h-full object-cover" />
                          {f.isBlurry && (
                            <div className="absolute inset-x-0 bottom-0 bg-destructive/90 text-destructive-foreground text-[9px] py-0.5 px-1 flex items-center gap-0.5 justify-center font-semibold">
                              <AlertTriangle className="w-2.5 h-2.5" /> 흔들림! 다시
                            </div>
                          )}
                          <button type="button" onClick={() => setFiles(files.filter((_, idx) => idx !== i))}
                            className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-0.5">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <Button onClick={handleSubmit} disabled={submitting || analyzing} className="w-full">
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
                      <Badge className={`text-[10px] px-1.5 py-0 h-4 border-0 ${r.score_locked ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'}`}>
                        {r.score_locked && <Lock className="w-2.5 h-2.5 mr-0.5 inline" />}
                        예상 {r.expected_score}점
                      </Badge>
                    )}
                    {r.actual_score != null && (
                      <Badge className="text-[10px] px-1.5 py-0 h-4 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-0">
                        실제 {r.actual_score}점
                      </Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {r.school_name} · {new Date(r.submitted_at).toLocaleDateString('ko-KR')}
                    {r.photos.length > 1 && ` · 사진 ${r.photos.length}장`}
                  </p>
                </div>
                {!r.score_locked && (
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDelete(r.id)}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
