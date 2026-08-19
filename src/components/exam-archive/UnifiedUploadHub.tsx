import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { Upload, FileText, Loader2, Sparkles, X, CheckCircle2, CalendarDays, BookOpen, ClipboardList } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { fileToDataUrl, buildSchoolCalendarScheduleRow } from './scheduleUploadUtils';
import { cn } from '@/lib/utils';

interface Props {
  knownSchools: string[];
  onComplete: () => void;
}

type DocType = 'school_calendar' | 'evaluation_plan' | 'other';

interface ExtractedSchedule {
  schedule_type: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  grade: number | null;
  subject: string | null;
  description: string | null;
}

interface ExtractedExamScope {
  subject: string | null;
  scope_text: string | null;
  chapters?: string[];
  pages?: string | null;
}

interface AnalysisResult {
  doc_type: DocType;
  school_name: string | null;
  exam_type?: string | null;
  exam_period?: string | null;
  schedules: ExtractedSchedule[];
  exam_scope: ExtractedExamScope[];
}

function guessDocType(filename: string): DocType {
  const n = filename.toLowerCase();
  if (n.includes('학사') || n.includes('calendar') || n.includes('일정')) return 'school_calendar';
  if (n.includes('시험범위') || n.includes('평가계획') || n.includes('범위') || n.includes('계획')) return 'evaluation_plan';
  return 'other';
}

function guessSchool(filename: string, knownSchools: string[]): string | null {
  for (const s of knownSchools) {
    const base = s.replace(/(초|중|고)$/, '');
    if (filename.includes(s) || (base && filename.includes(base))) return s;
  }
  return null;
}

const DOC_TYPE_INFO: Record<DocType, { label: string; icon: any; desc: string }> = {
  school_calendar: { label: '학사일정', icon: CalendarDays, desc: '학교 연간/월간 일정표 (시험·방학·행사)' },
  evaluation_plan: { label: '시험 시간표/범위', icon: ClipboardList, desc: '시험 공고문 · 평가계획서 · 시험범위' },
  other: { label: '기타 학교 자료', icon: BookOpen, desc: '교과서 목록 · 안내문 등' },
};

export function UnifiedUploadHub({ knownSchools, onComplete }: Props) {
  const { user } = useAuth();
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modal state
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileDataUrl, setFileDataUrl] = useState<string | null>(null);
  const [docType, setDocType] = useState<DocType>('other');
  const [schoolName, setSchoolName] = useState<string>('');
  const [newSchool, setNewSchool] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setFile(null);
    setFileDataUrl(null);
    setDocType('other');
    setSchoolName('');
    setNewSchool('');
    setResult(null);
    setAnalyzing(false);
    setSaving(false);
  };

  const handleFiles = useCallback(async (fileList: FileList | File[]) => {
    const f = Array.from(fileList)[0];
    if (!f) return;
    const sizeMB = f.size / (1024 * 1024);
    if (sizeMB > 20) {
      toast.error('파일이 너무 큽니다 (최대 20MB)');
      return;
    }
    setFile(f);
    setDocType(guessDocType(f.name));
    setSchoolName(guessSchool(f.name, knownSchools) || '');
    setResult(null);
    try {
      const dataUrl = await fileToDataUrl(f);
      setFileDataUrl(dataUrl);
    } catch {
      toast.error('파일을 읽지 못했습니다');
      return;
    }
    setOpen(true);
  }, [knownSchools]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  };

  const finalSchool = (schoolName === '__new__' ? newSchool.trim() : schoolName).trim();

  const runAnalysis = async () => {
    if (!file || !fileDataUrl) return;
    if (!finalSchool) {
      toast.error('학교를 선택하거나 입력해주세요');
      return;
    }
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-school-document', {
        body: {
          fileDataUrl,
          fileType: docType,
          schoolName: finalSchool,
          fileName: file.name,
          fileMimeType: file.type,
          subjectFilter: 'all',
        },
      });
      if (error) throw error;
      // Edge function returns { success, data: {...} } or sometimes the payload directly
      const envelope = (data as any) ?? {};
      const raw = envelope?.data && typeof envelope.data === 'object' ? envelope.data : envelope;
      if (envelope?.error) throw new Error(envelope.error);
      const schedules: ExtractedSchedule[] = Array.isArray(raw.schedules) ? [...raw.schedules] : [];
      const scope: ExtractedExamScope[] = Array.isArray(raw.exam_scope) ? [...raw.exam_scope] : [];
      // evaluation_plan returns exam_schedule with date/subject — convert to schedule rows
      if (Array.isArray(raw.exam_schedule)) {
        for (const s of raw.exam_schedule) {
          if (!s?.date) continue;
          schedules.push({
            schedule_type: 'exam',
            title: `${raw.exam_type || '시험'} - ${s.subject || ''}`.trim(),
            start_date: s.date,
            end_date: s.date,
            grade: typeof s.grade === 'number' ? s.grade : null,
            subject: s.subject || null,
            description: [s.start_time, s.end_time].filter(Boolean).join(' ~ ') || null,
          });
        }
      }
      if (schedules.length === 0 && scope.length === 0) {
        toast.warning('추출된 일정/시험범위가 없습니다. 문서 유형이나 학교를 확인 후 다시 시도해보세요.');
      }
      setResult({
        doc_type: docType,
        school_name: raw.school_name || finalSchool,
        exam_type: raw.exam_type || null,
        exam_period: raw.exam_period || null,
        schedules,
        exam_scope: scope,
      });
      toast.success('AI 분석 완료. 내용을 확인하고 저장하세요.');
    } catch (e: any) {
      toast.error(e.message || 'AI 분석 실패');
    } finally {
      setAnalyzing(false);
    }
  };

  const save = async () => {
    if (!result) return;
    if (!finalSchool) {
      toast.error('학교명이 필요합니다');
      return;
    }
    setSaving(true);
    try {
      // 1) Store file record
      let fileUrl: string | null = null;
      if (file) {
        const ext = file.name.split('.').pop() || 'bin';
        const path = `unified/${Date.now()}-${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('exam-files').upload(path, file, {
          contentType: file.type, upsert: false,
        });
        if (!upErr) {
          // 비공개 버킷: 공개 URL 대신 저장 경로를 보관하고 열람 시 서명 URL을 발급한다
          fileUrl = path;

          await supabase.from('school_files').insert({
            school_name: finalSchool,
            file_type: result.doc_type,
            file_name: file.name,
            file_url: fileUrl,
            subject_filter: 'all',
            ai_extraction_status: 'completed',
            ai_extracted_data: result as any,
            extracted_count: result.schedules.length + result.exam_scope.length,
            created_by: user?.id ?? null,
          } as any);
        }
      }

      // 2) Insert schedules
      const scheduleRows = result.schedules
        .map(s => buildSchoolCalendarScheduleRow(s, finalSchool, user?.id))
        .filter(Boolean) as any[];
      if (scheduleRows.length) {
        // attach source_file_url
        for (const r of scheduleRows) r.source_file_url = fileUrl;
        const { error } = await supabase.from('school_schedules').insert(scheduleRows);
        if (error) throw error;
      }

      // 3) Insert exam scope as archives
      if (result.exam_scope.length) {
        const archives = result.exam_scope.map(sc => ({
          school_name: finalSchool,
          school_level: '중',
          grade_year: 1,
          subject: sc.subject || '기타',
          semester: result.exam_period || '1학기',
          exam_type: result.exam_type || '중간고사',
          exam_scope: [sc.scope_text, sc.chapters?.join(', '), sc.pages].filter(Boolean).join('\n') || null,
          status: '자료수집전',
          created_by: user?.id ?? null,
        }));
        const { error } = await supabase.from('school_exam_archives').insert(archives as any);
        if (error) throw error;
      }

      toast.success(`저장 완료 — 일정 ${scheduleRows.length}건, 시험범위 ${result.exam_scope.length}건`);
      setOpen(false);
      reset();
      onComplete();
    } catch (e: any) {
      toast.error(e.message || '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const DocIcon = DOC_TYPE_INFO[docType].icon;

  return (
    <>
      <Card
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          'p-6 border-2 border-dashed transition-all cursor-pointer',
          dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30'
        )}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
        <div className="flex flex-col items-center text-center gap-2">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Upload className="w-6 h-6 text-primary" />
          </div>
          <h3 className="text-base font-semibold">자료 통합 업로드</h3>
          <p className="text-xs text-muted-foreground">
            학사일정 · 시험 시간표 · 시험 범위 PDF/이미지를 여기에 끌어다 놓거나 클릭해서 업로드
          </p>
          <p className="text-[10px] text-muted-foreground/70 flex items-center gap-1 mt-1">
            <Sparkles className="w-3 h-3" /> AI가 학교/유형/일정을 자동 분석해서 정리합니다
          </p>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" /> 자료 분류 및 저장
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="flex-1 pr-3 -mr-3">
            <div className="space-y-4">
              {/* File info */}
              {file && (
                <div className="flex items-center gap-2 p-2 rounded-md bg-muted/40 border">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs truncate flex-1">{file.name}</span>
                  <Badge variant="outline" className="text-[10px]">{(file.size / 1024).toFixed(0)} KB</Badge>
                </div>
              )}

              {/* Doc type */}
              <div className="space-y-2">
                <Label className="text-xs">문서 유형</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(DOC_TYPE_INFO) as DocType[]).map(t => {
                    const Info = DOC_TYPE_INFO[t];
                    const Icon = Info.icon;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => { setDocType(t); setResult(null); }}
                        className={cn(
                          'p-2.5 rounded-lg border-2 text-left transition',
                          docType === t ? 'border-primary bg-primary/5' : 'border-muted hover:border-muted-foreground/50'
                        )}
                      >
                        <Icon className={cn('w-4 h-4 mb-1', docType === t ? 'text-primary' : 'text-muted-foreground')} />
                        <div className="text-xs font-semibold">{Info.label}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">{Info.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* School */}
              <div className="space-y-2">
                <Label className="text-xs">학교</Label>
                <Select value={schoolName} onValueChange={(v) => { setSchoolName(v); setResult(null); }}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="학교 선택" /></SelectTrigger>
                  <SelectContent>
                    {knownSchools.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    <SelectItem value="__new__">+ 새 학교 입력</SelectItem>
                  </SelectContent>
                </Select>
                {schoolName === '__new__' && (
                  <Input
                    value={newSchool}
                    onChange={e => setNewSchool(e.target.value)}
                    placeholder="예: 신길중"
                    className="h-9 text-sm"
                  />
                )}
              </div>

              {/* Analyze button */}
              {!result && (
                <Button
                  onClick={runAnalysis}
                  disabled={analyzing || !finalSchool}
                  className="w-full gap-2"
                >
                  {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {analyzing ? 'AI 분석 중...' : 'AI 분석 시작'}
                </Button>
              )}

              {/* Result preview */}
              {result && (
                <Card className="p-3 space-y-3 bg-emerald-500/5 border-emerald-500/30">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-semibold">분석 결과 — 저장 전 확인</span>
                  </div>

                  <Tabs defaultValue="schedules">
                    <TabsList className="h-8">
                      <TabsTrigger value="schedules" className="text-xs h-7">
                        일정 {result.schedules.length > 0 && `(${result.schedules.length})`}
                      </TabsTrigger>
                      <TabsTrigger value="scope" className="text-xs h-7">
                        시험범위 {result.exam_scope.length > 0 && `(${result.exam_scope.length})`}
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="schedules" className="mt-2">
                      {result.schedules.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-3 text-center">추출된 일정이 없습니다</p>
                      ) : (
                        <div className="space-y-1 max-h-64 overflow-y-auto">
                          {result.schedules.map((s, i) => (
                            <div key={i} className="flex items-center gap-2 p-1.5 rounded bg-card text-xs border">
                              <Badge variant="outline" className="text-[10px] shrink-0">{s.schedule_type}</Badge>
                              <span className="font-medium truncate flex-1">{s.title}</span>
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                {s.start_date}{s.end_date && s.end_date !== s.start_date && ` ~ ${s.end_date}`}
                              </span>
                              <button
                                onClick={() => setResult({ ...result, schedules: result.schedules.filter((_, j) => j !== i) })}
                                className="text-muted-foreground hover:text-destructive"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </TabsContent>
                    <TabsContent value="scope" className="mt-2">
                      {result.exam_scope.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-3 text-center">추출된 시험 범위가 없습니다</p>
                      ) : (
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {result.exam_scope.map((s, i) => (
                            <div key={i} className="p-2 rounded bg-card text-xs border">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="outline" className="text-[10px]">{s.subject || '과목 미지정'}</Badge>
                                {s.pages && <span className="text-[10px] text-muted-foreground">{s.pages}</span>}
                              </div>
                              <p className="text-[11px] text-muted-foreground line-clamp-3">{s.scope_text}</p>
                              {s.chapters && s.chapters.length > 0 && (
                                <p className="text-[10px] text-muted-foreground mt-1">단원: {s.chapters.join(', ')}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </Card>
              )}
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="ghost" onClick={() => { setOpen(false); reset(); }}>취소</Button>
            {result && (
              <>
                <Button variant="outline" onClick={() => setResult(null)} disabled={saving}>다시 분석</Button>
                <Button onClick={save} disabled={saving} className="gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  저장
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
