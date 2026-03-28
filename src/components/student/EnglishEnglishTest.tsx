import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { ChevronLeft, RotateCcw, ArrowRight, Volume2 } from 'lucide-react';
import { speakEnglish } from '@/lib/ttsUtils';

interface VocabWordWithDef {
  english: string;
  meaning: string;
  english_definition: string;
}

type QuestionType = 'multiple_choice' | 'typing';

interface EnglishEnglishTestProps {
  words: VocabWordWithDef[];
  questionType: QuestionType;
  onFinish: (correct: number, wrong: number, total: number) => void;
  onBack: () => void;
}

interface WrongItem {
  word: string;
  english_definition: string;
}

function generateChoices(currentWord: VocabWordWithDef, allWords: VocabWordWithDef[]) {
  const others = allWords
    .filter(w => w.english !== currentWord.english)
    .sort(() => Math.random() - 0.5)
    .slice(0, 3);
  return [...others, currentWord].sort(() => Math.random() - 0.5);
}

export default function EnglishEnglishTest({ words, questionType, onFinish, onBack }: EnglishEnglishTestProps) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState('');
  const [typedAnswer, setTypedAnswer] = useState('');
  const [isCorrect, setIsCorrect] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongItems, setWrongItems] = useState<WrongItem[]>([]);
  const [finished, setFinished] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentWord = words[currentIdx];
  const totalCount = words.length;
  const score = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;

  const choices = useMemo(() => {
    if (questionType !== 'multiple_choice' || !currentWord) return [];
    return generateChoices(currentWord, words);
  }, [currentIdx, questionType, currentWord, words]);

  useEffect(() => {
    if (questionType === 'typing' && !answered && !finished && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [currentIdx, answered, finished, questionType]);

  const handleMultipleChoiceAnswer = useCallback((chosenWord: string) => {
    if (answered) return;
    const correct = chosenWord.toLowerCase() === currentWord.english.toLowerCase();
    setSelectedAnswer(chosenWord);
    setIsCorrect(correct);
    setAnswered(true);
    if (correct) {
      setCorrectCount(prev => prev + 1);
    } else {
      setWrongItems(prev => [...prev, { word: currentWord.english, english_definition: currentWord.english_definition }]);
    }
  }, [answered, currentWord]);

  const handleTypingSubmit = useCallback(() => {
    if (answered || !typedAnswer.trim()) return;
    const correct = typedAnswer.trim().toLowerCase() === currentWord.english.trim().toLowerCase();
    setIsCorrect(correct);
    setAnswered(true);
    if (correct) {
      setCorrectCount(prev => prev + 1);
    } else {
      setWrongItems(prev => [...prev, { word: currentWord.english, english_definition: currentWord.english_definition }]);
    }
  }, [answered, typedAnswer, currentWord]);

  const handleNext = () => {
    if (currentIdx + 1 >= totalCount) {
      const finalCorrect = correctCount;
      const finalWrong = totalCount - finalCorrect;
      setFinished(true);
      onFinish(finalCorrect, finalWrong, totalCount);
    } else {
      setCurrentIdx(prev => prev + 1);
      setAnswered(false);
      setSelectedAnswer('');
      setTypedAnswer('');
      setIsCorrect(false);
    }
  };

  const handleRetry = () => {
    setCurrentIdx(0);
    setAnswered(false);
    setSelectedAnswer('');
    setTypedAnswer('');
    setIsCorrect(false);
    setCorrectCount(0);
    setWrongItems([]);
    setFinished(false);
  };

  if (finished) {
    return (
      <div className="space-y-4 p-4 max-w-lg mx-auto">
        <Card>
          <CardContent className="pt-6 space-y-4 text-center">
            <div className="text-4xl">
              {score >= 80 ? '🎉' : score >= 60 ? '😊' : '😢'}
            </div>
            <h2 className="text-xl font-bold">
              {correctCount} / {totalCount} 정답
            </h2>
            <div className={`text-3xl font-bold ${
              score >= 80 ? 'text-green-600'
              : score >= 60 ? 'text-amber-600'
              : 'text-red-600'
            }`}>
              {score}점
            </div>
            <Progress value={score} className="h-3" />

            {wrongItems.length > 0 && (
              <div className="text-left space-y-2 mt-4">
                <p className="text-sm font-medium text-muted-foreground">
                  틀린 단어 ({wrongItems.length}개)
                </p>
                {wrongItems.map((item, i) => (
                  <div key={i}
                    className="flex items-start gap-3 p-3 rounded-lg bg-red-500/5 border border-red-500/20">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{item.word}</p>
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0"
                          onClick={() => speakEnglish(item.word)}>
                          <Volume2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {item.english_definition}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2 justify-center mt-4">
              <Button variant="outline" onClick={onBack}>
                <ChevronLeft className="w-4 h-4 mr-1" /> 목록으로
              </Button>
              <Button variant="outline" onClick={handleRetry}>
                <RotateCcw className="w-3.5 h-3.5 mr-1" /> 다시 풀기
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ChevronLeft className="w-4 h-4 mr-1" /> 목록
        </Button>
        <div className="text-sm text-muted-foreground">
          {currentIdx + 1} / {totalCount}
        </div>
        <div className="flex gap-2 text-sm">
          <span className="text-green-600 font-medium">✓{correctCount}</span>
          <span className="text-red-500 font-medium">✗{wrongItems.length}</span>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-6">
          {/* Progress */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {currentIdx + 1} / {totalCount}
            </span>
            <Progress value={(currentIdx / totalCount) * 100} className="w-32 h-1.5" />
          </div>

          {/* Definition */}
          <div className="bg-muted/50 rounded-xl p-5 text-center">
            <p className="text-xs text-muted-foreground mb-2 font-medium">Definition</p>
            <p className="text-base leading-relaxed font-medium">
              {currentWord.english_definition}
            </p>
            {questionType === 'typing' && (
              <p className="text-xs text-muted-foreground mt-3">
                힌트: {currentWord.english[0]}{'_'.repeat(currentWord.english.length - 1)} ({currentWord.english.length}글자)
              </p>
            )}
          </div>

          {/* Multiple Choice */}
          {questionType === 'multiple_choice' && (
            <div className="grid grid-cols-2 gap-2">
              {choices.map((choice, idx) => (
                <button
                  key={`${choice.english}-${idx}`}
                  onClick={() => handleMultipleChoiceAnswer(choice.english)}
                  disabled={answered}
                  className={`p-3 rounded-xl border text-sm font-medium transition-all duration-200 text-left
                    ${answered
                      ? choice.english.toLowerCase() === currentWord.english.toLowerCase()
                        ? 'border-green-500 bg-green-500/15 text-green-700'
                        : choice.english === selectedAnswer
                        ? 'border-red-500 bg-red-500/15 text-red-700'
                        : 'border-border bg-muted/30 text-muted-foreground'
                      : 'border-border hover:border-primary/50 hover:bg-primary/5'
                    }`}
                >
                  <span className="text-xs text-muted-foreground mr-2">
                    {['A', 'B', 'C', 'D'][idx]}
                  </span>
                  {choice.english}
                </button>
              ))}
            </div>
          )}

          {/* Typing */}
          {questionType === 'typing' && (
            <div className="space-y-2">
              <Input
                ref={inputRef}
                placeholder="영어 단어를 입력하세요..."
                value={typedAnswer}
                onChange={e => setTypedAnswer(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !answered && handleTypingSubmit()}
                disabled={answered}
                className="text-center text-base h-12"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
              />
              {!answered && (
                <Button className="w-full" onClick={handleTypingSubmit} disabled={!typedAnswer.trim()}>
                  확인
                </Button>
              )}
            </div>
          )}

          {/* Feedback */}
          {answered && (
            <div className={`rounded-xl p-3 text-center text-sm font-medium ${
              isCorrect ? 'bg-green-500/15 text-green-700' : 'bg-red-500/15 text-red-700'
            }`}>
              {isCorrect
                ? '✅ 정답!'
                : `❌ 오답 — 정답: ${currentWord.english}`}
            </div>
          )}

          {/* Next button */}
          {answered && (
            <Button className="w-full" onClick={handleNext}>
              {currentIdx + 1 === totalCount ? '결과 보기' : (
                <>다음 <ArrowRight className="w-4 h-4 ml-1" /></>
              )}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
