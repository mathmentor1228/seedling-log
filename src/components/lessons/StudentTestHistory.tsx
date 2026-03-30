import { Badge } from '@/components/ui/badge';
import type { UnifiedTestRecord } from './TestTab';

export function StudentTestHistory({ records }: { records: UnifiedTestRecord[] }) {
  const subjects = [...new Set(records.map(r => r.subject))];

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold">학생별 누적 이력</h4>
      {subjects.map(subj => {
        const subRecords = records.filter(r => r.subject === subj);
        const recent5 = subRecords.slice(0, 5);
        const withResult = subRecords.filter(r => r.passed !== null);
        const passCount = withResult.filter(r => r.passed === true).length;
        const passRate = withResult.length > 0 ? Math.round((passCount / withResult.length) * 100) : 0;

        return (
          <div key={subj} className="space-y-1">
            <div className="flex items-center gap-3 text-sm">
              <Badge variant="outline">{subj}</Badge>
              <span className="text-muted-foreground">통과율: {passRate}% ({passCount}/{withResult.length})</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {recent5.map(r => (
                <div key={r.id} className="text-xs border rounded-md p-2 bg-background">
                  <div className="font-medium">{r.test_date}</div>
                  <div className="text-muted-foreground truncate max-w-[150px]">{r.content}</div>
                  <div className="mt-1 flex items-center gap-1">
                    {r.passed === true && <Badge variant="secondary" className="text-[10px]">통과</Badge>}
                    {r.passed === false && <Badge variant="destructive" className="text-[10px]">불통과</Badge>}
                    {r.passed === null && <Badge variant="outline" className="text-[10px]">미기록</Badge>}
                    {r.score && <span className="ml-1">{r.score}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
