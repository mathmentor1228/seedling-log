// SCHOOL-EXAM-ARCHIVE-V2
// 학교별 내신 자료실 - 포괄적 시험/수행평가 관리, 진행상황 추적, 학원 준비자료, 시험후 분석
import { useState, useEffect, useCallback } from 'react';
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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Plus, FileUp, Trash2, Download, FileText, Image, File, Pencil, School, ChevronDown, ChevronRight, Paperclip, CalendarDays, Users, BarChart3, ClipboardCheck, Upload, X } from 'lucide-react';
import { format, differenceInDays, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';

interface Archive {
  id: string;
  school_name: string;
  school_level: string;
  grade_year: number;
  subject: string;
  academic_year: number;
  semester: string;
  exam_type: string;
  textbook_publisher: string | null;
  exam_scope: string | null;
  notes: string | null;
  exam_date_start: string | null;
  exam_date_end: string | null;
  post_exam_analysis: string | null;
  status: string;
  performance_assessment_info: string | null;
  grade_ratio: string | null;
  difficulty_level: string | null;
  exam_analysis_detail: string | null;
  preparing_teachers: string[] | null;
  exam_average_score: number | null;
  academy_prep_notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface Material {
  id: string;
  archive_id: string;
  file_category: string;
  original_name: string;
  storage_path: string;
  mime_type: string | null;
  file_size: number | null;
  description: string | null;
  uploaded_by: string | null;
  created_at: string;
}

const SCHOOL_LEVELS = ['초', '중', '고'];
const SUBJECTS = ['수학', '영어', '국어', '과학', '사회', '기타'];
const SEMESTERS = ['1학기', '2학기'];
const EXAM_TYPES = ['중간고사', '기말고사', '기타'];
const FILE_CATEGORIES = ['교과서', '기출시험지', '프린트', '시험범위', '시험지(실제)', '학원수업자료', '시험분석서', '기타'];
const DIFFICULTY_LEVELS = ['매우 쉬움', '쉬움', '보통', '어려움', '매우 어려움'];
const STATUS_OPTIONS = [
  { value: '자료수집전', label: '자료수집전', color: 'bg-muted text-muted-foreground' },
  { value: '자료수집완료', label: '자료수집완료', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
  { value: '시험대비중', label: '시험 D-Day', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' },
  { value: '시험완료', label: '시험완료', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
  { value: '시험분석요망', label: '분석요망', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
  { value: '시험분석완료', label: '분석완료', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' },
];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => currentYear - i);

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function getFileIcon(mimeType: string | null) {
  if (!mimeType) return <File className="w-4 h-4" />;
  if (mimeType.startsWith('image/')) return <Image className="w-4 h-4" />;
  if (mimeType.includes('pdf')) return <FileText className="w-4 h-4 text-destructive" />;
  return <File className="w-4 h-4" />;
}

function getStatusBadge(status: string) {
  const opt = STATUS_OPTIONS.find(s => s.value === status) || STATUS_OPTIONS[0];
  return <Badge className={`text-[10px] ${opt.color} border-0`}>{opt.label}</Badge>;
}

function getDdayText(examDateStart: string | null): string | null {
  if (!examDateStart) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const examDate = parseISO(examDateStart);
  const diff = differenceInDays(examDate, today);
  if (diff < 0) return null;
  if (diff === 0) return 'D-Day';
  return `D-${diff}`;
}

export function SchoolExamArchive() {
  const { user } = useAuth();

  // Filters
  const [filterYear, setFilterYear] = useState<string>(String(currentYear));
  const [filterSchool, setFilterSchool] = useState<string>('all');
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const [filterSubject, setFilterSubject] = useState<string>('all');
  const [filterSemester, setFilterSemester] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Data
  const [archives, setArchives] = useState<Archive[]>([]);
  const [materials, setMaterials] = useState<Record<string, Material[]>>({});
  const [schoolList, setSchoolList] = useState<string[]>([]);
  const [teacherList, setTeacherList] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedArchives, setExpandedArchives] = useState<Set<string>>(new Set());

  // Create/Edit dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingArchive, setEditingArchive] = useState<Archive | null>(null);
  const [formData, setFormData] = useState({
    school_name: '',
    school_level: '중',
    grade_year: 1,
    subject: '수학',
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
    preparing_teachers: [] as string[],
    exam_average_score: '',
    academy_prep_notes: '',
  });

  // Upload
  const [uploadArchiveId, setUploadArchiveId] = useState<string | null>(null);
  const [uploadCategory, setUploadCategory] = useState('기타');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const loadSchoolList = useCallback(async () => {
    const [studentsRes, archivesRes] = await Promise.all([
      supabase.from('students').select('school').not('school', 'is', null),
      supabase.from('school_exam_archives').select('school_name'),
    ]);
    const schools = new Set<string>();
    (studentsRes.data || []).forEach(s => { if (s.school) schools.add(s.school); });
    (archivesRes.data || []).forEach(a => schools.add(a.school_name));
    setSchoolList(Array.from(schools).sort());
  }, []);

  const loadTeachers = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('id, full_name').order('full_name');
    if (data) setTeacherList(data.map(p => ({ id: p.id, name: p.full_name })));
  }, []);

  const loadArchives = useCallback(async () => {
    setLoading(true);
    let query = (supabase as any).from('school_exam_archives').select('*').order('academic_year', { ascending: false }).order('school_name').order('grade_year');

    if (filterYear !== 'all') query = query.eq('academic_year', parseInt(filterYear));
    if (filterSchool !== 'all') query = query.eq('school_name', filterSchool);
    if (filterLevel !== 'all') query = query.eq('school_level', filterLevel);
    if (filterSubject !== 'all') query = query.eq('subject', filterSubject);
    if (filterSemester !== 'all') query = query.eq('semester', filterSemester);
    if (filterStatus !== 'all') query = query.eq('status', filterStatus);

    const { data, error } = await query;
    if (error) { toast.error('자료 로딩 실패'); console.error(error); }
    else setArchives((data as Archive[]) || []);
    setLoading(false);
  }, [filterYear, filterSchool, filterLevel, filterSubject, filterSemester, filterStatus]);

  const loadMaterials = useCallback(async (archiveId: string) => {
    const { data, error } = await supabase
      .from('school_exam_materials')
      .select('*')
      .eq('archive_id', archiveId)
      .order('file_category')
      .order('created_at', { ascending: false });
    if (!error && data) {
      setMaterials(prev => ({ ...prev, [archiveId]: data }));
    }
  }, []);

  useEffect(() => { loadSchoolList(); loadTeachers(); }, [loadSchoolList, loadTeachers]);
  useEffect(() => { loadArchives(); }, [loadArchives]);

  const toggleExpand = (id: string) => {
    setExpandedArchives(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); }
      else { next.add(id); loadMaterials(id); }
      return next;
    });
  };

  const handleSaveArchive = async () => {
    if (!formData.school_name.trim()) { toast.error('학교명을 입력해주세요'); return; }

    const payload: any = {
      school_name: formData.school_name.trim(),
      school_level: formData.school_level,
      grade_year: formData.grade_year,
      subject: formData.subject,
      academic_year: formData.academic_year,
      semester: formData.semester,
      exam_type: formData.exam_type,
      textbook_publisher: formData.textbook_publisher || null,
      exam_scope: formData.exam_scope || null,
      notes: formData.notes || null,
      exam_date_start: formData.exam_date_start || null,
      exam_date_end: formData.exam_date_end || null,
      post_exam_analysis: formData.post_exam_analysis || null,
      status: formData.status,
      performance_assessment_info: formData.performance_assessment_info || null,
      grade_ratio: formData.grade_ratio || null,
      difficulty_level: formData.difficulty_level || null,
      exam_analysis_detail: formData.exam_analysis_detail || null,
      preparing_teachers: formData.preparing_teachers.length > 0 ? formData.preparing_teachers : null,
      exam_average_score: formData.exam_average_score ? parseFloat(formData.exam_average_score) : null,
      academy_prep_notes: formData.academy_prep_notes || null,
      updated_at: new Date().toISOString(),
    };

    if (editingArchive) {
      const { error } = await (supabase as any).from('school_exam_archives').update(payload).eq('id', editingArchive.id);
      if (error) { toast.error('수정 실패'); return; }
      toast.success('자료 수정 완료');
    } else {
      const { error } = await (supabase as any).from('school_exam_archives').insert({ ...payload, created_by: user?.id });
      if (error) { toast.error('생성 실패'); console.error(error); return; }
      toast.success('자료 생성 완료');
    }

    setShowCreateDialog(false);
    setEditingArchive(null);
    loadArchives();
    loadSchoolList();
  };

  const openCreateDialog = () => {
    setEditingArchive(null);
    setFormData({
      school_name: filterSchool !== 'all' ? filterSchool : '',
      school_level: filterLevel !== 'all' ? filterLevel : '중',
      grade_year: 1,
      subject: filterSubject !== 'all' ? filterSubject : '수학',
      academic_year: filterYear !== 'all' ? parseInt(filterYear) : currentYear,
      semester: filterSemester !== 'all' ? filterSemester : '1학기',
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
      preparing_teachers: [],
      exam_average_score: '',
      academy_prep_notes: '',
    });
    setShowCreateDialog(true);
  };

  const openEditDialog = (archive: Archive) => {
    setEditingArchive(archive);
    setFormData({
      school_name: archive.school_name,
      school_level: archive.school_level,
      grade_year: archive.grade_year,
      subject: archive.subject,
      academic_year: archive.academic_year,
      semester: archive.semester,
      exam_type: archive.exam_type,
      textbook_publisher: archive.textbook_publisher || '',
      exam_scope: archive.exam_scope || '',
      notes: archive.notes || '',
      exam_date_start: archive.exam_date_start || '',
      exam_date_end: archive.exam_date_end || '',
      post_exam_analysis: archive.post_exam_analysis || '',
      status: archive.status || '자료수집전',
      performance_assessment_info: archive.performance_assessment_info || '',
      grade_ratio: archive.grade_ratio || '',
      difficulty_level: archive.difficulty_level || '',
      exam_analysis_detail: archive.exam_analysis_detail || '',
      preparing_teachers: archive.preparing_teachers || [],
      exam_average_score: archive.exam_average_score != null ? String(archive.exam_average_score) : '',
      academy_prep_notes: archive.academy_prep_notes || '',
    });
    setShowCreateDialog(true);
  };

  const handleDeleteArchive = async (id: string) => {
    const mats = materials[id] || [];
    if (mats.length > 0) {
      await supabase.storage.from('school-exam-materials').remove(mats.map(m => m.storage_path));
    }
    const { error } = await supabase.from('school_exam_archives').delete().eq('id', id);
    if (error) { toast.error('삭제 실패'); return; }
    toast.success('자료 삭제 완료');
    loadArchives();
  };

  const handleUploadFile = async () => {
    if (!uploadFile || !uploadArchiveId) return;
    setUploading(true);
    const path = `${uploadArchiveId}/${Date.now()}_${uploadFile.name}`;
    const { error: storageError } = await supabase.storage.from('school-exam-materials').upload(path, uploadFile);
    if (storageError) { toast.error('파일 업로드 실패'); setUploading(false); return; }
    const { error: dbError } = await supabase.from('school_exam_materials').insert({
      archive_id: uploadArchiveId,
      file_category: uploadCategory,
      original_name: uploadFile.name,
      storage_path: path,
      mime_type: uploadFile.type || null,
      file_size: uploadFile.size || null,
      description: uploadDescription || null,
      uploaded_by: user?.id,
    });
    if (dbError) { toast.error('자료 정보 저장 실패'); setUploading(false); return; }
    toast.success('파일 업로드 완료');
    const archId = uploadArchiveId;
    setUploadFile(null);
    setUploadDescription('');
    setUploadArchiveId(null);
    setUploading(false);
    loadMaterials(archId);
  };

  const handleDownloadFile = async (mat: Material) => {
    const { data, error } = await supabase.storage.from('school-exam-materials').createSignedUrl(mat.storage_path, 3600);
    if (error || !data?.signedUrl) { toast.error('다운로드 링크 생성 실패'); return; }
    window.open(data.signedUrl, '_blank');
  };

  const handleDeleteMaterial = async (mat: Material) => {
    await supabase.storage.from('school-exam-materials').remove([mat.storage_path]);
    await supabase.from('school_exam_materials').delete().eq('id', mat.id);
    toast.success('파일 삭제 완료');
    loadMaterials(mat.archive_id);
  };

  const handleQuickStatusChange = async (archiveId: string, newStatus: string) => {
    const { error } = await (supabase as any).from('school_exam_archives').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', archiveId);
    if (error) { toast.error('상태 변경 실패'); return; }
    toast.success('상태 변경 완료');
    loadArchives();
  };

  const toggleTeacher = (name: string) => {
    setFormData(p => ({
      ...p,
      preparing_teachers: p.preparing_teachers.includes(name)
        ? p.preparing_teachers.filter(t => t !== name)
        : [...p.preparing_teachers, name],
    }));
  };

  // Group archives by school
  const groupedArchives = archives.reduce<Record<string, Archive[]>>((acc, a) => {
    const key = `${a.school_name} (${a.school_level})`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(a);
    return acc;
  }, {});

  // Signed URL cache for inline image preview
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  const getSignedUrl = useCallback(async (storagePath: string) => {
    if (signedUrls[storagePath]) return signedUrls[storagePath];
    const { data, error } = await supabase.storage.from('school-exam-materials').createSignedUrl(storagePath, 3600);
    if (!error && data?.signedUrl) {
      setSignedUrls(prev => ({ ...prev, [storagePath]: data.signedUrl }));
      return data.signedUrl;
    }
    return null;
  }, [signedUrls]);

  // Load signed URLs for image materials when materials change
  useEffect(() => {
    const imageMats: Material[] = [];
    Object.values(materials).forEach(mats => {
      mats.forEach(m => {
        if (m.mime_type?.startsWith('image/') && !signedUrls[m.storage_path]) {
          imageMats.push(m);
        }
      });
    });
    if (imageMats.length > 0) {
      imageMats.forEach(m => getSignedUrl(m.storage_path));
    }
  }, [materials]);

  // School calendar images
  interface CalendarImage {
    id: string;
    school_name: string;
    school_level: string;
    academic_year: number;
    semester: string;
    storage_path: string;
    original_name: string;
    mime_type: string | null;
    created_at: string;
  }

  const [calendarImages, setCalendarImages] = useState<Record<string, CalendarImage[]>>({});
  const [calendarUrls, setCalendarUrls] = useState<Record<string, string>>({});
  const [calendarPreview, setCalendarPreview] = useState<string | null>(null);
  const [uploadingCalendar, setUploadingCalendar] = useState<string | null>(null);

  const loadCalendarImages = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from('school_calendar_images')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) { console.error(error); return; }
    const grouped: Record<string, CalendarImage[]> = {};
    for (const img of (data || [])) {
      const key = `${img.school_name} (${img.school_level})`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(img);
    }
    setCalendarImages(grouped);
    // Load signed URLs
    for (const img of (data || [])) {
      if (!calendarUrls[img.storage_path]) {
        supabase.storage.from('school-exam-materials').createSignedUrl(img.storage_path, 3600)
          .then(({ data: urlData }) => {
            if (urlData?.signedUrl) {
              setCalendarUrls(prev => ({ ...prev, [img.storage_path]: urlData.signedUrl }));
            }
          });
      }
    }
  }, []);

  useEffect(() => { loadCalendarImages(); }, [loadCalendarImages]);

  const handleUploadCalendarImage = async (schoolName: string, schoolLevel: string, file: File) => {
    const key = `${schoolName} (${schoolLevel})`;
    setUploadingCalendar(key);
    try {
      const path = `calendars/${schoolName}_${schoolLevel}_${Date.now()}_${file.name}`;
      const { error: storageError } = await supabase.storage.from('school-exam-materials').upload(path, file);
      if (storageError) throw storageError;

      const { error: dbError } = await (supabase as any).from('school_calendar_images').insert({
        school_name: schoolName,
        school_level: schoolLevel,
        academic_year: parseInt(filterYear) || currentYear,
        semester: filterSemester !== 'all' ? filterSemester : '1학기',
        storage_path: path,
        original_name: file.name,
        mime_type: file.type || null,
        file_size: file.size || null,
        uploaded_by: user?.id,
      });
      if (dbError) throw dbError;
      toast.success('학사일정표 업로드 완료');
      loadCalendarImages();
    } catch (err: any) {
      toast.error('업로드 실패: ' + err.message);
    } finally {
      setUploadingCalendar(null);
    }
  };

  const handleDeleteCalendarImage = async (img: CalendarImage) => {
    try {
      await supabase.storage.from('school-exam-materials').remove([img.storage_path]);
      await (supabase as any).from('school_calendar_images').delete().eq('id', img.id);
      toast.success('학사일정표 삭제됨');
      loadCalendarImages();
    } catch (err: any) {
      toast.error('삭제 실패: ' + err.message);
    }
  };

  const renderMaterialsByCategory = (archiveId: string, category: string, showInlineImages = false) => {
    const mats = (materials[archiveId] || []).filter(m => m.file_category === category);
    if (mats.length === 0) return null;
    return (
      <div className="space-y-2">
        {mats.map(mat => {
          const isImage = mat.mime_type?.startsWith('image/');
          const url = isImage ? signedUrls[mat.storage_path] : null;
          return (
            <div key={mat.id} className="space-y-1">
              <div className="flex items-center gap-2 p-1.5 rounded-md hover:bg-muted/50 group text-xs">
                {getFileIcon(mat.mime_type)}
                <span className="truncate flex-1">{mat.original_name}</span>
                <span className="text-muted-foreground">{formatFileSize(mat.file_size)}</span>
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100">
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDownloadFile(mat)}><Download className="w-3 h-3" /></Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDeleteMaterial(mat)}><Trash2 className="w-3 h-3" /></Button>
                </div>
              </div>
              {showInlineImages && isImage && url && (
                <div className="rounded-md overflow-hidden border bg-background">
                  <img
                    src={url}
                    alt={mat.original_name}
                    className="w-full max-h-[600px] object-contain cursor-pointer"
                    onClick={() => window.open(url, '_blank')}
                  />
                </div>
              )}
              {mat.description && <p className="text-xs text-muted-foreground pl-6">{mat.description}</p>}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <School className="w-5 h-5" />
            내신 자료실
          </h2>
          <p className="text-sm text-muted-foreground">학교별·학년별·과목별 시험/수행평가 자료 및 분석을 통합 관리합니다</p>
        </div>
        <Button onClick={openCreateDialog} size="sm">
          <Plus className="w-4 h-4 mr-1" /> 자료 추가
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Select value={filterYear} onValueChange={setFilterYear}>
          <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 연도</SelectItem>
            {YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}년</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterSchool} onValueChange={setFilterSchool}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 학교</SelectItem>
            {schoolList.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterLevel} onValueChange={setFilterLevel}>
          <SelectTrigger className="w-[90px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            {SCHOOL_LEVELS.map(l => <SelectItem key={l} value={l}>{l}등학교</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterSubject} onValueChange={setFilterSubject}>
          <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 과목</SelectItem>
            {SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterSemester} onValueChange={setFilterSemester}>
          <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 학기</SelectItem>
            {SEMESTERS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 상태</SelectItem>
            {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Archive List */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">로딩 중...</div>
      ) : archives.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <School className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>등록된 자료가 없습니다</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={openCreateDialog}>
            <Plus className="w-4 h-4 mr-1" /> 첫 자료 추가하기
          </Button>
        </div>
      ) : (
        Object.entries(groupedArchives).map(([schoolKey, items]) => {
          // Extract school_name and school_level from key like "신길중 (중)"
          const schoolName = items[0]?.school_name || '';
          const schoolLevel = items[0]?.school_level || '중';
          const calImgs = calendarImages[schoolKey] || [];

          return (
          <div key={schoolKey} className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground border-b pb-1">{schoolKey}</h3>

            {/* School Calendar Images */}
            <div className="flex items-center gap-2 flex-wrap">
              {calImgs.map(img => {
                const url = calendarUrls[img.storage_path];
                return (
                  <div key={img.id} className="relative group">
                    {url ? (
                      <img
                        src={url}
                        alt={img.original_name}
                        className="h-16 w-auto rounded-md border cursor-pointer hover:opacity-80 transition-opacity object-cover"
                        onClick={() => setCalendarPreview(url)}
                      />
                    ) : (
                      <div className="h-16 w-20 rounded-md border bg-muted flex items-center justify-center">
                        <CalendarDays className="w-5 h-5 text-muted-foreground" />
                      </div>
                    )}
                    <button
                      className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleDeleteCalendarImage(img)}
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                    <span className="text-[9px] text-muted-foreground block text-center mt-0.5 truncate max-w-[80px]">
                      {img.semester}
                    </span>
                  </div>
                );
              })}
              <label className={`h-16 w-16 rounded-md border-2 border-dashed flex flex-col items-center justify-center cursor-pointer hover:bg-accent/30 transition-colors ${uploadingCalendar === schoolKey ? 'opacity-50 pointer-events-none' : ''}`}>
                <Upload className="w-4 h-4 text-muted-foreground" />
                <span className="text-[9px] text-muted-foreground mt-0.5">일정표</span>
                <input
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handleUploadCalendarImage(schoolName, schoolLevel, file);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
            {items.map(archive => {
              const isExpanded = expandedArchives.has(archive.id);
              const archiveMaterials = materials[archive.id] || [];
              const dday = getDdayText(archive.exam_date_start);
              const showDday = dday && ['자료수집전', '자료수집완료', '시험대비중'].includes(archive.status);

              return (
                <Card key={archive.id} className="overflow-hidden">
                  <div
                    className="flex items-center gap-2 p-3 cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => toggleExpand(archive.id)}
                  >
                    {isExpanded ? <ChevronDown className="w-4 h-4 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {getStatusBadge(archive.status)}
                        <Badge variant="outline" className="text-xs">{archive.academic_year}</Badge>
                        <Badge variant="secondary" className="text-xs">{archive.school_level}{archive.grade_year}</Badge>
                        <Badge className="text-xs">{archive.subject}</Badge>
                        <span className="text-sm font-medium">{archive.semester} {archive.exam_type}</span>
                        {showDday && (
                          <Badge variant="destructive" className="text-[10px] animate-pulse">{dday}</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
                        {archive.textbook_publisher && <span>📖 {archive.textbook_publisher}</span>}
                        {archive.exam_date_start && (
                          <span>📅 {archive.exam_date_start}{archive.exam_date_end && archive.exam_date_end !== archive.exam_date_start ? `~${archive.exam_date_end}` : ''}</span>
                        )}
                        {archive.grade_ratio && <span>📊 {archive.grade_ratio}</span>}
                        {archive.preparing_teachers && archive.preparing_teachers.length > 0 && (
                          <span>👩‍🏫 {archive.preparing_teachers.join(', ')}</span>
                        )}
                        {archive.exam_average_score != null && (
                          <span>📈 평균 {archive.exam_average_score}점</span>
                        )}
                        {archiveMaterials.length > 0 && (
                          <span className="flex items-center gap-0.5"><Paperclip className="w-3 h-3" />{archiveMaterials.length}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditDialog(archive)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>자료 삭제</AlertDialogTitle>
                            <AlertDialogDescription>이 자료와 첨부된 모든 파일이 삭제됩니다. 계속하시겠습니까?</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>취소</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDeleteArchive(archive.id)}>삭제</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>

                  {isExpanded && (
                    <CardContent className="pt-0 pb-3 space-y-3 border-t">
                      {/* Quick status change */}
                      <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                        <span className="text-xs font-medium text-muted-foreground mr-1">진행상황:</span>
                        {STATUS_OPTIONS.map(s => (
                          <Button
                            key={s.value}
                            variant={archive.status === s.value ? 'default' : 'outline'}
                            size="sm"
                            className="h-6 text-[10px] px-2"
                            onClick={() => handleQuickStatusChange(archive.id, s.value)}
                          >
                            {s.label}
                          </Button>
                        ))}
                      </div>

                      <Tabs defaultValue="info" className="mt-2">
                        <TabsList className="h-8 flex-wrap">
                          <TabsTrigger value="info" className="text-xs h-7">📋 기본정보</TabsTrigger>
                          <TabsTrigger value="assessment" className="text-xs h-7">📊 평가구조</TabsTrigger>
                          <TabsTrigger value="prep" className="text-xs h-7">📚 학원준비자료</TabsTrigger>
                          <TabsTrigger value="materials" className="text-xs h-7">📎 첨부 ({archiveMaterials.length})</TabsTrigger>
                          <TabsTrigger value="analysis" className="text-xs h-7">🔍 시험후분석</TabsTrigger>
                        </TabsList>

                        {/* 기본정보 탭 */}
                        <TabsContent value="info" className="space-y-2 mt-2">
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                            <InfoRow label="교과서 출판사" value={archive.textbook_publisher} />
                            <InfoRow label="시험 기간" value={archive.exam_date_start ? `${archive.exam_date_start}${archive.exam_date_end && archive.exam_date_end !== archive.exam_date_start ? ` ~ ${archive.exam_date_end}` : ''}` : null} />
                            <InfoRow label="담당 선생님" value={archive.preparing_teachers?.join(', ')} />
                          </div>
                          {archive.exam_scope && (
                            <div className="mt-2">
                              <span className="text-xs font-medium text-muted-foreground">시험 범위:</span>
                              <p className="text-sm whitespace-pre-wrap mt-0.5 p-2 bg-muted/30 rounded-md">{archive.exam_scope}</p>
                            </div>
                          )}
                          {archive.notes && (
                            <div>
                              <span className="text-xs font-medium text-muted-foreground">메모:</span>
                              <p className="text-sm whitespace-pre-wrap mt-0.5">{archive.notes}</p>
                            </div>
                          )}
                          {!archive.textbook_publisher && !archive.exam_scope && !archive.notes && (
                            <p className="text-sm text-muted-foreground">등록된 정보가 없습니다. 수정 버튼을 눌러 정보를 추가해주세요.</p>
                          )}
                        </TabsContent>

                        {/* 평가구조 탭 */}
                        <TabsContent value="assessment" className="space-y-3 mt-2">
                          <div className="grid grid-cols-1 gap-2">
                            {archive.grade_ratio && (
                              <div className="p-3 bg-muted/30 rounded-md">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <BarChart3 className="w-3.5 h-3.5 text-muted-foreground" />
                                  <span className="text-xs font-semibold">반영 비율</span>
                                </div>
                                <p className="text-sm">{archive.grade_ratio}</p>
                              </div>
                            )}
                            {archive.performance_assessment_info && (
                              <div className="p-3 bg-muted/30 rounded-md">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <ClipboardCheck className="w-3.5 h-3.5 text-muted-foreground" />
                                  <span className="text-xs font-semibold">수행평가 정보</span>
                                </div>
                                <p className="text-sm whitespace-pre-wrap">{archive.performance_assessment_info}</p>
                              </div>
                            )}
                          </div>
                          {!archive.grade_ratio && !archive.performance_assessment_info && (
                            <p className="text-sm text-muted-foreground text-center py-4">
                              평가 구조 정보가 없습니다. 수정 버튼을 눌러 반영비율, 수행평가 정보를 입력해주세요.
                            </p>
                          )}
                        </TabsContent>

                        {/* 학원준비자료 탭 */}
                        <TabsContent value="prep" className="space-y-2 mt-2">
                          {archive.academy_prep_notes && (
                            <div className="p-3 bg-muted/30 rounded-md">
                              <span className="text-xs font-semibold">학원 수업/준비 내용</span>
                              <p className="text-sm whitespace-pre-wrap mt-1">{archive.academy_prep_notes}</p>
                            </div>
                          )}
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-semibold text-muted-foreground">학원수업자료 파일</span>
                              <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => { setUploadArchiveId(archive.id); setUploadCategory('학원수업자료'); }}>
                                <FileUp className="w-3 h-3 mr-1" /> 추가
                              </Button>
                            </div>
                            {renderMaterialsByCategory(archive.id, '학원수업자료') || (
                              <p className="text-xs text-muted-foreground text-center py-2">학원수업자료가 없습니다</p>
                            )}
                          </div>
                        </TabsContent>

                        {/* 첨부파일 탭 */}
                        <TabsContent value="materials" className="space-y-2 mt-2">
                          <div className="flex justify-end">
                            <Dialog open={uploadArchiveId === archive.id} onOpenChange={(open) => { if (!open) setUploadArchiveId(null); }}>
                              <DialogTrigger asChild>
                                <Button variant="outline" size="sm" onClick={() => setUploadArchiveId(archive.id)}>
                                  <FileUp className="w-3.5 h-3.5 mr-1" /> 파일 추가
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader><DialogTitle>파일 업로드</DialogTitle></DialogHeader>
                                <div className="space-y-3">
                                  <div>
                                    <Label>파일 분류</Label>
                                    <Select value={uploadCategory} onValueChange={setUploadCategory}>
                                      <SelectTrigger><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        {FILE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div>
                                    <Label>파일</Label>
                                    <Input type="file" onChange={e => setUploadFile(e.target.files?.[0] || null)} />
                                  </div>
                                  <div>
                                    <Label>설명 (선택)</Label>
                                    <Input value={uploadDescription} onChange={e => setUploadDescription(e.target.value)} placeholder="파일에 대한 간단한 설명" />
                                  </div>
                                  <Button onClick={handleUploadFile} disabled={!uploadFile || uploading} className="w-full">
                                    {uploading ? '업로드 중...' : '업로드'}
                                  </Button>
                                </div>
                              </DialogContent>
                            </Dialog>
                          </div>

                          {archiveMaterials.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-4">첨부된 파일이 없습니다</p>
                          ) : (
                            <div className="space-y-1">
                              {archiveMaterials.map(mat => (
                                <div key={mat.id} className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 group">
                                  {getFileIcon(mat.mime_type)}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">{mat.file_category}</Badge>
                                      <span className="text-sm truncate">{mat.original_name}</span>
                                      <span className="text-xs text-muted-foreground">{formatFileSize(mat.file_size)}</span>
                                    </div>
                                    {mat.description && <p className="text-xs text-muted-foreground truncate">{mat.description}</p>}
                                  </div>
                                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDownloadFile(mat)}>
                                      <Download className="w-3.5 h-3.5" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteMaterial(mat)}>
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </TabsContent>

                        {/* 시험후분석 탭 */}
                        <TabsContent value="analysis" className="space-y-3 mt-2">
                          <div className="grid grid-cols-2 gap-2">
                            {archive.difficulty_level && (
                              <div className="p-2 bg-muted/30 rounded-md">
                                <span className="text-[10px] font-medium text-muted-foreground">시험 난도</span>
                                <p className="text-sm font-semibold">{archive.difficulty_level}</p>
                              </div>
                            )}
                            {archive.exam_average_score != null && (
                              <div className="p-2 bg-muted/30 rounded-md">
                                <span className="text-[10px] font-medium text-muted-foreground">시험 평균</span>
                                <p className="text-sm font-semibold">{archive.exam_average_score}점</p>
                              </div>
                            )}
                          </div>

                          {archive.post_exam_analysis && (
                            <div>
                              <span className="text-xs font-semibold">출제 경향 분석</span>
                              <div className="whitespace-pre-wrap text-sm p-3 bg-muted/30 rounded-md mt-1">{archive.post_exam_analysis}</div>
                            </div>
                          )}

                          {archive.exam_analysis_detail && (
                            <div>
                              <span className="text-xs font-semibold">세부 시험 분석</span>
                              <div className="whitespace-pre-wrap text-sm p-3 bg-muted/30 rounded-md mt-1">{archive.exam_analysis_detail}</div>
                            </div>
                          )}

                          {/* Exam paper & analysis files */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-muted-foreground">시험지 (실제)</span>
                              <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => { setUploadArchiveId(archive.id); setUploadCategory('시험지(실제)'); }}>
                                <FileUp className="w-3 h-3 mr-1" /> 업로드
                              </Button>
                            </div>
                            {renderMaterialsByCategory(archive.id, '시험지(실제)', true) || (
                              <p className="text-xs text-muted-foreground text-center py-1">시험지가 아직 업로드되지 않았습니다</p>
                            )}
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-muted-foreground">시험분석서</span>
                              <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => { setUploadArchiveId(archive.id); setUploadCategory('시험분석서'); }}>
                                <FileUp className="w-3 h-3 mr-1" /> 업로드
                              </Button>
                            </div>
                            {renderMaterialsByCategory(archive.id, '시험분석서', true) || (
                              <p className="text-xs text-muted-foreground text-center py-1">시험분석서가 없습니다</p>
                            )}
                          </div>

                          {!archive.post_exam_analysis && !archive.exam_analysis_detail && !archive.difficulty_level && archive.exam_average_score == null && (
                            <p className="text-sm text-muted-foreground text-center py-2">
                              시험 분석이 아직 작성되지 않았습니다. 수정 버튼을 눌러 작성해주세요.
                            </p>
                          )}
                        </TabsContent>
                      </Tabs>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        );
        })
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingArchive ? '자료 수정' : '새 자료 추가'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* 기본 정보 */}
            <p className="text-xs font-semibold text-muted-foreground border-b pb-1">기본 정보</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>학교명 *</Label>
                <Input
                  value={formData.school_name}
                  onChange={e => setFormData(p => ({ ...p, school_name: e.target.value }))}
                  placeholder="예: 신길중"
                  list="school-suggestions"
                />
                <datalist id="school-suggestions">
                  {schoolList.map(s => <option key={s} value={s} />)}
                </datalist>
              </div>
              <div>
                <Label>학교 구분</Label>
                <Select value={formData.school_level} onValueChange={v => setFormData(p => ({ ...p, school_level: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SCHOOL_LEVELS.map(l => <SelectItem key={l} value={l}>{l}등학교</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>학년</Label>
                <Select value={String(formData.grade_year)} onValueChange={v => setFormData(p => ({ ...p, grade_year: parseInt(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{[1, 2, 3, 4, 5, 6].map(g => <SelectItem key={g} value={String(g)}>{g}학년</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>과목</Label>
                <Select value={formData.subject} onValueChange={v => setFormData(p => ({ ...p, subject: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>연도</Label>
                <Select value={String(formData.academic_year)} onValueChange={v => setFormData(p => ({ ...p, academic_year: parseInt(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>학기</Label>
                <Select value={formData.semester} onValueChange={v => setFormData(p => ({ ...p, semester: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SEMESTERS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>시험 유형</Label>
                <Select value={formData.exam_type} onValueChange={v => setFormData(p => ({ ...p, exam_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{EXAM_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>진행상황</Label>
                <Select value={formData.status} onValueChange={v => setFormData(p => ({ ...p, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>시험 시작일</Label>
                <Input type="date" value={formData.exam_date_start} onChange={e => setFormData(p => ({ ...p, exam_date_start: e.target.value }))} />
              </div>
              <div>
                <Label>시험 종료일</Label>
                <Input type="date" value={formData.exam_date_end} onChange={e => setFormData(p => ({ ...p, exam_date_end: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>교과서 출판사</Label>
              <Input value={formData.textbook_publisher} onChange={e => setFormData(p => ({ ...p, textbook_publisher: e.target.value }))} placeholder="예: 비상교육" />
            </div>
            <div>
              <Label>시험 범위</Label>
              <Textarea value={formData.exam_scope} onChange={e => setFormData(p => ({ ...p, exam_scope: e.target.value }))} placeholder="예: 1단원~3단원" rows={2} />
            </div>

            {/* 담당 선생님 */}
            <div>
              <Label>담당 선생님</Label>
              <div className="flex flex-wrap gap-1 mt-1">
                {teacherList.map(t => (
                  <Badge
                    key={t.id}
                    variant={formData.preparing_teachers.includes(t.name) ? 'default' : 'outline'}
                    className="cursor-pointer text-xs"
                    onClick={() => toggleTeacher(t.name)}
                  >
                    {t.name}
                  </Badge>
                ))}
              </div>
            </div>

            {/* 평가 구조 */}
            <p className="text-xs font-semibold text-muted-foreground border-b pb-1 pt-2">평가 구조</p>
            <div>
              <Label>반영 비율 (시험:수행평가)</Label>
              <Input value={formData.grade_ratio} onChange={e => setFormData(p => ({ ...p, grade_ratio: e.target.value }))} placeholder="예: 시험 60% / 수행평가 40%" />
            </div>
            <div>
              <Label>수행평가 정보</Label>
              <Textarea value={formData.performance_assessment_info} onChange={e => setFormData(p => ({ ...p, performance_assessment_info: e.target.value }))} placeholder="수행평가 종류, 일정, 내용 등을 입력" rows={3} />
            </div>

            {/* 학원 준비 */}
            <p className="text-xs font-semibold text-muted-foreground border-b pb-1 pt-2">학원 수업 준비</p>
            <div>
              <Label>학원 수업/준비 내용</Label>
              <Textarea value={formData.academy_prep_notes} onChange={e => setFormData(p => ({ ...p, academy_prep_notes: e.target.value }))} placeholder="이 시험을 위해 학원에서 제공한 수업, 자료, 특이사항 등" rows={3} />
            </div>

            {/* 시험 후 분석 */}
            <p className="text-xs font-semibold text-muted-foreground border-b pb-1 pt-2">시험 후 분석</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>시험 난도</Label>
                <Select value={formData.difficulty_level || 'none'} onValueChange={v => setFormData(p => ({ ...p, difficulty_level: v === 'none' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">미선택</SelectItem>
                    {DIFFICULTY_LEVELS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>시험 평균 점수</Label>
                <Input type="number" step="0.1" value={formData.exam_average_score} onChange={e => setFormData(p => ({ ...p, exam_average_score: e.target.value }))} placeholder="예: 72.5" />
              </div>
            </div>
            <div>
              <Label>출제 경향 분석</Label>
              <Textarea value={formData.post_exam_analysis} onChange={e => setFormData(p => ({ ...p, post_exam_analysis: e.target.value }))} placeholder="시험 출제 경향, 특이사항 등" rows={3} />
            </div>
            <div>
              <Label>세부 시험 분석</Label>
              <Textarea value={formData.exam_analysis_detail} onChange={e => setFormData(p => ({ ...p, exam_analysis_detail: e.target.value }))} placeholder="문항별 분석, 오답 경향, 학생별 결과 분석 등" rows={3} />
            </div>
            <div>
              <Label>메모</Label>
              <Textarea value={formData.notes} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))} placeholder="추가 메모 사항" rows={2} />
            </div>

            <Button onClick={handleSaveArchive} className="w-full">
              {editingArchive ? '수정 완료' : '추가'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Calendar Image Preview Modal */}
      {calendarPreview && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setCalendarPreview(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <button
              className="absolute -top-3 -right-3 bg-background border rounded-full w-8 h-8 flex items-center justify-center shadow-lg hover:bg-accent z-10"
              onClick={() => setCalendarPreview(null)}
            >
              <X className="w-4 h-4" />
            </button>
            <img
              src={calendarPreview}
              alt="학사일정표"
              className="max-w-full max-h-[85vh] rounded-lg shadow-2xl object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <span className="text-xs font-medium text-muted-foreground">{label}:</span>{' '}
      <span className="text-sm">{value}</span>
    </div>
  );
}
