import {describe,it,expect} from 'vitest';
import {buildStudentBillings,paidForMonth,paymentMonth,paymentStatus,dueDate,ledgerMonths,billingDisplayStatus,paymentReference,receiptCourseNames} from './tuitionLedger';
describe('원비 장부 규칙',()=>{
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
});
