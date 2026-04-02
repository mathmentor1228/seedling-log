import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Plus, Search, School, Users } from 'lucide-react';
import type { SchoolInfo } from './types';
import { SCHOOL_LEVEL_LABELS } from './types';

interface Props {
  schools: SchoolInfo[];
  selectedSchool: string | null;
  onSelectSchool: (name: string) => void;
  onAddSchool: (name: string, level: string) => void;
}

export function SchoolSidebar({ schools, selectedSchool, onSelectSchool, onAddSchool }: Props) {
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newLevel, setNewLevel] = useState('middle');

  const filtered = schools.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));

  const handleAdd = () => {
    if (!newName.trim()) return;
    onAddSchool(newName.trim(), newLevel);
    setNewName('');
    setNewLevel('middle');
    setAddOpen(false);
  };

  return (
    <div className="w-[240px] border-r bg-muted/20 flex flex-col h-full shrink-0">
      <div className="p-3 border-b space-y-2">
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="w-full gap-1 text-xs">
              <Plus className="w-3.5 h-3.5" /> 학교 추가
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xs">
            <DialogHeader><DialogTitle>학교 추가</DialogTitle></DialogHeader>
            <div className="space-y-3 mt-2">
              <div>
                <Label className="text-xs">학교명</Label>
                <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="예: 신길중학교" className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">학교 구분</Label>
                <Select value={newLevel} onValueChange={setNewLevel}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="elementary">초등학교</SelectItem>
                    <SelectItem value="middle">중학교</SelectItem>
                    <SelectItem value="high">고등학교</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button size="sm" className="w-full" onClick={handleAdd}>추가</Button>
            </div>
          </DialogContent>
        </Dialog>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="학교 검색..."
            className="h-7 text-xs pl-8"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filtered.map(school => (
          <div
            key={school.name}
            onClick={() => onSelectSchool(school.name)}
            className={cn(
              "rounded-lg p-2.5 cursor-pointer transition-all text-xs",
              selectedSchool === school.name
                ? "bg-primary/10 border border-primary/20 shadow-sm"
                : "hover:bg-muted/50 border border-transparent"
            )}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <School className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="font-medium truncate">{school.name}</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                {SCHOOL_LEVEL_LABELS[school.level] || school.level}
              </Badge>
              {school.studentCount > 0 && (
                <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                  <Users className="w-2.5 h-2.5" />{school.studentCount}명
                </span>
              )}
            </div>
            {school.nextExam && (
              <div className={cn(
                "mt-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded",
                school.nextExam.daysLeft <= 14
                  ? "bg-destructive/10 text-destructive"
                  : school.nextExam.daysLeft <= 30
                  ? "bg-orange-500/10 text-orange-600"
                  : "bg-muted text-muted-foreground"
              )}>
                {school.nextExam.title} D-{school.nextExam.daysLeft}
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">학교 없음</p>
        )}
      </div>
    </div>
  );
}
