import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import type { Textbook } from './types';

interface Props {
  schoolName: string;
  textbooks: Textbook[];
  onRefetch: () => void;
}

export function TextbookTab({ schoolName, textbooks, onRefetch }: Props) {
  const { user } = useAuth();
  const schoolTextbooks = textbooks.filter(t => t.school_name === schoolName);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ grade: '', subject: '', publisher: '', textbook_name: '' });

  const grouped = [1, 2, 3].map(grade => ({
    grade,
    items: schoolTextbooks.filter(t => t.grade === grade),
  })).filter(g => g.items.length > 0);

  const handleAdd = async () => {
    if (!form.subject.trim()) { toast.error('과목을 입력해주세요'); return; }
    const { error } = await supabase.from('school_textbooks').insert({
      school_name: schoolName,
      grade: form.grade ? parseInt(form.grade) : null,
      subject: form.subject,
      publisher: form.publisher || null,
      textbook_name: form.textbook_name || null,
      created_by: user?.id,
    } as any);
    if (error) { toast.error(error.message); return; }
    toast.success('교과서 정보 추가 완료');
    setAddOpen(false);
    setForm({ grade: '', subject: '', publisher: '', textbook_name: '' });
    onRefetch();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return;
    await supabase.from('school_textbooks').delete().eq('id', id);
    onRefetch();
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1">
              <Plus className="w-3.5 h-3.5" /> 교과서 추가
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xs">
            <DialogHeader><DialogTitle>교과서 정보 추가</DialogTitle></DialogHeader>
            <div className="space-y-3 mt-2">
              <div>
                <Label className="text-xs">학년</Label>
                <Input value={form.grade} onChange={e => setForm(p => ({ ...p, grade: e.target.value }))} placeholder="1" className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">과목 *</Label>
                <Input value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">출판사</Label>
                <Input value={form.publisher} onChange={e => setForm(p => ({ ...p, publisher: e.target.value }))} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">교과서명</Label>
                <Input value={form.textbook_name} onChange={e => setForm(p => ({ ...p, textbook_name: e.target.value }))} className="h-8 text-sm" />
              </div>
              <Button size="sm" className="w-full" onClick={handleAdd}>추가</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {schoolTextbooks.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">등록된 교과서 정보가 없습니다</p>
      ) : (
        <div className="space-y-4">
          {grouped.map(g => (
            <div key={g.grade}>
              <h3 className="text-sm font-semibold mb-2">{g.grade}학년</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>과목</TableHead>
                    <TableHead>출판사</TableHead>
                    <TableHead>교과서명</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {g.items.map(t => (
                    <TableRow key={t.id}>
                      <TableCell className="text-xs font-medium">{t.subject}</TableCell>
                      <TableCell className="text-xs">{t.publisher || '-'}</TableCell>
                      <TableCell className="text-xs">{t.textbook_name || '-'}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDelete(t.id)}>
                          <Trash2 className="w-3 h-3 text-muted-foreground" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ))}
          {/* Ungrouped (no grade) */}
          {schoolTextbooks.filter(t => !t.grade).length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2">학년 미지정</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>과목</TableHead>
                    <TableHead>출판사</TableHead>
                    <TableHead>교과서명</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schoolTextbooks.filter(t => !t.grade).map(t => (
                    <TableRow key={t.id}>
                      <TableCell className="text-xs font-medium">{t.subject}</TableCell>
                      <TableCell className="text-xs">{t.publisher || '-'}</TableCell>
                      <TableCell className="text-xs">{t.textbook_name || '-'}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDelete(t.id)}>
                          <Trash2 className="w-3 h-3 text-muted-foreground" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
