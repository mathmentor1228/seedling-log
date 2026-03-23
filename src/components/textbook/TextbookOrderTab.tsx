import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Loader2, Package, PackageCheck, Trash2, FileSpreadsheet, Download, Search, X, Pencil, ShoppingCart, ChevronDown, ChevronRight, Users } from 'lucide-react';
import { format } from 'date-fns';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

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

// Grouped view of same textbook
interface TextbookGroup {
  textbook_name: string;
  subject: string;
  unit_price: number;
  grade: string | null;
  category: string | null;
  orders: TextbookOrder[];
  totalQty: number;
  totalDistributed: number;
  // dominant status for filtering
  status: string;
}

const SUBJECTS = ['수학', '영어', '국어', '과학'];
const GRADES = ['초등', '중1', '중2', '중3', '고1', '고2', '고3'];
const CATEGORIES = ['내신', '문법', '개념', '유형', '심화', '독해', '단어', '기타'];
const ORDER_STATUSES = ['교재신청', '주문중', '입고완료'] as const;

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

  // Expanded groups
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Duplicate check state
  const [duplicateWarningShown, setDuplicateWarningShown] = useState(false);
  const [showDuplicateAlert, setShowDuplicateAlert] = useState(false);
  const [duplicateMatches, setDuplicateMatches] = useState<TextbookGroup[]>([]);

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
        if (updated.status === '입고완료' && updated.requested_by === user?.id) {
          toast.success(`📦 "${updated.textbook_name}" 교재가 입고 완료되었습니다!`, { duration: 6000 });
        }
        fetchOrders();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'textbook_orders' }, (payload) => {
        const newOrder = payload.new as any;
        if (role === 'admin' && newOrder.requested_by !== user?.id) {
          toast.info(`📋 ${newOrder.requested_by_name}님이 "${newOrder.textbook_name}" 교재를 신청했습니다`, { duration: 8000 });
        }
        fetchOrders();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, role, fetchOrders]);

  // Check for duplicate textbooks when name changes (use orders directly to avoid forward reference)
  const checkDuplicates = useCallback((inputName: string) => {
    if (inputName.trim().length < 2) {
      setDuplicateMatches([]);
      return;
    }
    const lowerInput = inputName.trim().toLowerCase();
    const matchingNames = new Set<string>();
    orders.forEach(o => {
      if (o.textbook_name.toLowerCase().includes(lowerInput) || lowerInput.includes(o.textbook_name.toLowerCase())) {
        matchingNames.add(o.textbook_name);
      }
    });
    // Build lightweight group info for display
    const matches: TextbookGroup[] = Array.from(matchingNames).map(tName => {
      const matching = orders.filter(o => o.textbook_name === tName);
      return {
        textbook_name: tName,
        subject: matching[0]?.subject || '',
        unit_price: matching[0]?.unit_price || 0,
        grade: matching[0]?.grade || null,
        category: matching[0]?.category || null,
        orders: matching,
        totalQty: matching.reduce((s, o) => s + o.quantity, 0),
        totalDistributed: matching.reduce((s, o) => s + (o.distributed_qty || 0), 0),
        status: matching[0]?.status || '교재신청',
      };
    });
    setDuplicateMatches(matches);
  }, [orders]);

  const handleCreate = async () => {
    if (!name.trim()) { toast.error('교재명을 입력해주세요'); return; }
    if (!price.trim() || isNaN(Number(price))) { toast.error('단가를 입력해주세요'); return; }

    // Show duplicate warning once if similar textbooks exist
    if (duplicateMatches.length > 0 && !duplicateWarningShown) {
      setShowDuplicateAlert(true);
      return;
    }

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
      status: '교재신청',
    } as any);
    if (error) { toast.error('신청 실패'); console.error(error); }
    else {
      toast.success('교재 신청이 등록되었습니다');
      setShowDialog(false);
      setName(''); setSubject('수학'); setQty('1'); setPrice(''); setNotes(''); setGrade(''); setCategory('기타');
      setDuplicateWarningShown(false);
      setDuplicateMatches([]);
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

  const handleStatusChange = async (order: TextbookOrder, newStatus: string) => {
    const updates: any = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };
    if (newStatus === '입고완료') {
      updates.approved_at = new Date().toISOString();
      updates.approved_by_name = userName;
    }
    const { error } = await supabase.from('textbook_orders').update(updates).eq('id', order.id);
    if (error) toast.error('상태 변경 실패');
    else { toast.success(`"${order.textbook_name}" → ${newStatus}`); fetchOrders(); }
  };

  const handleBulkStatusChange = async (orderIds: string[], newStatus: string) => {
    const updates: any = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };
    if (newStatus === '입고완료') {
      updates.approved_at = new Date().toISOString();
      updates.approved_by_name = userName;
    }
    const { error } = await supabase.from('textbook_orders').update(updates).in('id', orderIds);
    if (error) toast.error('상태 변경 실패');
    else { toast.success(`${orderIds.length}건 → ${newStatus}`); fetchOrders(); }
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

  // Normalize old status values
  const normalizeStatus = (s: string) => {
    if (s === '신청') return '교재신청';
    return s;
  };

  // Group orders by textbook_name + subject + unit_price
  const groups = useMemo((): TextbookGroup[] => {
    const map = new Map<string, TextbookGroup>();
    orders.forEach(o => {
      const key = `${o.textbook_name}||${o.subject}||${o.unit_price}`;
      const status = normalizeStatus(o.status);
      if (!map.has(key)) {
        map.set(key, {
          textbook_name: o.textbook_name,
          subject: o.subject,
          unit_price: o.unit_price,
          grade: o.grade || null,
          category: o.category || null,
          orders: [],
          totalQty: 0,
          totalDistributed: 0,
          status,
        });
      }
      const g = map.get(key)!;
      g.orders.push({ ...o, status });
      g.totalQty += o.quantity;
      g.totalDistributed += o.distributed_qty || 0;
      // Update grade/category from latest
      if (o.grade) g.grade = o.grade;
      if (o.category && o.category !== '기타') g.category = o.category;
      // Group status = most advanced status among orders
      const statusOrder = ['교재신청', '주문중', '입고완료'];
      if (statusOrder.indexOf(status) > statusOrder.indexOf(g.status)) {
        g.status = status;
      }
      // If any order is not 입고완료, group is not 입고완료
      if (status !== '입고완료' && g.status === '입고완료') {
        g.status = status;
      }
    });

    // Recalculate group status: use "lowest" status (most behind)
    map.forEach(g => {
      const statusOrder = ['교재신청', '주문중', '입고완료'];
      let minIdx = 2;
      g.orders.forEach(o => {
        const idx = statusOrder.indexOf(normalizeStatus(o.status));
        if (idx < minIdx) minIdx = idx;
      });
      g.status = statusOrder[minIdx];
      // If all are same status, use that
      const allSame = g.orders.every(o => normalizeStatus(o.status) === normalizeStatus(g.orders[0].status));
      if (allSame) g.status = normalizeStatus(g.orders[0].status);
    });

    return Array.from(map.values()).sort((a, b) => {
      // Sort by status priority, then name
      const statusOrder = ['교재신청', '주문중', '입고완료'];
      const diff = statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status);
      if (diff !== 0) return diff;
      return a.textbook_name.localeCompare(b.textbook_name);
    });
  }, [orders]);

  // Filter groups
  const filteredGroups = useMemo(() => {
    return groups.filter(g => {
      const matchesSearch = !searchQuery ||
        g.textbook_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        g.orders.some(o => o.requested_by_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        g.orders.some(o => o.notes && o.notes.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesSubject = filterSubject === 'all' || g.subject === filterSubject;
      const matchesStatus = filterStatus === 'all' || g.status === filterStatus || g.orders.some(o => normalizeStatus(o.status) === filterStatus);
      const matchesGrade = filterGrade === 'all' || g.grade === filterGrade;
      const matchesCategory = filterCategory === 'all' || g.category === filterCategory;
      return matchesSearch && matchesSubject && matchesStatus && matchesGrade && matchesCategory;
    });
  }, [groups, searchQuery, filterSubject, filterStatus, filterGrade, filterCategory]);

  const hasActiveFilters = searchQuery || filterSubject !== 'all' || filterStatus !== 'all' || filterGrade !== 'all' || filterCategory !== 'all';

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const subjectColor = (s: string) => {
    switch (s) {
      case '수학': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
      case '영어': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
      case '국어': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
      case '과학': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const statusColor = (s: string) => {
    switch (s) {
      case '교재신청': return 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300';
      case '주문중': return 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-300';
      case '입고완료': return 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const statusBorderColor = (s: string) => {
    switch (s) {
      case '교재신청': return 'border-l-orange-400';
      case '주문중': return 'border-l-sky-400';
      case '입고완료': return 'border-l-emerald-400';
      default: return '';
    }
  };

  // Stats
  const statCounts = useMemo(() => {
    const counts = { '교재신청': 0, '주문중': 0, '입고완료': 0 };
    orders.forEach(o => {
      const s = normalizeStatus(o.status);
      if (s in counts) counts[s as keyof typeof counts]++;
    });
    return counts;
  }, [orders]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">교재 신청 → 주문 중 → 입고 완료 순서로 관리합니다.</p>
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
                    <Input value={name} onChange={e => { setName(e.target.value); checkDuplicates(e.target.value); setDuplicateWarningShown(false); }} placeholder="[개념]교재명_중1" />
                    <p className="text-[10px] text-muted-foreground mt-0.5">[개념/유형/심화/응용/내신/독해/문법/듣기/기타]교재명_학년/레벨명</p>
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
                    <Input type="number" min="0" value={price} onChange={e => setPrice(e.target.value)} placeholder="정가 입력 (예: 15000)" />
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
              {SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
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
              {ORDER_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
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
      <div className="grid grid-cols-3 gap-3">
        {ORDER_STATUSES.map(s => (
          <Card
            key={s}
            className={cn(
              "p-4 text-center cursor-pointer hover:bg-muted/50 transition-colors",
              filterStatus === s && "ring-2 ring-primary"
            )}
            onClick={() => setFilterStatus(filterStatus === s ? 'all' : s)}
          >
            <p className="text-2xl font-bold text-foreground">{statCounts[s]}</p>
            <p className="text-xs text-muted-foreground mt-1">{s}</p>
          </Card>
        ))}
      </div>

      {/* Grouped order list */}
      <div className="space-y-3">
        {filteredGroups.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-12">
            {hasActiveFilters ? '검색 결과가 없습니다' : '등록된 교재 신청이 없습니다'}
          </p>
        )}
        {filteredGroups.map(group => {
          const groupKey = `${group.textbook_name}||${group.subject}||${group.unit_price}`;
          const isExpanded = expandedGroups.has(groupKey);
          const hasMultipleOrders = group.orders.length > 1;
          const remaining = group.totalQty - group.totalDistributed;

          return (
            <Card
              key={groupKey}
              className={cn(
                "border-l-4 transition-colors",
                statusBorderColor(group.status)
              )}
            >
              {/* Group header */}
              <div
                className={cn("p-4 cursor-pointer hover:bg-muted/30", hasMultipleOrders && "select-none")}
                onClick={() => hasMultipleOrders && toggleGroup(groupKey)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {hasMultipleOrders && (
                        isExpanded
                          ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                          : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      )}
                      <p className="font-medium text-foreground">{group.textbook_name}</p>
                      <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium", subjectColor(group.subject))}>{group.subject}</span>
                      {group.grade && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{group.grade}</Badge>}
                      {group.category && group.category !== '기타' && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{group.category}</Badge>}
                      <Badge className={cn("text-[10px]", statusColor(group.status))}>{group.status}</Badge>
                    </div>
                    <div className="flex items-center gap-4 mt-1.5 text-sm text-muted-foreground">
                      <span>
                        총 <span className="font-semibold text-foreground">{group.totalQty}권</span>
                        {' × '}{group.unit_price.toLocaleString()}원
                        {' = '}<span className="font-medium text-foreground">{(group.totalQty * group.unit_price).toLocaleString()}원</span>
                      </span>
                      {hasMultipleOrders && (
                        <span className="flex items-center gap-1 text-xs">
                          <Users className="w-3 h-3" />{group.orders.length}명 신청
                        </span>
                      )}
                      {group.status === '입고완료' && (
                        <span className="text-xs">
                          배부 {group.totalDistributed}권 · <span className={cn("font-medium", remaining <= 0 ? 'text-destructive' : 'text-foreground')}>남은 {remaining}권</span>
                        </span>
                      )}
                    </div>
                    {/* Show teacher breakdown summary when collapsed and multi-order */}
                    {hasMultipleOrders && !isExpanded && (
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                        {group.orders.map(o => (
                          <span key={o.id}>{o.requested_by_name} {o.quantity}권</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Status change buttons - admin only */}
                    {role === 'admin' && group.status !== '입고완료' && (
                      <>
                        {group.status === '교재신청' && (
                          <Button size="sm" variant="outline" className="gap-1 text-sky-600 border-sky-200 hover:bg-sky-50 text-xs" onClick={(e) => { e.stopPropagation(); handleBulkStatusChange(group.orders.map(o => o.id), '주문중'); }}>
                            <ShoppingCart className="w-3.5 h-3.5" />주문중
                          </Button>
                        )}
                        {(group.status === '교재신청' || group.status === '주문중') && (
                          <Button size="sm" variant="default" className="gap-1 text-xs" onClick={(e) => { e.stopPropagation(); handleBulkStatusChange(group.orders.map(o => o.id), '입고완료'); }}>
                            <PackageCheck className="w-3.5 h-3.5" />입고완료
                          </Button>
                        )}
                      </>
                    )}
                    {!hasMultipleOrders && (
                      <>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); openEdit(group.orders[0]); }}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        {role === 'admin' && (
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={(e) => { e.stopPropagation(); handleDelete(group.orders[0].id); }}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Expanded: per-teacher breakdown */}
              {isExpanded && hasMultipleOrders && (
                <div className="border-t border-border px-4 pb-4 pt-2 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground mb-2">선생님별 신청 내역</p>
                  {group.orders.map(order => (
                    <div key={order.id} className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/30 hover:bg-muted/50">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{order.requested_by_name}</span>
                          <span className="text-sm text-muted-foreground">{order.quantity}권</span>
                          <Badge className={cn("text-[9px]", statusColor(normalizeStatus(order.status)))}>{normalizeStatus(order.status)}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {format(new Date(order.created_at), 'MM/dd HH:mm')}
                          {order.notes && <span className="ml-2">📝 {order.notes}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {role === 'admin' && normalizeStatus(order.status) === '교재신청' && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-sky-600" onClick={() => handleStatusChange(order, '주문중')}>
                            주문중
                          </Button>
                        )}
                        {role === 'admin' && normalizeStatus(order.status) !== '입고완료' && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-emerald-600" onClick={() => handleStatusChange(order, '입고완료')}>
                            입고
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(order)}>
                          <Pencil className="w-3 h-3" />
                        </Button>
                        {role === 'admin' && (
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(order.id)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>

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
                <Input type="number" min="0" value={editPrice} onChange={e => setEditPrice(e.target.value)} placeholder="정가 입력" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground">학년</label>
                <Select value={editGrade || '__none__'} onValueChange={v => setEditGrade(v === '__none__' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="학년 선택" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">선택 안함</SelectItem>
                    {GRADES.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">분류</label>
                <Select value={editCategory} onValueChange={setEditCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
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

      {/* Duplicate textbook warning dialog */}
      <Dialog open={showDuplicateAlert} onOpenChange={setShowDuplicateAlert}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-warning">
              <AlertTriangle className="w-5 h-5" />유사 교재 재고 확인
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-foreground">
              입력하신 교재명과 유사한 교재가 이미 등록되어 있습니다. 재고를 확인하셨나요?
            </p>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {duplicateMatches.map(g => (
                <div key={g.textbook_name} className="text-[12px] px-3 py-2 rounded-md bg-muted border border-border">
                  <span className="font-medium text-foreground">{g.textbook_name}</span>
                  <span className="text-muted-foreground ml-1">({g.subject})</span>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowDuplicateAlert(false)}>
              취소
            </Button>
            <Button onClick={() => {
              setShowDuplicateAlert(false);
              setDuplicateWarningShown(true);
              // Re-trigger create after confirming
              setTimeout(() => handleCreate(), 100);
            }}>
              확인했습니다, 신청하기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
