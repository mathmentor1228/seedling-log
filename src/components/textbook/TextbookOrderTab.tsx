import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Loader2, Package, PackageCheck, Trash2, FileSpreadsheet, Download, Search, X, Pencil } from 'lucide-react';
import { format } from 'date-fns';

interface TextbookOrder {
  id: string;
  textbook_name: string;
  quantity: number;
  subject: string;
  unit_price: number;
  status: string;
  requested_by: string;
  requested_by_name: string;
  approved_at: string | null;
  approved_by_name: string | null;
  notes: string | null;
  created_at: string;
  distributed_qty?: number;
  grade?: string | null;
  category?: string | null;
}

const SUBJECTS = ['수학', '영어', '국어', '과학'];
const GRADES = ['초등', '중1', '중2', '중3', '고1', '고2', '고3'];
const CATEGORIES = ['내신', '문법', '개념', '유형', '심화', '독해', '단어', '기타'];

export function TextbookOrderTab() {
  const { user, role } = useAuth();
  const [orders, setOrders] = useState<TextbookOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [userName, setUserName] = useState('');

  // Search & filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSubject, setFilterSubject] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterGrade, setFilterGrade] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');

  // Create form
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('수학');
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [grade, setGrade] = useState('');
  const [category, setCategory] = useState('기타');

  // Edit state
  const [editOrder, setEditOrder] = useState<TextbookOrder | null>(null);
  const [editName, setEditName] = useState('');
  const [editSubject, setEditSubject] = useState('수학');
  const [editQty, setEditQty] = useState('1');
  const [editPrice, setEditPrice] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editGrade, setEditGrade] = useState('');
  const [editCategory, setEditCategory] = useState('기타');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      supabase.from('profiles').select('full_name').eq('id', user.id).single()
        .then(({ data }) => setUserName((data as any)?.full_name || user.email || ''));
    }
  }, [user]);

  const fetchOrders = useCallback(async () => {
    const { data, error } = await supabase
      .from('textbook_orders')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) toast.error('교재 신청 목록을 불러올 수 없습니다');
    else setOrders((data as any[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('textbook-orders-realtime')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'textbook_orders' }, (payload) => {
        const updated = payload.new as any;
        // Notify requesting teacher when their order is approved
        if (updated.status === '입고완료' && updated.requested_by === user?.id) {
          toast.success(`📦 "${updated.textbook_name}" 교재가 입고 완료되었습니다!`, { duration: 6000 });
        }
        fetchOrders();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'textbook_orders' }, (payload) => {
        const newOrder = payload.new as any;
        // Notify admin when a new order is requested by someone else
        if (role === 'admin' && newOrder.requested_by !== user?.id && newOrder.status === '신청') {
          toast.info(`📋 ${newOrder.requested_by_name}님이 "${newOrder.textbook_name}" 교재를 입고 요청했습니다`, { duration: 8000 });
        }
        fetchOrders();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, role, fetchOrders]);

  const handleCreate = async () => {
    if (!name.trim()) { toast.error('교재명을 입력해주세요'); return; }
    if (!price.trim() || isNaN(Number(price))) { toast.error('단가를 입력해주세요'); return; }
    setCreating(true);
    const { error } = await supabase.from('textbook_orders').insert({
      textbook_name: name.trim(),
      subject,
      quantity: parseInt(qty) || 1,
      unit_price: parseInt(price) || 0,
      requested_by: user!.id,
      requested_by_name: userName,
      notes: notes.trim() || null,
      grade: grade || null,
      category: category || '기타',
    } as any);
    if (error) { toast.error('신청 실패'); console.error(error); }
    else {
      toast.success('교재 신청이 등록되었습니다');
      setShowDialog(false);
      setName(''); setSubject('수학'); setQty('1'); setPrice(''); setNotes(''); setGrade(''); setCategory('기타');
      fetchOrders();
    }
    setCreating(false);
  };

  const openEdit = (order: TextbookOrder) => {
    setEditOrder(order);
    setEditName(order.textbook_name);
    setEditSubject(order.subject);
    setEditQty(String(order.quantity));
    setEditPrice(String(order.unit_price));
    setEditNotes(order.notes || '');
    setEditGrade(order.grade || '');
    setEditCategory(order.category || '기타');
  };

  const handleEdit = async () => {
    if (!editOrder) return;
    if (!editName.trim()) { toast.error('교재명을 입력해주세요'); return; }
    if (!editPrice.trim() || isNaN(Number(editPrice))) { toast.error('단가를 입력해주세요'); return; }
    setSaving(true);
    const { error } = await supabase.from('textbook_orders').update({
      textbook_name: editName.trim(),
      subject: editSubject,
      quantity: parseInt(editQty) || 1,
      unit_price: parseInt(editPrice) || 0,
      notes: editNotes.trim() || null,
      grade: editGrade || null,
      category: editCategory || '기타',
      updated_at: new Date().toISOString(),
    } as any).eq('id', editOrder.id);
    if (error) { toast.error('수정 실패'); console.error(error); }
    else {
      toast.success('교재 정보가 수정되었습니다');
      setEditOrder(null);
      fetchOrders();
    }
    setSaving(false);
  };

  const handleApprove = async (order: TextbookOrder) => {
    if (!confirm(`"${order.textbook_name}" ${order.quantity}권을 입고 완료 처리하시겠습니까?`)) return;
    const { error } = await supabase.from('textbook_orders').update({
      status: '입고완료',
      approved_at: new Date().toISOString(),
      approved_by_name: userName,
      updated_at: new Date().toISOString(),
    } as any).eq('id', order.id);
    if (error) toast.error('입고 처리 실패');
    else { toast.success('입고 완료 처리되었습니다'); fetchOrders(); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 신청을 삭제하시겠습니까?')) return;
    const { error } = await supabase.from('textbook_orders').delete().eq('id', id);
    if (error) toast.error('삭제 실패');
    else { toast.success('삭제되었습니다'); fetchOrders(); }
  };

  // CSV/Excel bulk import
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const handleDownloadTemplate = () => {
    const bom = '\uFEFF';
    const csv = bom + '교재명,과목,권수,단가,비고\n개념원리 수학1,수학,10,15000,\n능률 영어 중2,영어,5,13000,2학기용';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = '교재_일괄등록_양식.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);

    const text = await file.text();
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const dataLines = lines.slice(1);
    if (dataLines.length === 0) {
      toast.error('데이터가 없습니다');
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const parseCsvLine = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { inQuotes = !inQuotes; }
        else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
        else { current += ch; }
      }
      result.push(current.trim());
      return result;
    };

    const parseNumber = (val: string): number => parseInt(val.replace(/[,\s"]/g, '')) || 0;

    const rows = dataLines.map(line => {
      const cols = parseCsvLine(line);
      return {
        textbook_name: cols[0]?.replace(/^"|"$/g, '') || '',
        subject: cols[1]?.replace(/^"|"$/g, '') || '수학',
        quantity: parseNumber(cols[2] || '1') || 1,
        unit_price: parseNumber(cols[3] || '0'),
        notes: cols[4]?.replace(/^"|"$/g, '') || null,
        requested_by: user!.id,
        requested_by_name: userName,
        status: '입고완료',
      };
    }).filter(r => r.textbook_name && r.unit_price > 0);

    if (rows.length === 0) {
      toast.error('유효한 데이터가 없습니다. 교재명과 단가를 확인해주세요.');
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const { error } = await supabase.from('textbook_orders').insert(rows as any);
    if (error) { toast.error('일괄 등록 실패'); console.error(error); }
    else { toast.success(`${rows.length}건의 교재가 일괄 등록되었습니다`); fetchOrders(); }

    setImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  // Filter
  const filteredOrders = orders.filter(o => {
    const matchesSearch = !searchQuery ||
      o.textbook_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.requested_by_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (o.notes && o.notes.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesSubject = filterSubject === 'all' || o.subject === filterSubject;
    const matchesStatus = filterStatus === 'all' || o.status === filterStatus;
    const matchesGrade = filterGrade === 'all' || o.grade === filterGrade;
    const matchesCategory = filterCategory === 'all' || o.category === filterCategory;
    return matchesSearch && matchesSubject && matchesStatus && matchesGrade && matchesCategory;
  });

  const pending = filteredOrders.filter(o => o.status === '신청');
  const completed = filteredOrders.filter(o => o.status === '입고완료');
  const subjects = [...new Set(orders.map(o => o.subject))].sort();
  const hasActiveFilters = searchQuery || filterSubject !== 'all' || filterStatus !== 'all' || filterGrade !== 'all' || filterCategory !== 'all';

  const subjectColor = (s: string) => {
    switch (s) {
      case '수학': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
      case '영어': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
      case '국어': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
      case '과학': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">교재를 신청하고 입고 상태를 관리합니다.</p>
        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFileImport} />
          <Button size="sm" variant="outline" className="gap-1.5" onClick={handleDownloadTemplate}>
            <Download className="w-3.5 h-3.5" />양식
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => fileInputRef.current?.click()} disabled={importing}>
            {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
            일괄 등록
          </Button>
          <Dialog open={showDialog} onOpenChange={setShowDialog}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5"><Plus className="w-4 h-4" />교재 신청</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>교재 신청</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-foreground">교재명 *</label>
                    <Input value={name} onChange={e => setName(e.target.value)} placeholder="교재명 입력" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground">과목</label>
                    <Select value={subject} onValueChange={setSubject}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-foreground">권수</label>
                    <Input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground">단가 (원) *</label>
                    <Input type="number" min="0" value={price} onChange={e => setPrice(e.target.value)} placeholder="15000" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-foreground">학년</label>
                    <Select value={grade || '__none__'} onValueChange={v => setGrade(v === '__none__' ? '' : v)}>
                      <SelectTrigger><SelectValue placeholder="학년 선택" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">선택 안함</SelectItem>
                        {GRADES.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground">분류</label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">비고</label>
                  <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="메모 (선택)" />
                </div>
                <Button onClick={handleCreate} disabled={creating} className="w-full">
                  {creating && <Loader2 className="w-4 h-4 animate-spin mr-2" />}신청하기
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="교재명, 신청자, 비고 검색..."
              className="pl-8 pr-8"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <Select value={filterSubject} onValueChange={setFilterSubject}>
            <SelectTrigger className="w-full sm:w-[110px]"><SelectValue placeholder="과목" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 과목</SelectItem>
              {subjects.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterGrade} onValueChange={setFilterGrade}>
            <SelectTrigger className="w-full sm:w-[110px]"><SelectValue placeholder="학년" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 학년</SelectItem>
              {GRADES.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-full sm:w-[110px]"><SelectValue placeholder="분류" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 분류</SelectItem>
              {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-full sm:w-[120px]"><SelectValue placeholder="상태" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 상태</SelectItem>
              <SelectItem value="신청">입고 대기</SelectItem>
              <SelectItem value="입고완료">입고 완료</SelectItem>
            </SelectContent>
          </Select>
          {hasActiveFilters && (
            <Button size="sm" variant="ghost" className="gap-1 text-muted-foreground" onClick={() => { setSearchQuery(''); setFilterSubject('all'); setFilterStatus('all'); setFilterGrade('all'); setFilterCategory('all'); }}>
              <X className="w-3.5 h-3.5" />초기화
            </Button>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4 text-center cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setFilterStatus(filterStatus === '신청' ? 'all' : '신청')}>
          <p className="text-2xl font-bold text-foreground">{pending.length}</p>
          <p className="text-xs text-muted-foreground mt-1">입고 대기</p>
        </Card>
        <Card className="p-4 text-center cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setFilterStatus(filterStatus === '입고완료' ? 'all' : '입고완료')}>
          <p className="text-2xl font-bold text-foreground">{completed.length}</p>
          <p className="text-xs text-muted-foreground mt-1">입고 완료</p>
        </Card>
      </div>

      {/* Pending orders */}
      {pending.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5"><Package className="w-4 h-4" />입고 대기</h3>
          <div className="space-y-2">
            {pending.map(order => (
              <Card key={order.id} className="p-4 border-l-4 border-l-warning">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-foreground">{order.textbook_name}</p>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${subjectColor(order.subject)}`}>{order.subject}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {order.quantity}권 × {order.unit_price.toLocaleString()}원 = <span className="font-medium text-foreground">{(order.quantity * order.unit_price).toLocaleString()}원</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      신청: {order.requested_by_name} · {format(new Date(order.created_at), 'MM/dd HH:mm')}
                    </p>
                    {order.notes && <p className="text-xs text-muted-foreground mt-0.5">📝 {order.notes}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(order)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    {role === 'admin' && (
                      <>
                        <Button size="sm" variant="default" className="gap-1" onClick={() => handleApprove(order)}>
                          <PackageCheck className="w-3.5 h-3.5" />입고
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDelete(order.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Completed orders */}
      {completed.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5"><PackageCheck className="w-4 h-4" />입고 완료</h3>
          <div className="space-y-2">
            {completed.map(order => (
              <Card key={order.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-foreground">{order.textbook_name}</p>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${subjectColor(order.subject)}`}>{order.subject}</span>
                      <Badge variant="success" className="text-[10px]">입고완료</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      입고 {order.quantity}권 × {order.unit_price.toLocaleString()}원
                      {' · '}배부 {order.distributed_qty || 0}권
                      {' · '}
                      <span className={`font-medium ${(order.quantity - (order.distributed_qty || 0)) <= 0 ? 'text-destructive' : 'text-foreground'}`}>
                        남은 {order.quantity - (order.distributed_qty || 0)}권
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      신청: {order.requested_by_name} · 입고: {order.approved_by_name} ({order.approved_at && format(new Date(order.approved_at), 'MM/dd')})
                    </p>
                    {order.notes && <p className="text-xs text-muted-foreground mt-0.5">📝 {order.notes}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(order)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    {role === 'admin' && (
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDelete(order.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {filteredOrders.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-12">
          {hasActiveFilters ? '검색 결과가 없습니다' : '등록된 교재 신청이 없습니다'}
        </p>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editOrder} onOpenChange={open => { if (!open) setEditOrder(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>교재 정보 수정</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground">교재명 *</label>
                <Input value={editName} onChange={e => setEditName(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">과목</label>
                <Select value={editSubject} onValueChange={setEditSubject}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground">권수</label>
                <Input type="number" min="1" value={editQty} onChange={e => setEditQty(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">단가 (원) *</label>
                <Input type="number" min="0" value={editPrice} onChange={e => setEditPrice(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">비고</label>
              <Input value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="메모 (선택)" />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setEditOrder(null)}>취소</Button>
            <Button onClick={handleEdit} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
