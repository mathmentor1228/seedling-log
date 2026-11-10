import { overpaymentCheck } from '@/lib/tuitionLedgerApi';
import { confirmAtTop } from '@/lib/confirmAtTop';

const won = (n: number) => `${n.toLocaleString()}원`;

// Every in-app path that adds money to a student's month runs this first.
// Returns null when the user cancels; otherwise a memo note to keep with the record (empty when not over).
export async function confirmOverpayment(input: { studentName: string; studentId: string; month: string; amount: number; excludePaymentId?: string }): Promise<string | null> {
  const over = await overpaymentCheck(input.studentId, input.month, input.amount, input.excludePaymentId);
  if (!over) return '';
  const [y, m] = input.month.split('-');
  const ok = await confirmAtTop({
    title: `${input.studentName} ${y}년 ${Number(m)}월 원비보다 ${won(over.excess)} 많아요`,
    description: `정해진 원비 ${won(over.required)} · 이미 납부 ${won(over.alreadyPaid)} · 이번 ${won(input.amount)} → 합계 ${won(over.after)}. 금액과 청구월이 맞는지 확인해 주세요.`,
    confirmLabel: '초과 확인 후 반영',
  });
  return ok ? `[원비 초과 확인 ${won(over.excess)}]` : null;
}
