import {describe,it,expect} from 'vitest';
import {buildStudentBillings,paidForMonth,paymentMonth,paymentStatus,dueDate,ledgerMonths,billingDisplayStatus,isDueByToday,paymentReference,receiptCourseNames,isLedgerReviewPayment} from './tuitionLedger';
describe('원비 장부 규칙',()=>{
  it('확인 필요 목록은 10월부터이며 귀속월 미확정은 숨기지 않는다',()=>{
    expect(isLedgerReviewPayment({student_id:'a',amount:127500,billing_month:'2026-09'})).toBe(false);
    expect(isLedgerReviewPayment({student_id:'a',amount:127500,billing_schedules:{billing_month:'2026-09'}})).toBe(false);
    expect(isLedgerReviewPayment({student_id:'a',amount:330000,billing_month:'2026-10'})).toBe(true);
    expect(isLedgerReviewPayment({student_id:'a',amount:330000,billing_month:null})).toBe(true);
  });
  it('납부일이 10월이어도 9월 청구는 10월 완납에 포함하지 않는다',()=>{expect(paidForMonth([{student_id:'a',amount:330000,billing_month:'2026-09'}],'a','2026-10')).toBe(0);});
  it('취소된 납부는 합산하지 않는다',()=>{expect(paidForMonth([{student_id:'a',amount:330000,billing_month:'2026-10',canceled_at:'2026-10-23'}],'a','2026-10')).toBe(0);});
  it('연결된 청구월보다 납부 자체의 청구월을 우선한다',()=>{expect(paymentMonth({student_id:'a',amount:1,billing_month:'2026-09',billing_schedules:{billing_month:'2026-10'}})).toBe('2026-09');});
  it('청구월이 없으면 연결 청구를 보조로 사용한다',()=>{expect(paymentMonth({student_id:'a',amount:1,billing_schedules:{billing_month:'2026-10'}})).toBe('2026-10');});
  it('부분납과 완납을 구분한다',()=>{expect(paymentStatus(330000,100000)).toBe('partial');expect(paymentStatus(330000,330000)).toBe('paid');});
  it('월 원비 0인 휴학생은 생성에서 제외한다',()=>{expect(buildStudentBillings([{id:'민현기',payment_due_day:1}],{민현기:0},new Set(),'2026-11')).toHaveLength(0);});
  it('학생당 한 건을 만들며 월 함수 결과를 그대로 사용한다',()=>{const rows=buildStudentBillings([{id:'a',payment_due_day:6}],{a:320000},new Set(),'2026-11');expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({student_course_id:null,final_amount:320000,due_date:'2026-11-06'});});
  it('기존 청구가 있으면 추가하지 않는다',()=>{expect(buildStudentBillings([{id:'a',payment_due_day:1}],{a:720000},new Set(['a']),'2026-10')).toEqual([]);});
  it('특강비는 학생 청구에 한 번만 더한다',()=>{expect(buildStudentBillings([{id:'a',payment_due_day:1}],{a:330000},new Set(),'2026-11',{a:{fee:100000,memo:'특강'}})[0].final_amount).toBe(430000);});
  it('2026년 10월 이전은 생성하지 않는다',()=>{expect(()=>buildStudentBillings([],{},new Set(),'2026-09')).toThrow();expect(ledgerMonths('2026-11')).toEqual(['2026-10','2026-11']);});
  it('월말로 납입일을 제한한다',()=>{expect(dueDate('2026-11',31)).toBe('2026-11-30');});
  it('기한이 지난 대기는 표시상 미납이고 당일은 대기다',()=>{expect(billingDisplayStatus({status:'pending',due_date:'2026-10-22'},'2026-10-23')).toBe('overdue');expect(billingDisplayStatus({status:'pending',due_date:'2026-10-23'},'2026-10-23')).toBe('pending');});
  it('외부 식별자보다 실제 카드 승인번호를 표시한다',()=>{expect(paymentReference({external_id:'4035571',raw_text:'키오스크 승인 09001410'})).toBe('승인번호 09001410');});
  it('입금자명 뒤의 다른 수납 메모는 이름에서 제외한다',()=>{expect(paymentReference({raw_text:'입금자 허승무 · 이코딩 수기 #4087953'})).toBe('입금자 허승무');});
  it('영수증에는 해당 월 활성 과정만 포함한다',()=>{const policy={subject:'수학',course_name:'고등기본수학'};expect(receiptCourseNames([{is_active:true,enrollment_date:'2026-10-01',course_policies:policy},{is_active:false,enrollment_date:'2026-10-01',course_policies:{subject:'영어',course_name:'고등영어'}},{is_active:true,enrollment_date:'2026-12-01',course_policies:{subject:'국어',course_name:'고등국어'}}],'2026-11')).toBe('수학 · 고등기본수학');});
  it('납부기한이 오늘이면 미납 명단에 포함한다',()=>{expect(isDueByToday('2026-11',11,'2026-11-11')).toBe(true);});
  it('납부일 29일은 11일에 아직 기한 전이다',()=>{expect(isDueByToday('2026-11',29,'2026-11-11')).toBe(false);});
  it('지난달은 어떤 납부일이어도 기한이 지났다',()=>{expect(isDueByToday('2026-10',31,'2026-11-11')).toBe(true);expect(isDueByToday('2026-10',1,'2026-11-11')).toBe(true);});
  it('30일까지인 달의 31일 납부일은 말일로 맞춘다',()=>{expect(isDueByToday('2026-11',31,'2026-11-30')).toBe(true);expect(isDueByToday('2026-11',31,'2026-11-29')).toBe(false);});
});

import {effectiveDueDate,inRange,withdrawalBaseMonth,needsWithdrawalMonthCheck,autoCancelInfo,feeSyncTargets,defaultFeeSyncMonth} from './tuitionLedger';
describe('기간별 미납 기준 (#32 V2)',()=>{
  it('청구에 저장된 납부기한이 학생 납부일보다 우선한다',()=>{expect(effectiveDueDate({billing_month:'2026-10',due_date:'2026-10-26'},12)).toBe('2026-10-26');});
  it('저장된 기한이 없으면 학생 납부일로 계산한다',()=>{expect(effectiveDueDate({billing_month:'2026-11',due_date:null},29)).toBe('2026-11-29');});
  it('2026년 10월 31일 납부일은 10-31 그대로다',()=>{expect(effectiveDueDate({billing_month:'2026-10',due_date:null},31)).toBe('2026-10-31');});
  it('기간은 시작일과 종료일을 모두 포함한다',()=>{expect(inRange('2026-11-01','2026-11-01','2026-11-17')).toBe(true);expect(inRange('2026-11-17','2026-11-01','2026-11-17')).toBe(true);expect(inRange('2026-11-18','2026-11-01','2026-11-17')).toBe(false);expect(inRange('2026-10-31','2026-11-01','2026-11-17')).toBe(false);});
});
describe('퇴원 기준 달 (#33)',()=>{
  it('마지막 수업일이 있으면 그 달이 기준이다 (박지현 10/2, 퇴원 처리 11/2)',()=>{expect(withdrawalBaseMonth({enrollment_status:'퇴원',withdrawal_last_class_date:'2026-10-02',withdrawn_at:'2026-11-02T03:00:00Z'})).toBe('2026-10');});
  it('마지막 수업일이 없으면 퇴원일(한국 시간)의 달이다',()=>{expect(withdrawalBaseMonth({enrollment_status:'퇴원',withdrawn_at:'2026-10-31T16:00:00Z'})).toBe('2026-11');});
  it('퇴원 당월 청구만 확인 표시하고 그 전 달은 그냥 미납이다',()=>{const s={enrollment_status:'퇴원',withdrawal_last_class_date:'2026-11-12'};expect(needsWithdrawalMonthCheck(s,'2026-11')).toBe(true);expect(needsWithdrawalMonthCheck(s,'2026-10')).toBe(false);});
  it('재학생은 확인 표시가 없다',()=>{expect(needsWithdrawalMonthCheck({enrollment_status:'재학'},'2026-11')).toBe(false);});
  it('자동취소 메모에서 날짜를 읽는다',()=>{expect(autoCancelInfo('자동취소: 퇴원 2026-11-20')).toEqual({kind:'퇴원',date:'2026-11-20'});expect(autoCancelInfo('메모\n자동취소: 휴학 2026-12-01')).toEqual({kind:'휴학',date:'2026-12-01'});expect(autoCancelInfo('10/30 퇴원으로 11월 청구 취소')).toBeNull();});
});
describe('원비 변경 반영 (#34)',()=>{
  const bill=(id:string,month:string,extra:Record<string,unknown>={})=>({id,billing_month:month,status:'pending',final_amount:530000,discount_amount:0,extra_amount:0,memo:null,...extra});
  it('김혜원: 11월 대기 청구 530,000 → 600,000',()=>{expect(feeSyncTargets([bill('n','2026-11')],[],'2026-11',600000).map(t=>[t.bill.id,t.from,t.to])).toEqual([['n',530000,600000]]);});
  it('완납·부분납·결제 붙은 청구·원장 메모 청구는 바꾸지 않는다',()=>{const bills=[bill('p','2026-11',{status:'paid'}),bill('q','2026-12',{status:'partial'}),bill('r','2027-01'),bill('s','2027-02',{memo:'원장 직접 조정'})];expect(feeSyncTargets(bills,[{billing_schedule_id:'r'}],'2026-11',600000)).toEqual([]);});
  it('시작 달 이전 청구는 바꾸지 않는다',()=>{expect(feeSyncTargets([bill('o','2026-10'),bill('n','2026-11')],[],'2026-11',600000).map(t=>t.bill.id)).toEqual(['n']);});
  it('특강비가 붙은 청구는 새 원비에 특강비를 더한다',()=>{expect(feeSyncTargets([bill('n','2026-11',{extra_amount:100000,final_amount:630000})],[],'2026-11',600000)[0].to).toBe(700000);});
  it('이번 달이 이미 납부됐으면 기본 시작 달은 다음 달이다',()=>{expect(defaultFeeSyncMonth([bill('n','2026-11',{status:'paid'})],[],'2026-11')).toBe('2026-12');expect(defaultFeeSyncMonth([bill('n','2026-11')],[],'2026-11')).toBe('2026-11');expect(defaultFeeSyncMonth([],[{billing_month:'2026-12'}],'2026-12')).toBe('2027-01');});
});

describe('청구 메모 이어 붙이기 (#35)', () => {
  it('기존 시스템 메모 뒤에 줄을 바꿔 붙인다', async () => {
    const { appendMemoLine } = await import('./tuitionLedger');
    expect(appendMemoLine('원장 확인', '퇴원 당월 취소: 2026-11-19')).toBe('원장 확인\n퇴원 당월 취소: 2026-11-19');
    expect(appendMemoLine(null, '되살림: 2026-11-19')).toBe('되살림: 2026-11-19');
  });
  it('퇴원 당월 취소 날짜를 메모에서 읽는다', async () => {
    const { manualWithdrawalCancelDate } = await import('./tuitionLedger');
    expect(manualWithdrawalCancelDate('수집기\n퇴원 당월 취소: 2026-11-19')).toBe('2026-11-19');
    expect(manualWithdrawalCancelDate('자동취소: 퇴원 2026-11-17')).toBeNull();
  });
});

import {isAmountMismatchReview,pendingBillAmount} from './tuitionLedger';
describe('#36 amount-mismatch review banner', () => {
  it('counts only unlinked, uncancelled review payments', () => {
    expect(isAmountMismatchReview({needs_review:true,billing_schedule_id:null,canceled_at:null})).toBe(true);
    expect(isAmountMismatchReview({needs_review:true,billing_schedule_id:'b1',canceled_at:null})).toBe(false);
    expect(isAmountMismatchReview({needs_review:false,billing_schedule_id:null,canceled_at:null})).toBe(false);
    expect(isAmountMismatchReview({needs_review:true,billing_schedule_id:null,canceled_at:'2026-11-20T00:00:00Z'})).toBe(false);
  });
  it('shows the pending bill amount for that student-month, or none', () => {
    const bills=[
      {student_id:'s1',billing_month:'2026-11',status:'pending',final_amount:250000},
      {student_id:'s1',billing_month:'2026-10',status:'paid',final_amount:250000},
      {student_id:'s2',billing_month:'2026-11',status:'cancelled',final_amount:300000},
    ];
    expect(pendingBillAmount(bills,'s1','2026-11')).toBe(250000);
    expect(pendingBillAmount(bills,'s1','2026-10')).toBeNull();
    expect(pendingBillAmount(bills,'s2','2026-11')).toBeNull();
    expect(pendingBillAmount(bills,null,'2026-11')).toBeNull();
  });
});
