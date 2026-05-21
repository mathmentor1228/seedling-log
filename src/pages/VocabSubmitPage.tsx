import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import bcrypt from 'bcryptjs';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, CheckCircle2, XCircle, Upload, Keyboard, Camera } from 'lucide-react';
import HomeworkImageUploader, { type ImageItem } from '@/components/student/HomeworkImageUploader';
import logoImg from '@/assets/logo-thementor.png';

interface Question {
  questionNumber: number;
  type: 'eng_to_kor' | 'kor_to_eng';
  prompt: string;
  answer: string;
}

interface TestInfo {
  id: string;
  title: string;
  test_data: Question[];
  grading_strictness: string;
}

const STRICTNESS_LABEL: Record<string, { label: string; color: string }> = {
  strict: { label: '🌶️ 매운맛', color: 'bg-red-500/15 text-red-700 border-red-500/30' },
  normal: { label: '🍜 보통맛', color: 'bg-amber-500/15 text-amber-700 border-amber-500/30' },
  lenient: { label: '🍦 순한맛', color: 'bg-green-500/15 text-green-700 border-green-500/30' },
};

const uploadImage = async (file: File, studentId: string, testId: string, idx: number) => {
  const path = `${studentId}/${testId}/${Date.now()}_${idx}.jpg`;
  const { error } = await supabase.storage.from('vocab-submissions').upload(path, file, { upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from('vocab-submissions').getPublicUrl(path);
  return data.publicUrl;
};

export default function VocabSubmitPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [test, setTest] = useState<TestInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Student identification (PIN-based, similar to StudentLogin)
  const [step, setStep] = useState<'identify' | 'choose' | 'typing' | 'photo' | 'submitting' | 'result'>('identify');
  const [studentName, setStudentName] = useState('');
  const [pinDigits, setPinDigits] = useState('');
  const [matchedStudents, setMatchedStudents] = useState<Array<{ id: string; name: string; pin_hash: string }>>([]);
  const [studentId, setStudentId] = useState('');
  const [confirmedName, setConfirmedName] = useState('');
  const [identifying, setIdentifying] = useState(false);

  // Answer state
  const [typedAnswers, setTypedAnswers] = useState<Record<number, string>>({});
  const [images, setImages] = useState<ImageItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    if (!token) {
      setError('잘못된 링크입니다');
      setLoading(false);
      return;
    }
    supabase
      .from('vocab_generated_tests')
      .select('id, title, test_data, grading_strictness')
      .eq('share_token', token)
      .single()
      .then(({ data, error: err }) => {
        if (err || !data) setError('시험지를 찾을 수 없습니다');
        else setTest({
          id: data.id,
          title: data.title,
          test_data: data.test_data as unknown as Question[],
          grading_strictness: (data as any).grading_strictness || 'normal',
        });
        setLoading(false);
      });
  }, [token]);

  const handleIdentify = async () => {
    if (!studentName.trim() || pinDigits.length !== 4) {
      setError('이름과 4자리 PIN을 입력해주세요');
      return;
    }
    setError('');
    setIdentifying(true);
    try {
      // Search students by name (with possible suffixes _M, _H)
      const { data: students } = await supabase
        .from('students')
        .select('id, name')
        .ilike('name', `${studentName.trim()}%`);

      if (!students || students.length === 0) {
        setError('학생을 찾을 수 없습니다');
        setIdentifying(false);
        return;
      }

      const ids = students.map(s => s.id);
      const { data: accts } = await supabase
        .from('student_accounts')
        .select('student_id, pin_hash')
        .in('student_id', ids);

      const candidates: Array<{ id: string; name: string; pin_hash: string }> = [];
      for (const s of students) {
        const acct = accts?.find(a => a.student_id === s.id);
        if (acct && bcrypt.compareSync(pinDigits, acct.pin_hash)) {
          candidates.push({ id: s.id, name: s.name, pin_hash: acct.pin_hash });
        }
      }

      if (candidates.length === 0) {
        setError('PIN이 일치하지 않습니다');
        setIdentifying(false);
        return;
      }

      if (candidates.length === 1) {
        setStudentId(candidates[0].id);
        setConfirmedName(candidates[0].name);
        setStep('choose');
      } else {
        setMatchedStudents(candidates);
      }
    } catch (e: any) {
      setError(e.message || '확인 실패');
    }
    setIdentifying(false);
  };

  const handlePickStudent = (s: { id: string; name: string }) => {
    setStudentId(s.id);
    setConfirmedName(s.name);
    setMatchedStudents([]);
    setStep('choose');
  };

  const handleSubmitTyping = async () => {
    if (!test) return;
    setSubmitting(true);
    setError('');
    try {
      const { data, error: invErr } = await supabase.functions.invoke('grade-vocab-submission', {
        body: {
          token,
          student_id: studentId,
          submission_type: 'typing',
          typed_answers: typedAnswers,
        },
      });
      if (invErr) throw invErr;
      if ((data as any)?.error) throw new Error((data as any).error);
      setResult(data);
      setStep('result');
    } catch (e: any) {
      setError(e.message || '채점 실패');
    }
    setSubmitting(false);
  };

  const handleSubmitPhotos = async () => {
    if (!test || images.length === 0) return;
    setSubmitting(true);
    setError('');
    try {
      const urls = await Promise.all(
        images.map((img, i) => uploadImage(img.file, studentId, test.id, i))
      );
      const { data, error: invErr } = await supabase.functions.invoke('grade-vocab-submission', {
        body: {
          token,
          student_id: studentId,
          submission_type: 'photo',
          image_urls: urls,
        },
      });
      if (invErr) throw invErr;
      if ((data as any)?.error) throw new Error((data as any).error);
      setResult(data);
      setStep('result');
    } catch (e: any) {
      setError(e.message || '채점 실패');
    }
    setSubmitting(false);
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-muted-foreground">로딩 중...</div>;
  }
  if (error && !test) {
    return <div className="flex items-center justify-center min-h-screen text-destructive">{error}</div>;
  }
  if (!test) return null;

  const strictBadge = STRICTNESS_LABEL[test.grading_strictness] || STRICTNESS_LABEL.normal;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 p-4">
      <div className="max-w-xl mx-auto">
        <Card className="shadow-lg">
          <CardHeader className="text-center space-y-2 pb-4">
            <img src={logoImg} alt="더멘토" className="h-8 mx-auto" />
            <CardTitle className="text-lg">{test.title}</CardTitle>
            <div className="flex justify-center gap-2 flex-wrap">
              <Badge variant="outline">{test.test_data.length}문항</Badge>
              <Badge variant="outline" className={strictBadge.color}>{strictBadge.label}</Badge>
              {confirmedName && <Badge variant="secondary">{confirmedName}</Badge>}
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {step === 'identify' && (
              <>
                {matchedStudents.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">같은 이름의 학생이 여러 명입니다. 본인을 선택해주세요:</p>
                    {matchedStudents.map(s => (
                      <Button key={s.id} variant="outline" className="w-full justify-start" onClick={() => handlePickStudent(s)}>
                        {s.name}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label>이름</Label>
                      <Input
                        value={studentName}
                        onChange={e => setStudentName(e.target.value)}
                        placeholder="홍길동"
                        autoComplete="off"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>4자리 PIN</Label>
                      <Input
                        type="tel"
                        inputMode="numeric"
                        maxLength={4}
                        value={pinDigits}
                        onChange={e => setPinDigits(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        placeholder="••••"
                        className="text-center text-2xl tracking-[0.5em]"
                      />
                    </div>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                    <Button className="w-full" onClick={handleIdentify} disabled={identifying}>
                      {identifying ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      확인
                    </Button>
                  </>
                )}
              </>
            )}

            {step === 'choose' && (
              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" className="h-24 flex-col" onClick={() => setStep('typing')}>
                  <Keyboard className="w-7 h-7 mb-1" />
                  <span>타이핑 제출</span>
                </Button>
                <Button variant="outline" className="h-24 flex-col" onClick={() => setStep('photo')}>
                  <Camera className="w-7 h-7 mb-1" />
                  <span>사진 제출</span>
                </Button>
              </div>
            )}

            {step === 'typing' && (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                {test.test_data.map(q => (
                  <div key={q.questionNumber} className="flex items-center gap-2 border-b pb-2">
                    <span className="text-xs text-muted-foreground w-6 text-right">{q.questionNumber}.</span>
                    <span className="font-medium text-sm flex-1 min-w-0 truncate">{q.prompt}</span>
                    <Input
                      className="w-40 h-9"
                      value={typedAnswers[q.questionNumber] || ''}
                      onChange={e => setTypedAnswers(prev => ({ ...prev, [q.questionNumber]: e.target.value }))}
                      placeholder="답"
                    />
                  </div>
                ))}
                {error && <p className="text-sm text-destructive">{error}</p>}
                <div className="flex gap-2 pt-2 sticky bottom-0 bg-background/95 backdrop-blur">
                  <Button variant="outline" onClick={() => setStep('choose')} className="flex-1">뒤로</Button>
                  <Button className="flex-1" onClick={handleSubmitTyping} disabled={submitting}>
                    {submitting ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> 채점 중...</> : '제출'}
                  </Button>
                </div>
              </div>
            )}

            {step === 'photo' && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">답안지 사진을 1~4장 찍어 올리세요 (번호가 잘 보이게)</p>
                <HomeworkImageUploader
                  images={images}
                  onImagesChange={setImages}
                  maxFiles={4}
                  disabled={submitting}
                  maxDimension={1400}
                  quality={0.72}
                />
                {error && <p className="text-sm text-destructive">{error}</p>}
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep('choose')} className="flex-1">뒤로</Button>
                  <Button className="flex-1" onClick={handleSubmitPhotos} disabled={images.length === 0 || submitting}>
                    {submitting ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> 채점 중...</> : (<><Upload className="w-4 h-4 mr-2" />제출</>)}
                  </Button>
                </div>
              </div>
            )}

            {step === 'result' && result && (
              <ResultView result={result} onRetry={() => { setStep('choose'); setResult(null); setTypedAnswers({}); setImages([]); }} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ResultView({ result, onRetry }: { result: any; onRetry: () => void }) {
  const { score, total, answers } = result;
  const percent = total > 0 ? Math.round((score / total) * 100) : 0;
  const wrongs = (answers as any[]).filter(a => !a.is_correct);

  return (
    <div className="space-y-4">
      <div className="text-center py-4">
        <div className="text-4xl mb-1">{percent >= 80 ? '🎉' : percent >= 60 ? '😊' : '💪'}</div>
        <div className="text-3xl font-bold">{score} / {total}</div>
        <div className="text-sm text-muted-foreground mt-1">{percent}점</div>
      </div>

      {wrongs.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">틀린 문항 ({wrongs.length}개)</p>
          {wrongs.map(w => (
            <div key={w.n} className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm">
              <div className="flex items-center gap-2 mb-1">
                <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                <span className="font-medium">{w.n}. {w.prompt}</span>
              </div>
              <div className="pl-6 space-y-0.5 text-xs">
                <p><span className="text-muted-foreground">내 답:</span> <span className="text-red-600">{w.student_answer || '(빈칸)'}</span></p>
                <p><span className="text-muted-foreground">정답:</span> <span className="text-green-700 font-medium">{w.answer}</span></p>
                <p className="text-muted-foreground italic">→ {w.reason}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-6 text-green-600 flex flex-col items-center gap-2">
          <CheckCircle2 className="w-12 h-12" />
          <p className="font-bold">전부 정답이에요!</p>
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center pt-2">
        ※ 선생님이 결과를 확인하고 최종 점수를 조정할 수 있어요
      </p>
      <Button variant="outline" className="w-full" onClick={onRetry}>다른 방식으로 다시 제출</Button>
    </div>
  );
}
