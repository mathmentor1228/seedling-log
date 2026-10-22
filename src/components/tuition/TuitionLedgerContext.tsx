import {createContext,useContext,useState,ReactNode} from 'react';
import {Button} from '@/components/ui/button';
import {StudentPaymentDetail} from './StudentPaymentDetail';
import {TuitionReceipt} from './TuitionReceipt';
const LedgerContext=createContext<{openStudent:(id:string)=>void;openReceipt:(payments:any[],bulk?:boolean)=>void;revision:number;changed:()=>void}|null>(null);
export function useTuitionLedger(){const ctx=useContext(LedgerContext);if(!ctx)throw new Error('Tuition ledger provider missing');return ctx;}
export function StudentPaymentLink({id,name}:{id:string;name:string}){const {openStudent}=useTuitionLedger();return <Button variant="link" className="h-auto p-0 text-left text-foreground" onClick={()=>openStudent(id)}>{name}</Button>;}
export function TuitionLedgerProvider({children}:{children:ReactNode}){
 const [studentId,setStudentId]=useState<string|null>(null);const [returnId,setReturnId]=useState<string|null>(null);const [receipts,setReceipts]=useState<any[]|null>(null);const [bulk,setBulk]=useState(false);const [revision,setRevision]=useState(0);
 const changed=()=>setRevision(v=>v+1);
 const openReceipt=(payments:any[],originalOnly=false)=>{setReturnId(studentId);setStudentId(null);setBulk(originalOnly);setReceipts(payments);};
 return <LedgerContext.Provider value={{openStudent:setStudentId,openReceipt,revision,changed}}>{children}
  <StudentPaymentDetail studentId={studentId} onClose={()=>setStudentId(null)} onReceipt={p=>openReceipt([p])} onChanged={changed}/>
  <TuitionReceipt payments={receipts} originalOnly={bulk} onClose={()=>{setReceipts(null);setStudentId(returnId);setReturnId(null);}}/>
 </LedgerContext.Provider>;
}
