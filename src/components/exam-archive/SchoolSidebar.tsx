import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Plus, Search, School, Users, CalendarClock } from 'lucide-react';
import type { SchoolInfo } from './types';
import { SCHOOL_LEVEL_LABELS } from './types';

interface Props {
  schools: SchoolInfo[];
  selectedSchool: string | null;
  onSelectSchool: (name: string) => void;
  onAddSchool: (name: string, level: string) => void;
}

function getDdayDisplay(daysLeft: number) {
  if (daysLeft === 0) return { label: 'D-Day', color: 'bg-destructive text-destructive-foreground' };
  if (daysLeft > 0) return { label: `D-${daysLeft}`, color: daysLeft <= 7 ? 'bg-destructive/90 text-destructive-foreground' : daysLeft <= 14 ? 'bg-orange-500 text-white' : daysLeft <= 30 ? 'bg-amber-500 text-white' : 'bg-blue-500/80 text-white' };
  return { label: `D+${Math.abs(daysLeft)}`, color: 'bg-muted text-muted-foreground' };
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
    <div className="w-[260px] border-r bg-muted/10 flex flex-col h-full shrink-0">
      <div className="p-3 border-b space-y-2">
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="w-full gap-1.5 text-xs">
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
            className="h-8 text-xs pl-8"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filtered.map(school => {
          const isSelected = selectedSchool === school.name;
          const ddayInfo = school.nextExam ? getDdayDisplay(school.nextExam.daysLeft) : null;
          const finalsInfo = school.finalsExam ? getDdayDisplay(school.finalsExam.daysLeft) : null;

          return (
            <div
              key={school.name}
              onClick={() => onSelectSchool(school.name)}
              className={cn(
                "rounded-lg p-3 cursor-pointer transition-all",
                isSelected
                  ? "bg-primary/10 border-2 border-primary/30 shadow-sm"
                  : "hover:bg-muted/60 border-2 border-transparent"
              )}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <School className={cn("w-4 h-4 shrink-0", isSelected ? "text-primary" : "text-muted-foreground")} />
                <span className={cn("font-semibold text-sm truncate", isSelected && "text-primary")}>{school.name}</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap ml-6">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-[18px]">
                  {SCHOOL_LEVEL_LABELS[school.level] || school.level}
                </Badge>
                {school.studentCount > 0 && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                    <Users className="w-3 h-3" />{school.studentCount}명
                  </span>
                )}
              </div>
              {ddayInfo && school.nextExam && (
                <div className="ml-6 mt-2 flex items-center gap-1.5">
                  <Badge className={cn("text-[10px] font-bold px-1.5 py-0 h-[18px] shadow-sm", ddayInfo.color)}>
                    {ddayInfo.label}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                    {school.nextExam.title}
                  </span>
                </div>
              )}
              {finalsInfo && school.finalsExam && (
                <div className="ml-6 mt-1 flex items-center gap-1.5">
                  <Badge className={cn("text-[10px] font-bold px-1.5 py-0 h-[18px] shadow-sm", finalsInfo.color)}>
                    기말 {finalsInfo.label}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground truncate max-w-[110px]">
                    {school.finalsExam.title}
                  </span>
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">학교 없음</p>
        )}
      </div>
    </div>
  );
}