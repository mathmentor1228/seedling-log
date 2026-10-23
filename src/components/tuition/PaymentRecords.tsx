import {useState,useEffect,useMemo} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from '@/components/ui/table';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {Textarea} from '@/components/ui/textarea';
import {toast} from 'sonner';
import {Plus,Printer,Receipt,Loader2,RefreshCw} from 'lucide-react';
import {getTodayKST} from '@/lib/utils';
import {useAuth} from '@/lib/auth';
import {allRows,recordManualPayment} from '@/lib/tuitionLedgerApi';
import {paymentMonth,paymentReference} from '@/lib/tuitionLedger';
import {currentTuitionMonth,MonthInput,SourceBadge} from './LedgerControls';
import {StudentPaymentLink,useTuitionLedger} from './TuitionLedgerContext';
import {PaymentTiming} from './PaymentTiming';
import {type PaymentSchedule} from '@/lib/tuitionPaymentDates';
export function PaymentRecords(){
 const {user}=useAuth();const {openReceipt,revision,changed}=useTuitionLedger();
 const [payments,setPayments]=useState<any[]>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState('');
 const [schedules,setSchedules]=useState<PaymentSchedule[]>([]);
 const [search,setSearch]=useState('');const [showAdd,setShowAdd]=useState(false);const [students,setStudents]=useState<any[]>([]);const [billings,setBillings]=useState<any[]>([]);
 const [studentId,setStudentId]=useState('');const [billingId,setBillingId]=useState('');const [month,setMonth]=useState(currentTuitionMonth());const [amount,setAmount]=useState('');const [date,setDate]=useState(getTodayKST());const [method,setMethod]=useState('계좌이체');const [memo,setMemo]=useState('');const [saving,setSaving]=useState(false);const [studentSearch,setStudentSearch]=useState('');
 const [bulkOpen,setBulkOpen]=useState(false);const [bulkMode,setBulkMode]=useState('date');const [from,setFrom]=useState(`${currentTuitionMonth()}-01`);const [to,setTo]=useState(getTodayKST());
 async function load(){setLoading(true);setError('');try{const [rows,billings]=await Promise.all([allRows(()=>supabase.from('payment_records').select('*,students(name,payment_due_day),billing_schedules(billing_month,final_amount,due_date,status)').order('paid_date',{ascending:false}).order('id')),allRows(()=>supabase.from('billing_schedules').select('student_id,billing_month,due_date,status').order('id'))]);setPayments(rows);setSchedules(billings);}catch{setError('납부 이력을 불러오지 못했습니다');}finally{setLoading(false);}}
 useEffect(()=>{load();},[revision]);
 const visible=useMemo(()=>payments.filter(p=>!search||`${p.students?.name||'미지정'} ${paymentMonth(p)||''} ${p.source} ${p.memo||''}`.includes(search)),[payments,search]);
 async function openAdd(){try{
  const [s,b]=await Promise.all([allRows(()=>supabase.from('students').select('id,name,school,grade').in('enrollment_status',['재학','재등원']).order('name').order('id')),allRows(()=>supabase.from('billing_schedules').select('id,student_id,billing_month,final_amount,students(name)').in('status',['pending','overdue']).order('due_date').order('id'))]);
  setStudents(s);setBillings(b);setStudentId('');setBillingId('');setMonth(currentTuitionMonth());setAmount('');setDate(getTodayKST());setMemo('');setStudentSearch('');setShowAdd(true);
 }catch{toast.error('학생/청구 목록을 불러오지 못했습니다');}}
 async function save(){if(!studentId||Number(amount)<=0||!date||!month){toast.error('학생·금액·청구월·납부일을 확인해주세요');return;}setSaving(true);try{const warning=await recordManualPayment({student_id:studentId,billing_month:month,amount:Number(amount),paid_date:date,payment_method:method,memo:memo||null,recorded_by:user?.id||null});warning?toast.warning(warning):toast.success('납부 기록 완료');setShowAdd(false);changed();}catch{toast.error('납부를 저장하지 못했습니다');}finally{setSaving(false);}}
 function bulkPrint(){if(!from||!to||from>to){toast.error('조회 기간을 확인해주세요');return;}const rows=payments.filter(p=>{const key=bulkMode==='date'?p.paid_date:paymentMonth(p);return !p.canceled_at&&key&&key>=from&&key<=to;});if(!rows.length){toast.info('기간 내 출력할 납부가 없습니다');return;}setBulkOpen(false);openReceipt(rows,true);}
 return <div className="space-y-4 mt-4">
  <div className="flex items-center gap-2 flex-wrap"><Input aria-label="납부 이력 검색" placeholder="이름 / 청구월 / 출처 검색" value={search} onChange={e=>setSearch(e.target.value)} className="max-w-xs"/><span className="text-sm text-muted-foreground">{visible.length}건</span><Button size="sm" variant="outline" onClick={load} aria-label="납부 새로고침"><RefreshCw className="w-4 h-4"/></Button><Button size="sm" variant="outline" onClick={()=>{setFrom(`${currentTuitionMonth()}-01`);setTo(getTodayKST());setBulkMode('date');setBulkOpen(true);}}><Printer className="w-4 h-4 mr-1"/>기간 일괄 출력</Button><Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1"/>납부 등록</Button></div>
  {loading?<Loader2 className="animate-spin mx-auto"/>:error?<p role="alert" className="text-destructive">{error}</p>:<div className="overflow-x-auto border rounded-lg"><Table><TableHeader><TableRow>{['학생','청구월','납부금액','예정일 / 실제 납부일 / 차이','출처','수단','상세 / 메모','영수증'].map(h=><TableHead key={h} className="whitespace-nowrap">{h}</TableHead>)}</TableRow></TableHeader><TableBody>{visible.map(p=><TableRow key={p.id} className={p.canceled_at?'opacity-50':''}><TableCell><StudentPaymentLink id={p.student_id} name={p.students?.name||'미지정'}/></TableCell><TableCell className="whitespace-nowrap">{paymentMonth(p)||'확인 필요'}</TableCell><TableCell className="whitespace-nowrap font-semibold">{Number(p.amount).toLocaleString()}원{p.canceled_at&&<div className="text-destructive">취소</div>}</TableCell><TableCell><PaymentTiming payment={p} schedules={schedules} dueDay={p.students?.payment_due_day}/></TableCell><TableCell><SourceBadge source={p.source}/></TableCell><TableCell>{p.payment_method}</TableCell><TableCell title={`${paymentReference(p)}\n${p.raw_text||''}`} className="min-w-40 max-w-64 text-xs"><p>{paymentReference(p)}</p><p className="text-muted-foreground truncate">{p.memo||'—'}</p></TableCell><TableCell><Button size="icon" variant="ghost" aria-label={`${p.students?.name||'미지정'} ${p.paid_date} 영수증`} title="영수증" onClick={()=>openReceipt([p])}><Receipt className="w-4 h-4"/></Button></TableCell></TableRow>)}</TableBody></Table>{!visible.length&&<p className="text-center p-8 text-muted-foreground">납부 기록이 없습니다</p>}</div>}
  <Dialog open={showAdd} onOpenChange={setShowAdd}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>납부 등록</DialogTitle><DialogDescription>수납 출처 · 수기</DialogDescription></DialogHeader><div className="space-y-3">
   <Label>미납 청구서 (선택)</Label><Select value={billingId||'none'} onValueChange={id=>{if(id==='none'){setBillingId('');return;}setBillingId(id);const b=billings.find(x=>x.id===id);if(b){setStudentId(b.student_id);setMonth(b.billing_month);setAmount(String(b.final_amount));}}}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">직접 지정</SelectItem>{billings.map(b=><SelectItem key={b.id} value={b.id}>{b.students?.name} · {b.billing_month} · {Number(b.final_amount).toLocaleString()}원</SelectItem>)}</SelectContent></Select>
   <Label>학생</Label><Input aria-label="납부 등록 학생 검색" placeholder="이름 / 학교 검색" value={studentSearch} onChange={e=>setStudentSearch(e.target.value)}/><Select value={studentId} onValueChange={id=>{setStudentId(id);setBillingId('');}}><SelectTrigger aria-label="납부 학생"><SelectValue placeholder="학생 선택"/></SelectTrigger><SelectContent>{students.filter(s=>s.id===studentId||`${s.name} ${s.school}`.includes(studentSearch)).map(s=><SelectItem key={s.id} value={s.id}>{s.name} · {s.school} {s.grade}</SelectItem>)}</SelectContent></Select>
   <Label>청구월</Label><MonthInput value={month} onChange={v=>{setMonth(v);setBillingId('');}}/>
   <Label htmlFor="payment-amount">금액</Label><Input id="payment-amount" type="number" min="1" value={amount} onChange={e=>setAmount(e.target.value)}/>
   <Label htmlFor="payment-date">실제 납부일</Label><Input id="payment-date" type="date" value={date} onChange={e=>setDate(e.target.value)}/>
   <Label>납부 수단</Label><Select value={method} onValueChange={setMethod}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{['현금','카드','계좌이체','기타'].map(m=><SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select>
   <Label htmlFor="payment-memo">메모</Label><Textarea id="payment-memo" value={memo} onChange={e=>setMemo(e.target.value)}/><Button className="w-full" disabled={saving} onClick={save}>{saving?'저장 중…':'납부 등록'}</Button>
  </div></DialogContent></Dialog>
  <Dialog open={bulkOpen} onOpenChange={setBulkOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>기간 일괄 출력</DialogTitle><DialogDescription>교습비등 영수증 원부</DialogDescription></DialogHeader><Select value={bulkMode} onValueChange={mode=>{setBulkMode(mode);setFrom(mode==='date'?`${currentTuitionMonth()}-01`:currentTuitionMonth());setTo(mode==='date'?getTodayKST():currentTuitionMonth());}}><SelectTrigger aria-label="출력 기간 기준"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="date">실제 납부일</SelectItem><SelectItem value="month">청구월</SelectItem></SelectContent></Select><Label>시작</Label><Input aria-label="출력 시작" type={bulkMode==='date'?'date':'month'} value={from} onChange={e=>setFrom(e.target.value)}/><Label>종료</Label><Input aria-label="출력 종료" type={bulkMode==='date'?'date':'month'} value={to} onChange={e=>setTo(e.target.value)}/><Button onClick={bulkPrint}><Printer className="w-4 h-4 mr-2"/>원부 미리보기</Button></DialogContent></Dialog>
 </div>;
}
