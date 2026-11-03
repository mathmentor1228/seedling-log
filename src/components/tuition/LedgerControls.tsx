import {Badge} from '@/components/ui/badge';
import {Input} from '@/components/ui/input';
import {getTodayKST} from '@/lib/utils';
import './tuition.css';
export const currentTuitionMonth=()=>getTodayKST().slice(0,7);
export function MonthInput({value,onChange,label='청구월',min,id}:{value:string;onChange:(v:string)=>void;label?:string;min?:string;id?:string}) { return <Input id={id} aria-label={label} type="month" className="w-40" value={value} min={min} onChange={e=>{if(/^\d{4}-\d{2}$/.test(e.target.value))onChange(e.target.value);}}/>; }
export function SourceBadge({source}:{source?:string|null}) {
 const tone=source==='결제선생'?'source-payssam':source==='이코딩키오스크'?'source-kiosk':source==='이코딩수기'?'source-coding':source==='계좌이체문자'?'source-bank':source==='출결버스'?'bg-muted text-muted-foreground border-border':'';
 return <Badge variant="outline" className={`whitespace-nowrap ${tone}`}>{source||'수기'}</Badge>;
}
export function NoReceiptLabel(){return <span className="text-xs text-muted-foreground whitespace-nowrap">영수증 없음(출결버스 이관)</span>;}
export function BillingStatusBadge({status}:{status:string}) {const labels:Record<string,string>={pending:'대기',paid:'납부완료',overdue:'미납',cancelled:'취소'};return <Badge variant={status==='overdue'?'destructive':status==='paid'?'default':'outline'}>{labels[status]||status}</Badge>;}
