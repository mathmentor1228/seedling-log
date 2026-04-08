import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { cn, getTodayKST } from '@/lib/utils';
import { Upload, Plus, Trash2, Loader2, ScanLine, Pencil } from 'lucide-react';
import { format, differenceInDays, parseISO } from 'date-fns';
import { useAuth } from '@/lib/auth';
import type { Schedule } from './types';
import { SCHEDULE_TYPE_LABELS, SCHEDULE_TYPE_COLORS } from './types';
import { buildSchoolCalendarScheduleRow, fileToDataUrl, isGlobalMockExam } from './scheduleUploadUtils';
import { ExamTimetableGrid } from './ExamTimetableGrid';

interface Props {
  schoolName: string;
  schedules: Schedule[];
  archives: any[];
  onRefetch: () => void;
}

export function ScheduleTab({ schoolName, schedules, archives, onRefetch }: Props) {
  const { user } = useAuth();
  const today = parseISO(getTodayKST());

  const getDday = (dateStr: string | null) => {
    if (!dateStr) return null;
    return differenceInDays(parseISO(dateStr), today);
  };

  const schoolSchedules = schedules.filter(s => s.school_name === schoolName);
  const visibleSchedules = schoolSchedules.filter(
    (schedule) => schedule.schedule_type !== 'exam' || !schedule.start_date || getDday(schedule.start_date) === null || getDday(schedule.start_date)! >= -120
  );
  const [uploadOpen, setUploadOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [examScanOpen, setExamScanOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState('school_calendar');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [extractedData, setExtractedData] = useState<any[] | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [savingExtracted, setSavingExtracted] = useState(false);

  // Exam scan state
  const [examFile, setExamFile] = useState<File | null>(null);
  const [examScanning, setExamScanning] = useState(false);
  const [examResult, setExamResult] = useState<any | null>(null);

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

  const today = parseISO(getTodayKST());

  // --- Inline edit extracted data ---
  const updateExtractedItem = (index: number, field: string, value: any) => {
    if (!extractedData) return;
    const updated = [...extractedData];
    updated[index] = { ...updated[index], [field]: value };
    setExtractedData(updated);
  };

  const handleUploadAndAnalyze = async () => {
    if (!file) { toast.error('파일을 선택해주세요'); return; }
    setUploading(true);
    try {
      const fileDataUrl = await fileToDataUrl(file);

      setUploading(false);
      setAnalyzing(true);

      const { data: result, error } = await supabase.functions.invoke('analyze-school-document', {
        body: {
          fileDataUrl,
          fileName: file.name,
          fileMimeType: file.type || null,
          fileType,
          subjectFilter,
          schoolName,
        },
      });

      if (error || result?.error) {
        toast.error(error?.message || result?.error || 'AI 분석 실패');
        setAnalyzing(false);
        return;
      }

      let items: any[] = [];
      if (fileType === 'school_calendar' && result.data?.schedules) {
        items = result.data.schedules;
      } else if (fileType === 'textbook_list' && result.data?.textbooks) {
        items = result.data.textbooks;
      } else if (fileType === 'evaluation_plan' && result.data?.evaluations) {
        items = result.data.evaluations;
      } else if (fileType === 'other' && result.data?.schedules) {
        items = result.data.schedules;
      }

      setExtractedData(items);
      setSelectedItems(new Set(items.map((_, i) => i)));
      toast.success(`${items.length}개 항목이 추출되었습니다`);
    } catch (err: any) {
      toast.error(err.message || '문서 분석 실패');
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

      if (fileType === 'school_calendar' || fileType === 'other') {
        const rows = selected
          .map((s: any) => buildSchoolCalendarScheduleRow(s, schoolName, user?.id))
          .filter((row): row is NonNullable<typeof row> => Boolean(row));

        const globalMockExamCount = selected.filter((item: any) => isGlobalMockExam(item)).length;
        const { error } = await supabase.from('school_schedules').insert(rows as any);
        if (error) throw error;

        if (globalMockExamCount > 0) {
          toast.success(`모의고사 ${globalMockExamCount}개는 전체일정으로 분리 저장되었습니다`);
        }
      } else if (fileType === 'textbook_list') {
        const rows = selected.map((t: any) => ({
          school_name: schoolName,
          grade: t.grade || null,
          subject: t.subject,
          publisher: t.publisher || null,
          textbook_name: t.textbook_name || null,
          author: t.author || null,
          course_name: t.course_name || null,
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

        // Also update/create matching school_exam_archives for evaluation plans
        const currentYear = new Date().getFullYear();
        const schoolLevel = schoolName.includes('초') ? '초' : schoolName.includes('중') ? '중' : '고';
        for (const e of selected) {
          if (!e.subject || !e.grade) continue;
          const baseSubject = normalizeSubjectForArchive(e.subject);
          const examType = normalizeExamType(e.exam_type);
          const semester = e.semester ? `${e.semester}학기` : '1학기';

          const { data: existing } = await (supabase as any)
            .from('school_exam_archives')
            .select('id')
            .eq('school_name', schoolName)
            .eq('grade_year', e.grade)
            .eq('academic_year', currentYear)
            .eq('subject', baseSubject)
            .eq('exam_type', examType)
            .eq('semester', semester);

          if (existing && existing.length > 0) {
            const updates: any = { updated_at: new Date().toISOString() };
            if (e.exam_range) updates.exam_scope = e.exam_range;
            if (e.evaluation_ratio) updates.grade_ratio = e.evaluation_ratio;
            if (e.performance_detail) updates.performance_assessment_info = e.performance_detail;
            if (e.exam_start_date) updates.exam_date_start = e.exam_start_date;
            if (e.exam_end_date) updates.exam_date_end = e.exam_end_date;
            await (supabase as any).from('school_exam_archives').update(updates).eq('id', existing[0].id);
          } else {
            await (supabase as any).from('school_exam_archives').insert({
              school_name: schoolName,
              school_level: schoolLevel,
              grade_year: e.grade,
              subject: baseSubject,
              academic_year: currentYear,
              semester,
              exam_type: examType,
              exam_scope: e.exam_range || null,
              grade_ratio: e.evaluation_ratio || null,
              performance_assessment_info: e.performance_detail || null,
              exam_date_start: e.exam_start_date || null,
              exam_date_end: e.exam_end_date || null,
              status: '자료수집완료',
              created_by: user?.id,
            });
          }
        }
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

  // --- Exam scope scan ---
  const handleExamScan = async () => {
    if (!examFile) { toast.error('파일을 선택해주세요'); return; }
    setExamScanning(true);
    try {
      const imageDataUrl = await fileToDataUrl(examFile);

      const { data: result, error } = await supabase.functions.invoke('scan-exam-schedule', {
        body: {
          image_url: imageDataUrl,
          school_name: schoolName,
        },
      });

      if (error || result?.error) {
        toast.error(error?.message || result?.error || 'AI 분석 실패');
        return;
      }

      setExamResult(result.extracted || {});
      toast.success('시험 범위/일정 추출 완료');
    } catch (err: any) {
      toast.error(err.message || '분석 실패');
    } finally {
      setExamScanning(false);
    }
  };

  const updateExamSubject = (index: number, field: string, value: string) => {
    if (!examResult?.subjects) return;
    const updated = { ...examResult };
    updated.subjects = [...updated.subjects];
    updated.subjects[index] = { ...updated.subjects[index], [field]: value };
    setExamResult(updated);
  };

  // Normalize AI-extracted subject names to base archive subjects
  const normalizeSubjectForArchive = (name: string): string => {
    const n = name.trim();
    if (/^공통수학|^수학|^대수|^미적분|^확률|^기하/i.test(n)) return '수학';
    if (/^공통영어|^영어/i.test(n)) return '영어';
    if (/^공통국어|^국어|^문학|^독서|^화법/i.test(n)) return '국어';
    if (/^통합과학|^과학|^물리|^화학|^생명|^지구/i.test(n)) return '과학';
    if (/^통합사회|^사회|^한국지리|^세계지리|^경제/i.test(n)) return '사회';
    if (/^한국사/i.test(n)) return '한국사';
    return n;
  };

  // Derive course_name for high school subjects (e.g. 공통수학I → 공통수학1)
  const deriveCourseNameFromSubject = (rawName: string, baseSubject: string): string | null => {
    if (rawName === baseSubject) return null; // No specific course
    return rawName.trim();
  };

  // Normalize exam_type from AI output
  const normalizeExamType = (raw: string | null): string => {
    if (!raw) return '중간고사';
    if (/1차지필|1차 정기|중간/i.test(raw)) return '중간고사';
    if (/2차지필|2차 정기|기말/i.test(raw)) return '기말고사';
    return raw;
  };

  const handleSaveExamResult = async () => {
    if (!examResult?.subjects?.length) return;
    setSavingExtracted(true);
    try {
      const currentYear = new Date().getFullYear();
      const examType = normalizeExamType(examResult.exam_type);

      // 1. Deduplicate school_schedules: delete old AI-extracted exams for same school+grade+subject+exam_type
      const uniqueGradeSubjects = new Map<string, { grade: number; subject: string }>();
      for (const s of examResult.subjects) {
        const grade = s.grade ? parseInt(String(s.grade)) : null;
        if (!grade || !s.subject_name) continue;
        const key = `${grade}-${s.subject_name}`;
        if (!uniqueGradeSubjects.has(key)) {
          uniqueGradeSubjects.set(key, { grade, subject: s.subject_name });
        }
      }

      // Delete existing AI-extracted schedules for same school/grade/subject to prevent duplicates
      for (const { grade, subject } of uniqueGradeSubjects.values()) {
        await supabase
          .from('school_schedules')
          .delete()
          .eq('school_name', schoolName)
          .eq('schedule_type', 'exam')
          .eq('is_ai_extracted', true)
          .eq('grade', grade)
          .eq('subject', subject);
      }

      // 2. Insert fresh schedule rows
      const rows = examResult.subjects.map((s: any) => ({
        school_name: schoolName,
        schedule_type: 'exam',
        title: `${examType} - ${s.subject_name}`,
        start_date: s.exam_date || examResult.exam_date_start || null,
        end_date: s.exam_date || examResult.exam_date_end || null,
        grade: s.grade ? parseInt(String(s.grade)) || null : null,
        subject: s.subject_name || null,
        description: s.exam_scope || null,
        is_ai_extracted: true,
        created_by: user?.id,
      }));

      const { error } = await supabase.from('school_schedules').insert(rows as any);
      if (error) throw error;

      // 3. Match or create school_exam_archives entries per subject
      let matchedCount = 0;
      let createdCount = 0;

      // Determine school_level from school name
      const schoolLevel = schoolName.includes('초') ? '초' : schoolName.includes('중') ? '중' : '고';

      for (const subj of examResult.subjects) {
        if (!subj.subject_name) continue;
        const grade = subj.grade ? parseInt(String(subj.grade)) : null;
        if (!grade) continue;

        const baseSubject = normalizeSubjectForArchive(subj.subject_name);
        const courseName = deriveCourseNameFromSubject(subj.subject_name, baseSubject);

        // Try to find existing archive record
        const { data: matchedArchives } = await (supabase as any)
          .from('school_exam_archives')
          .select('id')
          .eq('school_name', schoolName)
          .eq('grade_year', grade)
          .eq('academic_year', currentYear)
          .eq('subject', baseSubject)
          .eq('exam_type', examType)
          .eq('semester', '1학기'); // Default to current semester

        if (matchedArchives && matchedArchives.length > 0) {
          // Update existing archive(s)
          const updatePayload: any = {
            updated_at: new Date().toISOString(),
          };
          if (subj.exam_scope) updatePayload.exam_scope = subj.exam_scope;
          if (courseName) updatePayload.course_name = courseName;
          if (examResult.exam_date_start) updatePayload.exam_date_start = examResult.exam_date_start;
          if (examResult.exam_date_end) updatePayload.exam_date_end = examResult.exam_date_end;

          for (const archive of matchedArchives) {
            await (supabase as any)
              .from('school_exam_archives')
              .update(updatePayload)
              .eq('id', archive.id);
            matchedCount++;
          }
        } else {
          // Create new archive entry
          const newArchive = {
            school_name: schoolName,
            school_level: schoolLevel,
            grade_year: grade,
            subject: baseSubject,
            course_name: courseName || null,
            academic_year: currentYear,
            semester: '1학기',
            exam_type: examType,
            exam_scope: subj.exam_scope || null,
            exam_date_start: examResult.exam_date_start || null,
            exam_date_end: examResult.exam_date_end || null,
            status: '자료수집완료',
            created_by: user?.id,
          };
          await (supabase as any).from('school_exam_archives').insert(newArchive);
          createdCount++;
        }
      }

      const msgs: string[] = [`${rows.length}개 과목 시험 일정 저장`];
      if (matchedCount > 0) msgs.push(`내신자료 ${matchedCount}건 업데이트`);
      if (createdCount > 0) msgs.push(`내신자료 ${createdCount}건 신규 생성`);
      toast.success(msgs.join(' / '));
      setExamResult(null);
      setExamFile(null);
      setExamScanOpen(false);
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
    return differenceInDays(parseISO(dateStr), today);
  };

  return (
    <div className="space-y-4">
      {/* Upload + Exam Scan + Manual buttons */}
      <div className="flex gap-2 flex-wrap">
        <Dialog open={uploadOpen} onOpenChange={v => { setUploadOpen(v); if (!v) { setExtractedData(null); setFile(null); } }}>
          <DialogTrigger asChild>
            <Button className="gap-1.5 bg-orange-500 hover:bg-orange-600 text-white">
              <Upload className="w-4 h-4" /> 파일 업로드
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
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
                    {uploading ? '파일 준비 중...' : analyzing ? 'AI가 문서를 분석 중입니다...' : (
                      <><ScanLine className="w-4 h-4" /> AI로 자동 분석</>
                    )}
                  </Button>
                </>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm font-medium">추출된 데이터 ({extractedData.length}개) — 클릭하여 수정 가능</p>
                  <div className="max-h-[400px] overflow-y-auto border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-8">
                            <Checkbox
                              checked={selectedItems.size === extractedData.length}
                              onCheckedChange={c => setSelectedItems(c ? new Set(extractedData!.map((_, i) => i)) : new Set())}
                            />
                          </TableHead>
                          {(fileType === 'school_calendar' || fileType === 'other') && <><TableHead>유형</TableHead><TableHead>제목</TableHead><TableHead>시작일</TableHead><TableHead>종료일</TableHead></>}
                          {fileType === 'textbook_list' && <><TableHead>학년</TableHead><TableHead>과목</TableHead><TableHead>과정명</TableHead><TableHead>출판사</TableHead><TableHead>교과서명</TableHead><TableHead>저자</TableHead></>}
                          {fileType === 'evaluation_plan' && <><TableHead>과목</TableHead><TableHead>시험유형</TableHead><TableHead>범위</TableHead><TableHead>비율</TableHead></>}
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
                            {(fileType === 'school_calendar' || fileType === 'other') && (
                              <>
                                <TableCell>
                                  <Select value={item.schedule_type || 'other'} onValueChange={v => updateExtractedItem(i, 'schedule_type', v)}>
                                    <SelectTrigger className="h-7 text-[11px] w-[80px]"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      {Object.entries(SCHEDULE_TYPE_LABELS).map(([k, v]) => (
                                        <SelectItem key={k} value={k}>{v}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell>
                                  <Input
                                    value={item.title || ''}
                                    onChange={e => updateExtractedItem(i, 'title', e.target.value)}
                                    className="h-7 text-[11px] min-w-[120px]"
                                  />
                                </TableCell>
                                <TableCell>
                                  <Input
                                    type="date"
                                    value={item.start_date || ''}
                                    onChange={e => updateExtractedItem(i, 'start_date', e.target.value)}
                                    className="h-7 text-[11px] w-[130px]"
                                  />
                                </TableCell>
                                <TableCell>
                                  <Input
                                    type="date"
                                    value={item.end_date || ''}
                                    onChange={e => updateExtractedItem(i, 'end_date', e.target.value)}
                                    className="h-7 text-[11px] w-[130px]"
                                  />
                                </TableCell>
                              </>
                            )}
                            {fileType === 'textbook_list' && (
                              <>
                                <TableCell>
                                  <Input value={item.grade ?? ''} onChange={e => updateExtractedItem(i, 'grade', e.target.value ? parseInt(e.target.value) : null)} className="h-7 text-[11px] w-[50px]" />
                                </TableCell>
                                <TableCell>
                                  <Input value={item.subject || ''} onChange={e => updateExtractedItem(i, 'subject', e.target.value)} className="h-7 text-[11px] min-w-[60px]" />
                                </TableCell>
                                <TableCell>
                                  <Input value={item.course_name || ''} onChange={e => updateExtractedItem(i, 'course_name', e.target.value)} className="h-7 text-[11px] min-w-[80px]" placeholder="과정명" />
                                </TableCell>
                                <TableCell>
                                  <Input value={item.publisher || ''} onChange={e => updateExtractedItem(i, 'publisher', e.target.value)} className="h-7 text-[11px] min-w-[60px]" />
                                </TableCell>
                                <TableCell>
                                  <Input value={item.textbook_name || ''} onChange={e => updateExtractedItem(i, 'textbook_name', e.target.value)} className="h-7 text-[11px] min-w-[80px]" />
                                </TableCell>
                                <TableCell>
                                  <Input value={item.author || ''} onChange={e => updateExtractedItem(i, 'author', e.target.value)} className="h-7 text-[11px] min-w-[60px]" placeholder="저자명" />
                                </TableCell>
                              </>
                            )}
                            {fileType === 'evaluation_plan' && (
                              <>
                                <TableCell>
                                  <Input value={item.subject || ''} onChange={e => updateExtractedItem(i, 'subject', e.target.value)} className="h-7 text-[11px] min-w-[60px]" />
                                </TableCell>
                                <TableCell>
                                  <Input value={item.exam_type || ''} onChange={e => updateExtractedItem(i, 'exam_type', e.target.value)} className="h-7 text-[11px] min-w-[70px]" />
                                </TableCell>
                                <TableCell>
                                  <Input value={item.exam_range || ''} onChange={e => updateExtractedItem(i, 'exam_range', e.target.value)} className="h-7 text-[11px] min-w-[120px]" />
                                </TableCell>
                                <TableCell>
                                  <Input value={item.evaluation_ratio || ''} onChange={e => updateExtractedItem(i, 'evaluation_ratio', e.target.value)} className="h-7 text-[11px] min-w-[80px]" />
                                </TableCell>
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

        {/* Exam scope scan */}
        <Dialog open={examScanOpen} onOpenChange={v => { setExamScanOpen(v); if (!v) { setExamResult(null); setExamFile(null); } }}>
          <DialogTrigger asChild>
            <Button variant="outline" className="gap-1.5">
              <ScanLine className="w-4 h-4" /> 시험범위 스캔
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>시험범위/일정 AI 스캔</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-2">
              {!examResult ? (
                <>
                  <p className="text-xs text-muted-foreground">시험범위표나 시험일정표 이미지/PDF를 업로드하면 AI가 자동으로 과목별 시험 일정과 범위를 추출합니다.</p>
                  <div>
                    <Label className="text-sm">파일 선택 (이미지 / PDF)</Label>
                    <Input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.webp"
                      onChange={e => setExamFile(e.target.files?.[0] || null)}
                      className="mt-1"
                    />
                  </div>
                  <Button
                    onClick={handleExamScan}
                    disabled={!examFile || examScanning}
                    className="w-full gap-2"
                  >
                    {examScanning && <Loader2 className="w-4 h-4 animate-spin" />}
                    {examScanning ? 'AI 분석 중...' : <><ScanLine className="w-4 h-4" /> 시험범위 추출</>}
                  </Button>
                </>
              ) : (
                <div className="space-y-4">
                  {/* General info */}
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs">시험 유형</Label>
                      <Input
                        value={examResult.exam_type || ''}
                        onChange={e => setExamResult((p: any) => ({ ...p, exam_type: e.target.value }))}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">시험 시작일</Label>
                      <Input
                        type="date"
                        value={examResult.exam_date_start || ''}
                        onChange={e => setExamResult((p: any) => ({ ...p, exam_date_start: e.target.value }))}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">시험 종료일</Label>
                      <Input
                        type="date"
                        value={examResult.exam_date_end || ''}
                        onChange={e => setExamResult((p: any) => ({ ...p, exam_date_end: e.target.value }))}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>

                  {/* Subjects */}
                  <div>
                    <p className="text-sm font-medium mb-2">과목별 시험 정보 ({examResult.subjects?.length || 0}개) — 수정 가능</p>
                    <div className="max-h-[350px] overflow-y-auto border rounded-lg">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>과목명</TableHead>
                            <TableHead>학년</TableHead>
                            <TableHead>시험일</TableHead>
                            <TableHead>시간</TableHead>
                            <TableHead>시험범위</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(examResult.subjects || []).map((subj: any, i: number) => (
                            <TableRow key={i}>
                              <TableCell>
                                <Input
                                  value={subj.subject_name || ''}
                                  onChange={e => updateExamSubject(i, 'subject_name', e.target.value)}
                                  className="h-7 text-[11px] min-w-[70px]"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  min={1}
                                  max={6}
                                  value={subj.grade || ''}
                                  onChange={e => updateExamSubject(i, 'grade', e.target.value)}
                                  className="h-7 text-[11px] w-[50px]"
                                  placeholder="학년"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="date"
                                  value={subj.exam_date || ''}
                                  onChange={e => updateExamSubject(i, 'exam_date', e.target.value)}
                                  className="h-7 text-[11px] w-[130px]"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="time"
                                  value={subj.exam_time || ''}
                                  onChange={e => updateExamSubject(i, 'exam_time', e.target.value)}
                                  className="h-7 text-[11px] w-[100px]"
                                />
                              </TableCell>
                              <TableCell>
                                <Textarea
                                  value={subj.exam_scope || ''}
                                  onChange={e => updateExamSubject(i, 'exam_scope', e.target.value)}
                                  className="text-[11px] min-h-[32px] min-w-[150px]"
                                  rows={1}
                                />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  {examResult.notes && (
                    <div>
                      <Label className="text-xs">참고사항</Label>
                      <Textarea
                        value={examResult.notes}
                        onChange={e => setExamResult((p: any) => ({ ...p, notes: e.target.value }))}
                        className="text-xs min-h-[40px]"
                        rows={2}
                      />
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => { setExamResult(null); setExamFile(null); }}>
                      다시 스캔
                    </Button>
                    <Button size="sm" onClick={handleSaveExamResult} disabled={savingExtracted} className="flex-1 gap-1">
                      {savingExtracted && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      일정으로 저장
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

      {/* Schedule list - grouped by type with better readability */}
      {visibleSchedules.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">등록된 일정이 없습니다</p>
      ) : (
        <div className="space-y-6">
          {/* Upcoming exams highlight */}
          {(() => {
            const upcomingExams = visibleSchedules
              .filter(s => s.schedule_type === 'exam' && s.start_date && getDday(s.start_date)! >= 0)
              .sort((a, b) => getDday(a.start_date)! - getDday(b.start_date)!);
            if (upcomingExams.length === 0) return null;
            return (
              <div className="rounded-xl border-2 border-destructive/20 bg-destructive/5 p-4 space-y-2">
                <h3 className="text-sm font-bold text-destructive flex items-center gap-1.5">
                  🔥 다가오는 시험
                </h3>
                <div className="space-y-2">
                  {upcomingExams.map(s => {
                    const dday = getDday(s.start_date)!;
                    return (
                      <div key={s.id} className="flex items-center gap-3 bg-background rounded-lg px-3 py-2 border">
                        <Badge className={cn(
                          "text-xs font-bold px-2.5 py-0.5 min-w-[52px] justify-center shadow-sm",
                          dday === 0 ? "bg-destructive text-destructive-foreground" :
                          dday <= 7 ? "bg-destructive/90 text-destructive-foreground" :
                          dday <= 14 ? "bg-orange-500 text-white" :
                          "bg-amber-500 text-white"
                        )}>
                          {dday === 0 ? 'D-Day' : `D-${dday}`}
                        </Badge>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium">{s.title}</span>
                          {s.grade && <span className="text-xs text-muted-foreground ml-2">{s.grade}학년</span>}
                          {s.subject && <span className="text-xs text-muted-foreground ml-1">· {s.subject}</span>}
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {s.start_date ? format(parseISO(s.start_date), 'MM/dd') : ''}
                          {s.end_date && s.end_date !== s.start_date ? ` ~ ${format(parseISO(s.end_date), 'MM/dd')}` : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Exam timetable grid - date×grade view */}
          <ExamTimetableGrid
            schedules={visibleSchedules}
            archives={archives.filter((archive) => archive.school_name === schoolName)}
          />

          {/* All schedules grouped by type */}
          {(['exam', 'performance', 'holiday', 'event', 'other'] as const).map(type => {
            const items = visibleSchedules.filter(s => s.schedule_type === type);
            if (items.length === 0) return null;
            return (
              <div key={type} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge className={cn("text-xs border", SCHEDULE_TYPE_COLORS[type])}>
                    {SCHEDULE_TYPE_LABELS[type]}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{items.length}건</span>
                  <div className="flex-1 border-t border-dashed" />
                </div>
                <div className="grid gap-1.5">
                  {items
                    .sort((a, b) => {
                      if (!a.start_date && !b.start_date) return 0;
                      if (!a.start_date) return 1;
                      if (!b.start_date) return -1;
                      return b.start_date.localeCompare(a.start_date);
                    })
                    .map(s => {
                    const dday = getDday(s.start_date);
                    const isFuture = dday !== null && dday >= 0;
                    const isPast = dday !== null && dday < 0;
                    return (
                      <div
                        key={s.id}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2 border transition-colors group",
                          isFuture ? "bg-background border-border" : "bg-muted/30 border-transparent"
                        )}
                      >
                        {/* Date column */}
                        <div className="w-[80px] shrink-0 text-center">
                          {s.start_date ? (
                            <div>
                              <div className={cn("text-xs font-medium", isPast && "text-muted-foreground")}>
                                {format(parseISO(s.start_date), 'MM/dd')}
                              </div>
                              {s.end_date && s.end_date !== s.start_date && (
                                <div className="text-[10px] text-muted-foreground">
                                  ~{format(parseISO(s.end_date), 'MM/dd')}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">날짜 미정</span>
                          )}
                        </div>

                        {/* Title + meta */}
                        <div className="flex-1 min-w-0">
                          <span className={cn("text-sm", isPast ? "text-muted-foreground" : "font-medium")}>{s.title}</span>
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                            {s.grade && <span className="text-[10px] text-muted-foreground">{s.grade}학년</span>}
                            {s.subject && <span className="text-[10px] text-muted-foreground">· {s.subject}</span>}
                          </div>
                          {s.description && (
                            <p className="mt-1 text-[10px] leading-4 text-muted-foreground whitespace-pre-wrap break-words">
                              {s.description}
                            </p>
                          )}
                        </div>

                        {/* D-day */}
                        <div className="w-[60px] text-right shrink-0">
                          {dday !== null && (
                            <span className={cn(
                              "text-xs font-bold",
                              dday === 0 ? "text-destructive" :
                              dday > 0 && dday <= 14 ? "text-destructive" :
                              dday > 0 && dday <= 30 ? "text-orange-500" :
                              dday > 0 ? "text-blue-500" :
                              "text-muted-foreground"
                            )}>
                              {dday === 0 ? 'D-Day' : dday > 0 ? `D-${dday}` : `D+${Math.abs(dday)}`}
                            </span>
                          )}
                        </div>

                        {/* Delete */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                          onClick={() => handleDelete(s.id)}
                        >
                          <Trash2 className="w-3 h-3 text-muted-foreground" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
