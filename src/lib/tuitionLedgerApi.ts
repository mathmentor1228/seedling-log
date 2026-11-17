import { supabase } from '@/integrations/supabase/client';
import { LEDGER_START, billingDisplayStatus, dueDate, needsWithdrawalMonthCheck, paidForMonth, paymentExcess, paymentMonth, type PaymentExcess } from './tuitionLedger';
import { monthsAround, type RangeBill } from '@/components/tuition/unpaidDue';
import { getTodayKST } from './utils';
import { pendingRepriceChanges, type FeeOverride } from './tuitionFeeOverrides';
import { scheduledPaymentDate, type PaymentSchedule } from './tuitionPaymentDates';

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
  // One batched call instead of one RPC per student (was ~6s on /admin/tuition).
  const {data,error}=await supabase.rpc('students_monthly_fees',{_month:month,_student_ids:ids});
  if(error) throw error;
  if(data==null) throw new Error('월 원비 조회 실패');
  const fees:Record<string,number>={};
  for(const id of ids) fees[id]=0;
  for(const row of data as {student_id:string;fee:number}[]) fees[row.student_id]=Number(row.fee);
  return fees;
}
export async function studentFeeOverrides(studentId: string): Promise<FeeOverride[]> {
  return allRows(() => supabase.from('student_fee_overrides').select('id,from_month,amount,note').eq('student_id', studentId).order('from_month', { ascending: false }).order('id'));
}
export async function recalculatePendingBillings(month: string): Promise<{ changed: number; skipped: number }> {
  const rows = await allRows(() => supabase.from('billing_schedules').select('*').eq('billing_month', month).eq('status', 'pending').order('id'));
  const fees = await monthlyFees([...new Set<string>(rows.map(row => row.student_id))], month);
  const changes = pendingRepriceChanges(rows, fees, month);
  let changed = 0, skipped = 0;
  for (const change of changes) {
    const { row } = change;
    // Recheck status and amounts in the write itself; preserve concurrent payments/edits.
    let query = supabase.from('billing_schedules').update({ base_amount: change.base_amount, final_amount: change.final_amount })
      .eq('id', row.id).eq('billing_month', month).eq('status', 'pending')
      .eq('base_amount', row.base_amount).eq('final_amount', row.final_amount).eq('discount_amount', row.discount_amount);
    query = row.extra_amount == null ? query.is('extra_amount', null) : query.eq('extra_amount', row.extra_amount);
    const { data, error } = await query.select('id');
    if (error) throw new Error(`${changed}건 변경 후 중단됐습니다. 청구 목록을 확인하고 다시 시도해주세요`);
    if (data?.length) changed += data.length; else skipped++;
  }
  return { changed, skipped };
}
export async function getMonthPayments(month:string) {
  const rows=await allRows(()=>supabase.from('payment_records').select('*, billing_schedules(billing_month,due_date,status)').or(`billing_month.eq.${month},billing_month.is.null`).order('id'));
  return rows.filter(p=>paymentMonth(p)===month);
}
export async function loadMonthLedger(month:string) {
  if (month < LEDGER_START) {
    const rows = await allRows(() => supabase.from('payment_records')
      .select('*, billing_schedules(billing_month,due_date,status), students(id,name,school,grade,school_level,grade_year,parent_phone,payment_due_day,tuition_memo,enrollment_status)')
      .eq('billing_month', month).is('canceled_at', null).order('id'));
    const totals = new Map<string, any>();
    const payments = rows.map(({ students: student, ...payment }) => {
      if (!student) throw new Error('과거 수납 학생 정보를 불러오지 못했습니다');
      const existing = totals.get(payment.student_id);
      const amount = Number(payment.amount);
      totals.set(payment.student_id, {
        ...student,
        totalFee: (existing?.totalFee ?? 0) + amount,
        paidAmount: (existing?.paidAmount ?? 0) + amount,
        isPaid: true,
        dueDate: dueDate(month, student.payment_due_day),
      });
      return payment;
    });
    return { students: [...totals.values()], payments, schedules: [] as PaymentSchedule[] };
  }
  const [students,payments,schedules]=await Promise.all([
    allRows(()=>supabase.from('students').select('id,name,school,grade,school_level,grade_year,parent_phone,payment_due_day,tuition_memo,enrollment_status,withdrawal_last_class_date,withdrawn_at').order('id')),
    getMonthPayments(month),
    allRows(()=>supabase.from('billing_schedules').select('id,student_id,billing_month,due_date,status,final_amount,discount_amount,extra_amount,memo').eq('billing_month',month).order('id')) as Promise<(PaymentSchedule & {id?:string;final_amount?:number;discount_amount?:number;extra_amount?:number|null;memo?:string|null})[]>,
  ]);
  const fees=await monthlyFees(students.map(s=>s.id),month);
  // 퇴원/휴학 students have a 0 monthly fee; keep them only while a non-cancelled bill remains for the month (amount = that bill).
  const billTotal=(id:string)=>schedules.filter(b=>b.student_id===id&&b.status!=='cancelled').reduce((sum,b)=>sum+Number(b.final_amount||0),0);
  const inactive=(s:any)=>s.enrollment_status==='퇴원'||s.enrollment_status==='휴학';
  return {students:students.filter(s=>fees[s.id]>0||(inactive(s)&&billTotal(s.id)>0)).map(s=>{
    const fee=fees[s.id]>0?fees[s.id]:billTotal(s.id);
    const paid=paidForMonth(payments,s.id,month);
    // A saved bill due date (owner-editable) wins; the student's due day is the fallback.
    const scheduled=scheduledPaymentDate(s.id,month,schedules,s.payment_due_day);
    return {...s,totalFee:fee,paidAmount:paid,isPaid:paid>=fee,scheduledDueDate:scheduled.date,dueDateBasis:scheduled.basis,dueDate:scheduled.date||dueDate(month,s.payment_due_day),withdrawalCheck:inactive(s)&&needsWithdrawalMonthCheck(s,month)};
  }),payments,schedules};
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
// Months before the ledger have no fixed fee, so they are never judged as over- or under-paid.
export async function overpaymentCheck(studentId:string,month:string,amount:number,excludePaymentId?:string):Promise<PaymentExcess|null> {
  if(!month || month<LEDGER_START) return null;
  const [billings,payments]=await Promise.all([
    allRows(()=>supabase.from('billing_schedules').select('final_amount').eq('student_id',studentId).eq('billing_month',month).neq('status','cancelled').order('id')),
    allRows(()=>supabase.from('payment_records').select('id,student_id,amount,billing_month,canceled_at,billing_schedules(billing_month)').eq('student_id',studentId).is('canceled_at',null).order('id')),
  ]);
  const required=billings.length?billings.reduce((sum,b)=>sum+Number(b.final_amount),0):(await monthlyFees([studentId],month))[studentId] ?? 0;
  return paymentExcess(required,paidForMonth(payments.filter(p=>p.id!==excludePaymentId),studentId,month),amount);
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

// #32 V2: bills whose due date may fall in [from, to] (± one billing month), with that window's payments.
const RANGE_STUDENT_COLUMNS='id,name,school,grade,school_level,grade_year,parent_phone,payment_due_day,tuition_memo,enrollment_status,withdrawal_last_class_date,withdrawn_at';
export async function loadUnpaidByDueRange(from:string,to:string):Promise<{bills:RangeBill[];payments:any[]}> {
  const {start,end}=monthsAround(from,to);
  const [bills,payments]=await Promise.all([
    allRows(()=>supabase.from('billing_schedules').select(`id,student_id,billing_month,due_date,status,final_amount,memo,students(${RANGE_STUDENT_COLUMNS})`).gte('billing_month',start).lte('billing_month',end).neq('status','cancelled').order('id')),
    allRows(()=>supabase.from('payment_records').select('id,student_id,amount,billing_month,canceled_at,billing_schedules(billing_month)').or(`and(billing_month.gte.${start},billing_month.lte.${end}),billing_month.is.null`).is('canceled_at',null).order('id')),
  ]);
  return {bills:bills as RangeBill[],payments};
}
// #32 V2: every payment actually made in [from, to], regardless of billing month.
export async function loadPaymentsByPaidRange(from:string,to:string) {
  return allRows(()=>supabase.from('payment_records').select('id,student_id,amount,paid_date,billing_month,source,needs_review,canceled_at,students(name),billing_schedules(billing_month,final_amount)').gte('paid_date',from).lte('paid_date',to).order('paid_date',{ascending:false}).order('id'));
}
// #34: bills + payments needed to preview which unpaid bills a fee change will touch.
export async function loadFeeSyncData(studentId:string) {
  const [bills,payments]=await Promise.all([
    allRows(()=>supabase.from('billing_schedules').select('id,billing_month,status,final_amount,discount_amount,extra_amount,memo').eq('student_id',studentId).gte('billing_month',LEDGER_START).order('billing_month').order('id')),
    allRows(()=>supabase.from('payment_records').select('id,billing_schedule_id,billing_month,canceled_at').eq('student_id',studentId).order('id')),
  ]);
  return {bills,payments};
}
export async function applyFeeChange(studentId:string,fromMonth:string,newTotal:number):Promise<number> {
  const {data,error}=await supabase.rpc('apply_fee_change',{p_student_id:studentId,p_from_month:fromMonth,p_new_total:newTotal});
  if(error) throw new Error(error.message || '원비 변경을 청구에 반영하지 못했습니다');
  return Number(data ?? 0);
}
