// DATA-QUALITY-ACK-V1 — 확인 기준선 조회/저장 훅 (data_quality_acks 전용, 운영 데이터 write 없음)
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { DQFinding } from './dataQuality';
import { buildAckPayload, type DQAckRow } from './dqAck';

export function useDataQualityAcks() {
  const [acks, setAcks] = useState<DQAckRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: e } = await supabase
      .from('data_quality_acks')
      .select('finding_id, acked_keys, record_count, group_count, acked_by, acked_at');
    if (e) setError(e.message);
    else {
      setError(null);
      setAcks((data || []) as DQAckRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  /** 현재 조회 결과 전체를 확인 완료로 저장. 실패 시 false 반환. */
  const ackAll = useCallback(async (findings: DQFinding[]) => {
    if (saving) return false;
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const payload = buildAckPayload(findings, auth?.user?.id ?? null, new Date().toISOString());
      const { error: e } = await supabase
        .from('data_quality_acks')
        .upsert(payload, { onConflict: 'finding_id' });
      if (e) {
        setError(e.message);
        return false;
      }
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 실패');
      return false;
    } finally {
      setSaving(false);
    }
  }, [load, saving]);

  return { acks, loading, error, saving, reload: load, ackAll };
}
