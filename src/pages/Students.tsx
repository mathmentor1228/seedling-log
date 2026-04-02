import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Plus, Search, Edit2, Trash2, Loader2, User, Calendar, Key, Link2, Wallet } from 'lucide-react';
import { format } from 'date-fns';
import { NewStudentOnboarding } from '@/components/admin/NewStudentOnboarding';
import { UnvisitedParentsList } from '@/components/admin/UnvisitedParentsList';
import StudentSlotAssignment from '@/components/StudentSlotAssignment';
import StudentSubjectTeacherMapping from '@/components/StudentSubjectTeacherMapping';
import StudentCsvImport from '@/components/StudentCsvImport';
import StudentPinManager from '@/components/StudentPinManager';
import { BulkEditStudents } from '@/components/admin/BulkEditStudents';
import { StudentCoursesTuitionTab } from '@/components/tuition/StudentCoursesTuitionTab';
import { useAuth, isAdmin, isTeacher } from '@/lib/auth';
import { generateStudentCode, normalizePhone } from '@/lib/phoneUtils';
import { Checkbox } from '@/components/ui/checkbox';

// STUDENT-ENROLLMENT-STATUS-V1, STATS-SCHOOL-GRADE-V1, STUDENT-PIN-MANAGER-V1
interface Student {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  grade: string | null;
  school_level: string | null;
  grade_year: number | null;
  enrollment_status: string;
  notes: string | null;
  school: string | null;
  parent_phone: string | null;
  parent_name: string | null;
  student_phone: string | null;
  student_code: string | null;
  payment_due_day: number | null;
  created_at: string;
}

export default function Students() {
  const { role } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [detailStudent, setDetailStudent] = useState<Student | null>(null);
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('재학');
  const [schoolLevelFilter, setSchoolLevelFilter] = useState<string>('all');
  const [gradeYearFilter, setGradeYearFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [tuitionSummary, setTuitionSummary] = useState<Record<string, { courses: number; monthlyFee: number; unpaid: number }>>({});
  // STUDENT-ENROLLMENT-STATUS-V1: Add enrollment_status to form
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    grade: '',
    school_level: '',
    grade_year: '',
    enrollment_status: '재학',
    notes: '',
    school: '',
    parent_phone: '',
    parent_name: '',
    student_phone: '',
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchStudents();
  }, [statusFilter]);

  useEffect(() => {
    if (students.length > 0) fetchTuitionSummary();
  }, [students]);

  async function fetchStudents() {
    try {
      let query = supabase
        .from('students')
        .select('*')
        .order('name');
      
      if (statusFilter !== 'all') {
        query = query.eq('enrollment_status', statusFilter);
      }

      const { data, error } = await query;

      if (error) throw error;
      setStudents(data || []);
    } catch (error) {
      console.error('Error fetching students:', error);
      toast({
        title: 'Error',
        description: 'Failed to load students',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  async function fetchTuitionSummary() {
    const studentIds = students.map(s => s.id);
    const [coursesRes, billingsRes] = await Promise.all([
      supabase.from('student_courses')
        .select('student_id, is_active, course_policies(monthly_fee)')
        .in('student_id', studentIds),
      supabase.from('billing_schedules')
        .select('student_id, status')
        .in('student_id', studentIds)
        .in('status', ['pending', 'overdue']),
    ]);

    const summary: Record<string, { courses: number; monthlyFee: number; unpaid: number }> = {};
    for (const c of (coursesRes.data || [])) {
      if (!summary[c.student_id]) summary[c.student_id] = { courses: 0, monthlyFee: 0, unpaid: 0 };
      if (c.is_active) {
        summary[c.student_id].courses++;
        summary[c.student_id].monthlyFee += Number((c as any).course_policies?.monthly_fee || 0);
      }
    }
    for (const b of (billingsRes.data || [])) {
      if (!summary[b.student_id]) summary[b.student_id] = { courses: 0, monthlyFee: 0, unpaid: 0 };
      summary[b.student_id].unpaid++;
    }
    setTuitionSummary(summary);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Student name is required',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const normalizedParentPhone = normalizePhone(formData.parent_phone);
      const normalizedStudentPhone = normalizePhone(formData.student_phone);

      const { data: existingCodes } = await supabase
        .from('students')
        .select('student_code')
        .not('student_code', 'is', null);

      const existingSet = new Set(
        (existingCodes || [])
          .map((s: any) => s.student_code)
          .filter((code: string | null) => code && code !== editingStudent?.student_code)
      );

      let studentCode = editingStudent?.student_code ?? null;

      if (!studentCode) {
        const generated = await generateStudentCode(normalizedStudentPhone, existingSet);
        if (!generated.code) {
          toast({
            title: 'Validation Error',
            description: generated.error || '학생번호 생성 불가: 학생전화 없음/짧음',
            variant: 'destructive',
          });
          setIsSubmitting(false);
          return;
        }
        studentCode = generated.code;
      }

      const payload: any = {
        name: formData.name.trim(),
        email: formData.email.trim() || null,
        phone: formData.phone.trim() || null,
        grade: formData.grade.trim() || null,
        school_level: formData.school_level || null,
        grade_year: formData.grade_year ? parseInt(formData.grade_year) : null,
        enrollment_status: formData.enrollment_status || '재학',
        notes: formData.notes.trim() || null,
        school: formData.school.trim() || null,
        parent_phone: normalizedParentPhone || null,
        parent_name: formData.parent_name.trim() || null,
        student_phone: normalizedStudentPhone || null,
        student_code: studentCode,
      };

      if (editingStudent) {
        const { error } = await supabase
          .from('students')
          .update(payload)
          .eq('id', editingStudent.id);

        if (error) throw error;

        toast({
          title: 'Success',
          description: `Student updated successfully (코드: ${studentCode})`,
        });
        
        if (detailStudent?.id === editingStudent.id) {
          setDetailStudent({ ...editingStudent, ...payload });
        }
      } else {
        const { error } = await supabase.from('students').insert(payload);

        if (error) throw error;

        toast({
          title: 'Success',
          description: `Student added successfully (코드: ${studentCode})`,
        });
      }

      setIsAddDialogOpen(false);
      setEditingStudent(null);
      resetForm();
      fetchStudents();
    } catch (error: any) {
      console.error('Error saving student:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to save student',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      phone: '',
      grade: '',
      school_level: '',
      grade_year: '',
      enrollment_status: '재학',
      notes: '',
      school: '',
      parent_phone: '',
      parent_name: '',
      student_phone: '',
    });
  };

  const handleEdit = (student: Student) => {
    setEditingStudent(student);
    setFormData({
      name: student.name,
      email: student.email || '',
      phone: student.phone || '',
      grade: student.grade || '',
      school_level: student.school_level || '',
      grade_year: student.grade_year?.toString() || '',
      enrollment_status: student.enrollment_status || '재학',
      notes: student.notes || '',
      school: student.school || '',
      parent_phone: student.parent_phone || '',
      parent_name: (student as any).parent_name || '',
      student_phone: student.student_phone || '',
    });
    setIsAddDialogOpen(true);
  };

  const handleEditFromDetail = () => {
    if (detailStudent) {
      handleEdit(detailStudent);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this student?')) return;

    try {
      const { error } = await supabase.from('students').delete().eq('id', id);
      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Student deleted successfully',
      });
      
      if (detailStudent?.id === id) {
        setDetailStudent(null);
      }
      
      fetchStudents();
    } catch (error: any) {
      console.error('Error deleting student:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete student',
        variant: 'destructive',
      });
    }
  };

  const generateParentLink = async (studentId: string) => {
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parent-portal?action=generate`,
        {
          method: 'POST',
          headers: {
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ student_id: studentId }),
        }
      );
      const result = await res.json();
      if (!res.ok || result.error) {
        throw new Error(result.error || '링크 생성 실패');
      }
      const publishedOrigin = 'https://seedling-log.lovable.app';
      const parentUrl = `${publishedOrigin}/parent?token=${result.token}`;
      await navigator.clipboard.writeText(parentUrl);
      toast({ title: '학부모 링크 복사됨', description: '카카오톡에 붙여넣기하세요!' });
    } catch (err: any) {
      toast({ title: '오류', description: err.message, variant: 'destructive' });
    }
  };

  const filteredStudents = students.filter((student) => {
    // Text search - includes name, email, grade, school, phone numbers
    const q = searchQuery.toLowerCase().replace(/\D/g, '') || searchQuery.toLowerCase();
    const qRaw = searchQuery.toLowerCase();
    const matchesSearch = !searchQuery || 
      student.name.toLowerCase().includes(qRaw) ||
      student.email?.toLowerCase().includes(qRaw) ||
      student.grade?.toLowerCase().includes(qRaw) ||
      student.school?.toLowerCase().includes(qRaw) ||
      (student.phone && normalizePhone(student.phone).includes(q)) ||
      (student.parent_phone && normalizePhone(student.parent_phone).includes(q)) ||
      (student.student_phone && normalizePhone(student.student_phone).includes(q)) ||
      (student.student_code?.toLowerCase().includes(qRaw));
    if (!matchesSearch) return false;

    // School level filter
    if (schoolLevelFilter !== 'all' && student.school_level !== schoolLevelFilter) return false;

    // Grade year filter
    if (gradeYearFilter !== 'all' && student.grade_year?.toString() !== gradeYearFilter) return false;

    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* New Student Onboarding Checklist */}
      <NewStudentOnboarding />
      {/* Unvisited Parents List */}
      <UnvisitedParentsList />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Students</h1>
          <p className="text-muted-foreground mt-1">Manage your student directory</p>
        </div>

        {isAdmin(role) && (
          <div className="flex gap-2">
            <StudentCsvImport onImportComplete={fetchStudents} />
            <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
              setIsAddDialogOpen(open);
              if (!open) {
                setEditingStudent(null);
                resetForm();
              }
            }}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Student
                </Button>
              </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>
                  {editingStudent ? 'Edit Student' : 'Add New Student'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="name">Name *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Student name"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="grade">Grade/Level (기존)</Label>
                    <Input
                      id="grade"
                      value={formData.grade}
                      onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                      placeholder="e.g., 고2"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="school_level">학교급 *</Label>
                    <Select
                      value={formData.school_level}
                      onValueChange={(value) => setFormData({ ...formData, school_level: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="선택" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="초">초등</SelectItem>
                        <SelectItem value="중">중등</SelectItem>
                        <SelectItem value="고">고등</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="grade_year">학년 *</Label>
                    <Select
                      value={formData.grade_year}
                      onValueChange={(value) => setFormData({ ...formData, grade_year: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {formData.school_level === '초' ? (
                          <>
                            <SelectItem value="1">1학년</SelectItem>
                            <SelectItem value="2">2학년</SelectItem>
                            <SelectItem value="3">3학년</SelectItem>
                            <SelectItem value="4">4학년</SelectItem>
                            <SelectItem value="5">5학년</SelectItem>
                            <SelectItem value="6">6학년</SelectItem>
                          </>
                        ) : (
                          <>
                            <SelectItem value="1">1학년</SelectItem>
                            <SelectItem value="2">2학년</SelectItem>
                            <SelectItem value="3">3학년</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="enrollment_status">재원상태 *</Label>
                    <Select
                      value={formData.enrollment_status}
                      onValueChange={(value) => setFormData({ ...formData, enrollment_status: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="선택" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="재원">재원</SelectItem>
                        <SelectItem value="휴원">휴원</SelectItem>
                        <SelectItem value="퇴원">퇴원</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="school">School</Label>
                    <Input
                      id="school"
                      value={formData.school}
                      onChange={(e) => setFormData({ ...formData, school: e.target.value })}
                      placeholder="e.g., 서울고등학교"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="student_phone">Student Phone</Label>
                    <Input
                      id="student_phone"
                      value={formData.student_phone}
                      onChange={(e) => setFormData({ ...formData, student_phone: e.target.value })}
                      placeholder="010-1234-5678"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="parent_phone">Parent Phone</Label>
                    <Input
                      id="parent_phone"
                      value={formData.parent_phone}
                      onChange={(e) => setFormData({ ...formData, parent_phone: e.target.value })}
                      placeholder="010-1234-5678"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="parent_name">학부모 성함</Label>
                    <Input
                      id="parent_name"
                      value={formData.parent_name}
                      onChange={(e) => setFormData({ ...formData, parent_name: e.target.value })}
                      placeholder="학부모 이름"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="student@example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Other Phone</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="Optional"
                    />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Input
                      id="notes"
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      placeholder="Additional notes"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsAddDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    {editingStudent ? 'Update' : 'Add'} Student
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        )}
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="이름, 전화번호, 학교 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            {/* Filters row */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Status filter chips */}
              {['재학', '휴학', '퇴원', 'all'].map((s) => (
                <Button
                  key={s}
                  variant={statusFilter === s ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setStatusFilter(s)}
                >
                  {s === 'all' ? '전체' : s}
                </Button>
              ))}
              <span className="w-px h-5 bg-border mx-1" />
              {/* School level filter */}
              <Select value={schoolLevelFilter} onValueChange={setSchoolLevelFilter}>
                <SelectTrigger className="h-7 w-[90px] text-xs">
                  <SelectValue placeholder="학교급" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="초">초등</SelectItem>
                  <SelectItem value="중">중등</SelectItem>
                  <SelectItem value="고">고등</SelectItem>
                </SelectContent>
              </Select>
              {/* Grade year filter */}
              <Select value={gradeYearFilter} onValueChange={setGradeYearFilter}>
                <SelectTrigger className="h-7 w-[90px] text-xs">
                  <SelectValue placeholder="학년" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  {(schoolLevelFilter === '초' ? [1,2,3,4,5,6] : [1,2,3]).map((y) => (
                    <SelectItem key={y} value={y.toString()}>{y}학년</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isAdmin(role) && selectedIds.size > 0 && (
                <Button size="sm" className="h-7 text-xs" onClick={() => setBulkEditOpen(true)}>
                  일괄 편집 ({selectedIds.size}명)
                </Button>
              )}
              <span className="ml-auto text-xs text-muted-foreground">
                {filteredStudents.length}명
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredStudents.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                {searchQuery ? 'No students found' : 'No students yet. Add your first student!'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                   <TableRow>
                     {isAdmin(role) && (
                       <TableHead className="w-10">
                         <Checkbox
                           checked={filteredStudents.length > 0 && filteredStudents.every(s => selectedIds.has(s.id))}
                           onCheckedChange={(checked) => {
                             if (checked) {
                               setSelectedIds(new Set(filteredStudents.map(s => s.id)));
                             } else {
                               setSelectedIds(new Set());
                             }
                           }}
                         />
                       </TableHead>
                     )}
                     <TableHead>Name</TableHead>
                     <TableHead>학생코드</TableHead>
                     <TableHead>상태</TableHead>
                     <TableHead>Grade</TableHead>
                     <TableHead>School</TableHead>
                     <TableHead>Phone</TableHead>
                     <TableHead>수강료</TableHead>
                     <TableHead>Added</TableHead>
                     <TableHead className="w-[120px]">Actions</TableHead>
                   </TableRow>
                 </TableHeader>
                 <TableBody>
                   {filteredStudents.map((student) => (
                     <TableRow 
                       key={student.id}
                       className="cursor-pointer hover:bg-muted/50"
                       onClick={() => setDetailStudent(student)}
                     >
                       {isAdmin(role) && (
                         <TableCell onClick={e => e.stopPropagation()}>
                           <Checkbox
                             checked={selectedIds.has(student.id)}
                             onCheckedChange={(checked) => {
                               setSelectedIds(prev => {
                                 const next = new Set(prev);
                                 if (checked) next.add(student.id); else next.delete(student.id);
                                 return next;
                               });
                             }}
                           />
                         </TableCell>
                       )}
                       <TableCell className="font-medium">{student.name}</TableCell>
                      <TableCell>
                        {student.student_code ? (
                          <code className="bg-muted px-2 py-0.5 rounded text-xs font-mono">
                            {student.student_code}
                          </code>
                        ) : (
                          <span className="text-muted-foreground text-xs">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            student.enrollment_status === '재학' ? 'default' :
                            student.enrollment_status === '휴학' ? 'secondary' : 'outline'
                          }
                          className={
                            student.enrollment_status === '퇴원'
                              ? 'text-muted-foreground border-muted-foreground/30'
                              : student.enrollment_status === '휴학'
                              ? 'bg-amber-500/15 text-amber-600 border-amber-500/30'
                              : ''
                          }
                        >
                          {student.enrollment_status || '재학'}
                        </Badge>
                      </TableCell>
                      <TableCell>{student.grade || '-'}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {student.school || '-'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {student.student_phone || student.phone || '-'}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const t = tuitionSummary[student.id];
                          if (!t || t.courses === 0) return <span className="text-xs text-muted-foreground">-</span>;
                          return (
                            <div className="text-xs">
                              <span className="font-medium">{t.monthlyFee.toLocaleString()}원</span>
                              <span className="text-muted-foreground">/{t.courses}과목</span>
                              {t.unpaid > 0 && <Badge variant="destructive" className="ml-1 text-[9px] px-1 py-0">{t.unpaid}미납</Badge>}
                            </div>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(student.created_at), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDetailStudent(student)}
                            title="상세/편집"
                          >
                            <User className="w-4 h-4" />
                          </Button>
                          {isAdmin(role) && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEdit(student)}
                                title="Edit"
                              >
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDelete(student.id)}
                                className="text-destructive hover:text-destructive"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Student Detail Modal */}
      <Dialog open={!!detailStudent} onOpenChange={(open) => !open && setDetailStudent(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User className="h-5 w-5" />
                학생 상세 - {detailStudent?.name}
              </div>
              {isAdmin(role) && detailStudent && (
                <Button variant="outline" size="sm" onClick={handleEditFromDetail}>
                  <Edit2 className="w-4 h-4 mr-2" />
                  편집
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>
          
          {detailStudent && (
            <Tabs defaultValue="info" className="mt-4">
              <TabsList className={`grid w-full ${isAdmin(role) ? 'grid-cols-5' : 'grid-cols-2'}`}>
                <TabsTrigger value="info">기본정보</TabsTrigger>
                {isAdmin(role) && (
                  <TabsTrigger value="tuition" className="gap-1">
                    <Wallet className="w-3.5 h-3.5" />수강/수강료
                  </TabsTrigger>
                )}
                {(isAdmin(role) || isTeacher(role)) && (
                  <TabsTrigger value="slots">
                    <Calendar className="w-4 h-4 mr-1" />
                    슬롯
                  </TabsTrigger>
                )}
                {isAdmin(role) && (
                  <TabsTrigger value="subject-teachers">과목담당</TabsTrigger>
                )}
                {isAdmin(role) && (
                  <TabsTrigger value="pin-manager">
                    <Key className="w-3.5 h-3.5 mr-1" />
                    앱계정
                  </TabsTrigger>
                )}
              </TabsList>
              
              <TabsContent value="info" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">이름</Label>
                    <p className="font-medium">{detailStudent.name}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">학년</Label>
                    <p className="font-medium">{detailStudent.grade || '-'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">학교</Label>
                    <p className="font-medium">{detailStudent.school || '-'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">학생 연락처</Label>
                    <p className="font-medium">{detailStudent.student_phone || '-'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">학부모 연락처</Label>
                    <p className="font-medium">{detailStudent.parent_phone || '-'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">이메일</Label>
                    <p className="font-medium">{detailStudent.email || '-'}</p>
                  </div>
                  <div className="space-y-1 col-span-2">
                    <Label className="text-xs text-muted-foreground">메모</Label>
                    <p className="font-medium">{detailStudent.notes || '-'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">등록일</Label>
                    <p className="font-medium text-muted-foreground">
                      {format(new Date(detailStudent.created_at), 'yyyy년 MM월 dd일')}
                    </p>
                  </div>
                </div>
                {/* Parent portal link button */}
                {isAdmin(role) && (
                  <div className="pt-4 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => generateParentLink(detailStudent.id)}
                    >
                      <Link2 className="w-4 h-4 mr-2" />
                      학부모 포털 링크 복사
                    </Button>
                    <p className="text-[10px] text-muted-foreground mt-1 text-center">
                      로그인 없이 숙제·테스트·리포트를 볼 수 있는 링크입니다
                    </p>
                  </div>
                )}
              </TabsContent>
              
              {isAdmin(role) && (
                <TabsContent value="tuition" className="mt-4">
                  <StudentCoursesTuitionTab
                    studentId={detailStudent.id}
                    studentName={detailStudent.name}
                  />
                </TabsContent>
              )}
              
              {(isAdmin(role) || isTeacher(role)) && (
                <TabsContent value="slots" className="mt-4">
                  <StudentSlotAssignment
                    studentId={detailStudent.id}
                    studentName={detailStudent.name}
                    readOnly={!isAdmin(role)}
                  />
                </TabsContent>
              )}
              {isAdmin(role) && (
                <TabsContent value="subject-teachers" className="mt-4">
                  <StudentSubjectTeacherMapping
                    studentId={detailStudent.id}
                    studentName={detailStudent.name}
                  />
                </TabsContent>
              )}
              {isAdmin(role) && (
                <TabsContent value="pin-manager" className="mt-4">
                  <StudentPinManager
                    studentId={detailStudent.id}
                    studentName={detailStudent.name}
                    studentCode={detailStudent.student_code}
                  />
                </TabsContent>
              )}
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
      {isAdmin(role) && (
        <BulkEditStudents
          open={bulkEditOpen}
          onOpenChange={setBulkEditOpen}
          selectedStudentIds={Array.from(selectedIds)}
          studentNames={Object.fromEntries(students.map(s => [s.id, s.name]))}
          onUpdated={() => { fetchStudents(); setSelectedIds(new Set()); setBulkEditOpen(false); }}
        />
      )}
    </div>
  );
}
