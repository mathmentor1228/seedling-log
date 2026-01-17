import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Save, RefreshCw, History, AlertCircle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

interface ReportTemplate {
  id: string;
  template_name: string;
  prompt_text: string;
  version: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function ReportPromptSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Active templates
  const [parentPrompt, setParentPrompt] = useState('');
  const [parentVersion, setParentVersion] = useState('');
  const [parentId, setParentId] = useState<string | null>(null);
  
  const [studentPrompt, setStudentPrompt] = useState('');
  const [studentVersion, setStudentVersion] = useState('');
  const [studentId, setStudentId] = useState<string | null>(null);
  
  // Version history
  const [allTemplates, setAllTemplates] = useState<ReportTemplate[]>([]);
  const [activeTab, setActiveTab] = useState<'parent' | 'student'>('parent');

  useEffect(() => {
    fetchTemplates();
  }, []);

  async function fetchTemplates() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('report_templates')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Cast data to ReportTemplate[] - the table structure matches our interface
      const templates = (data || []) as unknown as ReportTemplate[];
      setAllTemplates(templates);

      // Set active templates
      const activeParent = templates.find(t => t.template_name === 'parent' && t.is_active);
      const activeStudent = templates.find(t => t.template_name === 'student' && t.is_active);

      if (activeParent) {
        setParentPrompt(activeParent.prompt_text);
        setParentVersion(activeParent.version);
        setParentId(activeParent.id);
      }

      if (activeStudent) {
        setStudentPrompt(activeStudent.prompt_text);
        setStudentVersion(activeStudent.version);
        setStudentId(activeStudent.id);
      }
    } catch (error: any) {
      console.error('Error fetching templates:', error);
      toast({
        title: '오류',
        description: '프롬프트 템플릿을 불러오는데 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  function incrementVersion(currentVersion: string): string {
    const parts = currentVersion.replace('v', '').split('.');
    if (parts.length === 2) {
      const major = parseInt(parts[0], 10) || 1;
      const minor = parseInt(parts[1], 10) || 0;
      return `v${major}.${minor + 1}`;
    }
    return 'v1.1';
  }

  async function handleSaveParent() {
    if (!parentPrompt.trim()) {
      toast({ title: '오류', description: '프롬프트 내용을 입력해주세요.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const newVersion = incrementVersion(parentVersion);

      // Deactivate current active parent template
      if (parentId) {
        await supabase
          .from('report_templates')
          .update({ is_active: false })
          .eq('id', parentId);
      }

      // Insert new version
      const { data, error } = await supabase
        .from('report_templates')
        .insert({
          template_name: 'parent',
          prompt_text: parentPrompt,
          version: newVersion,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;

      setParentVersion(newVersion);
      setParentId(data.id);

      toast({
        title: '저장 완료',
        description: `학부모용 프롬프트가 ${newVersion}으로 저장되었습니다.`,
      });

      fetchTemplates();
    } catch (error: any) {
      console.error('Error saving parent prompt:', error);
      toast({
        title: '저장 실패',
        description: error.message || '프롬프트 저장에 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveStudent() {
    if (!studentPrompt.trim()) {
      toast({ title: '오류', description: '프롬프트 내용을 입력해주세요.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const newVersion = incrementVersion(studentVersion);

      // Deactivate current active student template
      if (studentId) {
        await supabase
          .from('report_templates')
          .update({ is_active: false })
          .eq('id', studentId);
      }

      // Insert new version
      const { data, error } = await supabase
        .from('report_templates')
        .insert({
          template_name: 'student',
          prompt_text: studentPrompt,
          version: newVersion,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;

      setStudentVersion(newVersion);
      setStudentId(data.id);

      toast({
        title: '저장 완료',
        description: `학생용 프롬프트가 ${newVersion}으로 저장되었습니다.`,
      });

      fetchTemplates();
    } catch (error: any) {
      console.error('Error saving student prompt:', error);
      toast({
        title: '저장 실패',
        description: error.message || '프롬프트 저장에 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }

  async function restoreVersion(templateId: string) {
    setSaving(true);
    try {
      const template = allTemplates.find(t => t.id === templateId);
      if (!template) throw new Error('Template not found');

      // Deactivate all templates of the same type
      await supabase
        .from('report_templates')
        .update({ is_active: false })
        .eq('template_name', template.template_name);

      // Activate the selected version
      const { error } = await supabase
        .from('report_templates')
        .update({ is_active: true })
        .eq('id', templateId);

      if (error) throw error;

      toast({
        title: '복원 완료',
        description: `${template.template_name === 'parent' ? '학부모용' : '학생용'} 프롬프트가 ${template.version}으로 복원되었습니다.`,
      });

      fetchTemplates();
    } catch (error: any) {
      console.error('Error restoring version:', error);
      toast({
        title: '복원 실패',
        description: error.message || '버전 복원에 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }

  const parentHistory = allTemplates.filter(t => t.template_name === 'parent');
  const studentHistory = allTemplates.filter(t => t.template_name === 'student');

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              리포트 프롬프트 설정
              <Badge variant="outline" className="ml-2">Admin</Badge>
            </CardTitle>
            <CardDescription className="mt-1">
              AI 주간 리포트 생성에 사용되는 프롬프트를 편집합니다. 저장 시 새 버전이 생성됩니다.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={fetchTemplates} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'parent' | 'student')}>
          <TabsList className="mb-4">
            <TabsTrigger value="parent">학부모용</TabsTrigger>
            <TabsTrigger value="student">학생용</TabsTrigger>
          </TabsList>

          <TabsContent value="parent" className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="parent-prompt" className="text-base font-medium">
                학부모용 프롬프트
              </Label>
              <Badge variant="secondary">현재 버전: {parentVersion || 'N/A'}</Badge>
            </div>
            
            <Textarea
              id="parent-prompt"
              value={parentPrompt}
              onChange={(e) => setParentPrompt(e.target.value)}
              placeholder="학부모용 리포트 생성 프롬프트를 입력하세요..."
              className="min-h-[400px] font-mono text-sm"
              disabled={loading}
            />

            <div className="flex justify-end gap-2">
              <Button onClick={handleSaveParent} disabled={saving || loading}>
                <Save className="w-4 h-4 mr-2" />
                {saving ? '저장 중...' : '저장 (새 버전 생성)'}
              </Button>
            </div>

            <Accordion type="single" collapsible className="mt-4">
              <AccordionItem value="history">
                <AccordionTrigger className="text-sm">
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4" />
                    버전 히스토리 ({parentHistory.length}개)
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <ScrollArea className="h-[200px]">
                    <div className="space-y-2">
                      {parentHistory.map((t) => (
                        <div
                          key={t.id}
                          className={`flex items-center justify-between p-2 rounded border ${
                            t.is_active ? 'bg-primary/10 border-primary' : 'bg-muted/50'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Badge variant={t.is_active ? 'default' : 'outline'}>
                              {t.version}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(t.updated_at).toLocaleString('ko-KR')}
                            </span>
                            {t.is_active && (
                              <Badge variant="secondary" className="text-xs">활성</Badge>
                            )}
                          </div>
                          {!t.is_active && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => restoreVersion(t.id)}
                              disabled={saving}
                            >
                              복원
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </TabsContent>

          <TabsContent value="student" className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="student-prompt" className="text-base font-medium">
                학생용 프롬프트
              </Label>
              <Badge variant="secondary">현재 버전: {studentVersion || 'N/A'}</Badge>
            </div>
            
            <Textarea
              id="student-prompt"
              value={studentPrompt}
              onChange={(e) => setStudentPrompt(e.target.value)}
              placeholder="학생용 리포트 생성 프롬프트를 입력하세요..."
              className="min-h-[400px] font-mono text-sm"
              disabled={loading}
            />

            <div className="flex justify-end gap-2">
              <Button onClick={handleSaveStudent} disabled={saving || loading}>
                <Save className="w-4 h-4 mr-2" />
                {saving ? '저장 중...' : '저장 (새 버전 생성)'}
              </Button>
            </div>

            <Accordion type="single" collapsible className="mt-4">
              <AccordionItem value="history">
                <AccordionTrigger className="text-sm">
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4" />
                    버전 히스토리 ({studentHistory.length}개)
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <ScrollArea className="h-[200px]">
                    <div className="space-y-2">
                      {studentHistory.map((t) => (
                        <div
                          key={t.id}
                          className={`flex items-center justify-between p-2 rounded border ${
                            t.is_active ? 'bg-primary/10 border-primary' : 'bg-muted/50'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Badge variant={t.is_active ? 'default' : 'outline'}>
                              {t.version}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(t.updated_at).toLocaleString('ko-KR')}
                            </span>
                            {t.is_active && (
                              <Badge variant="secondary" className="text-xs">활성</Badge>
                            )}
                          </div>
                          {!t.is_active && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => restoreVersion(t.id)}
                              disabled={saving}
                            >
                              복원
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </TabsContent>
        </Tabs>

        <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
          <div className="flex gap-2">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800 dark:text-amber-200">
              <p className="font-medium">프롬프트 변경 시 주의사항</p>
              <ul className="list-disc list-inside mt-1 space-y-1 text-amber-700 dark:text-amber-300">
                <li>저장 시 새로운 버전이 생성되며, 이전 버전은 히스토리에 보관됩니다.</li>
                <li>변경사항은 다음 리포트 생성부터 적용됩니다.</li>
                <li>리포트 미리보기에서 PROMPT_VERSION으로 적용된 버전을 확인할 수 있습니다.</li>
              </ul>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
