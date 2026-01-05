import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Plus, Search, Edit2, Trash2, Loader2, User, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import StudentSlotAssignment from '@/components/StudentSlotAssignment';
import StudentSubjectTeacherMapping from '@/components/StudentSubjectTeacherMapping';
import StudentCsvImport from '@/components/StudentCsvImport';
import { useAuth, isAdmin, isTeacher } from '@/lib/auth';
import { normalizePhone } from '@/lib/phoneUtils';

interface Student {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  grade: string | null;
  notes: string | null;
  school: string | null;
  parent_phone: string | null;
  student_phone: string | null;
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
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    grade: '',
    notes: '',
    school: '',
    parent_phone: '',
    student_phone: '',
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchStudents();
  }, []);

  async function fetchStudents() {
    try {
      const { data, error } = await supabase
        .from('students')
        .select('*')
        .order('name');

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
      // Normalize phone numbers
      const normalizedParentPhone = normalizePhone(formData.parent_phone);
      const normalizedStudentPhone = normalizePhone(formData.student_phone);
      
      // For new students, generate student_code if not editing
      let studentCode: string | null = null;
      
      if (!editingStudent) {
        // Generate student_code from last 4 digits of student_phone
        if (normalizedStudentPhone.length >= 4) {
          const last4 = normalizedStudentPhone.slice(-4);
          
          // Check for uniqueness
          const { data: existingCodes } = await supabase
            .from('students')
            .select('student_code')
            .not('student_code', 'is', null);
          
          const existingSet = new Set(
            (existingCodes || []).map((s: any) => s.student_code).filter(Boolean)
          );
          
          let candidateCode = last4;
          let suffix = 2;
          
          while (existingSet.has(candidateCode)) {
            candidateCode = `${last4}-${suffix}`;
            suffix++;
            if (suffix > 100) break;
          }
          
          if (suffix <= 100) {
            studentCode = candidateCode;
          }
        }
        
        if (!studentCode && normalizedStudentPhone.length < 4) {
          toast({
            title: 'Validation Error',
            description: '학생번호 생성 불가: 학생전화 없음/짧음',
            variant: 'destructive',
          });
          setIsSubmitting(false);
          return;
        }
      }

      const payload: any = {
        name: formData.name.trim(),
        email: formData.email.trim() || null,
        phone: formData.phone.trim() || null,
        grade: formData.grade.trim() || null,
        notes: formData.notes.trim() || null,
        school: formData.school.trim() || null,
        parent_phone: normalizedParentPhone || null,
        student_phone: normalizedStudentPhone || null,
      };

      if (editingStudent) {
        const { error } = await supabase
          .from('students')
          .update(payload)
          .eq('id', editingStudent.id);

        if (error) throw error;

        toast({
          title: 'Success',
          description: 'Student updated successfully',
        });
        
        // Update detail view if open
        if (detailStudent?.id === editingStudent.id) {
          setDetailStudent({ ...editingStudent, ...payload });
        }
      } else {
        // Add student_code for new students
        payload.student_code = studentCode;
        
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
      notes: '',
      school: '',
      parent_phone: '',
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
      notes: student.notes || '',
      school: student.school || '',
      parent_phone: student.parent_phone || '',
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

  const filteredStudents = students.filter(
    (student) =>
      student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      student.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      student.grade?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      student.school?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
                    <Label htmlFor="grade">Grade/Level</Label>
                    <Input
                      id="grade"
                      value={formData.grade}
                      onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                      placeholder="e.g., 고2"
                    />
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
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search students..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
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
                    <TableHead>Name</TableHead>
                    <TableHead>Grade</TableHead>
                    <TableHead>School</TableHead>
                    <TableHead>Phone</TableHead>
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
                      <TableCell className="font-medium">{student.name}</TableCell>
                      <TableCell>{student.grade || '-'}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {student.school || '-'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {student.student_phone || student.phone || '-'}
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
              <TabsList className={`grid w-full ${isAdmin(role) ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <TabsTrigger value="info">기본정보</TabsTrigger>
                {(isAdmin(role) || isTeacher(role)) && (
                  <TabsTrigger value="slots">
                    <Calendar className="w-4 h-4 mr-2" />
                    수업 슬롯 배정
                  </TabsTrigger>
                )}
                {isAdmin(role) && (
                  <TabsTrigger value="subject-teachers">과목별 담당</TabsTrigger>
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
              </TabsContent>
              
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
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
