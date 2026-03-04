// SCHOOL-EXAM-ARCHIVE-V1
// 학교별 내신 자료실 - 학교/학년/과목별로 시험 자료를 관리하는 컴포넌트
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Plus, FileUp, Trash2, Download, FileText, Image, File, Pencil, School, ChevronDown, ChevronRight, Paperclip } from 'lucide-react';
import { format } from 'date-fns';
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
const FILE_CATEGORIES = ['교과서', '기출시험지', '프린트', '시험범위', '시험지', '분석자료', '기타'];

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

export function SchoolExamArchive() {
  const { user } = useAuth();

  // Filters
  const [filterYear, setFilterYear] = useState<string>(String(currentYear));
  const [filterSchool, setFilterSchool] = useState<string>('all');
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const [filterSubject, setFilterSubject] = useState<string>('all');
  const [filterSemester, setFilterSemester] = useState<string>('all');

  // Data
  const [archives, setArchives] = useState<Archive[]>([]);
  const [materials, setMaterials] = useState<Record<string, Material[]>>({});
  const [schoolList, setSchoolList] = useState<string[]>([]);
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
  });

  // Upload
  const [uploadArchiveId, setUploadArchiveId] = useState<string | null>(null);
  const [uploadCategory, setUploadCategory] = useState('기타');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // Load school list from students table + archives
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

  // Load archives
  const loadArchives = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('school_exam_archives').select('*').order('academic_year', { ascending: false }).order('school_name').order('grade_year');

    if (filterYear !== 'all') query = query.eq('academic_year', parseInt(filterYear));
    if (filterSchool !== 'all') query = query.eq('school_name', filterSchool);
    if (filterLevel !== 'all') query = query.eq('school_level', filterLevel);
    if (filterSubject !== 'all') query = query.eq('subject', filterSubject);
    if (filterSemester !== 'all') query = query.eq('semester', filterSemester);

    const { data, error } = await query;
    if (error) { toast.error('자료 로딩 실패'); console.error(error); }
    else setArchives(data || []);
    setLoading(false);
  }, [filterYear, filterSchool, filterLevel, filterSubject, filterSemester]);

  // Load materials for expanded archives
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

  useEffect(() => { loadSchoolList(); }, [loadSchoolList]);
  useEffect(() => { loadArchives(); }, [loadArchives]);

  const toggleExpand = (id: string) => {
    setExpandedArchives(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); }
      else { next.add(id); loadMaterials(id); }
      return next;
    });
  };

  // Create / Update archive
  const handleSaveArchive = async () => {
    if (!formData.school_name.trim()) { toast.error('학교명을 입력해주세요'); return; }

    const payload = {
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
      updated_at: new Date().toISOString(),
    };

    if (editingArchive) {
      const { error } = await supabase.from('school_exam_archives').update(payload).eq('id', editingArchive.id);
      if (error) { toast.error('수정 실패'); return; }
      toast.success('자료 수정 완료');
    } else {
      const { error } = await supabase.from('school_exam_archives').insert({ ...payload, created_by: user?.id });
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
    });
    setShowCreateDialog(true);
  };

  const handleDeleteArchive = async (id: string) => {
    // Delete materials files first
    const mats = materials[id] || [];
    if (mats.length > 0) {
      await supabase.storage.from('school-exam-materials').remove(mats.map(m => m.storage_path));
    }
    const { error } = await supabase.from('school_exam_archives').delete().eq('id', id);
    if (error) { toast.error('삭제 실패'); return; }
    toast.success('자료 삭제 완료');
    loadArchives();
  };

  // Upload file
  const handleUploadFile = async () => {
    if (!uploadFile || !uploadArchiveId) return;
    setUploading(true);

    const ext = uploadFile.name.split('.').pop();
    const path = `${uploadArchiveId}/${Date.now()}_${uploadFile.name}`;

    const { error: storageError } = await supabase.storage
      .from('school-exam-materials')
      .upload(path, uploadFile);

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
    setUploadFile(null);
    setUploadDescription('');
    setUploadArchiveId(null);
    setUploading(false);
    loadMaterials(uploadArchiveId!);
  };

  const handleDownloadFile = async (mat: Material) => {
    const { data, error } = await supabase.storage
      .from('school-exam-materials')
      .createSignedUrl(mat.storage_path, 3600);
    if (error || !data?.signedUrl) { toast.error('다운로드 링크 생성 실패'); return; }
    window.open(data.signedUrl, '_blank');
  };

  const handleDeleteMaterial = async (mat: Material) => {
    await supabase.storage.from('school-exam-materials').remove([mat.storage_path]);
    await supabase.from('school_exam_materials').delete().eq('id', mat.id);
    toast.success('파일 삭제 완료');
    loadMaterials(mat.archive_id);
  };

  // Group archives by school
  const groupedArchives = archives.reduce<Record<string, Archive[]>>((acc, a) => {
    const key = `${a.school_name} (${a.school_level})`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(a);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <School className="w-5 h-5" />
            내신 자료실
          </h2>
          <p className="text-sm text-muted-foreground">학교별·학년별·과목별 시험 자료 및 분석을 관리합니다</p>
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
        Object.entries(groupedArchives).map(([schoolKey, items]) => (
          <div key={schoolKey} className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground border-b pb-1">{schoolKey}</h3>
            {items.map(archive => {
              const isExpanded = expandedArchives.has(archive.id);
              const archiveMaterials = materials[archive.id] || [];
              return (
                <Card key={archive.id} className="overflow-hidden">
                  <div
                    className="flex items-center gap-2 p-3 cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => toggleExpand(archive.id)}
                  >
                    {isExpanded ? <ChevronDown className="w-4 h-4 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant="outline" className="text-xs">{archive.academic_year}</Badge>
                        <Badge variant="secondary" className="text-xs">{archive.school_level}{archive.grade_year}</Badge>
                        <Badge className="text-xs">{archive.subject}</Badge>
                        <span className="text-sm font-medium">{archive.semester} {archive.exam_type}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                        {archive.textbook_publisher && <span>📖 {archive.textbook_publisher}</span>}
                        {archive.exam_date_start && (
                          <span>📅 {archive.exam_date_start}{archive.exam_date_end && archive.exam_date_end !== archive.exam_date_start ? `~${archive.exam_date_end}` : ''}</span>
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
                      {/* Details */}
                      <Tabs defaultValue="info" className="mt-3">
                        <TabsList className="h-8">
                          <TabsTrigger value="info" className="text-xs h-7">정보</TabsTrigger>
                          <TabsTrigger value="materials" className="text-xs h-7">자료 ({archiveMaterials.length})</TabsTrigger>
                          <TabsTrigger value="analysis" className="text-xs h-7">시험 분석</TabsTrigger>
                        </TabsList>

                        <TabsContent value="info" className="space-y-2 mt-2">
                          {archive.textbook_publisher && (
                            <div><span className="text-xs font-medium text-muted-foreground">교과서 출판사:</span> <span className="text-sm">{archive.textbook_publisher}</span></div>
                          )}
                          {archive.exam_scope && (
                            <div><span className="text-xs font-medium text-muted-foreground">시험 범위:</span> <p className="text-sm whitespace-pre-wrap">{archive.exam_scope}</p></div>
                          )}
                          {archive.notes && (
                            <div><span className="text-xs font-medium text-muted-foreground">메모:</span> <p className="text-sm whitespace-pre-wrap">{archive.notes}</p></div>
                          )}
                          {!archive.textbook_publisher && !archive.exam_scope && !archive.notes && (
                            <p className="text-sm text-muted-foreground">등록된 정보가 없습니다. 수정 버튼을 눌러 정보를 추가해주세요.</p>
                          )}
                        </TabsContent>

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

                        <TabsContent value="analysis" className="mt-2">
                          {archive.post_exam_analysis ? (
                            <div className="whitespace-pre-wrap text-sm p-3 bg-muted/30 rounded-md">{archive.post_exam_analysis}</div>
                          ) : (
                            <p className="text-sm text-muted-foreground text-center py-4">시험 분석이 아직 작성되지 않았습니다. 수정 버튼을 눌러 작성해주세요.</p>
                          )}
                        </TabsContent>
                      </Tabs>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        ))
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingArchive ? '자료 수정' : '새 자료 추가'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
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
                  <SelectContent>
                    {SCHOOL_LEVELS.map(l => <SelectItem key={l} value={l}>{l}등학교</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>학년</Label>
                <Select value={String(formData.grade_year)} onValueChange={v => setFormData(p => ({ ...p, grade_year: parseInt(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6].map(g => <SelectItem key={g} value={String(g)}>{g}학년</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>과목</Label>
                <Select value={formData.subject} onValueChange={v => setFormData(p => ({ ...p, subject: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>연도</Label>
                <Select value={String(formData.academic_year)} onValueChange={v => setFormData(p => ({ ...p, academic_year: parseInt(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>학기</Label>
                <Select value={formData.semester} onValueChange={v => setFormData(p => ({ ...p, semester: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SEMESTERS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>시험 유형</Label>
                <Select value={formData.exam_type} onValueChange={v => setFormData(p => ({ ...p, exam_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EXAM_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
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
            <div>
              <Label>메모</Label>
              <Textarea value={formData.notes} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))} placeholder="추가 메모 사항" rows={2} />
            </div>
            <div>
              <Label>시험 후 분석</Label>
              <Textarea value={formData.post_exam_analysis} onChange={e => setFormData(p => ({ ...p, post_exam_analysis: e.target.value }))} placeholder="시험 출제 경향, 난이도, 특이사항 등" rows={3} />
            </div>
            <Button onClick={handleSaveArchive} className="w-full">
              {editingArchive ? '수정 완료' : '추가'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
