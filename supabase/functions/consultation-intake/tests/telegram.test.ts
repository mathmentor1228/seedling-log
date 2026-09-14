import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatConsultationNotice, sendConsultationNotice } from '../telegram.ts';
const lead = { id: 'test-id', school_level: '중', grade_year: 2, preferred_date: '2026-09-17', preferred_time: '10:00', subjects: ['수학'] };
const config = { botToken: 'test-token', chatId: '123' };
const noop = async () => {};
test('notice contains schedule and authenticated admin link, not contact data or public token', () => {
 const txt = formatConsultationNotice({...lead, guardian_phone:'01099998888',public_token:'private-token',learning_concern:'private concern',student_name:'private name'} as typeof lead);
 assert.match(txt,/2026-09-17 10:00/); assert.match(txt,/중2/); assert.match(txt,/일정 확정 전/);
 assert.match(txt,/\/admin\/admissions/); assert.doesNotMatch(txt,/private|01099998888/);
});
test('missing config and group destination make no network requests',async()=>{
 const fail=async()=>{throw Error('unexpected request')};
 assert.equal((await sendConsultationNotice(lead,{},fail,noop)).status,'not_configured');
 assert.equal((await sendConsultationNotice(lead,{...config,chatId:'-100123'},fail,noop)).status,'not_configured');
});
test('success sends once to configured private chat with no parse_mode',async()=>{
 let count=0;
 const f=async (_url:any,init:any)=>{count++;const body=JSON.parse(init.body);assert.equal(body.chat_id,'123'); assert.equal(body.parse_mode,undefined);return Response.json({ok:true})};
 assert.equal((await sendConsultationNotice(lead,config,f,noop)).status,'sent');assert.equal(count,1);
});
test('transient server error retries then succeeds',async()=>{
 let count=0; const f=async()=>++count===1?Response.json({ok:false,error_code:503},{status:503}):Response.json({ok:true});
 assert.deepEqual(await sendConsultationNotice(lead,config,f,noop),{status:'sent',attempts:2});
});
test('Telegram ok=false is failure even with HTTP 200; forbidden is not retried',async()=>{
 assert.deepEqual(await sendConsultationNotice(lead,config,async()=>Response.json({ok:false,error_code:403}),noop),{status:'failed',attempts:1,code:403});
});
test('rate limit honors retry_after and stops for long limits',async()=>{
 let n=0; const waits:number[]=[];
 const f=async()=>++n===1?Response.json({ok:false,error_code:429,parameters:{retry_after:2}},{status:429}):Response.json({ok:true});
 assert.equal((await sendConsultationNotice(lead,config,f,async(ms)=>{waits.push(ms)})).status,'sent');assert.deepEqual(waits,[2000]);
 assert.equal((await sendConsultationNotice(lead,config,async()=>Response.json({ok:false,error_code:429,parameters:{retry_after:60}},{status:429}),noop)).attempts,1);
});
test('network failure is bounded and does not throw or disclose token',async()=>{
 const r=await sendConsultationNotice(lead,config,async()=>{throw Error('test-token')},noop);
 assert.deepEqual(r,{status:'failed',attempts:3}); assert.doesNotMatch(JSON.stringify(r),/test-token/);
});
