import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadMonthLedger } from './tuitionLedgerApi';

const db = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, any>[]>,
  failures: {} as Record<string, unknown>,
  from: vi.fn(),
  rpc: vi.fn(),
  reads: [] as { table: string; from: number; to: number }[],
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: db.from, rpc: db.rpc } }));

beforeEach(() => {
  db.tables = {};
  db.failures = {};
  db.reads = [];
  db.rpc.mockReset().mockResolvedValue({ data: 330000, error: null });
  db.from.mockReset().mockImplementation((table: string) => {
    const filters: ((row: Record<string, any>) => boolean)[] = [];
    const query = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      eq: vi.fn((key: string, value: unknown) => { filters.push(row => row[key] === value); return query; }),
      is: vi.fn((key: string, value: unknown) => { filters.push(row => (row[key] ?? null) === value); return query; }),
      or: vi.fn((value: string) => {
        const month = value.match(/billing_month\.eq\.([^,]+)/)?.[1];
        filters.push(row => row.billing_month === month || row.billing_month == null);
        return query;
      }),
      range: vi.fn(async (from: number, to: number) => {
        db.reads.push({ table, from, to });
        return { data: (db.tables[table] ?? []).filter(row => filters.every(filter => filter(row))).slice(from, to + 1), error: db.failures[table] ?? null };
      }),
    };
    return query;
  });
});

const student = (id: string, status = '재학') => ({ id, name: id, enrollment_status: status, payment_due_day: 15 });
const payment = (id: string, studentId: string, amount: number, extra: Record<string, unknown> = {}) => ({
  id, student_id: studentId, amount, billing_month: '2026-09', canceled_at: null, students: student(studentId), ...extra,
});

describe('historical monthly ledger', () => {
  it('uses September recorded 127500/190000 amounts as both fee and paid total without querying current fees', async () => {
    db.tables.payment_records = [payment('a', '박서정', 127500), payment('b', '할인학생', 190000)];
    const ledger = await loadMonthLedger('2026-09');
    expect(ledger.students).toMatchObject([
      { id: '박서정', totalFee: 127500, paidAmount: 127500, isPaid: true },
      { id: '할인학생', totalFee: 190000, paidAmount: 190000, isPaid: true },
    ]);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('groups split payments by student and retains the individual payment rows', async () => {
    db.tables.payment_records = [payment('a', '신동훈', 100000), payment('b', '신동훈', 210000)];
    const ledger = await loadMonthLedger('2026-09');
    expect(ledger.students).toHaveLength(1);
    expect(ledger.students[0]).toMatchObject({ totalFee: 310000, paidAmount: 310000, isPaid: true });
    expect(ledger.payments).toHaveLength(2);
  });

  it('includes withdrawn students with payments but omits students with no payment that month', async () => {
    db.tables.students = [student('미납추정금지'), student('퇴원학생', '퇴원')];
    db.tables.payment_records = [payment('a', '퇴원학생', 575000, { students: student('퇴원학생', '퇴원') })];
    const ledger = await loadMonthLedger('2026-09');
    expect(ledger.students.map(row => row.id)).toEqual(['퇴원학생']);
    expect(ledger.students[0].enrollment_status).toBe('퇴원');
    expect(db.from).not.toHaveBeenCalledWith('students');
  });

  it('excludes canceled and other-month payments, with no linked-month fallback before October', async () => {
    db.tables.payment_records = [
      payment('a', '박서정', 127500),
      payment('c', '박서정', 127500, { canceled_at: '2026-11-04' }),
      payment('o', '다른달', 330000, { billing_month: '2026-10' }),
      payment('l', '연결달', 330000, { billing_month: null, billing_schedules: { billing_month: '2026-09' } }),
    ];
    const ledger = await loadMonthLedger('2026-09');
    expect(ledger.students.map(row => row.id)).toEqual(['박서정']);
    expect(ledger.payments.map(row => row.id)).toEqual(['a']);
    expect(ledger.students[0].totalFee).toBe(127500);
  });

  it('pages all historical payments instead of returning partial totals', async () => {
    db.tables.payment_records = Array.from({ length: 501 }, (_, index) => payment(String(index), '박서정', 1000));
    const ledger = await loadMonthLedger('2026-09');
    expect(ledger.students[0].paidAmount).toBe(501000);
    expect(ledger.payments).toHaveLength(501);
    expect(db.reads).toEqual([{ table: 'payment_records', from: 0, to: 499 }, { table: 'payment_records', from: 500, to: 999 }]);
  });

  it('fails visibly on payment reads or missing student joins', async () => {
    db.failures.payment_records = new Error('read failed');
    await expect(loadMonthLedger('2026-09')).rejects.toThrow('read failed');
    db.failures = {};
    db.tables.payment_records = [payment('a', '박서정', 127500, { students: null })];
    await expect(loadMonthLedger('2026-09')).rejects.toThrow('과거 수납 학생');
  });

  it('continues using current monthly fees and partial/unpaid judgement from October', async () => {
    db.tables.students = [student('부분납'), student('미납')];
    db.tables.payment_records = [payment('a', '부분납', 100000, { billing_month: '2026-10' })];
    const ledger = await loadMonthLedger('2026-10');
    expect(ledger.students).toMatchObject([
      { id: '부분납', totalFee: 330000, paidAmount: 100000, isPaid: false },
      { id: '미납', totalFee: 330000, paidAmount: 0, isPaid: false },
    ]);
    expect(db.rpc).toHaveBeenCalledTimes(2);
    expect(db.rpc).toHaveBeenCalledWith('student_monthly_fee', { _student_id: '부분납', _month: '2026-10' });
  });
});