// DATA-QUALITY-ACK-V1 — 신규 미확인 건수만 배지로 표시 (확인된 과거 항목은 합산하지 않음)
import { useDataQuality } from './useDataQuality';
import { useDataQualityAcks } from './useDataQualityAcks';
import { diffFindings, totalNewCount } from './dqAck';
import { Badge } from '@/components/ui/badge';

export function DataQualityNewBadge() {
  const { loading, findings } = useDataQuality();
  const { acks, loading: ackLoading, error } = useDataQualityAcks();
  if (loading || ackLoading || error) return null;
  const n = totalNewCount(diffFindings(findings, acks));
  if (n === 0) return null;
  return (
    <Badge variant="outline" className="ml-1 text-[10px] bg-primary/15 text-primary border-primary/30">
      신규 {n.toLocaleString()}
    </Badge>
  );
}
