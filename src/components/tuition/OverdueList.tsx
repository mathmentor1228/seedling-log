import {useState,useEffect,useMemo} from 'react';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
import {Label} from '@/components/ui/label';
import {Switch} from '@/components/ui/switch';
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from '@/components/ui/table';
import {Loader2,RefreshCw} from 'lucide-react';
import {loadMonthLedger} from '@/lib/tuitionLedgerApi';
import {LEDGER_START} from '@/lib/tuitionLedger';
import {cn,getTodayKST} from '@/lib/utils';
import {currentTuitionMonth,MonthInput} from './LedgerControls';
import {StudentPaymentLink,useTuitionLedger} from './TuitionLedgerContext';
import {splitUnpaidByDue,studentDueDate,unpaidSummary,useShowUpcomingUnpaid} from './unpaidDue';
export function OverdueList(){
 const {revision}=useTuitionLedger();const [month,setMonth]=useState(currentTuitionMonth());const [rows,setRows]=useState<any[]>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState('');
 const [showUpcoming,setShowUpcoming]=useShowUpcomingUnpaid();
 async function load(){setLoading(true);setError('');try{const {students}=await loadMonthLedger(month);setRows(students.filter(s=>s.paidAmount<s.totalFee));}catch{setError('미납 목록을 불러오지 못했습니다');}finally{setLoading(false);}}
 useEffect(()=>{load();},[month,revision]);
 const today=getTodayKST();
 const {due,upcoming}=useMemo(()=>splitUnpaidByDue(rows,month,today),[rows,month,today]);
 const shown=showUpcoming?[...due,...upcoming]:due;
 const summary=unpaidSummary(shown);const upcomingSummary=unpaidSummary(upcoming);
 const upcomingIds=new Set(upcoming.map(s=>s.id));
 return <div className="space-y-4 mt-4">
  <div className="flex flex-wrap gap-2 items-center"><MonthInput min={LEDGER_START} value={month} onChange={v=>{if(v>=LEDGER_START)setMonth(v);}}/><Button variant="outline" size="icon" aria-label="미납 새로고침" onClick={load}><RefreshCw className="w-4 h-4"/></Button>
   <div className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5"><Switch id="overdue-show-upcoming" checked={showUpcoming} onCheckedChange={setShowUpcoming}/><Label htmlFor="overdue-show-upcoming" className="text-sm cursor-pointer">기한 전 학생도 보기</Label></div>
   <span className="text-muted-foreground text-sm">미납 {summary.unpaid}명 · 부분납 {summary.partial}명</span></div>
  <div><p className="font-bold text-lg">미납 잔액 <span className="text-destructive">{summary.balance.toLocaleString()}원</span></p>
   <p className="text-xs text-muted-foreground">{showUpcoming?(upcoming.length?`그중 기한 전 ${upcomingSummary.count}명 · ${upcomingSummary.balance.toLocaleString()}원`:'기한 전 미납자 없음'):`${today} 기준 납부기한이 지난 학생만 · 기한 전 ${upcomingSummary.count}명 제외`}</p></div>
  {loading?<Loader2 className="animate-spin mx-auto"/>:error?<p role="alert" className="text-destructive">{error}</p>:<div className="overflow-x-auto border rounded-lg"><Table><TableHeader><TableRow>{['학생','청구월','원비','납부액','잔액','상태','납부기한','보호자 연락처'].map(h=><TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>{shown.map(s=>{const isUpcoming=upcomingIds.has(s.id);return <TableRow key={s.id} className={cn(isUpcoming&&'text-muted-foreground bg-muted/30')}><TableCell><StudentPaymentLink id={s.id} name={s.name}/></TableCell><TableCell>{month}</TableCell><TableCell>{s.totalFee.toLocaleString()}원</TableCell><TableCell>{s.paidAmount.toLocaleString()}원</TableCell><TableCell className={cn('font-semibold',isUpcoming?'text-muted-foreground':'text-destructive')}>{(s.totalFee-s.paidAmount).toLocaleString()}원</TableCell><TableCell><Badge variant={isUpcoming?'outline':s.paidAmount>0?'secondary':'destructive'}>{s.paidAmount>0?'부분납':'미납'}</Badge>{isUpcoming&&<span className="block text-xs text-muted-foreground">기한 전</span>}</TableCell><TableCell>{studentDueDate(s,month)}</TableCell><TableCell>{s.parent_phone||'—'}</TableCell></TableRow>;})}</TableBody></Table>{!shown.length&&<p className="p-8 text-center text-muted-foreground">{upcoming.length?`오늘까지 기한이 온 미납자가 없습니다 (기한 전 ${upcoming.length}명)`:'미납자가 없습니다'}</p>}</div>}
 </div>;
}
