import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { RiskBadge } from '@/components/ui/risk-badge';
import { ScoreBadge } from '@/components/ui/score-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Search, FileBarChart, Calendar } from 'lucide-react';
import { format } from 'date-fns';

interface WeeklyReport {
  id: string;
  student_id: string;
  week_start: string;
  week_end: string;
  total_lessons: number;
  avg_understanding: number | null;
  homework_completion_rate: number | null;
  common_issues: string[];
  summary: string | null;
  risk_level: 'low' | 'medium' | 'high' | null;
  generated_at: string;
  student_name?: string;
}

export default function Reports() {
  const [reports, setReports] = useState<WeeklyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    fetchReports();
  }, []);

  async function fetchReports() {
    try {
      const { data, error } = await supabase
        .from('weekly_reports')
        .select(`
          *,
          students:student_id (name)
        `)
        .order('generated_at', { ascending: false });

      if (error) throw error;

      const formattedReports = (data || []).map((r: any) => ({
        ...r,
        student_name: r.students?.name,
      }));

      setReports(formattedReports);
    } catch (error) {
      console.error('Error fetching reports:', error);
      toast({
        title: 'Error',
        description: 'Failed to load reports',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  const filteredReports = reports.filter((report) =>
    report.student_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Weekly Reports</h1>
        <p className="text-muted-foreground mt-1">
          Auto-generated weekly summaries per student
        </p>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by student name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="w-4 h-4" />
              <span>Reports generated every Friday at 22:00 KST</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredReports.length === 0 ? (
            <div className="text-center py-12">
              <FileBarChart className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {searchQuery
                  ? 'No reports found'
                  : 'No reports generated yet. Reports are created automatically every Friday.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Week</TableHead>
                    <TableHead>Lessons</TableHead>
                    <TableHead>Avg Score</TableHead>
                    <TableHead>HW Rate</TableHead>
                    <TableHead>Issues</TableHead>
                    <TableHead>Risk</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReports.map((report) => (
                    <TableRow key={report.id}>
                      <TableCell className="font-medium">
                        {report.student_name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(report.week_start), 'MMM d')} -{' '}
                        {format(new Date(report.week_end), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>{report.total_lessons}</TableCell>
                      <TableCell>
                        {report.avg_understanding ? (
                          <ScoreBadge score={Math.round(report.avg_understanding)} />
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>
                        {report.homework_completion_rate !== null
                          ? `${Math.round(report.homework_completion_rate)}%`
                          : '-'}
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        {report.common_issues && report.common_issues.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {report.common_issues.slice(0, 2).map((issue, i) => (
                              <span
                                key={i}
                                className="text-xs bg-secondary px-2 py-0.5 rounded-full"
                              >
                                {issue}
                              </span>
                            ))}
                            {report.common_issues.length > 2 && (
                              <span className="text-xs text-muted-foreground">
                                +{report.common_issues.length - 2} more
                              </span>
                            )}
                          </div>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>
                        {report.risk_level ? (
                          <RiskBadge level={report.risk_level} />
                        ) : (
                          '-'
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary Cards */}
      {filteredReports.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="animate-fade-in">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                High Risk Students
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-risk-high">
                {reports.filter((r) => r.risk_level === 'high').length}
              </p>
            </CardContent>
          </Card>
          <Card className="animate-fade-in" style={{ animationDelay: '0.1s' }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Medium Risk Students
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-risk-medium">
                {reports.filter((r) => r.risk_level === 'medium').length}
              </p>
            </CardContent>
          </Card>
          <Card className="animate-fade-in" style={{ animationDelay: '0.2s' }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Low Risk Students
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-risk-low">
                {reports.filter((r) => r.risk_level === 'low').length}
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
