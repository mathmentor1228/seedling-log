import {Badge} from '@/components/ui/badge';
import {paymentDayDifference, paymentScheduledDate, type DatedTuitionPayment, type PaymentSchedule} from '@/lib/tuitionPaymentDates';

export function PaymentTiming({payment, schedules = [], dueDay, showDue = true, showAmount = false}: {
  payment: DatedTuitionPayment;
  schedules?: PaymentSchedule[];
  dueDay?: number | null;
  showDue?: boolean;
  showAmount?: boolean;
}) {
  const scheduled = paymentScheduledDate(payment, schedules, dueDay);
  const difference = paymentDayDifference(scheduled.date, payment.paid_date);
  const label = payment.canceled_at ? '취소 / 제외' : payment.needs_review ? '확인 필요' : difference === null ? '비교 확인 필요' : difference === 0 ? '예정일 납부' : difference > 0 ? `${difference}일 늦음` : `${Math.abs(difference)}일 빠름`;
  const variant = payment.canceled_at || difference === null ? 'muted' : payment.needs_review || difference > 0 ? 'warning' : 'success';

  return <div className="space-y-1 whitespace-nowrap text-xs tabular-nums">
    <div className="flex flex-wrap items-center gap-2"><span>{payment.paid_date}</span><Badge variant={variant}>{label}</Badge></div>
    {showDue && <div className="text-muted-foreground">예정 {scheduled.date || '확인 필요'}</div>}
    {scheduled.basis === 'current' && <div className="text-muted-foreground">현재 납입일 설정 기준</div>}
    {showAmount && <div className="text-muted-foreground">{Number(payment.amount).toLocaleString()}원</div>}
  </div>;
}