// SHARE-CHANNEL-V1: 태그 입력. 선택된 태그는 칩, 아래에 추천(기본 + 이미 쓰인) 태그를 한 번 눌러 추가.
import { useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { SHARE_PRESET_TAGS, addTag, parseTagInput } from '@/lib/share';

interface TagPickerProps {
  value: string[];
  onChange: (tags: string[]) => void;
  /** 이미 쓰인 태그(많이 쓴 순). 기본 태그 뒤에 붙는다. */
  suggestions: string[];
}

export function TagPicker({ value, onChange, suggestions }: TagPickerProps) {
  const [input, setInput] = useState('');

  const commit = (raw: string) => {
    let next = value;
    for (const tag of parseTagInput(raw)) next = addTag(next, tag);
    onChange(next);
    setInput('');
  };

  const remove = (tag: string) => onChange(value.filter((t) => t !== tag));

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.nativeEvent as { isComposing?: boolean }).isComposing) return; // 한글 조합 중 Enter 무시
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (input.trim()) commit(input);
    } else if (e.key === 'Backspace' && !input && value.length > 0) {
      remove(value[value.length - 1]);
    }
  };

  const seen = new Set(value.map((t) => t.toLowerCase()));
  const chips = [...SHARE_PRESET_TAGS, ...suggestions]
    .filter((tag, idx, arr) => arr.findIndex((t) => t.toLowerCase() === tag.toLowerCase()) === idx)
    .filter((tag) => !seen.has(tag.toLowerCase()))
    .slice(0, 16);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border bg-background px-2 py-1.5">
        {value.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1 pr-1 font-normal">
            #{tag}
            <button
              type="button"
              onClick={() => remove(tag)}
              className="rounded-full p-0.5 hover:bg-foreground/10"
              aria-label={`${tag} 태그 빼기`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => { if (input.trim()) commit(input); }}
          placeholder={value.length === 0 ? '태그 입력 후 Enter (예: 중3 수학)' : '태그 추가'}
          className="h-7 min-w-[9rem] flex-1 border-0 px-1 shadow-none focus-visible:ring-0"
        />
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {chips.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => onChange(addTag(value, tag))}
              className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              + {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
