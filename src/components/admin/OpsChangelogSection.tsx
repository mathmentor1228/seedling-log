import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { Plus, Pencil, Trash2, FileText, Loader2 } from 'lucide-react';

// OPS_CHANGELOG_V1

interface OpsChangelogEntry {
  id: string;
  log_date: string;
  log_type: string;
  target: string | null;
  content: string;
  author_name: string;
  author_id: string | null;
  created_at: string;
}

const LOG_TYPES = [
  { value: 'teacher_change', label: '선생님 변경' },
  { value: 'class_change', label: '클래스 변경' },
  { value: 'policy_change', label: '운영 정책 변경' },
  { value: 'schedule_change', label: '시간표 변경' },
  { value: 'general', label: '일반' },
];

function getLogTypeLabel(type: string): string {
  return LOG_TYPES.find(t => t.value === type)?.label || type;
}

function getLogTypeBadgeVariant(type: string): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (type) {
    case 'teacher_change': return 'default';
    case 'class_change': return 'secondary';
    case 'policy_change': return 'destructive';
    case 'schedule_change': return 'outline';
    default: return 'outline';
  }
}

export function OpsChangelogSection() {
  const { toast } = useToast();
  const { user } = useAuth();
  
  const [entries, setEntries] = useState<OpsChangelogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Form state
  const [formOpen, setFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<OpsChangelogEntry | null>(null);
  const [saving, setSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    log_date: format(new Date(), 'yyyy-MM-dd'),
    log_type: 'general',
    target: '',
    content: '',
    author_name: '',
  });

  useEffect(() => {
    fetchEntries();
  }, []);

  async function fetchEntries() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('ops_changelog')
        .select('*')
        .order('log_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      setEntries(data || []);
    } catch (error) {
      console.error('Error fetching changelog:', error);
      toast({ title: '이력 로딩 실패', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  function openNewForm() {
    setEditingEntry(null);
    setFormData({
      log_date: format(new Date(), 'yyyy-MM-dd'),
      log_type: 'general',
      target: '',
      content: '',
      author_name: '',
    });
    setFormOpen(true);
  }

  function openEditForm(entry: OpsChangelogEntry) {
    setEditingEntry(entry);
    setFormData({
      log_date: entry.log_date,
      log_type: entry.log_type,
      target: entry.target || '',
      content: entry.content,
      author_name: entry.author_name,
    });
    setFormOpen(true);
  }

  async function handleSave() {
    if (!formData.content.trim() || !formData.author_name.trim()) {
      toast({ title: '내용과 작성자를 입력해주세요', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      if (editingEntry) {
        // Update
        const { error } = await supabase
          .from('ops_changelog')
          .update({
            log_date: formData.log_date,
            log_type: formData.log_type,
            target: formData.target || null,
            content: formData.content,
            author_name: formData.author_name,
          })
          .eq('id', editingEntry.id);

        if (error) throw error;
        toast({ title: '수정되었습니다' });
      } else {
        // Insert
        const { error } = await supabase
          .from('ops_changelog')
          .insert({
            log_date: formData.log_date,
            log_type: formData.log_type,
            target: formData.target || null,
            content: formData.content,
            author_name: formData.author_name,
            author_id: user?.id || null,
          });

        if (error) throw error;
        toast({ title: '등록되었습니다' });
      }

      setFormOpen(false);
      fetchEntries();
    } catch (error) {
      console.error('Error saving changelog:', error);
      toast({ title: '저장 실패', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('이 이력을 삭제하시겠습니까?')) return;

    try {
      const { error } = await supabase
        .from('ops_changelog')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast({ title: '삭제되었습니다' });
      fetchEntries();
    } catch (error) {
      console.error('Error deleting changelog:', error);
      toast({ title: '삭제 실패', variant: 'destructive' });
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          <FileText className="h-5 w-5" />
          운영 변경 이력
          <Badge variant="outline" className="text-xs font-mono">OPS_CHANGELOG_V1</Badge>
        </CardTitle>
        <Button size="sm" onClick={openNewForm}>
          <Plus className="h-4 w-4 mr-1" />
          이력 추가
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            등록된 운영 변경 이력이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">날짜</TableHead>
                  <TableHead className="w-[120px]">유형</TableHead>
                  <TableHead className="w-[150px]">대상</TableHead>
                  <TableHead>내용</TableHead>
                  <TableHead className="w-[100px]">작성자</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map(entry => (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap">
                      {format(new Date(entry.log_date), 'M월 d일', { locale: ko })}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getLogTypeBadgeVariant(entry.log_type)}>
                        {getLogTypeLabel(entry.log_type)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {entry.target || '-'}
                    </TableCell>
                    <TableCell>
                      <div className="whitespace-pre-wrap text-sm max-h-24 overflow-y-auto">
                        {entry.content}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {entry.author_name}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditForm(entry)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(entry.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
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

      {/* Form Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingEntry ? '이력 수정' : '운영 변경 이력 추가'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>날짜</Label>
                <Input
                  type="date"
                  value={formData.log_date}
                  onChange={e => setFormData(prev => ({ ...prev, log_date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>유형</Label>
                <Select
                  value={formData.log_type}
                  onValueChange={value => setFormData(prev => ({ ...prev, log_type: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LOG_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>대상 (선택)</Label>
              <Input
                placeholder="예: 고등부 영어, 수학 A반"
                value={formData.target}
                onChange={e => setFormData(prev => ({ ...prev, target: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>내용 *</Label>
              <Textarea
                placeholder="변경 내용을 자세히 입력해주세요..."
                rows={5}
                value={formData.content}
                onChange={e => setFormData(prev => ({ ...prev, content: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>작성자 *</Label>
              <Input
                placeholder="예: 황은지"
                value={formData.author_name}
                onChange={e => setFormData(prev => ({ ...prev, author_name: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              취소
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {editingEntry ? '수정' : '등록'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
