import {useState,useEffect} from 'react';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from '@/components/ui/table';
import {Loader2,RefreshCw} from 'lucide-react';
import {loadMonthLedger} from '@/lib/tuitionLedgerApi';
import {dueDate,LEDGER_START} from '@/lib/tuitionLedger';
import {getTodayKST} from '@/lib/utils';
import {currentTuitionMonth,MonthInput} from './LedgerControls';
import {StudentPaymentLink,useTuitionLedger} from './TuitionLedgerContext';
export function OverdueList(){
 const {revision}=useTuitionLedger();const [month,setMonth]=useState(currentTuitionMonth());const [rows,setRows]=useState<any[]>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState('');
 async function load(){setLoading(true);setError('');try{const {students}=await loadMonthLedger(month);setRows(students.filter(s=>s.paidAmount<s.totalFee));}catch{setError('미납 목록을 불러오지 못했습니다');}finally{setLoading(false);}}
 useEffect(()=>{load();},[month,revision]);
 return <div className="space-y-4 mt-4"><div className="flex gap-2 items-center"><MonthInput min={LEDGER_START} value={month} onChange={v=>{if(v>=LEDGER_START)setMonth(v);}}/><Button variant="outline" size="icon" aria-label="미납 새로고침" onClick={load}><RefreshCw className="w-4 h-4"/></Button><span className="text-muted-foreground text-sm">미납 {rows.filter(s=>s.paidAmount===0).length}명 · 부분납 {rows.filter(s=>s.paidAmount>0).length}명</span></div><p className="font-bold text-lg">미납 잔액 <span className="text-destructive">{rows.reduce((sum,s)=>sum+s.totalFee-s.paidAmount,0).toLocaleString()}원</span></p>
 {loading?<Loader2 className="animate-spin mx-auto"/>:error?<p role="alert" className="text-destructive">{error}</p>:<div className="overflow-x-auto border rounded-lg"><Table><TableHeader><TableRow>{['학생','청구월','원비','납부액','잔액','상태','납부기한','보호자 연락처'].map(h=><TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.map(s=><TableRow key={s.id}><TableCell><StudentPaymentLink id={s.id} name={s.name}/></TableCell><TableCell>{month}</TableCell><TableCell>{s.totalFee.toLocaleString()}원</TableCell><TableCell>{s.paidAmount.toLocaleString()}원</TableCell><TableCell className="text-destructive font-semibold">{(s.totalFee-s.paidAmount).toLocaleString()}원</TableCell><TableCell><Badge variant={s.paidAmount>0?'secondary':'destructive'}>{s.paidAmount>0?'부분납':'미납'}</Badge>{dueDate(month,s.payment_due_day)>=getTodayKST()&&<span className="block text-xs text-muted-foreground">기한 전</span>}</TableCell><TableCell>{dueDate(month,s.payment_due_day)}</TableCell><TableCell>{s.parent_phone||'—'}</TableCell></TableRow>)}</TableBody></Table>{!rows.length&&<p className="p-8 text-center text-muted-foreground">미납자가 없습니다</p>}</div>}
 </div>;
}
