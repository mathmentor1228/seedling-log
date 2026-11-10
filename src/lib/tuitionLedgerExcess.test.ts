import {describe,it,expect} from 'vitest';
import {paymentExcess} from './tuitionLedger';
describe('원비 초과 납부 확인 규칙',()=>{
  it('기존 납부와 이번 금액의 합이 원비를 넘으면 초과액을 알려준다',()=>{expect(paymentExcess(520000,310000,300000)).toEqual({required:520000,alreadyPaid:310000,after:610000,excess:90000});});
  it('원비와 정확히 같으면 확인 없이 반영한다',()=>{expect(paymentExcess(520000,310000,210000)).toBeNull();});
  it('정해진 원비가 없는 달은 입력 금액 전체가 초과다',()=>{expect(paymentExcess(0,0,250000)?.excess).toBe(250000);});
});
