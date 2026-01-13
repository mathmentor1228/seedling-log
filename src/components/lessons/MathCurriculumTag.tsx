import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RotateCcw, BookOpen } from 'lucide-react';

// MATH-CURRICULUM-TAG-V1

interface CurriculumUnit {
  unit_key: string;
  unit_title: string;
  flow_summary: string;
}

interface MathCurriculumTagProps {
  curriculumVersion: string;
  course: string;
  unitKey: string;
  onChange: (version: string, course: string, unitKey: string) => void;
  disabled?: boolean;
}

const VERSION_OPTIONS = [
  { value: 'middle', label: '중등' },
  { value: '2022', label: '고등 22개정' },
  { value: '2015', label: '고등 15개정' },
];

const COURSE_OPTIONS: Record<string, { value: string; label: string }[]> = {
  middle: [
    { value: '중1', label: '중1' },
    { value: '중2', label: '중2' },
    { value: '중3', label: '중3' },
  ],
  '2022': [
    { value: '공통수학1', label: '공통수학1' },
    { value: '공통수학2', label: '공통수학2' },
    { value: '대수', label: '대수' },
    { value: '미적분1', label: '미적분1' },
    { value: '기하', label: '기하' },
  ],
  '2015': [
    { value: '미적분(2015)', label: '미적분(2015)' },
    { value: '확률과통계(2015)', label: '확률과통계(2015)' },
  ],
};

export function MathCurriculumTag({
  curriculumVersion,
  course,
  unitKey,
  onChange,
  disabled = false,
}: MathCurriculumTagProps) {
  const [units, setUnits] = useState<CurriculumUnit[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(false);

  // Load units when version+course changes
  const fetchUnits = useCallback(async (version: string, courseVal: string) => {
    if (!version || !courseVal) {
      setUnits([]);
      return;
    }

    setLoadingUnits(true);
    try {
      const { data, error } = await supabase
        .from('curriculum_map')
        .select('unit_key, unit_title, flow_summary')
        .eq('subject', '수학')
        .eq('curriculum_version', version)
        .eq('course', courseVal)
        .order('unit_key', { ascending: true });

      if (error) throw error;
      setUnits(data || []);
    } catch (error) {
      console.error('Error fetching curriculum units:', error);
      setUnits([]);
    } finally {
      setLoadingUnits(false);
    }
  }, []);

  useEffect(() => {
    if (curriculumVersion && course) {
      fetchUnits(curriculumVersion, course);
    } else {
      setUnits([]);
    }
  }, [curriculumVersion, course, fetchUnits]);

  const handleVersionChange = (value: string) => {
    // Reset course and unit when version changes
    onChange(value === '__none__' ? '' : value, '', '');
  };

  const handleCourseChange = (value: string) => {
    // Reset unit when course changes
    onChange(curriculumVersion, value === '__none__' ? '' : value, '');
  };

  const handleUnitChange = (value: string) => {
    onChange(curriculumVersion, course, value === '__none__' ? '' : value);
  };

  const handleReset = () => {
    onChange('', '', '');
    setUnits([]);
  };

  const courseOptions = curriculumVersion ? COURSE_OPTIONS[curriculumVersion] || [] : [];
  const selectedUnit = units.find(u => u.unit_key === unitKey);

  return (
    <div className="p-4 rounded-lg border-2 border-orange-500/30 bg-orange-500/5 space-y-3">
      {/* MATH-CURRICULUM-TAG-V1 marker */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-orange-600" />
          <Label className="text-base font-semibold text-orange-700">진도 태그 (수학)</Label>
        </div>
        {(curriculumVersion || course || unitKey) && (
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
      
      <p className="text-xs text-muted-foreground">
        진도 태그(권장): 교과 흐름 설명에 사용됩니다.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Version Select */}
        <div className="space-y-1">
          <Label className="text-sm">교육과정</Label>
          <Select
            value={curriculumVersion || '__none__'}
            onValueChange={handleVersionChange}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder="선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">선택 안함</SelectItem>
              {VERSION_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Course Select */}
        <div className="space-y-1">
          <Label className="text-sm">과정</Label>
          <Select
            value={course || '__none__'}
            onValueChange={handleCourseChange}
            disabled={disabled || !curriculumVersion}
          >
            <SelectTrigger>
              <SelectValue placeholder={curriculumVersion ? '선택' : '교육과정 먼저 선택'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">선택 안함</SelectItem>
              {courseOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Unit Select */}
        <div className="space-y-1">
          <Label className="text-sm">단원</Label>
          <Select
            value={unitKey || '__none__'}
            onValueChange={handleUnitChange}
            disabled={disabled || !course || loadingUnits}
          >
            <SelectTrigger>
              <SelectValue placeholder={loadingUnits ? '불러오는 중...' : course ? '선택' : '과정 먼저 선택'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">선택 안함</SelectItem>
              {units.map((unit) => (
                <SelectItem key={unit.unit_key} value={unit.unit_key}>
                  {unit.unit_title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Selected unit summary */}
      {selectedUnit && (
        <div className="mt-2 p-2 bg-background/50 rounded text-sm">
          <span className="font-medium">{selectedUnit.unit_title}</span>
          <p className="text-muted-foreground text-xs mt-1">{selectedUnit.flow_summary}</p>
        </div>
      )}

      {/* Debug marker */}
      <span className="text-[10px] text-muted-foreground bg-muted px-1 rounded font-mono">
        MATH-CURRICULUM-TAG-V1
      </span>
    </div>
  );
}
