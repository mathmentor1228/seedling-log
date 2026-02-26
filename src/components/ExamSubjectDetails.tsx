import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Plus, Upload, FileText, Trash2, Download, Save, BookOpen } from 'lucide-react';

interface ExamSubjectDetail {
  id: string;
  event_id: string;
  subject_name: string;
  exam_date: string | null;
  exam_time: string | null;
  exam_scope: string | null;
  paper_storage_path: string | null;
  paper_original_name: string | null;
  paper_mime_type: string | null;
  paper_file_size: number | null;
  uploaded_by: string | null;
}

const DEFAULT_SUBJECTS = ['국어', '영어', '수학', '사회', '과학', '역사', '도덕', '기술가정', '음악', '미술', '체육'];

interface Props {
  eventId: string;
  examStartDate?: string;
  examEndDate?: string | null;
}

export function ExamSubjectDetails({ eventId, examStartDate, examEndDate }: Props) {
  const { user } = useAuth();
  const [details, setDetails] = useState<ExamSubjectDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addingSubject, setAddingSubject] = useState(false);
  const [newSubject, setNewSubject] = useState('');

  // Edit state for each row
  const [editData, setEditData] = useState<Record<string, {
    exam_date: string;
    exam_time: string;
    exam_scope: string;
  }>>({});

  useEffect(() => {
    fetchDetails();
  }, [eventId]);

  async function fetchDetails() {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('exam_subject_details')
        .select('*')
        .eq('event_id', eventId)
        .order('subject_name');

      if (error) throw error;
      setDetails((data as ExamSubjectDetail[]) || []);

      // Initialize edit state
      const edits: typeof editData = {};
      for (const d of (data || [])) {
        edits[d.id] = {
          exam_date: d.exam_date || '',
          exam_time: d.exam_time || '',
          exam_scope: d.exam_scope || '',
        };
      }
      setEditData(edits);
    } catch (err) {
      console.error('Failed to fetch exam details:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddSubject(subjectName: string) {
    if (!subjectName.trim()) return;
    setAddingSubject(true);
    try {
      const { error } = await (supabase as any).from('exam_subject_details').insert({
        event_id: eventId,
        subject_name: subjectName.trim(),
        uploaded_by: user?.id,
      });
      if (error) {
        if (error.code === '23505') {
          toast.error('이미 추가된 과목입니다');
        } else {
          throw error;
        }
      } else {
        toast.success(`${subjectName} 추가됨`);
        setNewSubject('');
        fetchDetails();
      }
    } catch (err: any) {
      toast.error('추가 실패: ' + err.message);
    } finally {
      setAddingSubject(false);
    }
  }

  async function handleSaveRow(id: string) {
    const data = editData[id];
    if (!data) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from('exam_subject_details')
        .update({
          exam_date: data.exam_date || null,
          exam_time: data.exam_time || null,
          exam_scope: data.exam_scope || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;
      toast.success('저장되었습니다');
      fetchDetails();
    } catch (err: any) {
      toast.error('저장 실패: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteRow(id: string, subjectName: string) {
    if (!confirm(`${subjectName} 과목을 삭제하시겠습니까?`)) return;
    try {
      const { error } = await (supabase as any).from('exam_subject_details').delete().eq('id', id);
      if (error) throw error;
      toast.success('삭제되었습니다');
      fetchDetails();
    } catch (err: any) {
      toast.error('삭제 실패: ' + err.message);
    }
  }

  async function handleUploadPaper(id: string, file: File) {
    try {
      const ext = file.name.split('.').pop();
      const path = `${eventId}/${id}_${Date.now()}.${ext}`;
      
      const { error: uploadError } = await supabase.storage
        .from('exam-papers')
        .upload(path, file);
      if (uploadError) throw uploadError;

      const { error: updateError } = await (supabase as any)
        .from('exam_subject_details')
        .update({
          paper_storage_path: path,
          paper_original_name: file.name,
          paper_mime_type: file.type,
          paper_file_size: file.size,
          uploaded_by: user?.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (updateError) throw updateError;

      toast.success('시험지 업로드 완료');
      fetchDetails();
    } catch (err: any) {
      toast.error('업로드 실패: ' + err.message);
    }
  }

  async function handleDownloadPaper(detail: ExamSubjectDetail) {
    if (!detail.paper_storage_path) return;
    try {
      const { data, error } = await supabase.storage
        .from('exam-papers')
        .createSignedUrl(detail.paper_storage_path, 60 * 5);
      if (error) throw error;
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank');
      }
    } catch (err: any) {
      toast.error('다운로드 실패: ' + err.message);
    }
  }

  async function handleDeletePaper(id: string, storagePath: string) {
    try {
      await supabase.storage.from('exam-papers').remove([storagePath]);
      await (supabase as any).from('exam_subject_details').update({
        paper_storage_path: null,
        paper_original_name: null,
        paper_mime_type: null,
        paper_file_size: null,
        updated_at: new Date().toISOString(),
      }).eq('id', id);
      toast.success('시험지 삭제됨');
      fetchDetails();
    } catch (err: any) {
      toast.error('삭제 실패: ' + err.message);
    }
  }

  function updateEdit(id: string, field: string, value: string) {
    setEditData(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  }

  // Available subjects (not yet added)
  const addedSubjects = new Set(details.map(d => d.subject_name));
  const availableSubjects = DEFAULT_SUBJECTS.filter(s => !addedSubjects.has(s));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        <span className="text-xs text-muted-foreground">과목별 일정 로딩...</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <BookOpen className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold">과목별 시험 일정</span>
        </div>
        <Badge variant="secondary" className="text-[10px]">
          {details.length}과목
        </Badge>
      </div>

      {/* Existing subjects */}
      {details.length > 0 ? (
        <div className="space-y-2">
          {details.map(detail => {
            const edit = editData[detail.id] || { exam_date: '', exam_time: '', exam_scope: '' };
            const hasChanges = 
              (edit.exam_date || '') !== (detail.exam_date || '') ||
              (edit.exam_time || '') !== (detail.exam_time || '') ||
              (edit.exam_scope || '') !== (detail.exam_scope || '');

            return (
              <div key={detail.id} className="border rounded-lg p-3 space-y-2 bg-card">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-xs font-semibold">{detail.subject_name}</Badge>
                  <div className="flex items-center gap-1">
                    {hasChanges && (
                      <Button
                        size="sm"
                        className="h-6 px-2 text-[10px] gap-1"
                        onClick={() => handleSaveRow(detail.id)}
                        disabled={saving}
                      >
                        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                        저장
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => handleDeleteRow(detail.id, detail.subject_name)}
                    >
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">시험 날짜</Label>
                    <Input
                      type="date"
                      value={edit.exam_date}
                      onChange={e => updateEdit(detail.id, 'exam_date', e.target.value)}
                      className="h-8 text-xs"
                      min={examStartDate}
                      max={examEndDate || undefined}
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">시험 시간</Label>
                    <Input
                      type="time"
                      value={edit.exam_time}
                      onChange={e => updateEdit(detail.id, 'exam_time', e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-[10px] text-muted-foreground">시험 범위</Label>
                  <Textarea
                    value={edit.exam_scope}
                    onChange={e => updateEdit(detail.id, 'exam_scope', e.target.value)}
                    placeholder="시험 범위를 입력하세요..."
                    className="text-xs min-h-[48px]"
                    rows={2}
                  />
                </div>

                {/* Paper upload */}
                <div>
                  <Label className="text-[10px] text-muted-foreground">시험지</Label>
                  {detail.paper_storage_path ? (
                    <div className="flex items-center gap-2 mt-1 p-2 bg-muted/50 rounded-md">
                      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-xs truncate flex-1">{detail.paper_original_name}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => handleDownloadPaper(detail)}
                      >
                        <Download className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => handleDeletePaper(detail.id, detail.paper_storage_path!)}
                      >
                        <Trash2 className="w-3 h-3 text-destructive" />
                      </Button>
                    </div>
                  ) : (
                    <label className="flex items-center gap-2 mt-1 p-2 border border-dashed rounded-md cursor-pointer hover:bg-accent/30 transition-colors">
                      <Upload className="w-4 h-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">시험지 파일 첨부</span>
                      <input
                        type="file"
                        className="hidden"
                        accept=".pdf,.doc,.docx,.hwp,.hwpx,.jpg,.jpeg,.png"
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (file) handleUploadPaper(detail.id, file);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-4 text-xs text-muted-foreground border rounded-lg bg-muted/30">
          아직 과목이 추가되지 않았습니다.
        </div>
      )}

      {/* Add subject */}
      <div className="space-y-2">
        <p className="text-[10px] font-semibold text-muted-foreground">과목 추가</p>
        <div className="flex flex-wrap gap-1">
          {availableSubjects.map(subj => (
            <Button
              key={subj}
              variant="outline"
              size="sm"
              className="h-6 text-[10px] px-2"
              disabled={addingSubject}
              onClick={() => handleAddSubject(subj)}
            >
              <Plus className="w-3 h-3 mr-0.5" />
              {subj}
            </Button>
          ))}
        </div>
        <div className="flex gap-1">
          <Input
            placeholder="기타 과목명..."
            value={newSubject}
            onChange={e => setNewSubject(e.target.value)}
            className="h-7 text-xs"
            onKeyDown={e => { if (e.key === 'Enter') handleAddSubject(newSubject); }}
          />
          <Button
            size="sm"
            className="h-7 text-xs px-2"
            disabled={!newSubject.trim() || addingSubject}
            onClick={() => handleAddSubject(newSubject)}
          >
            추가
          </Button>
        </div>
      </div>
    </div>
  );
}
