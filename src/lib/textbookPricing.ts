// 시중 교재는 정가의 10% 할인, 자체제작(원내 제작) 교재는 입력된 금액 그대로 청구한다.
export const MARKET_TEXTBOOK_DISCOUNT = 0.1;
export function textbookChargePerCopy(order: { unit_price: number; is_inhouse?: boolean | null }): number {
  const price = Number(order.unit_price) || 0;
  return order.is_inhouse ? price : Math.round(price * (1 - MARKET_TEXTBOOK_DISCOUNT));
}
