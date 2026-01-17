import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RotateCcw, BookOpen } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

// ENGLISH-CURRICULUM-V1: English curriculum tagging component

interface EnglishCurriculumTagProps {
  grammarUnit: string | null;
  readingUnits: string[];
  studentGrade: string | null;
  onChange: (grammarUnit: string | null, readingUnits: string[]) => void;
  disabled?: boolean;
}

// Grammar levels
const GRAMMAR_LEVELS = ['초등', '초등+', '중1', '중2', '중3'] as const;
type GrammarLevel = typeof GRAMMAR_LEVELS[number];

// Grammar units per level
const GRAMMAR_UNITS: Record<GrammarLevel, string[]> = {
  '초등': [
    '명사 / 관사 / 대명사 / 지시대명사',
    'be동사 (긍정·부정·의문문)',
    '일반동사 (긍정·부정·의문문)',
    '의문사 의문문',
    '조동사',
    '현재진행형',
    '명령문과 제안문',
    '숫자표현과 비인칭주어',
    '형용사 / 부사',
    '전치사',
  ],
  '초등+': [
    '명사 / 관사 / 대명사 / 지시대명사',
    'be동사 (긍정·부정·의문문)',
    '일반동사 (긍정·부정·의문문)',
    '의문사 의문문',
    '조동사',
    '현재진행형',
    '명령문과 제안문',
    '숫자표현과 비인칭주어',
    '형용사 / 부사',
    '전치사',
  ],
  '중1': [
    '명사 / 관사 / 대명사',
    'be동사 / 일반동사',
    '조동사',
    '문장의 형식 (동사의 종류)',
    '다양한 문장',
    '시제',
    '의문사',
    'to부정사 / 동명사',
    '형용사 / 부사',
    '비교',
    '접속사',
    '전치사',
  ],
  '중2': [
    '시제',
    '조동사',
    '수동태',
    'to부정사 / 동명사',
    '분사 / 분사구문',
    '문장의 형식 (동사의 종류)',
    '관계대명사 / 관계부사',
    '가정법',
    '접속사',
    '일치',
    '형용사 / 부사',
    '비교',
    '대명사',
  ],
  '중3': [
    '품사',
    '문장의 형식 (동사의 종류)',
    '명사 / 관사 / 대명사',
    '시제',
    '조동사',
    '수동태',
    '준동사',
    'to부정사 / 동명사',
    '분사 / 분사구문',
    '관계대명사 / 관계부사',
    '가정법',
    '형용사 / 부사',
    '비교',
    '접속사',
    '전치사',
    '일치',
    '특수구문',
  ],
};

// Reading units (same for all levels)
const READING_UNITS = [
  '자기주도 예습',
  '직독직해',
  '문장 구조 분석 및 문법 해설',
  '정밀 독해',
  '어휘 확장',
  '문제 풀이',
  '개별 피드백',
  '주요 문장 직독직해',
];

// Map student grade to grammar level
function gradeToGrammarLevel(grade: string | null): GrammarLevel {
  if (!grade) return '중1';
  const normalized = grade.trim().toLowerCase();
  
  // Check for 초등+
  if (normalized.includes('초등+') || normalized.includes('초등 +')) return '초등+';
  // Check for 초등
  if (normalized.includes('초') && !normalized.includes('중')) return '초등';
  // Check for middle school grades
  if (normalized.includes('중1') || normalized.includes('중 1')) return '중1';
  if (normalized.includes('중2') || normalized.includes('중 2')) return '중2';
  if (normalized.includes('중3') || normalized.includes('중 3')) return '중3';
  
  // Default fallback
  return '중1';
}

export function EnglishCurriculumTag({
  grammarUnit,
  readingUnits,
  studentGrade,
  onChange,
  disabled = false,
}: EnglishCurriculumTagProps) {
  const [selectedLevel, setSelectedLevel] = useState<GrammarLevel>(() => gradeToGrammarLevel(studentGrade));

  // Update level when student grade changes
  useEffect(() => {
    const level = gradeToGrammarLevel(studentGrade);
    setSelectedLevel(level);
  }, [studentGrade]);

  const handleLevelChange = (level: string) => {
    if (GRAMMAR_LEVELS.includes(level as GrammarLevel)) {
      setSelectedLevel(level as GrammarLevel);
      // Reset grammar unit when level changes
      onChange(null, readingUnits);
    }
  };

  const handleGrammarChange = (value: string) => {
    onChange(value === '__none__' ? null : value, readingUnits);
  };

  const handleReadingToggle = (unit: string, checked: boolean) => {
    const newReadingUnits = checked
      ? [...readingUnits, unit]
      : readingUnits.filter(u => u !== unit);
    onChange(grammarUnit, newReadingUnits);
  };

  const handleReset = () => {
    onChange(null, []);
  };

  const grammarOptions = GRAMMAR_UNITS[selectedLevel] || [];

  return (
    <div className="p-4 rounded-lg border-2 border-blue-500/30 bg-blue-500/5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-blue-600" />
          <Label className="text-base font-semibold text-blue-700">진도 태그 (영어)</Label>
        </div>
        {(grammarUnit || readingUnits.length > 0) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleReset}
            disabled={disabled}
            className="text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="w-4 h-4 mr-1" />
            초기화
          </Button>
        )}
      </div>

      {/* Grammar Section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-blue-700">Grammar (단일선택)</span>
          <Badge variant="outline" className="text-xs">필수</Badge>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Level Select */}
          <div className="space-y-1">
            <Label className="text-sm">레벨</Label>
            <Select
              value={selectedLevel}
              onValueChange={handleLevelChange}
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="레벨 선택" />
              </SelectTrigger>
              <SelectContent>
                {GRAMMAR_LEVELS.map((level) => (
                  <SelectItem key={level} value={level}>{level}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Grammar Unit Select */}
          <div className="space-y-1">
            <Label className="text-sm">문법 단원</Label>
            <Select
              value={grammarUnit || '__none__'}
              onValueChange={handleGrammarChange}
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="단원 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">선택 안함</SelectItem>
                {grammarOptions.map((unit) => (
                  <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Reading Section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-blue-700">Reading (복수선택)</span>
          <Badge variant="secondary" className="text-xs">선택</Badge>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {READING_UNITS.map((unit) => (
            <div key={unit} className="flex items-center space-x-2">
              <Checkbox
                id={`reading_${unit}`}
                checked={readingUnits.includes(unit)}
                onCheckedChange={(checked) => handleReadingToggle(unit, !!checked)}
                disabled={disabled}
              />
              <label
                htmlFor={`reading_${unit}`}
                className="text-sm cursor-pointer leading-tight"
              >
                {unit}
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Selected Summary */}
      {(grammarUnit || readingUnits.length > 0) && (
        <div className="mt-2 p-2 bg-background/50 rounded text-sm space-y-1">
          {grammarUnit && (
            <div className="flex items-center gap-2">
              <Badge variant="default" className="bg-blue-600">Grammar</Badge>
              <span>{grammarUnit}</span>
            </div>
          )}
          {readingUnits.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary">Reading</Badge>
              {readingUnits.map(unit => (
                <Badge key={unit} variant="outline" className="text-xs">{unit}</Badge>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Debug marker */}
      <span className="text-[10px] text-muted-foreground bg-muted px-1 rounded font-mono">
        ENGLISH-CURRICULUM-V1
      </span>
    </div>
  );
}

// Export for View mode badge display
export function EnglishCurriculumBadges({
  grammarUnit,
  readingUnits,
}: {
  grammarUnit: string | null;
  readingUnits: string[];
}) {
  if (!grammarUnit && readingUnits.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {grammarUnit && (
        <Badge variant="default" className="bg-blue-600 text-xs">{grammarUnit}</Badge>
      )}
      {readingUnits.map(unit => (
        <Badge key={unit} variant="secondary" className="text-xs">{unit}</Badge>
      ))}
    </div>
  );
}
