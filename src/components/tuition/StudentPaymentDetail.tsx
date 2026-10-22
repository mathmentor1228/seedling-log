import {useEffect,useState} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import {Table,TableHeader,TableHead,TableRow,TableBody,TableCell} from '@/components/ui/table';
import {Loader2,Receipt,XCircle,RefreshCw} from 'lucide-react';
import {toast} from 'sonner';
import {allRows,cancelPayment,monthlyFees} from '@/lib/tuitionLedgerApi';
import {billingDisplayStatus,ledgerMonths,paidForMonth,paymentMonth,paymentReference} from '@/lib/tuitionLedger';
import {formatStudentGrade,getTodayKST} from '@/lib/utils';
import {BillingStatusBadge,SourceBadge,currentTuitionMonth} from './LedgerControls';
export function StudentPaymentDetail({studentId,onClose,onReceipt,onChanged}:{studentId:string|null;onClose:()=>void;onReceipt:(p:any)=>void;onChanged:()=>void}) {
 const [data,setData]=useState<{student:any;billings:any[];payments:any[];unpaid:any[]}|null>(null);
 const [error,setError]=useState('');const [version,setVersion]=useState(0);const [canceling,setCanceling]=useState('');
 useEffect(()=>{ if(!studentId)return;let alive=true;setData(null);setError('');
  (async()=>{
   const [s,billings,payments]=await Promise.all([
    supabase.from('students').select('id,name,school,grade,school_level,grade_year,payment_due_day,parent_phone,tuition_memo,deposit_name').eq('id',studentId).single(),
    allRows(()=>supabase.from('billing_schedules').select('*').eq('student_id',studentId).order('billing_month',{ascending:false}).order('id')),
    allRows(()=>supabase.from('payment_records').select('*,billing_schedules(billing_month)').eq('student_id',studentId).order('paid_date',{ascending:false}).order('id')),
   ]);if(s.error)throw s.error;
   const unpaid:any[]=[];
   for(const month of ledgerMonths(currentTuitionMonth())){const fee=(await monthlyFees([studentId],month))[studentId];const paid=paidForMonth(payments,studentId,month);if(fee>paid)unpaid.push({month,fee,paid});}
   if(alive)setData({student:s.data,billings,payments,unpaid});
  })().catch(()=>{if(alive)setError('수납 상세내역을 불러오지 못했습니다');});return()=>{alive=false;};
 },[studentId,version]);
 async function cancel(p:any){if(!window.confirm(`${p.paid_date} ${Number(p.amount).toLocaleString()}원 납부를 취소할까요? 기록과 영수증 번호는 유지됩니다.`))return;setCanceling(p.id);try{const warning=await cancelPayment(p);warning?toast.warning(warning):toast.success('납부 취소 완료');setVersion(v=>v+1);onChanged();}catch{toast.error('취소하지 못했습니다');}finally{setCanceling('');}}
 return <Dialog open={!!studentId} onOpenChange={open=>{if(!open)onClose();}}><DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{data?.student.name||'학생'} 수납 상세</DialogTitle><DialogDescription>청구 · 납부 이력 · 미납</DialogDescription></DialogHeader>
 {error?<div><p role="alert" className="text-destructive">{error}</p><Button variant="outline" onClick={()=>setVersion(v=>v+1)}><RefreshCw className="w-4 h-4 mr-1"/>다시 불러오기</Button></div>:!data?<Loader2 className="mx-auto animate-spin"/>:<>
  <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm border-b pb-4">
   <div><dt className="text-muted-foreground">학교/학년</dt><dd>{data.student.school||'—'} {formatStudentGrade(data.student)}</dd></div>
   <div><dt className="text-muted-foreground">납입 예정일</dt><dd>매월 {data.student.payment_due_day}일</dd></div>
   <div><dt className="text-muted-foreground">보호자 연락처</dt><dd>{data.student.parent_phone||'—'}</dd></div>
   <div><dt className="text-muted-foreground">입금자명</dt><dd>{data.student.deposit_name||'—'}</dd></div>
   <div className="col-span-2 md:col-span-4"><dt className="text-muted-foreground">원비 메모</dt><dd className="whitespace-pre-wrap">{data.student.tuition_memo||'—'}</dd></div>
  </dl>
  <section><h3 className="mb-2">청구 ({data.billings.length}건)</h3><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>청구월</TableHead><TableHead>금액</TableHead><TableHead>할인 / 추가</TableHead><TableHead>납부기한</TableHead><TableHead>상태</TableHead></TableRow></TableHeader><TableBody>{data.billings.map(b=><TableRow key={b.id}><TableCell>{b.billing_month}</TableCell><TableCell>{Number(b.final_amount).toLocaleString()}원</TableCell><TableCell>−{Number(b.discount_amount).toLocaleString()} / +{Number(b.extra_amount).toLocaleString()}</TableCell><TableCell>{b.due_date}</TableCell><TableCell><BillingStatusBadge status={billingDisplayStatus(b,getTodayKST())}/></TableCell></TableRow>)}</TableBody></Table></div>{!data.billings.length&&<p className="text-muted-foreground text-sm py-3">청구 이력이 없습니다</p>}</section>
  <section><h3 className="mb-2">납부 이력 ({data.payments.length}건)</h3><div className="overflow-x-auto"><Table><TableHeader><TableRow>{['납부일','금액','귀속월','출처','수단','상세 / 메모','영수증','취소'].map(h=><TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>{data.payments.map(p=><TableRow key={p.id} className={p.canceled_at?'opacity-50':''}><TableCell className="whitespace-nowrap">{p.paid_date}</TableCell><TableCell className="whitespace-nowrap">{Number(p.amount).toLocaleString()}원{p.canceled_at&&<div className="text-destructive">취소</div>}</TableCell><TableCell>{paymentMonth(p)||'확인 필요'}</TableCell><TableCell><SourceBadge source={p.source}/></TableCell><TableCell>{p.payment_method}</TableCell><TableCell className="min-w-40 max-w-72 text-xs"><p>{paymentReference(p)||'—'}</p><p className="whitespace-pre-wrap text-muted-foreground">{p.memo}</p><details><summary className="cursor-pointer">원문</summary><p className="whitespace-pre-wrap break-all">{p.raw_text||'—'}</p></details></TableCell><TableCell><Button size="icon" variant="ghost" aria-label={`${p.paid_date} 영수증`} title="영수증" onClick={()=>onReceipt(p)}><Receipt className="w-4 h-4"/></Button></TableCell><TableCell>{!p.canceled_at&&<Button size="icon" variant="ghost" aria-label={`${p.paid_date} 납부 취소`} title="납부 취소" disabled={!!canceling} onClick={()=>cancel(p)}><XCircle className="w-4 h-4 text-destructive"/></Button>}</TableCell></TableRow>)}</TableBody></Table></div>{!data.payments.length&&<p className="text-sm text-muted-foreground py-3">납부 이력이 없습니다</p>}</section>
  <section><h3 className="mb-2">미납 · 2026년 10월부터</h3>{data.unpaid.length?<Table><TableHeader><TableRow><TableHead>청구월</TableHead><TableHead>원비</TableHead><TableHead>납부</TableHead><TableHead>잔액</TableHead></TableRow></TableHeader><TableBody>{data.unpaid.map(u=><TableRow key={u.month}><TableCell>{u.month}</TableCell><TableCell>{u.fee.toLocaleString()}원</TableCell><TableCell>{u.paid.toLocaleString()}원</TableCell><TableCell className="text-destructive">{(u.fee-u.paid).toLocaleString()}원</TableCell></TableRow>)}</TableBody></Table>:<p className="text-sm text-muted-foreground py-3">미납 월이 없습니다</p>}</section>
 </>}
 </DialogContent></Dialog>;
}
