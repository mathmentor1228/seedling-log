import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {supabase} from '@/integrations/supabase/client';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import {Loader2,Printer} from 'lucide-react';
import {allRows} from '@/lib/tuitionLedgerApi';
import {paymentMonth,paymentReference} from '@/lib/tuitionLedger';
import './tuition.css';

function ReceiptCopy({payment,student,academy,courses,original}:{payment:any;student:any;academy:any;courses:string;original:boolean}) {
 return <section className="receipt-copy">
  <h2>{original?'교습비등 영수증 원부':'교습비등 영수증'}</h2>
  <div className="flex justify-between"><span>일련번호 {payment.receipt_number || '번호 미부여'}</span><span>연월 {paymentMonth(payment)||'확인 필요'}</span></div>
  <table><tbody>
   <tr><th>납부자 등록번호(학반)</th><td>{student?.student_code||''}</td></tr>
   <tr><th>성명</th><td>{student?.name||'미지정'}</td></tr>
   <tr><th>생년월일</th><td>　</td></tr>
   <tr><th>교습과목</th><td>{courses}</td></tr>
   <tr><th>납부명세 · 교습비</th><td>{Number(payment.amount).toLocaleString()}원</td></tr>
   <tr><th>기타경비</th><td>　</td></tr>
  </tbody></table>
  <p className="text-center my-3">위와 같이 영수하였음을 증명합니다.</p>
  <p className="text-right">영수일 {payment.paid_date}</p>
  <p className="mt-3">{academy.academy_name} (등록 {academy.registration_no})</p>
  <p>학원설립·운영자 {academy.representative} (서명 또는 인)</p>
  <p>주소 {academy.address}</p>
  <footer>결제수단 {payment.payment_method} · {paymentReference(payment)||'승인번호/입금자명 —'} · 출처 {payment.source}<br/>{payment.canceled_at?'취소된 납부 · 유효하지 않은 영수증':''}</footer>
 </section>;
}
export function TuitionReceipt({payments,onClose,originalOnly=false}:{payments:any[]|null;onClose:()=>void;originalOnly?:boolean}) {
 const [data,setData]=useState<{academy:any;students:Record<string,any>;courses:Record<string,any[]>}|null>(null);
 const [error,setError]=useState('');
 useEffect(()=>{ if(!payments) return; let alive=true; setData(null);setError('');
  (async()=>{
   const ids=[...new Set(payments.map(p=>p.student_id))];
   const [academyRes,students,courses]=await Promise.all([
    supabase.from('academy_profile').select('academy_name,registration_no,representative,address').eq('id',1).single(),
    allRows(()=>supabase.from('students').select('id,name,student_code').in('id',ids).order('id')),
    allRows(()=>supabase.from('student_courses').select('student_id,enrollment_date,end_date,is_active,course_policies(subject,course_name)').in('student_id',ids).order('id')),
   ]);
   if(academyRes.error)throw academyRes.error;
   const byStudent:Record<string,any[]>={}; for(const c of courses)byStudent[c.student_id]=[...(byStudent[c.student_id]||[]),c];
   if(alive)setData({academy:academyRes.data,students:Object.fromEntries(students.map(s=>[s.id,s])),courses:byStudent});
  })().catch(()=>{if(alive)setError('영수증 정보를 불러오지 못했습니다');});
  return ()=>{alive=false;};
 },[payments]);
 const sheets=data && payments?payments.map(p=>{
  const month=paymentMonth(p)||p.paid_date.slice(0,7);
  const names=(data.courses[p.student_id]||[]).filter(c=>c.enrollment_date<=`${month}-31` && (!c.end_date||c.end_date>=`${month}-01`)).map(c=>c.course_policies?`${c.course_policies.subject} · ${c.course_policies.course_name}`:'').filter(Boolean);
  return <article className="receipt-sheet" key={p.id}><ReceiptCopy payment={p} student={data.students[p.student_id]} academy={data.academy} courses={[...new Set(names)].join(', ')} original/>{!originalOnly&&<ReceiptCopy payment={p} student={data.students[p.student_id]} academy={data.academy} courses={[...new Set(names)].join(', ')} original={false}/>}</article>;
 }):null;
 return <>
  <Dialog open={!!payments} onOpenChange={open=>{if(!open)onClose();}}><DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{originalOnly?'기간 일괄 출력':'교습비등 영수증'}</DialogTitle><DialogDescription>{payments?.length||0}건 · 별지 제24호서식</DialogDescription></DialogHeader>
   <div className="flex justify-end"><Button disabled={!data||!!error} onClick={()=>window.print()}><Printer className="w-4 h-4 mr-2"/>인쇄 / PDF</Button></div>
   {error?<p role="alert" className="text-destructive">{error}</p>:!data?<Loader2 className="animate-spin mx-auto"/>:sheets}
  </DialogContent></Dialog>
  {payments&&data&&createPortal(<div id="tuition-print-root">{sheets}</div>,document.body)}
 </>;
}
