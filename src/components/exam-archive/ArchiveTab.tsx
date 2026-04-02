import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';

interface Props {
  schoolName: string;
  archives: any[];
  onRefetch: () => void;
}

const YEARS = [2026, 2025, 2024, 2023];
const SEMESTERS = ['1학기', '2학기'];
const EXAM_TYPES = ['중간고사', '기말고사', '기타'];

export function ArchiveTab({ schoolName, archives, onRefetch }: Props) {
  const [yearFilter, setYearFilter] = useState('all');
  const [semFilter, setSemFilter] = useState('all');
  const [examTypeFilter, setExamTypeFilter] = useState('all');

  const schoolArchives = archives.filter(a => {
    if (a.school_name !== schoolName) return false;
    if (yearFilter !== 'all' && a.academic_year?.toString() !== yearFilter) return false;
    if (semFilter !== 'all' && a.semester !== semFilter) return false;
    if (examTypeFilter !== 'all' && a.exam_type !== examTypeFilter) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger className="h-8 w-[100px] text-xs"><SelectValue placeholder="연도" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 연도</SelectItem>
            {YEARS.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={semFilter} onValueChange={setSemFilter}>
          <SelectTrigger className="h-8 w-[100px] text-xs"><SelectValue placeholder="학기" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 학기</SelectItem>
            {SEMESTERS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={examTypeFilter} onValueChange={setExamTypeFilter}>
          <SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue placeholder="시험유형" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 유형</SelectItem>
            {EXAM_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {schoolArchives.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">등록된 내신 자료가 없습니다</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {schoolArchives.map(a => (
            <Card key={a.id} className="hover:shadow-sm transition-shadow cursor-pointer">
              <CardContent className="p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-[10px]">{a.grade_year}학년</Badge>
                    <Badge variant="secondary" className="text-[10px]">{a.subject}</Badge>
                    <Badge className="text-[10px] bg-primary/10 text-primary border-0">{a.exam_type}</Badge>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{a.academic_year} {a.semester}</span>
                </div>

                {(a.exam_date_start || a.exam_date_end) && (
                  <p className="text-xs text-muted-foreground">
                    시험기간: {a.exam_date_start ? format(parseISO(a.exam_date_start), 'MM/dd') : '?'}
                    {a.exam_date_end ? ` ~ ${format(parseISO(a.exam_date_end), 'MM/dd')}` : ''}
                  </p>
                )}

                {a.exam_scope && (
                  <p className="text-xs text-muted-foreground truncate">범위: {a.exam_scope}</p>
                )}

                {a.grade_ratio && (
                  <p className="text-xs text-muted-foreground">평가비율: {a.grade_ratio}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
