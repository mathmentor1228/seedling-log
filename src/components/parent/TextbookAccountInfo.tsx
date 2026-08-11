// PARENT-PAY-V1: 학부모 포털 미납 교재비 카드의 입금 계좌 안내 (복사 버튼 포함)
import { useState } from 'react';
import { Copy, Check, Landmark } from 'lucide-react';

interface Props {
  accountInfo?: string | null;
  amount: number;
  studentName: string;
}

const BANK_NAME = '카카오뱅크';
const ACCOUNT_NUMBER = '3333156191775';
const ACCOUNT_HOLDER = '최윤기';

export function TextbookAccountInfo({ accountInfo, amount, studentName }: Props) {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = value;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  const rows = [
    { key: 'account', label: '입금 계좌', display: `${BANK_NAME} ${ACCOUNT_NUMBER}`, sub: `예금주 ${ACCOUNT_HOLDER}`, value: ACCOUNT_NUMBER },
    { key: 'amount', label: '입금 금액', display: `${amount.toLocaleString()}원`, sub: '', value: String(amount) },
    { key: 'name', label: '입금자명', display: studentName, sub: '학생 이름으로 입금해주세요', value: studentName },
  ];

  return (
    <div className="mt-2 rounded-lg bg-white/85 dark:bg-background/50 border border-yellow-200 overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-2 bg-yellow-100/70 dark:bg-yellow-900/30">
        <Landmark className="w-3.5 h-3.5 text-yellow-700 dark:text-yellow-300" />
        <p className="text-xs font-semibold text-yellow-800 dark:text-yellow-300">입금 안내</p>
      </div>
      <div className="divide-y divide-yellow-100 dark:divide-border">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center justify-between gap-2 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground">{row.label}</p>
              <p className="text-sm font-bold text-foreground break-all">{row.display}</p>
              {row.sub && <p className="text-[11px] text-muted-foreground">{row.sub}</p>}
            </div>
            <button
              type="button"
              onClick={() => copy(row.key, row.value)}
              className={`shrink-0 inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                copied === row.key
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-yellow-400 text-yellow-950 hover:bg-yellow-500'
              }`}
            >
              {copied === row.key ? <><Check className="w-3 h-3" />복사됨</> : <><Copy className="w-3 h-3" />복사</>}
            </button>
          </div>
        ))}
      </div>
      {accountInfo && (
        <p className="px-3 py-2 text-[11px] text-muted-foreground border-t border-yellow-100 dark:border-border">
          입금 확인까지 시간이 걸릴 수 있습니다. 문의사항은 학원으로 연락 부탁드립니다.
        </p>
      )}
    </div>
  );
}
