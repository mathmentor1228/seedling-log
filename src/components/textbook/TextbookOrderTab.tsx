import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { StatCard } from '@/components/ui/stat-card';
import { toast } from 'sonner';
import { Plus, Loader2, Package, PackageCheck, Trash2, FileSpreadsheet, Download, Search, X, Pencil, ShoppingCart, Users, BookOpen, GraduationCap, Copy, ClipboardList } from 'lucide-react';
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
  textbook_type?: string;
  is_inhouse?: boolean;
  inhouse_author?: string | null;
}

interface TextbookGroup {
  textbook_name: string;
  subject: string;
  unit_price: number;
  grade: string | null;
  category: string | null;
  textbook_type: string;
  is_inhouse: boolean;
  inhouse_author: string | null;
  orders: TextbookOrder[];
  totalQty: number;
  totalDistributed: number;
  status: string;
  /** Stock available for distribution: 입고완료 qty - 배부 qty (학생용 only) */
  remainingStock: number;
  /** 입고완료 권수 합 (학생용) */
  receivedQty: number;
}

interface TextbookOrderTabProps {
  onNavigateToDistribution?: () => void;
}

const SUBJECTS = ['수학', '영어', '국어', '과학'];
const GRADES = ['초등', '중1', '중2', '중3', '고1', '고2', '고3'];
const CATEGORIES = ['내신', '문법', '개념', '유형', '심화', '독해', '단어', '기타'];
// 자체제작(원내 제작) 교재의 제작 선생님 후보
const INHOUSE_AUTHORS = ['이재진', '김민희', '김은수', '최윤기', '함유빈', '조준희', '이나연', '황은지'];
const ORDER_STATUSES = ['교재신청', '주문중', '입고완료'] as const;
const TEXTBOOK_TYPES = [
  { value: 'student', label: '학생용', icon: GraduationCap },
  { value: 'teacher', label: '교사용', icon: BookOpen },
] as const;

export function TextbookOrderTab({ onNavigateToDistribution }: TextbookOrderTabProps = {}) {
  const { user, role } = useAuth();
  const [orders, setOrders] = useState<TextbookOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [userName, setUserName] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [filterSubject, setFilterSubject] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterGrade, setFilterGrade] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterInhouse, setFilterInhouse] = useState<string>('all');

  const [name, setName] = useState('');
  const [subject, setSubject] = useState('수학');
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [grade, setGrade] = useState('');
  const [category, setCategory] = useState('기타');
  const [textbookType, setTextbookType] = useState<string>('student');
  const [isInhouse, setIsInhouse] = useState(false);
  const [inhouseAuthor, setInhouseAuthor] = useState('');

  const [editOrder, setEditOrder] = useState<TextbookOrder | null>(null);
  const [editName, setEditName] = useState('');
  const [editSubject, setEditSubject] = useState('수학');
  const [editQty, setEditQty] = useState('1');
  const [editPrice, setEditPrice] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editGrade, setEditGrade] = useState('');
  const [editCategory, setEditCategory] = useState('기타');
  const [editTextbookType, setEditTextbookType] = useState<string>('student');
  const [editIsInhouse, setEditIsInhouse] = useState(false);
  const [editInhouseAuthor, setEditInhouseAuthor] = useState('');
  const [saving, setSaving] = useState(false);

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
    const [ordersRes, distRes] = await Promise.all([
      supabase.from('textbook_orders').select('*').order('created_at', { ascending: false }),
      supabase.from('textbook_distributions').select('order_id, quantity'),
    ]);
    if (ordersRes.error) toast.error('교재 신청 목록을 불러올 수 없습니다');
    else {
      // Derive distributed_qty from actual distributions to prevent drift
      const distMap = new Map<string, number>();
      ((distRes.data as any[]) || []).forEach((d: any) => {
        if (!d.order_id) return;
        distMap.set(d.order_id, (distMap.get(d.order_id) || 0) + (d.quantity || 0));
      });
      const merged = ((ordersRes.data as any[]) || []).map((o: any) => ({
        ...o,
        distributed_qty: distMap.get(o.id) ?? 0,
      }));
      setOrders(merged);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

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

  const checkDuplicates = useCallback((inputName: string) => {
    if (inputName.trim().length < 2) { setDuplicateMatches([]); return; }
    // 정규화 시그니처: 한글/숫자(하이픈포함)/영문 토큰으로 잘라 정렬 → 띄어쓰기·순서·기호 차이를 흡수
    // 예) "리피트 2-2", "리피트2-2", "2-2리피트", "리피트  2 - 2" → 모두 "2-2|리피트"
    const tokenize = (s: string): string[] => {
      const lower = s.toLowerCase().replace(/[\s_./\\()[\]]+/g, '');
      return lower.match(/[가-힣]+|[0-9]+(?:[-][0-9]+)*|[a-z]+/g) || [];
    };
    const sigOf = (s: string) => tokenize(s).slice().sort().join('|');
    const compactOf = (s: string) => s.toLowerCase().replace(/\s+/g, '');

    const inputSig = sigOf(inputName);
    const inputTokens = tokenize(inputName);
    const inputCompact = compactOf(inputName.trim());

    const matchingNames = new Set<string>();
    orders.forEach(o => {
      const oSig = sigOf(o.textbook_name);
      const oCompact = compactOf(o.textbook_name);
      const oTokens = tokenize(o.textbook_name);
      // 1) 시그니처 완전 일치(순서·공백 무시) 2) 압축문자열 포함(양쪽 모두 3자 이상) 3) 토큰 거의 전부 겹침
      // 일반 토큰(zip, 미적분, 숫자 등)이 우연히 겹치는 경우를 배제하기 위해 임계값을 엄격하게.
      const tokenOverlap = inputTokens.filter(t => oTokens.includes(t)).length;
      const minTokens = Math.min(inputTokens.length, oTokens.length);
      const maxTokens = Math.max(inputTokens.length, oTokens.length);
      const overlapRatio = maxTokens > 0 ? tokenOverlap / maxTokens : 0;
      const compactIncludes =
        inputCompact.length >= 3 && oCompact.length >= 3 &&
        (oCompact.includes(inputCompact) || inputCompact.includes(oCompact));
      const matched =
        (inputSig && oSig && inputSig === oSig) ||
        compactIncludes ||
        (minTokens >= 3 && overlapRatio >= 0.85) ||
        (minTokens === 2 && tokenOverlap === 2 && maxTokens === 2);
      if (matched) matchingNames.add(o.textbook_name);
    });
    const matches: TextbookGroup[] = Array.from(matchingNames).map(tName => {
      const matching = orders.filter(o => o.textbook_name === tName);
      const receivedQty = matching
        .filter(o => normalizeStatus(o.status) === '입고완료' && (o.textbook_type || 'student') !== 'teacher')
        .reduce((s, o) => s + o.quantity, 0);
      const distributedFromReceived = matching
        .filter(o => normalizeStatus(o.status) === '입고완료' && (o.textbook_type || 'student') !== 'teacher')
        .reduce((s, o) => s + (o.distributed_qty || 0), 0);
      const remainingStock = Math.max(0, receivedQty - distributedFromReceived);
      return {
        textbook_name: tName, subject: matching[0]?.subject || '', unit_price: matching[0]?.unit_price || 0,
        grade: matching[0]?.grade || null, category: matching[0]?.category || null,
        textbook_type: matching[0]?.textbook_type || 'student',
        is_inhouse: matching.some(o => o.is_inhouse), inhouse_author: matching.find(o => o.inhouse_author)?.inhouse_author || null,
        orders: matching, totalQty: matching.reduce((s, o) => s + o.quantity, 0),
        totalDistributed: matching.reduce((s, o) => s + (o.distributed_qty || 0), 0),
        status: matching[0]?.status || '교재신청',
        receivedQty, remainingStock,
      };
    });
    setDuplicateMatches(matches);
  }, [orders]);

  const handleCreate = async () => {
    if (!name.trim()) { toast.error('교재명을 입력해주세요'); return; }
    if (!price.trim() || isNaN(Number(price))) { toast.error('단가를 입력해주세요'); return; }
    const requestedQty = parseInt(qty) || 1;
    const totalAvailable = duplicateMatches.reduce((s, m) => s + m.remainingStock, 0);
    // 재고가 남아 있으면 항상 알림 (한 번 봤어도)
    if (duplicateMatches.length > 0 && totalAvailable > 0 && !duplicateWarningShown) {
      setShowDuplicateAlert(true);
      return;
    }
    // 유사 교재가 있으나 재고는 0 → 기존 소프트 워닝 1회만
    if (duplicateMatches.length > 0 && totalAvailable === 0 && !duplicateWarningShown) {
      setShowDuplicateAlert(true);
      return;
    }

    setCreating(true);
    const { error } = await supabase.from('textbook_orders').insert({
      textbook_name: name.trim(), subject, quantity: parseInt(qty) || 1,
      unit_price: parseInt(price) || 0, requested_by: user!.id, requested_by_name: userName,
      notes: notes.trim() || null, grade: grade || null, category: category || '기타',
      status: '교재신청', textbook_type: textbookType,
      is_inhouse: isInhouse, inhouse_author: isInhouse ? (inhouseAuthor.trim() || null) : null,
    } as any);
    if (error) { toast.error('신청 실패'); console.error(error); }
    else {
      toast.success('교재 신청이 등록되었습니다');
      setShowDialog(false);
      setName(''); setSubject('수학'); setQty('1'); setPrice(''); setNotes(''); setGrade(''); setCategory('기타'); setTextbookType('student'); setIsInhouse(false); setInhouseAuthor('');
      setDuplicateWarningShown(false); setDuplicateMatches([]);
      fetchOrders();
    }
    setCreating(false);
  };

  const openEdit = (order: TextbookOrder) => {
    setEditOrder(order); setEditName(order.textbook_name); setEditSubject(order.subject);
    setEditQty(String(order.quantity)); setEditPrice(String(order.unit_price));
    setEditNotes(order.notes || ''); setEditGrade(order.grade || ''); setEditCategory(order.category || '기타');
    setEditTextbookType(order.textbook_type || 'student');
    setEditIsInhouse(!!order.is_inhouse); setEditInhouseAuthor(order.inhouse_author || '');
  };

  const openReorder = (group: TextbookGroup) => {
    setName(group.textbook_name);
    setSubject(group.subject);
    setQty('1');
    setPrice(String(group.unit_price || ''));
    setNotes('');
    setGrade(group.grade || '');
    setCategory(group.category || '기타');
    setTextbookType(group.textbook_type || 'student');
    setIsInhouse(!!group.is_inhouse); setInhouseAuthor(group.inhouse_author || '');
    setDuplicateWarningShown(true); // skip duplicate popup since user intentionally reorders
    setDuplicateMatches([]);
    setShowDialog(true);
  };

  const handleEdit = async () => {
    if (!editOrder) return;
    if (!editName.trim()) { toast.error('교재명을 입력해주세요'); return; }
    if (!editPrice.trim() || isNaN(Number(editPrice))) { toast.error('단가를 입력해주세요'); return; }
    setSaving(true);
    const { error } = await supabase.from('textbook_orders').update({
      textbook_name: editName.trim(), subject: editSubject, quantity: parseInt(editQty) || 1,
      unit_price: parseInt(editPrice) || 0, notes: editNotes.trim() || null, grade: editGrade || null,
      category: editCategory || '기타', textbook_type: editTextbookType, updated_at: new Date().toISOString(),
      is_inhouse: editIsInhouse, inhouse_author: editIsInhouse ? (editInhouseAuthor.trim() || null) : null,
    } as any).eq('id', editOrder.id);
    if (error) { toast.error('수정 실패'); console.error(error); }
    else { toast.success('교재 정보가 수정되었습니다'); setEditOrder(null); fetchOrders(); }
    setSaving(false);
  };

  const handleStatusChange = async (order: TextbookOrder, newStatus: string) => {
    const updates: any = { status: newStatus, updated_at: new Date().toISOString() };
    if (newStatus === '입고완료') { updates.approved_at = new Date().toISOString(); updates.approved_by_name = userName; }
    const { error } = await supabase.from('textbook_orders').update(updates).eq('id', order.id);
    if (error) toast.error('상태 변경 실패');
    else { toast.success(`"${order.textbook_name}" → ${newStatus}`); fetchOrders(); }
  };

  const handleBulkStatusChange = async (orderIds: string[], newStatus: string) => {
    const updates: any = { status: newStatus, updated_at: new Date().toISOString() };
    if (newStatus === '입고완료') { updates.approved_at = new Date().toISOString(); updates.approved_by_name = userName; }
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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const handleDownloadTemplate = () => {
    const bom = '\uFEFF';
    const csv = bom + '교재명,과목,권수,단가,비고\n개념원리 수학1,수학,10,15000,\n능률 영어 중2,영어,5,13000,2학기용';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = '교재_일괄등록_양식.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    const text = await file.text();
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const dataLines = lines.slice(1);
    if (dataLines.length === 0) { toast.error('데이터가 없습니다'); setImporting(false); if (fileInputRef.current) fileInputRef.current.value = ''; return; }

    const parseCsvLine = (line: string): string[] => {
      const result: string[] = []; let current = ''; let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { inQuotes = !inQuotes; } else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; } else { current += ch; }
      }
      result.push(current.trim()); return result;
    };
    const parseNumber = (val: string): number => parseInt(val.replace(/[,\s"]/g, '')) || 0;

    const rows = dataLines.map(line => {
      const cols = parseCsvLine(line);
      return {
        textbook_name: cols[0]?.replace(/^"|"$/g, '') || '', subject: cols[1]?.replace(/^"|"$/g, '') || '수학',
        quantity: parseNumber(cols[2] || '1') || 1, unit_price: parseNumber(cols[3] || '0'),
        notes: cols[4]?.replace(/^"|"$/g, '') || null, requested_by: user!.id, requested_by_name: userName, status: '입고완료',
      };
    }).filter(r => r.textbook_name && r.unit_price > 0);

    if (rows.length === 0) { toast.error('유효한 데이터가 없습니다.'); setImporting(false); if (fileInputRef.current) fileInputRef.current.value = ''; return; }
    const { error } = await supabase.from('textbook_orders').insert(rows as any);
    if (error) { toast.error('일괄 등록 실패'); console.error(error); }
    else { toast.success(`${rows.length}건의 교재가 일괄 등록되었습니다`); fetchOrders(); }
    setImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const normalizeStatus = (s: string) => s === '신청' ? '교재신청' : s;

  // 교재명 정규화: 띄어쓰기/언더스코어/순서/기호 차이를 흡수해 동일 교재로 묶는 시그니처
  // 예) "리피트 2-2", "리피트중2-2", "2-2리피트", "리피트_중2-2" → 동일 시그니처
  const textbookSignature = (s: string): string => {
    if (!s) return '';
    // 공백/구두점 제거 후, 학년 수준 표기(초/중/고) 단일 글자도 제거하여
    // "리피트 2-2" ≡ "리피트중2-2" ≡ "리피트_중2-2" ≡ "2-2리피트" 동일 시그니처
    const compact = s.toLowerCase()
      .replace(/[\s_./\\()[\]]+/g, '')
      .replace(/[초중고]/g, '');
    const tokens = compact.match(/[가-힣]+|[0-9]+(?:[-][0-9]+)*|[a-z]+/g) || [];
    return tokens.slice().sort().join('|');
  };

  const groups = useMemo((): TextbookGroup[] => {
    const map = new Map<string, TextbookGroup & { _nameCounts: Map<string, number> }>();
    orders.forEach(o => {
      // 시그니처 + 과목 + 유형으로만 묶음 (단가/세부표기 차이 흡수)
      const sig = textbookSignature(o.textbook_name);
      const key = `${sig}||${o.subject}||${o.textbook_type || 'student'}`;
      const status = normalizeStatus(o.status);
      if (!map.has(key)) {
        map.set(key, {
          textbook_name: o.textbook_name, subject: o.subject, unit_price: o.unit_price,
          grade: o.grade || null, category: o.category || null, textbook_type: o.textbook_type || 'student',
          is_inhouse: !!o.is_inhouse, inhouse_author: o.inhouse_author || null,
          orders: [], totalQty: 0, totalDistributed: 0, status,
          remainingStock: 0, receivedQty: 0,
          _nameCounts: new Map(),
        } as any);
      }
      const g = map.get(key)!;
      g.orders.push({ ...o, status }); g.totalQty += o.quantity; g.totalDistributed += o.distributed_qty || 0;
      if (o.grade) g.grade = o.grade; if (o.category && o.category !== '기타') g.category = o.category;
      if (o.textbook_type === 'teacher') g.textbook_type = 'teacher';
      if (o.is_inhouse) { g.is_inhouse = true; if (o.inhouse_author) g.inhouse_author = o.inhouse_author; }
      // 표시명 후보 집계 (가장 자주 쓰인 표기를 대표명으로)
      g._nameCounts.set(o.textbook_name, (g._nameCounts.get(o.textbook_name) || 0) + 1);
    });

    map.forEach(g => {
      const statusOrder = ['교재신청', '주문중', '입고완료'];
      let minIdx = 2;
      g.orders.forEach(o => { const idx = statusOrder.indexOf(normalizeStatus(o.status)); if (idx < minIdx) minIdx = idx; });
      g.status = statusOrder[minIdx];
      const allSame = g.orders.every(o => normalizeStatus(o.status) === normalizeStatus(g.orders[0].status));
      if (allSame) g.status = normalizeStatus(g.orders[0].status);
      // Recompute received vs remaining stock (학생용, 입고완료만 카운트)
      const receivedOrders = g.orders.filter(o => normalizeStatus(o.status) === '입고완료' && (o.textbook_type || 'student') !== 'teacher');
      g.receivedQty = receivedOrders.reduce((s, o) => s + o.quantity, 0);
      g.remainingStock = Math.max(0, g.receivedQty - receivedOrders.reduce((s, o) => s + (o.distributed_qty || 0), 0));
      // 대표 표기명: 가장 많이 쓰인 표기 (동률이면 가장 긴 이름)
      const sorted = Array.from(g._nameCounts.entries()).sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);
      if (sorted[0]) g.textbook_name = sorted[0][0];
      // 대표 단가: 가장 자주 쓰인 단가
      const priceCounts = new Map<number, number>();
      g.orders.forEach(o => priceCounts.set(o.unit_price, (priceCounts.get(o.unit_price) || 0) + 1));
      const pSorted = Array.from(priceCounts.entries()).sort((a, b) => b[1] - a[1]);
      if (pSorted[0]) g.unit_price = pSorted[0][0];
    });

    return Array.from(map.values()).sort((a, b) => {
      const statusOrder = ['교재신청', '주문중', '입고완료'];
      const diff = statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status);
      if (diff !== 0) return diff;
      return a.textbook_name.localeCompare(b.textbook_name);
    });
  }, [orders]);

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
      const matchesType = filterType === 'all' || g.textbook_type === filterType;
      const matchesInhouse = filterInhouse === 'all'
        || (filterInhouse === 'inhouse' && g.is_inhouse)
        || (filterInhouse === 'external' && !g.is_inhouse);
      return matchesSearch && matchesSubject && matchesStatus && matchesGrade && matchesCategory && matchesType && matchesInhouse;
    });
  }, [groups, searchQuery, filterSubject, filterStatus, filterGrade, filterCategory, filterType, filterInhouse]);

  const hasActiveFilters = searchQuery || filterSubject !== 'all' || filterStatus !== 'all' || filterGrade !== 'all' || filterCategory !== 'all' || filterType !== 'all' || filterInhouse !== 'all';

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

  const statCounts = useMemo(() => {
    const counts = { '교재신청': 0, '주문중': 0, '입고완료': 0 };
    orders.forEach(o => { const s = normalizeStatus(o.status); if (s in counts) counts[s as keyof typeof counts]++; });
    return counts;
  }, [orders]);

  const inventoryStats = useMemo(() => {
    const totalStock = orders.filter(o => normalizeStatus(o.status) === '입고완료').reduce((s, o) => s + o.quantity, 0);
    const totalDistributed = orders.reduce((s, o) => s + (o.distributed_qty || 0), 0);
    const remaining = totalStock - totalDistributed;
    const teacherCount = orders.filter(o => o.textbook_type === 'teacher').length;
    return { totalStock, totalDistributed, remaining, teacherCount };
  }, [orders]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const renderFormFields = (isEdit: boolean) => {
    const n = isEdit ? editName : name; const setN = isEdit ? setEditName : setName;
    const s = isEdit ? editSubject : subject; const setS = isEdit ? setEditSubject : setSubject;
    const q = isEdit ? editQty : qty; const setQ = isEdit ? setEditQty : setQty;
    const p = isEdit ? editPrice : price; const setP = isEdit ? setEditPrice : setPrice;
    const no = isEdit ? editNotes : notes; const setNo = isEdit ? setEditNotes : setNotes;
    const g = isEdit ? editGrade : grade; const setG = isEdit ? setEditGrade : setGrade;
    const c = isEdit ? editCategory : category; const setC = isEdit ? setEditCategory : setCategory;
    const t = isEdit ? editTextbookType : textbookType; const setT = isEdit ? setEditTextbookType : setTextbookType;
    const ih = isEdit ? editIsInhouse : isInhouse; const setIh = isEdit ? setEditIsInhouse : setIsInhouse;
    const ia = isEdit ? editInhouseAuthor : inhouseAuthor; const setIa = isEdit ? setEditInhouseAuthor : setInhouseAuthor;

    return (
      <div className="space-y-4 mt-2">
        {/* Textbook type toggle */}
        <div>
          <label className="text-sm font-medium text-foreground mb-1.5 block">교재 유형</label>
          <div className="flex gap-2">
            {TEXTBOOK_TYPES.map(tt => (
              <Button key={tt.value} type="button" size="sm" variant={t === tt.value ? 'default' : 'outline'}
                className={cn("flex-1 gap-1.5", t === tt.value && tt.value === 'teacher' && 'bg-amber-600 hover:bg-amber-700')}
                onClick={() => setT(tt.value)}
              >
                <tt.icon className="w-3.5 h-3.5" />{tt.label}
              </Button>
            ))}
          </div>
          {t === 'teacher' && (
            <p className="text-xs text-amber-600 mt-1">⚠️ 교사용 교재는 학생 배부 대상에서 제외됩니다.</p>
          )}
        </div>
        {/* 자체제작 교재 */}
        <div className="rounded-lg border p-3 space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer">
            <input type="checkbox" className="accent-violet-600 w-4 h-4" checked={ih} onChange={e => setIh(e.target.checked)} />
            자체제작 교재 (원내 제작)
          </label>
          {ih && (
            <div>
              <label className="text-xs text-muted-foreground">제작 선생님</label>
              <Select value={ia || '__none__'} onValueChange={v => setIa(v === '__none__' ? '' : v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="선생님 선택" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">선택 안함</SelectItem>
                  {INHOUSE_AUTHORS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-violet-600 mt-1">※ 자체제작으로 표시하면 교재비 청구 내역에서 따로 골라볼 수 있습니다.</p>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-foreground">교재명 *</label>
            <Input value={n} onChange={e => { setN(e.target.value); if (!isEdit) { checkDuplicates(e.target.value); setDuplicateWarningShown(false); } }} placeholder="[개념]교재명_중1" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">과목</label>
            <Select value={s} onValueChange={setS}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-foreground">권수</label>
            <Input type="number" min="1" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">단가 (원) *</label>
            <Input type="number" min="0" value={p} onChange={e => setP(e.target.value)} placeholder="정가 입력" />
            <p className="text-[11px] text-destructive mt-1 font-medium">※ 반드시 "정가"로 입력해주세요</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-foreground">학년</label>
            <Select value={g || '__none__'} onValueChange={v => setG(v === '__none__' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="학년 선택" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">선택 안함</SelectItem>
                {GRADES.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">분류</label>
            <Select value={c} onValueChange={setC}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-foreground">비고</label>
          <Input value={no} onChange={e => setNo(e.target.value)} placeholder="메모 (선택)" />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Inventory Dashboard */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard title="입고 재고" value={`${inventoryStats.totalStock}권`} icon={<Package className="w-5 h-5" />} iconColor="primary" />
        <StatCard title="배부 완료" value={`${inventoryStats.totalDistributed}권`} icon={<PackageCheck className="w-5 h-5" />} iconColor="success" />
        <StatCard title="잔여 재고" value={`${inventoryStats.remaining}권`} icon={<Package className="w-5 h-5" />}
          iconColor={inventoryStats.remaining <= 5 ? 'destructive' : 'muted'} />
        <StatCard title="교사용" value={`${inventoryStats.teacherCount}건`} icon={<BookOpen className="w-5 h-5" />} iconColor="warning" />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">교재 신청 → 주문 중 → 입고 완료</p>
        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFileImport} />
          <Button size="sm" variant="outline" className="gap-1.5" onClick={handleDownloadTemplate}><Download className="w-3.5 h-3.5" />양식</Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => fileInputRef.current?.click()} disabled={importing}>
            {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}일괄 등록
          </Button>
          <Dialog open={showDialog} onOpenChange={setShowDialog}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5"><Plus className="w-4 h-4" />교재 신청</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>교재 신청</DialogTitle></DialogHeader>
              {renderFormFields(false)}
              <Button onClick={handleCreate} disabled={creating} className="w-full mt-2">
                {creating && <Loader2 className="w-4 h-4 animate-spin mr-2" />}신청하기
              </Button>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="교재명, 신청자 검색..." className="pl-8 pr-8" />
          {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>}
        </div>
        <Select value={filterSubject} onValueChange={setFilterSubject}>
          <SelectTrigger className="w-full sm:w-[100px]"><SelectValue placeholder="과목" /></SelectTrigger>
          <SelectContent><SelectItem value="all">전체</SelectItem>{SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-full sm:w-[110px]"><SelectValue placeholder="상태" /></SelectTrigger>
          <SelectContent><SelectItem value="all">전체</SelectItem>{ORDER_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-full sm:w-[110px]"><SelectValue placeholder="유형" /></SelectTrigger>
          <SelectContent><SelectItem value="all">전체</SelectItem><SelectItem value="student">학생용</SelectItem><SelectItem value="teacher">교사용</SelectItem></SelectContent>
        </Select>
        <Select value={filterInhouse} onValueChange={setFilterInhouse}>
          <SelectTrigger className="w-full sm:w-[120px]"><SelectValue placeholder="제작" /></SelectTrigger>
          <SelectContent><SelectItem value="all">전체</SelectItem><SelectItem value="inhouse">자체제작</SelectItem><SelectItem value="external">외부교재</SelectItem></SelectContent>
        </Select>
        {hasActiveFilters && (
          <Button size="sm" variant="ghost" className="gap-1 text-muted-foreground" onClick={() => { setSearchQuery(''); setFilterSubject('all'); setFilterStatus('all'); setFilterGrade('all'); setFilterCategory('all'); setFilterType('all'); setFilterInhouse('all'); }}>
            <X className="w-3.5 h-3.5" />초기화
          </Button>
        )}
      </div>

      {/* Status summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {ORDER_STATUSES.map(s => (
          <Card key={s} className={cn("p-3 text-center cursor-pointer hover:bg-muted/50 transition-colors", filterStatus === s && "ring-2 ring-primary")}
            onClick={() => setFilterStatus(filterStatus === s ? 'all' : s)}>
            <p className="text-xl font-bold text-foreground">{statCounts[s]}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s}</p>
          </Card>
        ))}
      </div>

      {/* 신규 신청교재 — 서점 발주용 (아직 입고 안 된 교재신청/주문중 items only) */}
      {(() => {
        const pendingOrders = orders.filter(o => {
          const s = normalizeStatus(o.status);
          return s === '교재신청' || s === '주문중';
        });
        if (pendingOrders.length === 0) return null;
        // Aggregate by textbook_name + subject + grade + unit_price + type
        type PendingAgg = { key: string; textbook_name: string; subject: string; grade: string | null; unit_price: number; textbook_type: string; qty: number; requesters: Set<string>; ids: string[]; status: string; };
        const aggMap = new Map<string, PendingAgg>();
        pendingOrders.forEach(o => {
          const key = `${o.textbook_name}||${o.subject}||${o.grade || ''}||${o.unit_price}||${o.textbook_type || 'student'}`;
          if (!aggMap.has(key)) {
            aggMap.set(key, {
              key, textbook_name: o.textbook_name, subject: o.subject, grade: o.grade || null,
              unit_price: o.unit_price, textbook_type: o.textbook_type || 'student',
              qty: 0, requesters: new Set(), ids: [], status: normalizeStatus(o.status),
            });
          }
          const a = aggMap.get(key)!;
          a.qty += o.quantity;
          if (o.requested_by_name) a.requesters.add(o.requested_by_name);
          a.ids.push(o.id);
          // 상태 우선순위: 교재신청 > 주문중
          if (normalizeStatus(o.status) === '교재신청') a.status = '교재신청';
        });
        const aggList = Array.from(aggMap.values()).sort((a, b) => {
          if (a.status !== b.status) return a.status === '교재신청' ? -1 : 1;
          return a.textbook_name.localeCompare(b.textbook_name);
        });
        const totalQty = aggList.reduce((s, a) => s + a.qty, 0);
        const totalAmount = aggList.reduce((s, a) => s + a.qty * a.unit_price, 0);

        const buildCopyText = () => {
          const lines = ['📚 교재 발주 요청'];
          aggList.forEach((a, i) => {
            const parts = [`${i + 1}. ${a.textbook_name}`, `${a.qty}권`];
            if (a.grade) parts.push(a.grade);
            if (a.textbook_type === 'teacher') parts.push('교사용');
            lines.push(parts.join(' · '));
          });
          lines.push('', `합계: ${totalQty}권 / ${totalAmount.toLocaleString()}원`);
          return lines.join('\n');
        };

        const handleCopy = async () => {
          try {
            await navigator.clipboard.writeText(buildCopyText());
            toast.success('발주 목록이 복사되었습니다');
          } catch {
            toast.error('복사 실패');
          }
        };

        const handleAllToOrdering = () => {
          const targetIds = aggList.filter(a => a.status === '교재신청').flatMap(a => a.ids);
          if (targetIds.length === 0) { toast.info('교재신청 상태인 항목이 없습니다'); return; }
          handleBulkStatusChange(targetIds, '주문중');
        };

        return (
          <Card className="border-2 border-orange-300 dark:border-orange-500/40 bg-orange-50/40 dark:bg-orange-950/10 p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-orange-600" />
                <h3 className="text-sm font-bold text-foreground">서점 발주용 — 신규 신청교재</h3>
                <Badge className="bg-orange-100 text-orange-700 border-orange-300 text-[10px]">
                  {aggList.length}종 · 총 {totalQty}권
                </Badge>
              </div>
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={handleCopy}>
                  <Copy className="w-3 h-3" />목록 복사
                </Button>
                {role === 'admin' && aggList.some(a => a.status === '교재신청') && (
                  <Button size="sm" variant="default" className="h-7 gap-1 text-xs" onClick={handleAllToOrdering}>
                    <ShoppingCart className="w-3 h-3" />전체 주문중 처리
                  </Button>
                )}
              </div>
            </div>
            <div className="rounded-lg border bg-background overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr className="text-muted-foreground">
                    <th className="text-left px-3 py-2 font-medium w-8">#</th>
                    <th className="text-left px-3 py-2 font-medium">교재명</th>
                    <th className="text-left px-3 py-2 font-medium w-16">과목</th>
                    <th className="text-left px-3 py-2 font-medium w-14">학년</th>
                    <th className="text-right px-3 py-2 font-medium w-16">권수</th>
                    <th className="text-right px-3 py-2 font-medium w-24">단가</th>
                    <th className="text-left px-3 py-2 font-medium w-20">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {aggList.map((a, i) => (
                    <tr key={a.key} className="border-t hover:bg-muted/30">
                      <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-2 font-medium text-foreground">
                        {a.textbook_name}
                        {a.textbook_type === 'teacher' && <Badge className="ml-1.5 text-[9px] bg-amber-100 text-amber-700 border-amber-300">교사용</Badge>}
                      </td>
                      <td className="px-3 py-2">
                        <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium", subjectColor(a.subject))}>{a.subject}</span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{a.grade || '-'}</td>
                      <td className="px-3 py-2 text-right font-semibold text-foreground">{a.qty}권</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{a.unit_price.toLocaleString()}원</td>
                      <td className="px-3 py-2">
                        <Badge className={cn("text-[10px]", statusColor(a.status))}>{a.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/30 border-t">
                  <tr className="font-semibold">
                    <td colSpan={4} className="px-3 py-2 text-right text-muted-foreground">합계</td>
                    <td className="px-3 py-2 text-right text-foreground">{totalQty}권</td>
                    <td className="px-3 py-2 text-right text-foreground">{totalAmount.toLocaleString()}원</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              ※ 이 목록은 <b>아직 입고되지 않은</b> 신청 건만 정리한 발주용 뷰입니다. 캡쳐 후 서점에 전달해주세요. 입고 완료된 재고는 아래 목록에서 관리합니다.
            </p>
          </Card>
        );
      })()}

      {/* Accordion list */}
      {filteredGroups.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-12">{hasActiveFilters ? '검색 결과가 없습니다' : '등록된 교재 신청이 없습니다'}</p>
      )}

      <Accordion type="multiple" className="space-y-2">
        {filteredGroups.map(group => {
          const groupKey = `${group.textbook_name}||${group.subject}||${group.unit_price}`;
          const hasMultipleOrders = group.orders.length > 1;
          const remaining = group.totalQty - group.totalDistributed;
          const isTeacher = group.textbook_type === 'teacher';

          return (
            <AccordionItem key={groupKey} value={groupKey} className={cn("border rounded-xl overflow-hidden border-l-4", statusBorderColor(group.status))}>
              <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/30">
                <div className="flex items-start justify-between gap-3 flex-1 text-left pr-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-foreground text-sm">{group.textbook_name}</p>
                      <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium", subjectColor(group.subject))}>{group.subject}</span>
                      {isTeacher && <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-300">교사용</Badge>}
                      {group.is_inhouse && <Badge className="text-[10px] bg-violet-100 text-violet-700 border-violet-300">자체제작{group.inhouse_author ? ` · ${group.inhouse_author}` : ''}</Badge>}
                      {group.grade && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{group.grade}</Badge>}
                      <Badge className={cn("text-[10px]", statusColor(group.status))}>{group.status}</Badge>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                      <span>총 <span className="font-semibold text-foreground">{group.totalQty}권</span> × {group.unit_price.toLocaleString()}원</span>
                      {hasMultipleOrders && <span className="flex items-center gap-1"><Users className="w-3 h-3" />{group.orders.length}명</span>}
                      {group.status === '입고완료' && !isTeacher && (
                        <span>배부 {group.totalDistributed} · <span className={cn("font-medium", remaining <= 0 ? 'text-destructive' : 'text-foreground')}>남은 {remaining}권</span></span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-primary border-primary/30 hover:bg-primary/5 text-xs h-7"
                      onClick={() => openReorder(group)}
                      title="이 교재로 추가 주문 신청"
                    >
                      <Plus className="w-3 h-3" />추가주문
                    </Button>
                    {role === 'admin' && group.status !== '입고완료' && (
                      <>
                        {group.status === '교재신청' && (
                          <Button size="sm" variant="outline" className="gap-1 text-sky-600 border-sky-200 hover:bg-sky-50 text-xs h-7"
                            onClick={() => handleBulkStatusChange(group.orders.map(o => o.id), '주문중')}>
                            <ShoppingCart className="w-3 h-3" />주문중
                          </Button>
                        )}
                        <Button size="sm" variant="default" className="gap-1 text-xs h-7"
                          onClick={() => handleBulkStatusChange(group.orders.map(o => o.id), '입고완료')}>
                          <PackageCheck className="w-3 h-3" />입고완료
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-3">
                <div className="space-y-2">
                  {group.orders.map(order => (
                    <div key={order.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/40">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{order.requested_by_name}</span>
                          <span className="text-sm text-muted-foreground">{order.quantity}권</span>
                          <Badge className={cn("text-[9px]", statusColor(normalizeStatus(order.status)))}>{normalizeStatus(order.status)}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {format(new Date(order.created_at), 'MM/dd HH:mm')}
                          {order.notes && <span className="ml-2">📝 {order.notes}</span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        {role === 'admin' && normalizeStatus(order.status) === '교재신청' && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-sky-600" onClick={() => handleStatusChange(order, '주문중')}>주문중</Button>
                        )}
                        {role === 'admin' && normalizeStatus(order.status) !== '입고완료' && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-emerald-600" onClick={() => handleStatusChange(order, '입고완료')}>입고</Button>
                        )}
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(order)}><Pencil className="w-3 h-3" /></Button>
                        {role === 'admin' && <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(order.id)}><Trash2 className="w-3 h-3" /></Button>}
                      </div>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      {/* Edit Dialog */}
      <Dialog open={!!editOrder} onOpenChange={open => { if (!open) setEditOrder(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>교재 정보 수정</DialogTitle></DialogHeader>
          {renderFormFields(true)}
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setEditOrder(null)}>취소</Button>
            <Button onClick={handleEdit} disabled={saving}>{saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}저장</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate / stock warning */}
      <Dialog open={showDuplicateAlert} onOpenChange={setShowDuplicateAlert}>
        <DialogContent className="max-w-md">
          {(() => {
            const requestedQty = parseInt(qty) || 1;
            const totalAvailable = duplicateMatches.reduce((s, m) => s + m.remainingStock, 0);
            const hasStock = totalAvailable > 0;
            const stockCoversAll = hasStock && totalAvailable >= requestedQty;
            const shortageQty = Math.max(0, requestedQty - totalAvailable);
            return (
              <>
                <DialogHeader>
                  <DialogTitle className={cn("flex items-center gap-2", hasStock ? "text-destructive" : "text-warning")}>
                    <AlertTriangle className="w-5 h-5" />
                    {hasStock ? '재고가 남아 있습니다' : '유사 교재 확인'}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <p className="text-sm text-foreground">
                    {hasStock
                      ? <>이미 입고된 재고가 <b className="text-destructive">{totalAvailable}권</b> 남아 있습니다. 먼저 재고를 배포해 주세요.{!stockCoversAll && <> 부족분 <b>{shortageQty}권</b>만 새로 신청할 수 있습니다.</>}</>
                      : '입력하신 교재명과 유사한 교재가 이미 등록되어 있습니다. 중복 신청이 아닌지 확인해 주세요.'}
                  </p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {duplicateMatches.map(g => (
                      <div key={g.textbook_name} className={cn(
                        "text-xs px-3 py-2 rounded-md border",
                        g.remainingStock > 0 ? "bg-destructive/5 border-destructive/30" : "bg-muted border-border"
                      )}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="font-medium text-foreground">{g.textbook_name}</span>
                            <span className="text-muted-foreground ml-1">({g.subject})</span>
                          </div>
                          {g.remainingStock > 0 ? (
                            <Badge className="bg-destructive/15 text-destructive border-destructive/30 text-[10px]">
                              재고 {g.remainingStock}권
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">
                              입고 {g.receivedQty} · 배부 {g.totalDistributed}
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <DialogFooter className="gap-2 sm:gap-0 flex-col sm:flex-row">
                  <Button variant="outline" onClick={() => setShowDuplicateAlert(false)}>취소</Button>
                  {hasStock && onNavigateToDistribution && (
                    <Button
                      variant="default"
                      className="gap-1.5"
                      onClick={() => { setShowDuplicateAlert(false); setShowDialog(false); onNavigateToDistribution(); }}
                    >
                      <BookOpen className="w-4 h-4" />재고로 배부하러 가기
                    </Button>
                  )}
                  {hasStock && !stockCoversAll && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setQty(String(shortageQty));
                        setShowDuplicateAlert(false);
                        setDuplicateWarningShown(true);
                        setTimeout(() => handleCreate(), 100);
                      }}
                    >
                      부족분 {shortageQty}권만 신청
                    </Button>
                  )}
                  {!hasStock && (
                    <Button onClick={() => { setShowDuplicateAlert(false); setDuplicateWarningShown(true); setTimeout(() => handleCreate(), 100); }}>
                      확인했습니다, 신청하기
                    </Button>
                  )}
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
