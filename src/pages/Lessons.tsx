import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScoreBadge } from '@/components/ui/score-badge';
import { useToast } from '@/hooks/use-toast';
import { Plus, Search, Edit2, Trash2, Loader2, ClipboardList } from 'lucide-react';
import { format } from 'date-fns';

interface LessonRecord {
  id: string;
  student_id: string;
  class_id: string | null;
  subject: string;
  lesson_date: string;
  lesson_range: string;
  understanding_score: number;
  homework_status: string;
  learning_issues: string[];
  next_lesson_goal: string | null;
  notes: string | null;
  student_name?: string;
}

interface Student {
  id: string;
  name: string;
}

interface ClassItem {
  id: string;
  name: string;
  subject: string;
}

const LEARNING_ISSUES = [
  'Concentration difficulty',
  'Vocabulary gaps',
  'Concept understanding',
  'Problem solving',
  'Memory retention',
  'Test anxiety',
  'Homework completion',
  'Time management',
];

const HOMEWORK_STATUS = [
  { value: 'completed', label: 'Completed' },
  { value: 'partial', label: 'Partially Done' },
  { value: 'not_done', label: 'Not Done' },
  { value: 'none_assigned', label: 'None Assigned' },
];

export default function Lessons() {
  const { user, role } = useAuth();
  const [lessons, setLessons] = useState<LessonRecord[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingLesson, setEditingLesson] = useState<LessonRecord | null>(null);
  const [formData, setFormData] = useState({
    student_id: '',
    class_id: '',
    subject: '',
    lesson_date: format(new Date(), 'yyyy-MM-dd'),
    lesson_range: '',
    understanding_score: '3',
    homework_status: 'none_assigned',
    learning_issues: [] as string[],
    next_lesson_goal: '',
    notes: '',
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchLessons();
    fetchStudents();
    fetchClasses();
  }, [user, role]);

  async function fetchLessons() {
    if (!user) return;

    try {
      let query = supabase
        .from('lesson_records')
        .select(`
          *,
          students:student_id (name)
        `)
        .order('lesson_date', { ascending: false });

      if (role === 'teacher') {
        query = query.eq('teacher_id', user.id);
      }

      const { data, error } = await query;

      if (error) throw error;

      const formattedLessons = (data || []).map((l: any) => ({
        ...l,
        student_name: l.students?.name,
      }));

      setLessons(formattedLessons);
    } catch (error) {
      console.error('Error fetching lessons:', error);
      toast({
        title: 'Error',
        description: 'Failed to load lessons',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  async function fetchStudents() {
    try {
      const { data, error } = await supabase
        .from('students')
        .select('id, name')
        .order('name');

      if (error) throw error;
      setStudents(data || []);
    } catch (error) {
      console.error('Error fetching students:', error);
    }
  }

  async function fetchClasses() {
    try {
      const { data, error } = await supabase
        .from('classes')
        .select('id, name, subject')
        .order('name');

      if (error) throw error;
      setClasses(data || []);
    } catch (error) {
      console.error('Error fetching classes:', error);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!formData.student_id || !formData.subject || !formData.lesson_range) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const lessonPayload = {
        teacher_id: user.id,
        student_id: formData.student_id,
        class_id: formData.class_id || null,
        subject: formData.subject.trim(),
        lesson_date: formData.lesson_date,
        lesson_range: formData.lesson_range.trim(),
        understanding_score: parseInt(formData.understanding_score),
        homework_status: formData.homework_status,
        learning_issues: formData.learning_issues,
        next_lesson_goal: formData.next_lesson_goal.trim() || null,
        notes: formData.notes.trim() || null,
      };

      if (editingLesson) {
        const { error } = await supabase
          .from('lesson_records')
          .update(lessonPayload)
          .eq('id', editingLesson.id);

        if (error) throw error;

        toast({
          title: 'Success',
          description: 'Lesson record updated successfully',
        });
      } else {
        const { error } = await supabase.from('lesson_records').insert(lessonPayload);

        if (error) throw error;

        toast({
          title: 'Success',
          description: 'Lesson record created successfully',
        });
      }

      setIsDialogOpen(false);
      setEditingLesson(null);
      resetForm();
      fetchLessons();
    } catch (error: any) {
      console.error('Error saving lesson:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to save lesson record',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      student_id: '',
      class_id: '',
      subject: '',
      lesson_date: format(new Date(), 'yyyy-MM-dd'),
      lesson_range: '',
      understanding_score: '3',
      homework_status: 'none_assigned',
      learning_issues: [],
      next_lesson_goal: '',
      notes: '',
    });
  };

  const handleEdit = (lesson: LessonRecord) => {
    setEditingLesson(lesson);
    setFormData({
      student_id: lesson.student_id,
      class_id: lesson.class_id || '',
      subject: lesson.subject,
      lesson_date: lesson.lesson_date,
      lesson_range: lesson.lesson_range,
      understanding_score: lesson.understanding_score.toString(),
      homework_status: lesson.homework_status,
      learning_issues: lesson.learning_issues || [],
      next_lesson_goal: lesson.next_lesson_goal || '',
      notes: lesson.notes || '',
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this lesson record?')) return;

    try {
      const { error } = await supabase.from('lesson_records').delete().eq('id', id);
      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Lesson record deleted successfully',
      });
      fetchLessons();
    } catch (error: any) {
      console.error('Error deleting lesson:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete lesson record',
        variant: 'destructive',
      });
    }
  };

  const toggleIssue = (issue: string) => {
    setFormData((prev) => ({
      ...prev,
      learning_issues: prev.learning_issues.includes(issue)
        ? prev.learning_issues.filter((i) => i !== issue)
        : [...prev.learning_issues, issue],
    }));
  };

  const filteredLessons = lessons.filter(
    (lesson) =>
      lesson.student_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lesson.subject.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getHomeworkLabel = (status: string) => {
    return HOMEWORK_STATUS.find((s) => s.value === status)?.label || status;
  };

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
          <h1 className="text-2xl font-bold text-foreground">Lesson Records</h1>
          <p className="text-muted-foreground mt-1">
            {role === 'admin' ? 'All lesson records' : 'Log and track your lessons'}
          </p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            setEditingLesson(null);
            resetForm();
          }
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Log Lesson
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingLesson ? 'Edit Lesson Record' : 'Log New Lesson'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="student">Student *</Label>
                  <Select
                    value={formData.student_id}
                    onValueChange={(value) => setFormData({ ...formData, student_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select student" />
                    </SelectTrigger>
                    <SelectContent>
                      {students.map((student) => (
                        <SelectItem key={student.id} value={student.id}>
                          {student.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="class">Class (Optional)</Label>
                  <Select
                    value={formData.class_id}
                    onValueChange={(value) => setFormData({ ...formData, class_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select class" />
                    </SelectTrigger>
                    <SelectContent>
                      {classes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} - {c.subject}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="subject">Subject *</Label>
                  <Input
                    id="subject"
                    value={formData.subject}
                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                    placeholder="e.g., Mathematics"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lesson_date">Lesson Date *</Label>
                  <Input
                    id="lesson_date"
                    type="date"
                    value={formData.lesson_date}
                    onChange={(e) => setFormData({ ...formData, lesson_date: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="lesson_range">Lesson Range/Content *</Label>
                <Input
                  id="lesson_range"
                  value={formData.lesson_range}
                  onChange={(e) => setFormData({ ...formData, lesson_range: e.target.value })}
                  placeholder="e.g., Chapter 5: Quadratic Equations (pages 120-135)"
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Understanding Score (1-5) *</Label>
                  <Select
                    value={formData.understanding_score}
                    onValueChange={(value) => setFormData({ ...formData, understanding_score: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map((score) => (
                        <SelectItem key={score} value={score.toString()}>
                          {score} - {score === 1 ? 'Poor' : score === 2 ? 'Below Average' : score === 3 ? 'Average' : score === 4 ? 'Good' : 'Excellent'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Homework Status *</Label>
                  <Select
                    value={formData.homework_status}
                    onValueChange={(value) => setFormData({ ...formData, homework_status: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HOMEWORK_STATUS.map((status) => (
                        <SelectItem key={status.value} value={status.value}>
                          {status.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Learning Issues (Select all that apply)</Label>
                <div className="grid grid-cols-2 gap-2 p-4 bg-secondary/50 rounded-lg">
                  {LEARNING_ISSUES.map((issue) => (
                    <div key={issue} className="flex items-center space-x-2">
                      <Checkbox
                        id={issue}
                        checked={formData.learning_issues.includes(issue)}
                        onCheckedChange={() => toggleIssue(issue)}
                      />
                      <label htmlFor={issue} className="text-sm cursor-pointer">
                        {issue}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="next_goal">Next Lesson Goal</Label>
                <Input
                  id="next_goal"
                  value={formData.next_lesson_goal}
                  onChange={(e) => setFormData({ ...formData, next_lesson_goal: e.target.value })}
                  placeholder="What to focus on next lesson"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Additional Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Any other observations or comments"
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {editingLesson ? 'Update' : 'Save'} Record
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by student or subject..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent>
          {filteredLessons.length === 0 ? (
            <div className="text-center py-12">
              <ClipboardList className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {searchQuery ? 'No lessons found' : 'No lesson records yet. Log your first lesson!'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Content</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Homework</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLessons.map((lesson) => (
                    <TableRow key={lesson.id}>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(lesson.lesson_date), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell className="font-medium">{lesson.student_name}</TableCell>
                      <TableCell>{lesson.subject}</TableCell>
                      <TableCell className="max-w-[200px] truncate" title={lesson.lesson_range}>
                        {lesson.lesson_range}
                      </TableCell>
                      <TableCell>
                        <ScoreBadge score={lesson.understanding_score} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {getHomeworkLabel(lesson.homework_status)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(lesson)}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(lesson.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
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
    </div>
  );
}
