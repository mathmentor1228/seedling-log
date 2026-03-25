import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Plus, Copy, Trash2, Pencil, FileText, Check, Search } from 'lucide-react';

const TEMPLATE_CATEGORIES = ['일반 안내', '수업 안내', '시험 안내', '등원/하원', '행사 안내', '원비 안내', '기타'];

interface Template {
  id: string;
  title: string;
  category: string;
  body: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  sort_order: number;
}

export function ParentAnnouncementTemplates() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [copied, setCopied] = useState<string | null>(null);

  // Form
  const [formTitle, setFormTitle] = useState('');
  const [formCategory, setFormCategory] = useState(TEMPLATE_CATEGORIES[0]);
  const [formBody, setFormBody] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchTemplates = useCallback(async () => {
    const { data, error } = await supabase
      .from('parent_announcement_templates')
      .select('*')
      .order('sort_order')
      .order('created_at', { ascending: false });
    if (!error) setTemplates((data || []) as Template[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const handleSave = async () => {
    if (!formTitle.trim() || !formBody.trim()) {
      toast({ title: '제목과 내용을 입력해주세요', variant: 'destructive' });
      return;
    }
    setSaving(true);
    if (editingTemplate) {
      const { error } = await supabase
        .from('parent_announcement_templates')
        .update({
          title: formTitle.trim(),
          category: formCategory,
          body: formBody.trim(),
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', editingTemplate.id);
      if (!error) toast({ title: '수정 완료' });
    } else {
      const { error } = await supabase.from('parent_announcement_templates').insert({
        title: formTitle.trim(),
        category: formCategory,
        body: formBody.trim(),
        created_by: user?.email || '',
      } as any);
      if (!error) toast({ title: '등록 완료' });
    }
    setSaving(false);
    resetForm();
    fetchTemplates();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 양식을 삭제하시겠습니까?')) return;
    await supabase.from('parent_announcement_templates').delete().eq('id', id);
    setTemplates(prev => prev.filter(t => t.id !== id));
    toast({ title: '삭제 완료' });
  };

  const handleCopy = async (body: string, id: string) => {
    await navigator.clipboard.writeText(body);
    setCopied(id);
    toast({ title: '클립보드에 복사되었습니다' });
    setTimeout(() => setCopied(null), 2000);
  };

  const handleEdit = (t: Template) => {
    setEditingTemplate(t);
    setFormTitle(t.title);
    setFormCategory(t.category);
    setFormBody(t.body);
    setShowDialog(true);
  };

  const resetForm = () => {
    setShowDialog(false);
    setEditingTemplate(null);
    setFormTitle('');
    setFormCategory(TEMPLATE_CATEGORIES[0]);
    setFormBody('');
  };

  const filtered = templates.filter(t => {
    if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;
    if (search && !t.title.includes(search) && !t.body.includes(search)) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold">학부모 안내문 양식</h2>
          <Badge variant="secondary" className="text-xs">{templates.length}개</Badge>
        </div>
        <Button size="sm" onClick={() => { resetForm(); setShowDialog(true); }}>
          <Plus className="w-4 h-4 mr-1" /> 새 양식
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-8 h-9 text-sm" placeholder="양식 검색..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[140px] h-9 text-sm">
            <SelectValue placeholder="분류" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            {TEMPLATE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">로딩 중...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">등록된 양식이 없습니다</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map(t => (
            <Card key={t.id} className="group">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <Badge variant="outline" className="text-[10px] mb-1">{t.category}</Badge>
                    <CardTitle className="text-sm font-semibold truncate">{t.title}</CardTitle>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(t)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(t.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-4 mb-3">{t.body}</p>
                <Button
                  variant="outline" size="sm" className="w-full h-8 text-xs"
                  onClick={() => handleCopy(t.body, t.id)}
                >
                  {copied === t.id ? <Check className="w-3.5 h-3.5 mr-1 text-green-600" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                  {copied === t.id ? '복사됨!' : '내용 복사'}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={open => { if (!open) resetForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? '양식 수정' : '새 안내문 양식 등록'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">분류</Label>
                <Select value={formCategory} onValueChange={setFormCategory}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TEMPLATE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">제목</Label>
                <Input className="h-9 text-sm" value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="예: 여름방학 안내" />
              </div>
            </div>
            <div>
              <Label className="text-xs">내용</Label>
              <Textarea className="min-h-[200px] text-sm" value={formBody} onChange={e => setFormBody(e.target.value)}
                placeholder="안녕하세요, 더멘토입니다.&#10;&#10;..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>취소</Button>
            <Button onClick={handleSave} disabled={saving}>
              {editingTemplate ? '수정' : '등록'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
