import {useState,useEffect} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Checkbox} from '@/components/ui/checkbox';
import {Textarea} from '@/components/ui/textarea';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from '@/components/ui/table';
import {Check,UserRoundCheck,Ban,Loader2,RefreshCw} from 'lucide-react';
import {toast} from 'sonner';
import {allRows,cancelPayment,syncStudentBilling} from '@/lib/tuitionLedgerApi';
import {paymentMonth} from '@/lib/tuitionLedger';
import {SourceBadge} from './LedgerControls';
import {StudentPaymentLink,useTuitionLedger} from './TuitionLedgerContext';
export function PaymentReviewQueue(){
 const {revision,changed}=useTuitionLedger();const [rows,setRows]=useState<any[]>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [students,setStudents]=useState<any[]>([]);const [active,setActive]=useState<any|null>(null);const [mode,setMode]=useState('assign');const [studentId,setStudentId]=useState('');const [search,setSearch]=useState('');const [alias,setAlias]=useState('');const [saveAlias,setSaveAlias]=useState(false);const [note,setNote]=useState('');const [saving,setSaving]=useState(false);
 async function load(){setLoading(true);setError('');try{setRows(await allRows(()=>supabase.from('payment_records').select('*,students(name),billing_schedules(billing_month)').eq('needs_review',true).is('canceled_at',null).order('paid_date',{ascending:false}).order('id')));}catch{setError('확인 필요 목록을 불러오지 못했습니다');}finally{setLoading(false);}}
 useEffect(()=>{load();},[revision]);
 async function begin(p:any,nextMode:string){try{if(nextMode==='assign')setStudents(await allRows(()=>supabase.from('students').select('id,name,school,grade').order('name').order('id')));setMode(nextMode);setStudentId('');setSearch('');const parsed=`${p.raw_text||''}\n${p.memo||''}`.match(/입금자(?:명)?\s*[:：]?\s*([^\n,|]+)/);setAlias(parsed?.[1]?.trim()||'');setSaveAlias(false);setNote(p.review_note||'');setActive(p);}catch{toast.error('학생 목록을 불러오지 못했습니다');}}
 async function confirmed(p:any){try{const {error}=await supabase.from('payment_records').update({needs_review:false}).eq('id',p.id);if(error)throw error;toast.success('금액 확인 완료');changed();}catch{toast.error('확인 처리 실패');}}
 async function save(){if(!active)return;if(mode==='assign'&&!studentId){toast.error('학생을 선택해주세요');return;}if(saveAlias&&!alias.trim()){toast.error('입금자 별칭을 입력해주세요');return;}if(mode==='ignore'&&!note.trim()){toast.error('원비가 아닌 사유를 입력해주세요');return;}setSaving(true);
  let persisted=false;
  try {
   if(mode==='ignore') {const warning=await cancelPayment(active,note);if(warning)toast.warning(warning);}
   else {const {error}=await supabase.from('payment_records').update({student_id:studentId,billing_schedule_id:null,matched_by:'manual',needs_review:false}).eq('id',active.id);if(error)throw error;}
   persisted=true;
   if(mode==='assign') {const month=paymentMonth(active);if(month){try {await syncStudentBilling(active.student_id,month);await syncStudentBilling(studentId,month);}catch{toast.warning('학생 지정은 저장됐지만 청구 상태 확인이 필요합니다');}}}
   if(saveAlias){
    let lookup=supabase.from('deposit_aliases').select('id').eq('alias_name',alias.trim());
    lookup=mode==='assign'?lookup.eq('student_id',studentId):lookup.is('student_id',null);
    const {data:existing,error:lookupError}=await lookup;
    if(lookupError)throw new Error('처리는 완료됐지만 별칭을 확인하지 못했습니다');
    const payload={alias_name:alias.trim(),student_id:mode==='assign'?studentId:null,is_ignore:mode==='ignore',confidence:'원장확인',note:note||null};
    const result=existing?.length?await supabase.from('deposit_aliases').update(payload).eq('id',existing[0].id):await supabase.from('deposit_aliases').insert(payload);
    if(result.error)throw new Error('처리는 완료됐지만 별칭을 저장하지 못했습니다');
   }
   toast.success(mode==='assign'?'학생 지정 완료':'원비 아님 처리 완료');setActive(null);changed();
  } catch(e:any){toast.error(e.message||'처리 실패');if(persisted){setActive(null);changed();}}
  finally{setSaving(false);}
 }
 return <div className="space-y-4 mt-4"><div className="flex gap-2 items-center"><h3>확인 필요 ({rows.length}건)</h3><Button variant="outline" size="icon" aria-label="확인 필요 새로고침" onClick={load}><RefreshCw className="w-4 h-4"/></Button></div>
 {loading?<Loader2 className="animate-spin mx-auto"/>:error?<p role="alert" className="text-destructive">{error}</p>:<div className="overflow-x-auto border rounded-lg"><Table><TableHeader><TableRow>{['납부일','금액','출처','학생','원문','확인 사유','처리'].map(h=><TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.map(p=><TableRow key={p.id}><TableCell>{p.paid_date}</TableCell><TableCell className="whitespace-nowrap">{Number(p.amount).toLocaleString()}원</TableCell><TableCell><SourceBadge source={p.source}/></TableCell><TableCell><StudentPaymentLink id={p.student_id} name={p.students?.name||'미지정'}/></TableCell><TableCell className="min-w-48 max-w-80 whitespace-pre-wrap break-all text-xs">{p.raw_text||'—'}</TableCell><TableCell className="text-xs">{p.review_note||'—'}</TableCell><TableCell><div className="flex gap-1"><Button size="icon" variant="outline" title="학생 지정" aria-label="학생 지정" onClick={()=>begin(p,'assign')}><UserRoundCheck className="w-4 h-4"/></Button><Button size="icon" variant="outline" title="원비 아님" aria-label="원비 아님" onClick={()=>begin(p,'ignore')}><Ban className="w-4 h-4"/></Button><Button size="icon" variant="outline" title="금액 확인 완료" aria-label="금액 확인 완료" onClick={()=>confirmed(p)}><Check className="w-4 h-4"/></Button></div></TableCell></TableRow>)}</TableBody></Table>{!rows.length&&<p className="text-center py-12 text-muted-foreground">확인 필요한 수납이 없습니다</p>}</div>}
 <Dialog open={!!active} onOpenChange={open=>{if(!open&&!saving)setActive(null);}}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{mode==='assign'?'학생 지정':'원비 아님'}</DialogTitle><DialogDescription>{active?.paid_date} · {Number(active?.amount||0).toLocaleString()}원</DialogDescription></DialogHeader>{mode==='assign'?<><Input aria-label="확인 필요 학생 검색" placeholder="이름 / 학교 검색" value={search} onChange={e=>setSearch(e.target.value)}/><Select value={studentId} onValueChange={setStudentId}><SelectTrigger aria-label="지정할 학생"><SelectValue placeholder="학생 선택"/></SelectTrigger><SelectContent>{students.filter(s=>`${s.name} ${s.school}`.includes(search)).map(s=><SelectItem key={s.id} value={s.id}>{s.name} · {s.school} {s.grade}</SelectItem>)}</SelectContent></Select></>:<><Label htmlFor="review-note">원비 아닌 사유</Label><Textarea id="review-note" value={note} onChange={e=>setNote(e.target.value)}/></>}
 <div className="flex items-center gap-2"><Checkbox id="save-deposit-alias" checked={saveAlias} onCheckedChange={v=>setSaveAlias(v===true)}/><Label htmlFor="save-deposit-alias">{mode==='assign'?'이 입금자명을 별칭으로 저장':'이 입금자명을 원비 제외 별칭으로 저장'}</Label></div>{saveAlias&&<Input aria-label="입금자 별칭" value={alias} onChange={e=>setAlias(e.target.value)} placeholder="입금자명"/>}<Button disabled={saving} onClick={save}>{saving?'저장 중…':'저장'}</Button>
 </DialogContent></Dialog></div>;
}
