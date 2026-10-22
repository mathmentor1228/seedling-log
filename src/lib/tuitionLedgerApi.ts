import { supabase } from '@/integrations/supabase/client';
import { billingDisplayStatus, paidForMonth, paymentMonth } from './tuitionLedger';
import { getTodayKST } from './utils';

// Page every ledger query so row caps never turn a partial read into "unpaid".
export async function allRows(query: () => any): Promise<any[]> {
  const rows:any[]=[];
  for (let start=0;;start+=500) {
    const {data,error}=await query().range(start,start+499);
    if(error) throw error;
    rows.push(...(data || []));
    if(!data || data.length<500) return rows;
  }
}
export async function monthlyFees(ids:string[],month:string):Promise<Record<string,number>> {
  const fees:Record<string,number>={}; let index=0;
  await Promise.all(Array.from({length:Math.min(8,ids.length)},async()=>{
    while(index<ids.length) { const id=ids[index++]; const {data,error}=await supabase.rpc('student_monthly_fee',{_student_id:id,_month:month}); if(error) throw error; if(data==null) throw new Error('월 원비 조회 실패'); fees[id]=Number(data); }
  }));
  return fees;
}
export async function getMonthPayments(month:string) {
  const rows=await allRows(()=>supabase.from('payment_records').select('*, billing_schedules(billing_month)').or(`billing_month.eq.${month},billing_month.is.null`).order('id'));
  return rows.filter(p=>paymentMonth(p)===month);
}
export async function loadMonthLedger(month:string) {
  const [students,payments]=await Promise.all([
    allRows(()=>supabase.from('students').select('id,name,school,grade,school_level,grade_year,parent_phone,payment_due_day,tuition_memo,enrollment_status').order('id')),
    getMonthPayments(month),
  ]);
  const fees=await monthlyFees(students.map(s=>s.id),month);
  return {students:students.filter(s=>fees[s.id]>0).map(s=>({...s,totalFee:fees[s.id],paidAmount:paidForMonth(payments,s.id,month),isPaid:paidForMonth(payments,s.id,month)>=fees[s.id]})),payments};
}
export async function syncStudentBilling(studentId:string,month:string) {
  const [billings,payments]=await Promise.all([
    allRows(()=>supabase.from('billing_schedules').select('*').eq('student_id',studentId).eq('billing_month',month).neq('status','cancelled').order('id')),
    getMonthPayments(month),
  ]);
  const total=paidForMonth(payments,studentId,month);
  const required=billings.reduce((sum,b)=>sum+Number(b.final_amount),0);
  for(const b of billings) {
    const status=required>0 && total>=required?'paid':billingDisplayStatus({status:'pending',due_date:b.due_date},getTodayKST());
    if(b.status!==status) { const {error}=await supabase.from('billing_schedules').update({status}).eq('id',b.id); if(error) throw error; }
  }
}
export async function recordManualPayment(input:{student_id:string;billing_month:string;amount:number;paid_date:string;payment_method:string;memo:string|null;recorded_by?:string|null}) {
  const {data:billings,error:billError}=await supabase.from('billing_schedules').select('id').eq('student_id',input.student_id).eq('billing_month',input.billing_month).neq('status','cancelled').order('id').limit(1);
  if(billError) throw billError;
  const {error}=await supabase.from('payment_records').insert({...input,billing_schedule_id:billings?.[0]?.id || null,source:'수기',matched_by:'manual'});
  if(error) throw error;
  // A reconciliation failure must not invite duplicate payment insertion.
  try { await syncStudentBilling(input.student_id,input.billing_month); return null; } catch { return '납부는 저장됐지만 청구 상태 확인이 필요합니다'; }
}
export async function cancelPayment(p:any,note?:string) {
  const {data,error}=await supabase.from('payment_records').update({canceled_at:new Date().toISOString(),...(note?{review_note:note}:{})}).eq('id',p.id).is('canceled_at',null).select('id').maybeSingle();
  if(error) throw error;
  if(!data) throw new Error('이미 취소되었거나 취소할 수 없는 납부입니다');
  const month=paymentMonth(p);
  if(month) { try {await syncStudentBilling(p.student_id,month);} catch {return '취소는 저장됐지만 청구 상태 확인이 필요합니다';} }
  return null;
}
