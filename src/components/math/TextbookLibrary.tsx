import { useEffect, useState, useCallback } from 'react';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  Loader2, Plus, BookOpen, Upload, Trash2, Edit, FileText, Sparkles, Zap, Check, X, Video,
  FolderOpen, FolderPlus, ChevronDown, ChevronRight, RotateCw,
} from 'lucide-react';
import { MathRenderer } from './MathRenderer';
import { TextbookQuizGenerator } from './TextbookQuizGenerator';
import { compressImage } from '@/lib/imageCompression';

interface Textbook {
  id: string;
  title: string;
  publisher: string | null;
  subject: string;
  grade: string | null;
  course: string | null;
  description: string | null;
  created_at: string;
  folder: string | null;
}

interface TextbookExample {
  id: string;
  textbook_id: string;
  chapter: string;
  page_number: number | null;
  problem_number: string | null;
  question_text: string;
  answer: string | null;
  explanation: string | null;
  difficulty: string | null;
  category: string | null;
  graph_data: any;
  video_url: string | null;
  sort_order: number;
}

const SUBJECTS = ['수학', '영어', '국어', '과학', '사회', '기타'];
const MAX_PDF_EXTRACT_FILE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_EXTRACT_FILE_BYTES = 20 * 1024 * 1024;
const IMAGE_COMPRESS_TARGET_BYTES = 2 * 1024 * 1024;
const SUPPORTED_AI_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const isPdfUpload = (file: File) => {
  const type = (file.type || '').toLowerCase();
  return type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
};

const getUploadLimitBytes = (file: File) => (isPdfUpload(file) ? MAX_PDF_EXTRACT_FILE_BYTES : MAX_IMAGE_EXTRACT_FILE_BYTES);

/* ── VideoUrlEditor ── */
function VideoUrlEditor({ exampleId, currentUrl, onSaved }: { exampleId: string; currentUrl: string | null; onSaved: (url: string | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState(currentUrl || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const trimmed = url.trim() || null;
    const { error } = await supabase.from('textbook_examples').update({ video_url: trimmed } as any).eq('id', exampleId);
    if (!error) { onSaved(trimmed); setEditing(false); }
    setSaving(false);
  };

  if (!editing) {
    return (
      <div className="flex items-center gap-1 mt-1">
        {currentUrl ? (
          <a href={currentUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-blue-600 dark:text-blue-400 flex items-center gap-1 hover:underline">
            <Video className="w-3 h-3" /> 해설 영상
          </a>
        ) : null}
        <Button size="sm" variant="ghost" className="h-5 px-1 text-[10px] text-muted-foreground" onClick={() => { setEditing(true); setUrl(currentUrl || ''); }}>
          <Video className="w-3 h-3 mr-0.5" /> {currentUrl ? '영상 수정' : '영상 추가'}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 mt-1">
      <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://youtu.be/..." className="h-6 text-xs flex-1" autoFocus
        onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }} />
      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={handleSave} disabled={saving}><Check className="w-3 h-3 text-green-600" /></Button>
      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setEditing(false)}><X className="w-3 h-3" /></Button>
    </div>
  );
}


export function TextbookLibrary() {
  const { toast } = useToast();
  const [textbooks, setTextbooks] = useState<Textbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTextbook, setSelectedTextbook] = useState<Textbook | null>(null);
  const [examples, setExamples] = useState<TextbookExample[]>([]);
  const [loadingExamples, setLoadingExamples] = useState(false);

  // Add textbook form
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPublisher, setNewPublisher] = useState('');
  const [newSubject, setNewSubject] = useState('수학');
  const [newGrade, setNewGrade] = useState('');
  const [newCourse, setNewCourse] = useState('');
  const [newFolder, setNewFolder] = useState('');
  const [saving, setSaving] = useState(false);

  // Add example form
  const [showAddExample, setShowAddExample] = useState(false);
  const [exChapter, setExChapter] = useState('');
  const [exPage, setExPage] = useState('');
  const [exNumber, setExNumber] = useState('');
  const [exQuestion, setExQuestion] = useState('');
  const [exAnswer, setExAnswer] = useState('');
  const [exExplanation, setExExplanation] = useState('');
  const [exDifficulty, setExDifficulty] = useState('medium');
  const [savingExample, setSavingExample] = useState(false);

  // AI extraction — single merged title field
  const [extracting, setExtracting] = useState(false);
  const [extractFiles, setExtractFiles] = useState<File[]>([]);
  const [extractLabel, setExtractLabel] = useState('');
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; results: BatchResult[] } | null>(null);
  const [reExtractingId, setReExtractingId] = useState<string | null>(null);

  interface BatchResult { fileName: string; status: 'success' | 'error'; count?: number; message: string; reason?: string; }

  // Quiz generator
  const [showQuizGen, setShowQuizGen] = useState(false);

  // Inline editing
  const [editingTextbookId, setEditingTextbookId] = useState<string | null>(null);
  const [editingTextbookTitle, setEditingTextbookTitle] = useState('');
  const [editingExampleId, setEditingExampleId] = useState<string | null>(null);
  const [editingExampleNumber, setEditingExampleNumber] = useState('');
  const [editingChapter, setEditingChapter] = useState<string | null>(null);
  const [editingChapterName, setEditingChapterName] = useState('');

  // Folder management
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [folderSearch, setFolderSearch] = useState('');

  const toggleFolder = (folder: string) => {
    setCollapsedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folder)) next.delete(folder); else next.add(folder);
      return next;
    });
  };

  const handleRenameTextbook = async (id: string) => {
    const trimmed = editingTextbookTitle.trim();
    if (!trimmed) return;
    const { error } = await supabase.from('textbooks').update({ title: trimmed } as any).eq('id', id);
    if (error) { toast({ title: '수정 실패', variant: 'destructive' }); }
    else {
      toast({ title: '교재명이 수정되었습니다' });
      setTextbooks(prev => prev.map(tb => tb.id === id ? { ...tb, title: trimmed } : tb));
      if (selectedTextbook?.id === id) setSelectedTextbook(prev => prev ? { ...prev, title: trimmed } : prev);
    }
    setEditingTextbookId(null);
  };

  const handleRenameExample = async (id: string) => {
    const trimmed = editingExampleNumber.trim();
    const { error } = await supabase.from('textbook_examples').update({ problem_number: trimmed || null } as any).eq('id', id);
    if (error) { toast({ title: '수정 실패', variant: 'destructive' }); }
    else { setExamples(prev => prev.map(ex => ex.id === id ? { ...ex, problem_number: trimmed || null } : ex)); }
    setEditingExampleId(null);
  };

  const handleRenameChapter = async (oldName: string) => {
    const newName = editingChapterName.trim();
    if (!newName || !selectedTextbook || newName === oldName) { setEditingChapter(null); return; }
    const { error } = await supabase
      .from('textbook_examples')
      .update({ chapter: newName } as any)
      .eq('textbook_id', selectedTextbook.id)
      .eq('chapter', oldName);
    if (error) { toast({ title: '단원명 수정 실패', variant: 'destructive' }); }
    else {
      toast({ title: `"${oldName}" → "${newName}" 변경 완료` });
      setExamples(prev => prev.map(ex => ex.chapter === oldName ? { ...ex, chapter: newName } : ex));
    }
    setEditingChapter(null);
  };

  const handleMoveTextbookFolder = async (id: string, folder: string | null) => {
    const { error } = await supabase.from('textbooks').update({ folder } as any).eq('id', id);
    if (!error) {
      setTextbooks(prev => prev.map(tb => tb.id === id ? { ...tb, folder } : tb));
      toast({ title: folder ? `"${folder}" 폴더로 이동` : '폴더 해제됨' });
    }
  };

  const fetchTextbooks = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('textbooks').select('*').order('created_at', { ascending: false });
    if (error) { toast({ title: '오류', description: '교재 목록을 불러오지 못했습니다.', variant: 'destructive' }); }
    else { setTextbooks((data as any[]) || []); }
    setLoading(false);
  }, [toast]);

  const fetchExamples = useCallback(async (textbookId: string) => {
    setLoadingExamples(true);
    const { data, error } = await supabase.from('textbook_examples').select('*').eq('textbook_id', textbookId).order('sort_order', { ascending: true });
    if (!error) { setExamples((data as any[]) || []); }
    setLoadingExamples(false);
  }, []);

  useEffect(() => { fetchTextbooks(); }, [fetchTextbooks]);
  useEffect(() => { if (selectedTextbook) fetchExamples(selectedTextbook.id); else setExamples([]); }, [selectedTextbook, fetchExamples]);

  const handleAddTextbook = async () => {
    if (!newTitle.trim()) { toast({ title: '교재명을 입력하세요', variant: 'destructive' }); return; }
    setSaving(true);
    const { error } = await supabase.from('textbooks').insert({
      title: newTitle.trim(), publisher: newPublisher.trim() || null, subject: newSubject,
      grade: newGrade.trim() || null, course: newCourse.trim() || null, folder: newFolder.trim() || null,
    } as any);
    if (error) { toast({ title: '저장 실패', description: error.message, variant: 'destructive' }); }
    else { toast({ title: '교재가 등록되었습니다' }); setNewTitle(''); setNewPublisher(''); setNewGrade(''); setNewCourse(''); setNewFolder(''); setShowAddDialog(false); fetchTextbooks(); }
    setSaving(false);
  };

  const handleDeleteTextbook = async (id: string) => {
    if (!confirm('이 교재와 모든 예제를 삭제하시겠습니까?')) return;
    const { error } = await supabase.from('textbooks').delete().eq('id', id);
    if (error) { toast({ title: '삭제 실패', variant: 'destructive' }); }
    else { if (selectedTextbook?.id === id) setSelectedTextbook(null); fetchTextbooks(); }
  };

  const handleAddExample = async () => {
    if (!selectedTextbook || !exQuestion.trim()) return;
    setSavingExample(true);
    const { error } = await supabase.from('textbook_examples').insert({
      textbook_id: selectedTextbook.id, chapter: exChapter.trim() || '기타',
      page_number: exPage ? parseInt(exPage) : null, problem_number: exNumber.trim() || null,
      question_text: exQuestion.trim(), answer: exAnswer.trim() || null, explanation: exExplanation.trim() || null,
      difficulty: exDifficulty, sort_order: examples.length,
    } as any);
    if (error) { toast({ title: '저장 실패', variant: 'destructive' }); }
    else { toast({ title: '예제가 등록되었습니다' }); setExChapter(''); setExPage(''); setExNumber(''); setExQuestion(''); setExAnswer(''); setExExplanation(''); setShowAddExample(false); fetchExamples(selectedTextbook.id); }
    setSavingExample(false);
  };

  const handleDeleteExample = async (id: string) => {
    const { error } = await supabase.from('textbook_examples').delete().eq('id', id);
    if (!error && selectedTextbook) fetchExamples(selectedTextbook.id);
  };

  const handleDeleteChapter = async (chapter: string) => {
    if (!selectedTextbook) return;
    const count = chapterGroups[chapter]?.length || 0;
    if (!confirm(`"${chapter}" 단원의 ${count}개 문항을 모두 삭제하시겠습니까?`)) return;
    const { error } = await supabase.from('textbook_examples').delete().eq('textbook_id', selectedTextbook.id).eq('chapter', chapter);
    if (error) { toast({ title: '단원 삭제 실패', description: error.message, variant: 'destructive' }); }
    else { toast({ title: `"${chapter}" 단원 ${count}개 문항 삭제 완료` }); fetchExamples(selectedTextbook.id); }
  };

  const handleReExtractExample = async (exampleId: string) => {
    if (!selectedTextbook) return;
    const ex = examples.find(e => e.id === exampleId);
    if (!ex) return;

    setReExtractingId(exampleId);
    try {
      const { data, error } = await supabase.functions.invoke('rewrite-quiz-question', {
        body: {
          quiz_id: '__textbook_re_extract__',
          question_index: 0,
          rewrite_mode: 'fix_code',
          question: {
            question_number: 1,
            question_type: 'short_answer',
            question_text: ex.question_text,
            answer: ex.answer || '',
            explanation: ex.explanation || '',
            difficulty: ex.difficulty || 'medium',
          },
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const newQ = data.question;
      const { error: updateErr } = await supabase
        .from('textbook_examples')
        .update({
          question_text: newQ.question_text || ex.question_text,
          answer: newQ.answer || ex.answer,
          explanation: newQ.explanation || ex.explanation,
        } as any)
        .eq('id', exampleId);

      if (updateErr) throw updateErr;

      setExamples(prev => prev.map(e => e.id === exampleId ? {
        ...e,
        question_text: newQ.question_text || e.question_text,
        answer: newQ.answer || e.answer,
        explanation: newQ.explanation || e.explanation,
      } : e));

      toast({ title: '문항 재추출 완료', description: '수식과 텍스트가 정리되었습니다.' });
    } catch (err: any) {
      toast({ title: '재추출 실패', description: err.message, variant: 'destructive' });
    } finally {
      setReExtractingId(null);
    }
  };

  const handleAIExtract = async () => {
    if (!selectedTextbook || extractFiles.length === 0) return;
    setExtracting(true);
    const results: BatchResult[] = [];
    setBatchProgress({ current: 0, total: extractFiles.length, results: [] });

    const parseInvokeError = async (error: any) => {
      let message = error?.message || 'AI 추출 호출 실패';
      let reason = '';
      if (error instanceof FunctionsHttpError) {
        try { const payload = await error.context.json(); if (payload?.error) message = payload.error; if (payload?.detail?.reason) reason = payload.detail.reason; } catch {}
      }
      if (message.includes('non-2xx')) { message = '서버 처리 중 메모리 제한으로 실패했습니다. PDF는 8MB 이하 또는 페이지별 이미지로 업로드해 주세요.'; reason = reason || 'edge_non_2xx'; }
      return { message, reason };
    };

    // Use the merged label as chapter name
    const chapterName = extractLabel.trim() || '전체';

    for (let i = 0; i < extractFiles.length; i++) {
      const rawFile = extractFiles[i];
      setBatchProgress({ current: i + 1, total: extractFiles.length, results: [...results] });
      try {
        let uploadFile = rawFile;
        const pdfUpload = isPdfUpload(uploadFile);
        const imageUpload = uploadFile.type.startsWith('image/');
        if (!pdfUpload && !imageUpload) { results.push({ fileName: rawFile.name, status: 'error', message: 'PDF 또는 이미지 파일만 지원됩니다.' }); continue; }
        if (imageUpload) {
          const shouldNormalize = uploadFile.size > IMAGE_COMPRESS_TARGET_BYTES || !SUPPORTED_AI_IMAGE_TYPES.has(uploadFile.type);
          if (shouldNormalize) uploadFile = await compressImage(uploadFile, 1800, 1800, 0.78);
          if (!SUPPORTED_AI_IMAGE_TYPES.has(uploadFile.type)) { results.push({ fileName: rawFile.name, status: 'error', message: 'PNG/JPEG/WEBP/GIF 형식만 지원됩니다.' }); continue; }
        }
        const maxBytes = getUploadLimitBytes(uploadFile);
        if (uploadFile.size > maxBytes) {
          const limitMb = Math.floor(maxBytes / 1024 / 1024);
          results.push({ fileName: rawFile.name, status: 'error', message: `파일이 너무 큽니다. ${limitMb}MB 이하로 줄여 주세요.`, reason: 'file_too_large' }); continue;
        }

        const formData = new FormData();
        formData.append('file', uploadFile);
        formData.append('textbook_id', selectedTextbook.id);
        formData.append('chapter', chapterName);
        formData.append('batch_label', `${i + 1}/${extractFiles.length}`);

        const { data, error } = await supabase.functions.invoke('extract-textbook-examples', { body: formData });
        if (error) { const parsed = await parseInvokeError(error); results.push({ fileName: rawFile.name, status: 'error', message: parsed.message, reason: parsed.reason }); continue; }
        if (!data?.success) {
          const detail = data?.detail; const reason = detail?.reason || '';
          let msg = data?.error || 'AI 추출 실패';
          if (reason === 'pdf_too_large' || reason === 'request_too_large') msg = 'PDF가 너무 큽니다. 페이지 단위 이미지로 나누어 업로드해 주세요.';
          results.push({ fileName: rawFile.name, status: 'error', message: msg, reason }); continue;
        }
        const catSummary = data.categorySummary;
        const catDesc = catSummary ? Object.entries(catSummary).map(([k, v]) => `${k} ${v}개`).join(', ') : '';
        results.push({ fileName: rawFile.name, status: 'success', count: data.count, message: `${data.count}개 추출 (${catDesc})` });
      } catch (err: any) { results.push({ fileName: rawFile.name, status: 'error', message: err.message || '알 수 없는 오류' }); }
    }

    setBatchProgress({ current: extractFiles.length, total: extractFiles.length, results });
    const successCount = results.filter(r => r.status === 'success').length;
    const totalExtracted = results.reduce((sum, r) => sum + (r.count || 0), 0);
    const firstError = results.find((r) => r.status === 'error');
    toast({
      title: `${successCount}/${extractFiles.length}개 파일 처리 완료`,
      description: totalExtracted > 0 ? `총 ${totalExtracted}개 문항 추출` : (firstError?.message || '추출된 문항이 없습니다.'),
      variant: successCount === 0 ? 'destructive' : undefined,
    });
    setExtractFiles([]); setExtractLabel('');
    if (selectedTextbook) fetchExamples(selectedTextbook.id);
    setExtracting(false);
  };

  const chapterGroups = examples.reduce<Record<string, TextbookExample[]>>((acc, ex) => {
    const ch = ex.chapter || '기타';
    if (!acc[ch]) acc[ch] = [];
    acc[ch].push(ex);
    return acc;
  }, {});

  const difficultyLabel: Record<string, string> = { easy: '쉬움', medium: '보통', hard: '어려움' };
  const difficultyColor: Record<string, string> = {
    easy: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    hard: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  };
  const categoryLabel: Record<string, string> = { '일반문항': '일반', '예제': '예제', '활동형': '활동', '사고력': '사고력', '마무리': '마무리' };
  const categoryColor: Record<string, string> = {
    '일반문항': 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    '예제': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    '활동형': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    '사고력': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    '마무리': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  };

  // Folder grouping
  const existingFolders = [...new Set(textbooks.map(tb => tb.folder).filter(Boolean) as string[])].sort();
  const folderGrouped: Record<string, Textbook[]> = {};
  const ungrouped: Textbook[] = [];
  for (const tb of textbooks) {
    if (folderSearch) {
      const q = folderSearch.toLowerCase();
      if (!tb.title.toLowerCase().includes(q) && !(tb.folder || '').toLowerCase().includes(q)) continue;
    }
    if (tb.folder) {
      if (!folderGrouped[tb.folder]) folderGrouped[tb.folder] = [];
      folderGrouped[tb.folder].push(tb);
    } else {
      ungrouped.push(tb);
    }
  }

  const renderTextbookItem = (tb: Textbook) => (
    <div
      key={tb.id}
      onClick={() => setSelectedTextbook(tb)}
      className={`p-2.5 rounded-lg cursor-pointer border transition-colors ${
        selectedTextbook?.id === tb.id ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-muted/50'
      }`}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0 flex-1">
          {editingTextbookId === tb.id ? (
            <div className="flex items-center gap-1">
              <Input value={editingTextbookTitle} onChange={e => setEditingTextbookTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleRenameTextbook(tb.id); if (e.key === 'Escape') setEditingTextbookId(null); }}
                className="h-7 text-sm" autoFocus onClick={e => e.stopPropagation()} />
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0" onClick={e => { e.stopPropagation(); handleRenameTextbook(tb.id); }}><Check className="w-3.5 h-3.5 text-green-600" /></Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0" onClick={e => { e.stopPropagation(); setEditingTextbookId(null); }}><X className="w-3.5 h-3.5" /></Button>
            </div>
          ) : (
            <p className="text-sm font-medium truncate">{tb.title}</p>
          )}
          <p className="text-xs text-muted-foreground">{[tb.publisher, tb.subject, tb.grade].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {editingTextbookId !== tb.id && (
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
              onClick={e => { e.stopPropagation(); setEditingTextbookId(tb.id); setEditingTextbookTitle(tb.title); }}>
              <Edit className="w-3.5 h-3.5 text-muted-foreground" />
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
            onClick={e => { e.stopPropagation(); handleDeleteTextbook(tb.id); }}>
            <Trash2 className="w-3.5 h-3.5 text-destructive" />
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">교재 라이브러리</h2>
          <p className="text-xs text-muted-foreground">교재별 대표 예제를 등록하고 관리합니다</p>
        </div>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5"><Plus className="w-4 h-4" /> 교재 추가</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>새 교재 등록</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">교재명 *</Label>
                <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="개념원리 수학(상)" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">출판사</Label>
                  <Input value={newPublisher} onChange={e => setNewPublisher(e.target.value)} placeholder="개념원리" />
                </div>
                <div>
                  <Label className="text-xs">과목</Label>
                  <Select value={newSubject} onValueChange={setNewSubject}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">학년</Label>
                  <Input value={newGrade} onChange={e => setNewGrade(e.target.value)} placeholder="고1" />
                </div>
                <div>
                  <Label className="text-xs">과정</Label>
                  <Input value={newCourse} onChange={e => setNewCourse(e.target.value)} placeholder="공통수학1" />
                </div>
              </div>
              <div>
                <Label className="text-xs">폴더 (선택)</Label>
                <div className="flex gap-2">
                  <Input value={newFolder} onChange={e => setNewFolder(e.target.value)} placeholder="예: 고1 수학" className="flex-1" list="folder-suggestions" />
                  <datalist id="folder-suggestions">
                    {existingFolders.map(f => <option key={f} value={f} />)}
                  </datalist>
                </div>
              </div>
              <Button onClick={handleAddTextbook} disabled={saving} className="w-full">
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null} 등록
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Textbook list with folders */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <BookOpen className="w-4 h-4" /> 교재 목록
            </CardTitle>
            <Input placeholder="교재/폴더 검색" value={folderSearch} onChange={e => setFolderSearch(e.target.value)} className="h-7 text-xs mt-1" />
          </CardHeader>
          <CardContent className="space-y-1 max-h-[60vh] overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : textbooks.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">등록된 교재가 없습니다</p>
            ) : (
              <>
                {/* Folder groups */}
                {Object.entries(folderGrouped).sort(([a], [b]) => a.localeCompare(b)).map(([folder, items]) => {
                  const isCollapsed = collapsedFolders.has(folder);
                  return (
                    <div key={folder} className="mb-1">
                      <button
                        onClick={() => toggleFolder(folder)}
                        className="flex items-center gap-1.5 w-full text-left px-2 py-1.5 rounded-md hover:bg-muted/50 text-xs font-semibold text-muted-foreground"
                      >
                        {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        <FolderOpen className="w-3.5 h-3.5" />
                        {folder}
                        <Badge variant="secondary" className="text-[10px] ml-auto">{items.length}</Badge>
                      </button>
                      {!isCollapsed && (
                        <div className="pl-3 space-y-0.5">
                          {items.map(renderTextbookItem)}
                        </div>
                      )}
                    </div>
                  );
                })}
                {/* Ungrouped */}
                {ungrouped.length > 0 && Object.keys(folderGrouped).length > 0 && (
                  <div className="px-2 py-1 text-[10px] text-muted-foreground font-medium">미분류</div>
                )}
                {ungrouped.map(renderTextbookItem)}
              </>
            )}
          </CardContent>
        </Card>

        {/* Right: Examples */}
        <Card className="lg:col-span-2">
          {selectedTextbook ? (
            <>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">{selectedTextbook.title}</CardTitle>
                    <CardDescription className="text-xs">
                      {[selectedTextbook.publisher, selectedTextbook.grade, selectedTextbook.course].filter(Boolean).join(' · ')}
                      {selectedTextbook.folder && <> · 📁 {selectedTextbook.folder}</>}
                      {' · '}{examples.length}개 예제
                    </CardDescription>
                    {/* Folder move */}
                    <div className="flex items-center gap-1 mt-1">
                      <FolderPlus className="w-3 h-3 text-muted-foreground" />
                      <select
                        className="text-[11px] bg-transparent border rounded px-1 py-0.5 text-muted-foreground"
                        value={selectedTextbook.folder || ''}
                        onChange={e => {
                          const val = e.target.value || null;
                          handleMoveTextbookFolder(selectedTextbook.id, val);
                          setSelectedTextbook(prev => prev ? { ...prev, folder: val } : prev);
                        }}
                      >
                        <option value="">폴더 없음</option>
                        {existingFolders.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                      <Input
                        placeholder="새 폴더명"
                        className="h-5 text-[11px] w-24"
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            const val = (e.target as HTMLInputElement).value.trim();
                            if (val) {
                              handleMoveTextbookFolder(selectedTextbook.id, val);
                              setSelectedTextbook(prev => prev ? { ...prev, folder: val } : prev);
                              (e.target as HTMLInputElement).value = '';
                            }
                          }
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" className="gap-1 text-xs h-8" onClick={() => setShowQuizGen(true)} disabled={examples.length === 0}>
                      <Zap className="w-3.5 h-3.5" /> 퀴즈 생성
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1 text-xs h-8" onClick={() => setShowAddExample(true)}>
                      <Plus className="w-3.5 h-3.5" /> 수동 추가
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* AI Extraction — merged single field */}
                <Card className="border-dashed">
                  <CardContent className="p-3 space-y-2">
                    <p className="text-xs font-medium flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-primary" />
                      AI 자동 추출 (PDF/이미지) — 여러 파일 동시 업로드 가능
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <Input type="file" accept=".pdf,image/*" multiple className="text-xs h-8 col-span-1"
                        onChange={e => {
                          const files = Array.from(e.target.files || []);
                          const valid: File[] = [];
                          for (const f of files) {
                            const maxBytes = getUploadLimitBytes(f);
                            if (f.size > maxBytes) { toast({ title: '용량 초과', description: `${f.name}: ${Math.floor(maxBytes / 1024 / 1024)}MB 초과`, variant: 'destructive' }); continue; }
                            if (!isPdfUpload(f) && !f.type.startsWith('image/')) { toast({ title: '지원하지 않는 형식', description: `${f.name}: PDF 또는 이미지만 가능`, variant: 'destructive' }); continue; }
                            valid.push(f);
                          }
                          setExtractFiles(valid);
                        }}
                      />
                      <Input value={extractLabel} onChange={e => setExtractLabel(e.target.value)}
                        placeholder="제목/단원명 (선택)" className="text-xs h-8" />
                      <Button size="sm" className="h-8 text-xs gap-1" disabled={extractFiles.length === 0 || extracting} onClick={handleAIExtract}>
                        {extracting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                        {extractFiles.length > 1 ? `${extractFiles.length}개 추출` : '추출하기'}
                      </Button>
                    </div>
                    {extractFiles.length > 0 && !extracting && (
                      <p className="text-[11px] text-muted-foreground">{extractFiles.map(f => f.name).join(', ')}</p>
                    )}
                    {batchProgress && extracting && (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="w-3 h-3 animate-spin" /><span>처리 중: {batchProgress.current}/{batchProgress.total}</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-1.5">
                          <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }} />
                        </div>
                      </div>
                    )}
                    {batchProgress && !extracting && batchProgress.results.length > 0 && (
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {batchProgress.results.map((r, i) => (
                          <div key={i} className={`flex items-center gap-2 text-xs p-1.5 rounded ${r.status === 'success' ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
                            {r.status === 'success' ? <Badge variant="secondary" className="text-[10px] shrink-0">✓ {r.count}개</Badge> : <Badge variant="destructive" className="text-[10px] shrink-0">✗</Badge>}
                            <span className="truncate font-medium">{r.fileName}</span>
                            <span className="text-muted-foreground ml-auto shrink-0 text-[10px]">{r.status === 'error' ? r.message : ''}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="text-[11px] text-muted-foreground">💡 페이지별 이미지로 나누어 업로드하면 더 정확하게 추출됩니다. PDF는 8MB 이하만 처리 가능합니다.</p>
                  </CardContent>
                </Card>

                {/* Manual add */}
                <Dialog open={showAddExample} onOpenChange={setShowAddExample}>
                  <DialogContent>
                    <DialogHeader><DialogTitle>예제 수동 등록</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <div className="grid grid-cols-3 gap-2">
                        <div><Label className="text-xs">단원</Label><Input value={exChapter} onChange={e => setExChapter(e.target.value)} placeholder="I. 지수함수" className="h-8 text-sm" /></div>
                        <div><Label className="text-xs">페이지</Label><Input value={exPage} onChange={e => setExPage(e.target.value)} placeholder="42" type="number" className="h-8 text-sm" /></div>
                        <div><Label className="text-xs">문제번호</Label><Input value={exNumber} onChange={e => setExNumber(e.target.value)} placeholder="예제 3" className="h-8 text-sm" /></div>
                      </div>
                      <div><Label className="text-xs">문제 *</Label><Textarea value={exQuestion} onChange={e => setExQuestion(e.target.value)} placeholder="$x^2 + 2x + 1 = 0$의 근을 구하시오." rows={3} /></div>
                      <div><Label className="text-xs">정답</Label><Input value={exAnswer} onChange={e => setExAnswer(e.target.value)} placeholder="$x = -1$ (중근)" className="h-8 text-sm" /></div>
                      <div><Label className="text-xs">해설</Label><Textarea value={exExplanation} onChange={e => setExExplanation(e.target.value)} rows={2} /></div>
                      <div><Label className="text-xs">난이도</Label>
                        <Select value={exDifficulty} onValueChange={setExDifficulty}><SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="easy">쉬움</SelectItem><SelectItem value="medium">보통</SelectItem><SelectItem value="hard">어려움</SelectItem></SelectContent>
                        </Select>
                      </div>
                      <Button onClick={handleAddExample} disabled={savingExample || !exQuestion.trim()} className="w-full">{savingExample ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}등록</Button>
                    </div>
                  </DialogContent>
                </Dialog>

                {/* Examples list by chapter */}
                {loadingExamples ? (
                  <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                ) : examples.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">등록된 예제가 없습니다. PDF를 업로드하여 AI로 추출하거나 수동으로 추가하세요.</p>
                ) : (
                  <Accordion type="multiple" defaultValue={Object.keys(chapterGroups)} className="space-y-2">
                    {Object.entries(chapterGroups).map(([chapter, items]) => (
                      <AccordionItem key={chapter} value={chapter} className="border rounded-lg px-3">
                        <AccordionTrigger className="py-2 text-sm hover:no-underline">
                          <div className="flex items-center gap-2 flex-1">
                            <FileText className="w-4 h-4 text-muted-foreground" />
                            {editingChapter === chapter ? (
                              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                <Input value={editingChapterName} onChange={e => setEditingChapterName(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') handleRenameChapter(chapter); if (e.key === 'Escape') setEditingChapter(null); }}
                                  className="h-6 text-xs w-40" autoFocus />
                                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={e => { e.stopPropagation(); handleRenameChapter(chapter); }}><Check className="w-3 h-3 text-green-600" /></Button>
                                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={e => { e.stopPropagation(); setEditingChapter(null); }}><X className="w-3 h-3" /></Button>
                              </div>
                            ) : (
                              <>
                                <span className="font-medium">{chapter}</span>
                                <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={e => { e.stopPropagation(); setEditingChapter(chapter); setEditingChapterName(chapter); }}>
                                  <Edit className="w-3 h-3 text-muted-foreground" />
                                </Button>
                              </>
                            )}
                            <Badge variant="secondary" className="text-xs">{items.length}문항</Badge>
                            <Button size="sm" variant="ghost" className="h-6 px-1.5 ml-auto" onClick={e => { e.stopPropagation(); handleDeleteChapter(chapter); }}>
                              <Trash2 className="w-3 h-3 text-destructive" /><span className="text-[10px] text-destructive ml-0.5">단원 삭제</span>
                            </Button>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="space-y-2 pb-3">
                          {items.map((ex, idx) => (
                            <div key={ex.id} className="p-3 rounded-md border bg-muted/30 space-y-1.5">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {editingExampleId === ex.id ? (
                                    <div className="flex items-center gap-1">
                                      <Input value={editingExampleNumber} onChange={e => setEditingExampleNumber(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') handleRenameExample(ex.id); if (e.key === 'Escape') setEditingExampleId(null); }}
                                        className="h-6 text-xs w-28" placeholder="문항 제목" autoFocus />
                                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => handleRenameExample(ex.id)}><Check className="w-3 h-3 text-green-600" /></Button>
                                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setEditingExampleId(null)}><X className="w-3 h-3" /></Button>
                                    </div>
                                  ) : (
                                    <>
                                      <Badge variant="outline" className="text-xs">{ex.problem_number || `#${idx + 1}`}</Badge>
                                      <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => { setEditingExampleId(ex.id); setEditingExampleNumber(ex.problem_number || ''); }}>
                                        <Edit className="w-3 h-3 text-muted-foreground" />
                                      </Button>
                                    </>
                                  )}
                                  {ex.page_number && <span className="text-xs text-muted-foreground">p.{ex.page_number}</span>}
                                  {ex.category && ex.category !== '일반문항' && (
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${categoryColor[ex.category] || ''}`}>{categoryLabel[ex.category] || ex.category}</span>
                                  )}
                                  {ex.difficulty && <span className={`text-xs px-1.5 py-0.5 rounded ${difficultyColor[ex.difficulty] || ''}`}>{difficultyLabel[ex.difficulty] || ex.difficulty}</span>}
                                </div>
                                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => handleDeleteExample(ex.id)}><Trash2 className="w-3 h-3 text-destructive" /></Button>
                              </div>
                              <div className="text-sm"><MathRenderer text={ex.question_text} /></div>
                              {ex.answer && <div className="text-xs text-muted-foreground"><span className="font-medium">정답: </span><MathRenderer text={ex.answer} /></div>}
                              {ex.explanation && <div className="text-xs text-muted-foreground"><span className="font-medium">해설: </span><MathRenderer text={ex.explanation} /></div>}
                              <VideoUrlEditor exampleId={ex.id} currentUrl={ex.video_url} onSaved={url => setExamples(prev => prev.map(e => e.id === ex.id ? { ...e, video_url: url } : e))} />
                            </div>
                          ))}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                )}
              </CardContent>
            </>
          ) : (
            <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <BookOpen className="w-10 h-10 mb-3 opacity-50" />
              <p className="text-sm">왼쪽에서 교재를 선택하세요</p>
            </CardContent>
          )}
        </Card>
      </div>
      <TextbookQuizGenerator open={showQuizGen} onOpenChange={setShowQuizGen} textbook={selectedTextbook} examples={examples} />
    </div>
  );
}
