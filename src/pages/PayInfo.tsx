// PAY-INFO-V1: 교재비 알림톡 "계좌·금액 복사" 버튼이 여는 공개 페이지
// URL: /pay-info?d=<base64url(JSON)> — { s: 학생명, a: 금액(숫자), n: 입금자명 }
// 파라미터가 깨져도 계좌번호 복사는 항상 가능하도록 계좌 정보는 고정 표기
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Copy, Check, Landmark } from 'lucide-react';

const BANK_NAME = '카카오뱅크';
const ACCOUNT_NUMBER = '3333156191775';
const ACCOUNT_HOLDER = '최윤기';

interface PayData { s?: string; a?: number; n?: string }

function decodeData(raw: string | null): PayData {
  if (!raw) return {};
  try {
    const b64 = raw.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return {};
  }
}

export default function PayInfo() {
  const [params] = useSearchParams();
  const data = useMemo(() => decodeData(params.get('d')), [params]);
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // 구형 브라우저/카톡 인앱 폴백
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

  const rows: { key: string; label: string; display: string; copyValue: string }[] = [
    { key: 'account', label: '입금 계좌', display: `${BANK_NAME} ${ACCOUNT_NUMBER}`, copyValue: ACCOUNT_NUMBER },
    ...(data.a ? [{ key: 'amount', label: '입금 금액', display: `${Number(data.a).toLocaleString()}원`, copyValue: String(data.a) }] : []),
    ...(data.n ? [{ key: 'depositor', label: '입금자명', display: data.n, copyValue: data.n }] : []),
  ];

  return (
    <div className="min-h-screen bg-muted/30 flex items-start justify-center p-4 pt-10">
      <div className="w-full max-w-sm space-y-4">
        <div className="text-center space-y-1">
          <div className="mx-auto w-10 h-10 rounded-full bg-yellow-400/20 flex items-center justify-center">
            <Landmark className="w-5 h-5 text-yellow-600" />
          </div>
          <h1 className="text-lg font-bold text-foreground">교재비 입금 안내</h1>
          {data.s && <p className="text-sm text-muted-foreground">{data.s} 학생</p>}
        </div>

        <div className="bg-background rounded-xl border shadow-sm divide-y">
          {rows.map(row => (
            <div key={row.key} className="flex items-center justify-between gap-2 p-4">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{row.label}</p>
                <p className="text-base font-semibold text-foreground break-all">
                  {row.display}
                  {row.key === 'account' && <span className="block text-xs font-normal text-muted-foreground">예금주 {ACCOUNT_HOLDER}</span>}
                </p>
              </div>
              <button
                onClick={() => copy(row.key, row.copyValue)}
                className={`shrink-0 inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                  copied === row.key ? 'bg-green-100 text-green-700' : 'bg-yellow-400 text-yellow-950 hover:bg-yellow-500'
                }`}
              >
                {copied === row.key ? <><Check className="w-3.5 h-3.5" />복사됨</> : <><Copy className="w-3.5 h-3.5" />복사</>}
              </button>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground text-center leading-relaxed">
          {data.n ? `입금 시 "${data.n}" 이름으로 입금해주세요.` : '안내받으신 입금자명으로 입금해주세요.'}
          <br />입금 확인 후 처리까지 시간이 걸릴 수 있습니다.
        </p>
      </div>
    </div>
  );
}
