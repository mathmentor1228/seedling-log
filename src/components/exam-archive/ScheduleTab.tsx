import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Upload, Plus, Trash2, Loader2, ScanLine } from 'lucide-react';
import { format, differenceInDays, parseISO } from 'date-fns';
import { useAuth } from '@/lib/auth';
import type { Schedule } from './types';
import { SCHEDULE_TYPE_LABELS, SCHEDULE_TYPE_COLORS, FILE_TYPE_LABELS } from './types';

interface Props {
  schoolName: string;
  schedules: Schedule[];
  onRefetch: () => void;
}

export function ScheduleTab({ schoolName, schedules, onRefetch }: Props) {
  const { user } = useAuth();
  const schoolSchedules = schedules.filter(s => s.school_name === schoolName);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState('school_calendar');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [extractedData, setExtractedData] = useState<any[] | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [savingExtracted, setSavingExtracted] = useState(false);

  // Manual add form
  const [manualForm, setManualForm] = useState({
    schedule_type: 'exam',
    title: '',
    start_date: '',
    end_date: '',
    grade: '',
    subject: '',
    description: '',
  });

  const today = new Date();

  const handleUploadAndAnalyze = async () => {
    if (!file) { toast.error('파일을 선택해주세요'); return; }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'bin';
      const path = `${schoolName}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from('school-documents').upload(path, file);
      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage.from('school-documents').getPublicUrl(path);
      const fileUrl = urlData.publicUrl;

      // Insert file record
      await supabase.from('school_files').insert({
        school_name: schoolName,
        file_type: fileType,
        file_name: file.name,
        file_url: fileUrl,
        subject_filter: subjectFilter,
        ai_extraction_status: 'processing',
        created_by: user?.id,
      } as any);

      setUploading(false);
      setAnalyzing(true);

      // Call AI analysis
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-school-document`,
        {
          method: 'POST',
          headers: {
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ fileUrl, fileType, subjectFilter, schoolName }),
        }
      );

      const result = await res.json();

      if (!res.ok || result.error) {
        toast.error(result.error || 'AI 분석 실패');
        setAnalyzing(false);
        return;
      }

      // Parse extracted items based on file type
      let items: any[] = [];
      if (fileType === 'school_calendar' && result.data?.schedules) {
        items = result.data.schedules;
      } else if (fileType === 'textbook_list' && result.data?.textbooks) {
        items = result.data.textbooks;
      } else if (fileType === 'evaluation_plan' && result.data?.evaluations) {
        items = result.data.evaluations;
      }

      setExtractedData(items);
      setSelectedItems(new Set(items.map((_, i) => i)));
      toast.success(`${items.length}개 항목이 추출되었습니다`);
    } catch (err: any) {
      toast.error(err.message || '업로드 실패');
    } finally {
      setUploading(false);
      setAnalyzing(false);
    }
  };

  const handleSaveExtracted = async () => {
    if (!extractedData || selectedItems.size === 0) return;
    setSavingExtracted(true);
    try {
      const selected = extractedData.filter((_, i) => selectedItems.has(i));

      if (fileType === 'school_calendar') {
        const rows = selected.map((s: any) => ({
          school_name: schoolName,
          schedule_type: s.schedule_type || 'other',
          title: s.title,
          start_date: s.start_date || null,
          end_date: s.end_date || null,
          grade: s.grade || null,
          subject: s.subject || null,
          description: s.description || null,
          is_ai_extracted: true,
          created_by: user?.id,
        }));
        const { error } = await supabase.from('school_schedules').insert(rows as any);
        if (error) throw error;
      } else if (fileType === 'textbook_list') {
        const rows = selected.map((t: any) => ({
          school_name: schoolName,
          grade: t.grade || null,
          subject: t.subject,
          publisher: t.publisher || null,
          textbook_name: t.textbook_name || null,
          is_ai_extracted: true,
          created_by: user?.id,
        }));
        const { error } = await supabase.from('school_textbooks').insert(rows as any);
        if (error) throw error;
      } else if (fileType === 'evaluation_plan') {
        const rows = selected.map((e: any) => ({
          school_name: schoolName,
          schedule_type: e.exam_type?.includes('수행') ? 'performance' : 'exam',
          title: `${e.subject || ''} ${e.exam_type || ''}`.trim(),
          start_date: e.exam_start_date || null,
          end_date: e.exam_end_date || null,
          grade: e.grade || null,
          subject: e.subject || null,
          description: [e.exam_range, e.evaluation_ratio, e.performance_detail].filter(Boolean).join(' / '),
          is_ai_extracted: true,
          created_by: user?.id,
        }));
        const { error } = await supabase.from('school_schedules').insert(rows as any);
        if (error) throw error;
      }

      toast.success(`${selectedItems.size}개 항목이 저장되었습니다`);
      setExtractedData(null);
      setFile(null);
      setUploadOpen(false);
      onRefetch();
    } catch (err: any) {
      toast.error(err.message || '저장 실패');
    } finally {
      setSavingExtracted(false);
    }
  };

  const handleManualAdd = async () => {
    if (!manualForm.title.trim()) { toast.error('제목을 입력해주세요'); return; }
    const { error } = await supabase.from('school_schedules').insert({
      school_name: schoolName,
      schedule_type: manualForm.schedule_type,
      title: manualForm.title,
      start_date: manualForm.start_date || null,
      end_date: manualForm.end_date || null,
      grade: manualForm.grade ? parseInt(manualForm.grade) : null,
      subject: manualForm.subject || null,
      description: manualForm.description || null,
      created_by: user?.id,
    } as any);
    if (error) { toast.error(error.message); return; }
    toast.success('일정 추가 완료');
    setManualOpen(false);
    setManualForm({ schedule_type: 'exam', title: '', start_date: '', end_date: '', grade: '', subject: '', description: '' });
    onRefetch();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return;
    await supabase.from('school_schedules').delete().eq('id', id);
    onRefetch();
  };

  const getDday = (dateStr: string | null) => {
    if (!dateStr) return null;
    const d = differenceInDays(parseISO(dateStr), today);
    return d;
  };

  return (
    <div className="space-y-4">
      {/* Upload + Manual buttons */}
      <div className="flex gap-2">
        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogTrigger asChild>
            <Button className="gap-1.5 bg-orange-500 hover:bg-orange-600 text-white">
              <Upload className="w-4 h-4" /> 파일 업로드
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>파일 업로드 & AI 분석</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-2">
              {!extractedData ? (
                <>
                  <div>
                    <Label className="text-sm">파일 선택 (PDF / 이미지)</Label>
                    <Input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.webp"
                      onChange={e => setFile(e.target.files?.[0] || null)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-sm">파일 유형</Label>
                    <Select value={fileType} onValueChange={setFileType}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="school_calendar">학사일정</SelectItem>
                        <SelectItem value="textbook_list">교과서/출판사 목록</SelectItem>
                        <SelectItem value="evaluation_plan">평가계획서</SelectItem>
                        <SelectItem value="other">기타</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm">과목 필터</Label>
                    <Select value={subjectFilter} onValueChange={setSubjectFilter}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">전체 과목</SelectItem>
                        <SelectItem value="english">영어만</SelectItem>
                        <SelectItem value="math">수학만</SelectItem>
                        <SelectItem value="other">기타 과목만</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={handleUploadAndAnalyze}
                    disabled={!file || uploading || analyzing}
                    className="w-full gap-2"
                  >
                    {(uploading || analyzing) && <Loader2 className="w-4 h-4 animate-spin" />}
                    {uploading ? '업로드 중...' : analyzing ? 'AI가 문서를 분석 중입니다...' : (
                      <><ScanLine className="w-4 h-4" /> AI로 자동 분석</>
                    )}
                  </Button>
                </>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm font-medium">추출된 데이터 ({extractedData.length}개)</p>
                  <div className="max-h-[300px] overflow-y-auto border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-8">
                            <Checkbox
                              checked={selectedItems.size === extractedData.length}
                              onCheckedChange={c => setSelectedItems(c ? new Set(extractedData!.map((_, i) => i)) : new Set())}
                            />
                          </TableHead>
                          {fileType === 'school_calendar' && <><TableHead>유형</TableHead><TableHead>제목</TableHead><TableHead>날짜</TableHead></>}
                          {fileType === 'textbook_list' && <><TableHead>학년</TableHead><TableHead>과목</TableHead><TableHead>출판사</TableHead></>}
                          {fileType === 'evaluation_plan' && <><TableHead>과목</TableHead><TableHead>시험유형</TableHead><TableHead>범위</TableHead></>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {extractedData.map((item, i) => (
                          <TableRow key={i}>
                            <TableCell>
                              <Checkbox
                                checked={selectedItems.has(i)}
                                onCheckedChange={c => {
                                  const next = new Set(selectedItems);
                                  c ? next.add(i) : next.delete(i);
                                  setSelectedItems(next);
                                }}
                              />
                            </TableCell>
                            {fileType === 'school_calendar' && (
                              <>
                                <TableCell className="text-xs">{SCHEDULE_TYPE_LABELS[item.schedule_type] || item.schedule_type}</TableCell>
                                <TableCell className="text-xs font-medium">{item.title}</TableCell>
                                <TableCell className="text-xs">{item.start_date || '-'}</TableCell>
                              </>
                            )}
                            {fileType === 'textbook_list' && (
                              <>
                                <TableCell className="text-xs">{item.grade}학년</TableCell>
                                <TableCell className="text-xs font-medium">{item.subject}</TableCell>
                                <TableCell className="text-xs">{item.publisher}</TableCell>
                              </>
                            )}
                            {fileType === 'evaluation_plan' && (
                              <>
                                <TableCell className="text-xs font-medium">{item.subject}</TableCell>
                                <TableCell className="text-xs">{item.exam_type}</TableCell>
                                <TableCell className="text-xs truncate max-w-[150px]">{item.exam_range}</TableCell>
                              </>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => { setExtractedData(null); setFile(null); }}>
                      다시 분석
                    </Button>
                    <Button size="sm" onClick={handleSaveExtracted} disabled={savingExtracted || selectedItems.size === 0} className="flex-1 gap-1">
                      {savingExtracted && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      선택 항목 저장 ({selectedItems.size}개)
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={manualOpen} onOpenChange={setManualOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1">
              <Plus className="w-3.5 h-3.5" /> 수동 추가
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>일정 추가</DialogTitle></DialogHeader>
            <div className="space-y-3 mt-2">
              <div>
                <Label className="text-xs">일정 유형</Label>
                <Select value={manualForm.schedule_type} onValueChange={v => setManualForm(p => ({ ...p, schedule_type: v }))}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(SCHEDULE_TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">제목 *</Label>
                <Input value={manualForm.title} onChange={e => setManualForm(p => ({ ...p, title: e.target.value }))} className="h-8 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">시작일</Label>
                  <Input type="date" value={manualForm.start_date} onChange={e => setManualForm(p => ({ ...p, start_date: e.target.value }))} className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">종료일</Label>
                  <Input type="date" value={manualForm.end_date} onChange={e => setManualForm(p => ({ ...p, end_date: e.target.value }))} className="h-8 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">학년</Label>
                  <Input value={manualForm.grade} onChange={e => setManualForm(p => ({ ...p, grade: e.target.value }))} placeholder="1" className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">과목</Label>
                  <Input value={manualForm.subject} onChange={e => setManualForm(p => ({ ...p, subject: e.target.value }))} className="h-8 text-sm" />
                </div>
              </div>
              <Button size="sm" className="w-full" onClick={handleManualAdd}>추가</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Schedule list */}
      {schoolSchedules.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">등록된 일정이 없습니다</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>유형</TableHead>
                <TableHead>제목</TableHead>
                <TableHead>날짜</TableHead>
                <TableHead>학년</TableHead>
                <TableHead>과목</TableHead>
                <TableHead>D-day</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schoolSchedules.map(s => {
                const dday = getDday(s.start_date);
                return (
                  <TableRow key={s.id}>
                    <TableCell>
                      <Badge className={cn("text-[10px] border", SCHEDULE_TYPE_COLORS[s.schedule_type] || SCHEDULE_TYPE_COLORS.other)}>
                        {SCHEDULE_TYPE_LABELS[s.schedule_type] || s.schedule_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-medium">{s.title}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {s.start_date ? format(parseISO(s.start_date), 'MM/dd') : '-'}
                      {s.end_date && s.end_date !== s.start_date ? ` ~ ${format(parseISO(s.end_date), 'MM/dd')}` : ''}
                    </TableCell>
                    <TableCell className="text-xs">{s.grade ? `${s.grade}학년` : '-'}</TableCell>
                    <TableCell className="text-xs">{s.subject || '-'}</TableCell>
                    <TableCell>
                      {dday !== null && (
                        <span className={cn(
                          "text-xs font-bold",
                          dday < 0 ? "text-muted-foreground" : dday <= 30 ? "text-destructive" : dday <= 60 ? "text-orange-500" : "text-muted-foreground"
                        )}>
                          {dday < 0 ? '종료' : `D-${dday}`}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDelete(s.id)}>
                        <Trash2 className="w-3 h-3 text-muted-foreground" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
