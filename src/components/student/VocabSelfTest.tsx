import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { ChevronLeft, RotateCcw, Volume2, CheckCircle2, XCircle, ArrowRight, HelpCircle, Triangle, Headphones } from 'lucide-react';
import { speakEnglish } from '@/lib/ttsUtils';

interface VocabWord {
  english: string;
  meaning: string;
}

type ResultStatus = 'correct' | 'partial' | 'wrong' | 'skipped';

interface TestResult {
  word: VocabWord;
  userAnswer: string;
  status: ResultStatus;
}

type QMode = 'eng_to_kor' | 'kor_to_eng' | 'listening';

interface VocabSelfTestProps {
  words: VocabWord[];
  mode: QMode;
  testLevel?: number; // 1=3choices/4s, 2=5choices/4s, 3=typing/6s
  testTimeLimit?: number | null; // total seconds
  /** When provided, each question will randomly pick a mode from this pool (self-test only). */
  modePool?: QMode[];
  onFinish: (correct: number, wrong: number, total: number, meta?: { startedAt: string; finishedAt: string; durationSeconds: number }) => void;
  onBack: () => void;
}

// 품사 약어 목록
const POS_TAGS = ['n.', 'v.', 'adj.', 'adv.', 'prep.', 'conj.', 'pron.', 'int.', 'det.', 'a.', 'vt.', 'vi.', 'aux.'];
const POS_KOREAN = ['명사', '동사', '형용사', '부사', '전치사', '접속사', '대명사', '감탄사', '한정사', '조동사', '타동사', '자동사'];

function stripPosTag(s: string): string {
  let stripped = s.trim();
  for (const tag of POS_TAGS) {
    if (stripped.toLowerCase().startsWith(tag)) {
      stripped = stripped.slice(tag.length).trim();
    }
  }
  for (const tag of POS_KOREAN) {
    stripped = stripped.replace(new RegExp(`\\(?${tag}\\)?`, 'g'), '').trim();
  }
  return stripped;
}

// Strip parenthetical glosses, e.g. "사과(과일)" -> "사과"
function stripParens(s: string): string {
  return s.replace(/\([^)]*\)/g, '').replace(/（[^）]*）/g, '').trim();
}

function normalize(s: string): string {
  return stripParens(s)
    .toLowerCase()
    // Strip all whitespace (spacing-insensitive comparison)
    .replace(/\s+/g, '')
    // Strip punctuation/symbols commonly typed by mistake on mobile
    .replace(/[.,:!?'"\[\]{}()\-_~`*…·、|/\\]/g, '')
    .trim();
}

// Levenshtein distance for typo tolerance
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let curr = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const next = Math.min(curr + 1, prev[j] + 1, prev[j - 1] + cost);
      prev[j - 1] = curr;
      curr = next;
    }
    prev[b.length] = curr;
  }
  return prev[b.length];
}

// Allow small typos: ~1 edit for short answers, scales with length.
function isFuzzyMatch(user: string, candidate: string): boolean {
  if (!user || !candidate) return false;
  const len = Math.max(user.length, candidate.length);
  // Too short — require exact match to avoid false positives
  if (len <= 2) return user === candidate;
  let threshold: number;
  if (len <= 4) threshold = 1;
  else if (len <= 8) threshold = 2;
  else threshold = Math.floor(len * 0.25);
  return levenshtein(user, candidate) <= threshold;
}

// Split a meaning string into individual acceptable answers.
// Supports: , / ; · 、 | ~또는~ and Korean middle dot.
function splitMeanings(s: string): string[] {
  return stripParens(s)
    .split(/[,/;·、|]|\s또는\s|\sor\s/i)
    .map(a => a.trim())
    .filter(a => a.length > 0);
}

function checkAnswerResult(userAnswer: string, correctAnswer: string): ResultStatus {
  const normalizedUser = normalize(userAnswer);
  if (!normalizedUser) return 'skipped';

  // Build candidate answers: full string + each split piece, both raw and pos-stripped
  const rawPieces = splitMeanings(correctAnswer);
  const candidates = new Set<string>();
  candidates.add(normalize(correctAnswer));
  for (const p of rawPieces) {
    const n = normalize(p);
    if (n) candidates.add(n);
    const ns = normalize(stripPosTag(p));
    if (ns) candidates.add(ns);
  }

  // Exact match against any candidate => fully correct
  for (const c of candidates) {
    if (c === normalizedUser) return 'correct';
  }

  // Typo-tolerant match (mobile typing)
  for (const c of candidates) {
    if (isFuzzyMatch(normalizedUser, c)) return 'correct';
  }

  // Also accept if user typed multiple meanings: split user's input too and accept
  // when every user piece matches a candidate (any order).
  const userPieces = splitMeanings(userAnswer).map(p => normalize(p)).filter(Boolean);
  if (
    userPieces.length > 1 &&
    userPieces.every(up => Array.from(candidates).some(c => c === up || isFuzzyMatch(up, c)))
  ) {
    return 'correct';
  }

  const userCore = normalize(stripPosTag(userAnswer));

  // Substring containment => partial (avoid 1-char false positives)
  if (userCore.length >= 2) {
    for (const c of candidates) {
      if (c.length >= 2 && (c.includes(userCore) || userCore.includes(c))) {
        return 'partial';
      }
    }
  }

  return 'wrong';
}

export default function VocabSelfTest({ words, mode, testLevel = 1, testTimeLimit, modePool, onFinish, onBack }: VocabSelfTestProps) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [results, setResults] = useState<TestResult[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<ResultStatus | null>(null);
  const [finished, setFinished] = useState(false);
  const [reviewFilter, setReviewFilter] = useState<'all' | 'wrong' | 'partial'>('all');
  const [listeningRevealed, setListeningRevealed] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [choices, setChoices] = useState<string[]>([]);
  const [perQuestionTimer, setPerQuestionTimer] = useState(0);
  const [globalTimeLeft, setGlobalTimeLeft] = useState<number | null>(testTimeLimit || null);
  const inputRef = useRef<HTMLInputElement>(null);
  const startedAtRef = useRef<string>(new Date().toISOString());
  const answeredRef = useRef(false);

  // Per-question mode (random pick if pool, else fixed)
  const perQuestionModes = useMemo<QMode[]>(() => {
    if (!modePool || modePool.length === 0) return words.map(() => mode);
    return words.map(() => modePool[Math.floor(Math.random() * modePool.length)]);
  }, [words, mode, modePool]);

  const activeMode: QMode = perQuestionModes[currentIdx] ?? mode;
  const isListening = activeMode === 'listening';
  const isLevelMode = testLevel >= 1 && testLevel <= 3;
  const isChoiceMode = isLevelMode && (testLevel === 1 || testLevel === 2) && !isListening;
  const isTypingLevel = isLevelMode && (testLevel === 3 || isListening);
  const choiceCount = testLevel === 1 ? 3 : testLevel === 2 ? 5 : 0;
  const perQuestionSeconds = testLevel === 3 ? 6 : 4;
  const currentWord = words[currentIdx];
  // In listening mode: student hears English, types Korean meaning
  const question = isListening ? '' : (activeMode === 'eng_to_kor' ? currentWord?.english : currentWord?.meaning);
  const answer = isListening ? currentWord?.meaning : (activeMode === 'eng_to_kor' ? currentWord?.meaning : currentWord?.english);

  // Generate choices for level mode
  useEffect(() => {
    if (isChoiceMode && currentWord && !showResult && !finished) {
      const correctAnswer = answer;
      const otherAnswers = words
        .filter(w => w.english !== currentWord.english)
        .map(w => activeMode === 'eng_to_kor' ? w.meaning : w.english)
        .sort(() => Math.random() - 0.5)
        .slice(0, choiceCount - 1);
      const allChoices = [...otherAnswers, correctAnswer].sort(() => Math.random() - 0.5);
      setChoices(allChoices);
      setSelectedChoice(null);
    }
  }, [currentIdx, isChoiceMode, finished]);

  // Per-question timer
  useEffect(() => {
    if (finished || showResult) return;
    answeredRef.current = false;
    setPerQuestionTimer(perQuestionSeconds);
    const interval = setInterval(() => {
      setPerQuestionTimer(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          // Auto-skip on timeout — but ONLY if not already answered
          if (!answeredRef.current) {
            doCheck('', true);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [currentIdx, finished, perQuestionSeconds]);

  // Global time limit
  useEffect(() => {
    if (!testTimeLimit || finished) return;
    setGlobalTimeLeft(testTimeLimit);
    const interval = setInterval(() => {
      setGlobalTimeLeft(prev => {
        if (prev === null) return null;
        if (prev <= 1) {
          clearInterval(interval);
          // Force finish
          const correct = results.filter(r => r.status === 'correct').length;
          const wrong = words.length - correct;
          const finishedAt = new Date().toISOString();
          const duration = Math.round((new Date(finishedAt).getTime() - new Date(startedAtRef.current).getTime()) / 1000);
          setFinished(true);
          onFinish(correct, wrong, words.length, { startedAt: startedAtRef.current, finishedAt, durationSeconds: duration });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [testTimeLimit, finished]);

  useEffect(() => {
    if (!showResult && !finished && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [currentIdx, showResult, finished]);

  // Auto-play audio in listening mode when question changes
  useEffect(() => {
    if (isListening && currentWord && !showResult && !finished) {
      setTimeout(() => speakEnglish(currentWord.english), 300);
    }
  }, [currentIdx, isListening, currentWord, showResult, finished]);

  const doCheck = useCallback((answerText: string, isSkip: boolean) => {
    if (!currentWord) return;
    if (answeredRef.current) return; // prevent double-record from timer races
    answeredRef.current = true;
    const status = isSkip ? 'skipped' as ResultStatus : checkAnswerResult(answerText, answer);
    setCurrentStatus(status);
    setShowResult(true);
    setListeningRevealed(true);
    setResults(prev => [...prev, { word: currentWord, userAnswer: isSkip ? '' : answerText.trim(), status }]);
  }, [currentWord, answer]);

  const checkAnswer = useCallback(() => {
    if (!currentWord || userAnswer.trim() === '') return;
    doCheck(userAnswer, false);
  }, [currentWord, userAnswer, doCheck]);

  const skipAnswer = useCallback(() => {
    if (!currentWord) return;
    doCheck('', true);
  }, [currentWord, doCheck]);

  const goNext = () => {
    if (currentIdx < words.length - 1) {
      setCurrentIdx(prev => prev + 1);
      setUserAnswer('');
      setShowResult(false);
      setCurrentStatus(null);
      setListeningRevealed(false);
    } else {
      const correct = results.filter(r => r.status === 'correct').length;
      const wrong = results.filter(r => r.status !== 'correct').length;
      const finishedAt = new Date().toISOString();
      const duration = Math.round((new Date(finishedAt).getTime() - new Date(startedAtRef.current).getTime()) / 1000);
      setFinished(true);
      onFinish(correct, wrong, words.length, { startedAt: startedAtRef.current, finishedAt, durationSeconds: duration });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (showResult) {
        goNext();
      } else {
        checkAnswer();
      }
    }
  };

  const correctCount = results.filter(r => r.status === 'correct').length;
  const partialCount = results.filter(r => r.status === 'partial').length;
  const wrongCount = results.filter(r => r.status === 'wrong' || r.status === 'skipped').length;
  const progressPercent = Math.round(((currentIdx + (showResult ? 1 : 0)) / words.length) * 100);

  const wrongAndPartialWords = results.filter(r => r.status !== 'correct');
  const filteredReview = reviewFilter === 'all'
    ? wrongAndPartialWords
    : wrongAndPartialWords.filter(r =>
        reviewFilter === 'partial' ? r.status === 'partial' : (r.status === 'wrong' || r.status === 'skipped')
      );

  if (finished) {
    return <FinishedView
      correctCount={correctCount}
      partialCount={partialCount}
      wrongCount={wrongCount}
      totalCount={words.length}
      wrongAndPartialWords={wrongAndPartialWords}
      filteredReview={filteredReview}
      reviewFilter={reviewFilter}
      setReviewFilter={setReviewFilter}
      mode={mode}
      onBack={onBack}
      onRetry={() => {
        startedAtRef.current = new Date().toISOString();
        setCurrentIdx(0);
        setUserAnswer('');
        setResults([]);
        setShowResult(false);
        setCurrentStatus(null);
        setFinished(false);
        setReviewFilter('all');
        setListeningRevealed(false);
      }}
    />;
  }

  return (
    <div className="space-y-4 p-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ChevronLeft className="w-4 h-4 mr-1" /> 목록
        </Button>
        <div className="text-sm text-muted-foreground">
          {currentIdx + 1} / {words.length}
        </div>
        <div className="flex gap-2 text-sm">
          <span className="text-green-600 font-medium">✓{correctCount}</span>
          {partialCount > 0 && <span className="text-amber-500 font-medium">△{partialCount}</span>}
          <span className="text-red-500 font-medium">✗{wrongCount}</span>
        </div>
      </div>

      <Progress value={progressPercent} className="h-1.5" />

      {/* Question card */}
      <Card className="min-h-[260px] flex items-center justify-center">
        <CardContent className="text-center py-8 space-y-4 w-full">
          {isListening ? (
            <>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                듣고 뜻을 입력하세요
              </p>
              <div className="flex flex-col items-center gap-3">
                {!listeningRevealed ? (
                  <Button
                    variant="outline"
                    size="lg"
                    className="rounded-full w-20 h-20 border-2 border-primary"
                    onClick={() => speakEnglish(currentWord.english)}
                  >
                    <Volume2 className="w-8 h-8 text-primary" />
                  </Button>
                ) : (
                  <div className="space-y-1">
                    <p className="text-2xl font-bold">{currentWord.english}</p>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => speakEnglish(currentWord.english)}>
                      <Volume2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
                {!listeningRevealed && (
                  <p className="text-xs text-muted-foreground">버튼을 눌러 다시 들을 수 있어요</p>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {activeMode === 'eng_to_kor' ? '뜻을 입력하세요' : '영어 단어를 입력하세요'}
              </p>
              <div className="flex items-center justify-center gap-2">
                <p className="text-2xl font-bold">{question}</p>
                {activeMode === 'eng_to_kor' && (
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => speakEnglish(currentWord.english)}>
                    <Volume2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </>
          )}

          {/* Per-question timer */}
          {!showResult && (
            <div className="flex items-center justify-center gap-2 mb-1">
              <div className={`text-sm font-mono font-bold px-2 py-0.5 rounded ${perQuestionTimer <= 2 ? 'text-red-500 animate-pulse' : 'text-muted-foreground'}`}>
                ⏱ {perQuestionTimer}s
              </div>
              {globalTimeLeft !== null && (
                <div className={`text-xs font-mono px-2 py-0.5 rounded ${globalTimeLeft <= 30 ? 'text-red-500' : 'text-muted-foreground'}`}>
                  전체 {Math.floor(globalTimeLeft / 60)}:{String(globalTimeLeft % 60).padStart(2, '0')}
                </div>
              )}
            </div>
          )}

          {!showResult ? (
            <div className="px-4 space-y-3">
              {isChoiceMode ? (
                <div className={`grid gap-2 ${choiceCount >= 5 ? 'grid-cols-1' : 'grid-cols-1'}`}>
                  {choices.map((choice, idx) => (
                    <Button
                      key={idx}
                      variant={selectedChoice === choice ? 'default' : 'outline'}
                      className="w-full text-left justify-start py-3 h-auto whitespace-normal"
                      onClick={() => {
                        setSelectedChoice(choice);
                        setUserAnswer(choice);
                        doCheck(choice, false);
                      }}
                    >
                      <span className="mr-2 font-bold text-muted-foreground">{idx + 1}.</span>
                      {choice}
                    </Button>
                  ))}
                </div>
              ) : (
                <>
                  <Input
                    ref={inputRef}
                    value={userAnswer}
                    onChange={e => setUserAnswer(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={isListening ? '한글 뜻 입력...' : (activeMode === 'eng_to_kor' ? '한글 뜻 입력...' : 'Type in English...')}
                    className="text-center text-lg"
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                  />
                  <div className="flex gap-2">
                    <Button onClick={skipAnswer} variant="outline" className="flex-1 text-muted-foreground">
                      <HelpCircle className="w-4 h-4 mr-1" /> 모르겠다
                    </Button>
                    <Button onClick={checkAnswer} disabled={userAnswer.trim() === ''} className="flex-1">
                      확인
                    </Button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="px-4 space-y-3">
              <ResultFeedback status={currentStatus} userAnswer={userAnswer} answer={answer} />
              <Button onClick={goNext} className="w-full">
                {currentIdx < words.length - 1 ? (
                  <>다음 <ArrowRight className="w-4 h-4 ml-1" /></>
                ) : '결과 보기'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// --- Sub-components ---

function ResultFeedback({ status, userAnswer, answer }: { status: ResultStatus | null; userAnswer: string; answer: string }) {
  if (status === 'correct') {
    return (
      <div className="flex items-center justify-center gap-2 text-green-600">
        <CheckCircle2 className="w-6 h-6" />
        <span className="text-lg font-bold">정답!</span>
      </div>
    );
  }
  if (status === 'partial') {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-center gap-2 text-amber-500">
          <Triangle className="w-6 h-6 fill-amber-500" />
          <span className="text-lg font-bold">세모 (부분 정답)</span>
        </div>
        <p className="text-sm text-muted-foreground">
          내 답: <span className="text-amber-500">{userAnswer}</span>
        </p>
        <p className="text-base font-medium text-green-600">정답: {answer}</p>
        <p className="text-xs text-amber-600">핵심 의미는 맞지만 품사/표현이 다릅니다</p>
      </div>
    );
  }
  if (status === 'skipped') {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-center gap-2 text-muted-foreground">
          <HelpCircle className="w-6 h-6" />
          <span className="text-lg font-bold">모르겠다</span>
        </div>
        <p className="text-base font-medium text-green-600">정답: {answer}</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-center gap-2 text-red-500">
        <XCircle className="w-6 h-6" />
        <span className="text-lg font-bold">오답</span>
      </div>
      <p className="text-sm text-muted-foreground">
        내 답: <span className="line-through text-red-400">{userAnswer}</span>
      </p>
      <p className="text-base font-medium text-green-600">정답: {answer}</p>
    </div>
  );
}

interface FinishedViewProps {
  correctCount: number;
  partialCount: number;
  wrongCount: number;
  totalCount: number;
  wrongAndPartialWords: TestResult[];
  filteredReview: TestResult[];
  reviewFilter: 'all' | 'wrong' | 'partial';
  setReviewFilter: (f: 'all' | 'wrong' | 'partial') => void;
  mode: string;
  onBack: () => void;
  onRetry: () => void;
}

function FinishedView({
  correctCount, partialCount, wrongCount, totalCount,
  wrongAndPartialWords, filteredReview, reviewFilter, setReviewFilter,
  mode, onBack, onRetry,
}: FinishedViewProps) {
  const score = Math.round((correctCount / totalCount) * 100);
  return (
    <div className="space-y-4 p-4 max-w-lg mx-auto">
      <Card>
        <CardContent className="text-center space-y-4 py-8">
          <div className="text-4xl">{score >= 80 ? '🎉' : score >= 50 ? '💪' : '📖'}</div>
          <h2 className="text-xl font-bold">테스트 완료!</h2>
          <div className="text-3xl font-bold flex items-center justify-center gap-2">
            <span className="text-green-600">{correctCount}</span>
            {partialCount > 0 && (
              <>
                <span className="text-muted-foreground text-lg">+</span>
                <span className="text-amber-500">△{partialCount}</span>
              </>
            )}
            <span className="text-muted-foreground mx-1">/</span>
            <span>{totalCount}</span>
          </div>
          <p className="text-lg text-muted-foreground">정답률 {score}%</p>
          <Progress value={score} className="h-2" />

          {wrongAndPartialWords.length > 0 && (
            <div className="mt-4 space-y-2">
              <div className="flex gap-1 justify-center">
                <Button variant={reviewFilter === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setReviewFilter('all')} className="text-xs">
                  전체 ({wrongAndPartialWords.length})
                </Button>
                {partialCount > 0 && (
                  <Button variant={reviewFilter === 'partial' ? 'default' : 'outline'} size="sm" onClick={() => setReviewFilter('partial')} className="text-xs">
                    △ 세모 ({partialCount})
                  </Button>
                )}
                <Button variant={reviewFilter === 'wrong' ? 'default' : 'outline'} size="sm" onClick={() => setReviewFilter('wrong')} className="text-xs">
                  ✗ 오답 ({wrongCount})
                </Button>
              </div>

              <div className="space-y-2 text-left mt-2">
                {filteredReview.map((r, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-2 p-2 rounded-md text-sm border ${
                      r.status === 'partial'
                        ? 'bg-amber-50 border-amber-200'
                        : r.status === 'skipped'
                        ? 'bg-muted border-border'
                        : 'bg-red-50 border-red-100'
                    }`}
                  >
                    {r.status === 'partial' ? (
                      <Triangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0 fill-amber-500" />
                    ) : r.status === 'skipped' ? (
                      <HelpCircle className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{r.word.english}</div>
                      {r.status === 'skipped' ? (
                        <div className="text-muted-foreground text-xs">모르겠다고 표시함</div>
                      ) : (
                        <div className={`line-through text-xs ${r.status === 'partial' ? 'text-amber-500' : 'text-red-500'}`}>
                          {r.userAnswer}
                        </div>
                      )}
                      <div className="text-green-600 text-xs">→ {r.word.meaning}</div>
                      {r.status === 'partial' && (
                        <div className="text-amber-600 text-[10px] mt-0.5">품사/표현이 약간 다름</div>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => speakEnglish(r.word.english)}>
                      <Volume2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 justify-center mt-4">
            <Button variant="outline" onClick={onBack}>
              <ChevronLeft className="w-4 h-4 mr-1" /> 목록으로
            </Button>
            <Button variant="outline" onClick={onRetry}>
              <RotateCcw className="w-3.5 h-3.5 mr-1" /> 다시 풀기
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
