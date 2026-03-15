import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Printer, ArrowLeft, BookOpen, ClipboardCheck, FileText, Calculator } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { MathRenderer } from '@/components/math/MathRenderer';
import logoImg from '@/assets/logo-thementor.png';

type PrintMode = 'study' | 'quiz' | 'blank' | 'example';
type LayoutDensity = '4' | '6';

interface QuizQuestion {
  question_number: number;
  question_type: 'fill_blank' | 'true_false' | 'short_answer';
  question_text: string;
  answer: string;
  explanation: string;
  difficulty: 'easy' | 'medium' | 'hard';
  source_textbook?: string;
  source_page?: number | null;
  source_chapter?: string;
  source_problem?: string;
}

interface PrintData {
  quizId: string;
  conceptTitle: string;
  course: string;
  grade: string;
  subject: string;
  questions: QuizQuestion[];
  versionNumber: number;
  versionLabel: string | null;
}

function stripHtml(str: string): string {
  return str
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    .replace(/___BLANK___/g, '')
    .trim();
}

const KEYWORD_BLACKLIST = new Set([
  '참', '거짓', 'O', 'X', 'o', 'x', 'O/X', '단답', '빈칸',
  '맞다', '틀리다', '예', '아니오', '네', '아니요',
  'true', 'false', 'TRUE', 'FALSE', 'True', 'False',
]);

function isValidKeyword(kw: string): boolean {
  if (!kw || kw.length < 2) return false;
  if (KEYWORD_BLACKLIST.has(kw)) return false;
  if (/^[.,;:!?~\-=+*\/\\]+$/.test(kw)) return false;
  return true;
}

const MODE_META: Record<PrintMode, { label: string; icon: typeof BookOpen; subtitle: string; footer: string }> = {
  study: {
    label: '셀프 개념 학습지',
    icon: BookOpen,
    subtitle: '개념서를 보며 빈칸을 채워보세요',
    footer: '빈칸을 채운 후 아래 메모칸에 이 단원의 핵심 개념을 내 말로 정리해 보세요! 💡',
  },
  quiz: {
    label: '퀴즈 테스트지',
    icon: ClipboardCheck,
    subtitle: '개념 이해도를 확인하는 퀴즈입니다',
    footer: '정답은 박스 안에 정자로 바르게 적어주세요! 우리 똑부러지는 멘토 학생들은 충분히 할 수 있어요! 화이팅! ✨',
  },
  blank: {
    label: '백지 테스트지',
    icon: FileText,
    subtitle: '키워드를 보고 스스로 정의와 성질을 서술하세요',
    footer: '각 키워드의 정의, 성질, 조건을 빠짐없이 서술해 보세요! 개념을 완벽히 내 것으로! 🔥',
  },
  example: {
    label: '기초 예제 학습지',
    icon: Calculator,
    subtitle: '개념을 숫자와 식에 대입하여 연습하세요',
    footer: '풀이 과정을 빠짐없이 적어주세요! 기초가 탄탄해야 실력이 쑥쑥! 💪',
  },
};

export default function QuizPrintPage() {
  const [searchParams] = useSearchParams();
  const quizId = searchParams.get('quiz_id');
  const studentId = searchParams.get('student_id');
  const studentName = searchParams.get('student_name') || '';
  const [data, setData] = useState<PrintData | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<PrintMode>('quiz');
  const [showAnswerKey, setShowAnswerKey] = useState(false);
  const [layoutDensity, setLayoutDensity] = useState<LayoutDensity>('6');

  useEffect(() => {
    if (!quizId) { setLoading(false); return; }
    (async () => {
      const { data: quiz, error } = await supabase
        .from('math_concept_quizzes')
        .select('id, questions, version_number, version_label, math_concepts(title, course, grade, subject)')
        .eq('id', quizId)
        .single();
      if (error || !quiz) { setLoading(false); return; }
      const concept = (quiz as any).math_concepts;
      setData({
        quizId: quiz.id,
        conceptTitle: concept?.title || '',
        course: concept?.course || '',
        grade: concept?.grade || '',
        subject: concept?.subject || '수학',
        questions: (quiz.questions as any) as QuizQuestion[],
        versionNumber: (quiz as any).version_number || 1,
        versionLabel: (quiz as any).version_label || null,
      });
      setLoading(false);
    })();
  }, [quizId]);

  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const qrPayload = data ? `${window.location.origin}/quiz-submit?quiz_id=${data.quizId}${studentId ? `&student_id=${studentId}` : ''}` : '';

  const keywords = useMemo(() => {
    if (!data) return [] as string[];
    const seen = new Set<string>();
    const result: string[] = [];
    data.questions.forEach(q => {
      if (q.question_type === 'true_false') return;
      const clean = stripHtml(q.answer);
      if (isValidKeyword(clean) && !seen.has(clean)) {
        seen.add(clean);
        result.push(clean);
      }
    });
    return result;
  }, [data]);

  const exampleQuestions = useMemo(() => {
    if (!data) return [];
    return data.questions.filter(q =>
      q.question_type !== 'true_false' &&
      (q.difficulty === 'easy' || q.difficulty === 'medium')
    );
  }, [data]);

  const hasTextbookSource = useMemo(() => {
    if (!data) return false;
    return data.questions.some(q => (q as any).source_textbook);
  }, [data]);

  if (loading) return <div className="flex items-center justify-center min-h-screen text-muted-foreground">로딩 중...</div>;
  if (!data) return <div className="flex items-center justify-center min-h-screen text-destructive">퀴즈를 찾을 수 없습니다.</div>;

  const cfg = MODE_META[mode];
  const questionsPerPage = parseInt(layoutDensity);
  const is4 = questionsPerPage === 4;

  const toStudyText = (q: QuizQuestion): string => {
    const ans = stripHtml(q.answer);
    if (!ans) return q.question_text;
    if (q.question_text.includes('___BLANK___')) return q.question_text;
    const plainText = stripHtml(q.question_text);
    if (plainText.includes(ans)) {
      return plainText.replace(ans, '___BLANK___');
    }
    return plainText + ' ___BLANK___';
  };

  // Source info
  const SourceInfo = ({ q }: { q: QuizQuestion }) => {
    const src = q as any;
    if (!src.source_textbook) return null;
    return (
      <span className="qp-source">
        ({src.source_textbook}{src.source_page ? ` p.${src.source_page}` : ''}{src.source_problem ? ` ${src.source_problem}` : ''})
      </span>
    );
  };

  // ── Header ──
  const Header = () => (
    <div className="qp-header">
      {/* Date ribbon */}
      <div className="qp-date-ribbon">{today.replace(/\./g, '.')}</div>
      <div className="qp-header-content">
        <div className="qp-header-left">
          <p className="qp-subject-label">{data.subject}</p>
          <p className="qp-textbook-info">
            {data.course} · {data.grade}
            {hasTextbookSource && data.questions[0]?.source_textbook && (
              <> · {(data.questions[0] as any).source_textbook}</>
            )}
          </p>
          <p className="qp-concept-title">{data.conceptTitle}</p>
        </div>
        <div className="qp-header-right">
          <img src={logoImg} alt="더멘토" className="qp-logo print-logo" />
          <div className="qp-header-meta">
            <span>{data.questions.length}문제 / 멘토</span>
            <Badge variant="secondary" className="qp-version-badge">V{data.versionNumber}</Badge>
          </div>
          <div className="qp-name-field">
            이름 <span className="qp-name-underline">{studentName || '\u00A0'}</span>
          </div>
        </div>
      </div>
      <div className="qp-qr-float">
        <QRCodeSVG value={qrPayload} size={52} level="M" />
      </div>
    </div>
  );

  // ── Lined workspace + answer box ──
  const lineCount = is4 ? 8 : 5;

  const WorkspaceArea = ({ q, showAnswer }: { q: QuizQuestion; showAnswer: boolean }) => (
    <div className="qp-workspace">
      <div className="qp-lined-area">
        {Array.from({ length: lineCount }).map((_, i) => (
          <div key={i} className="qp-line" />
        ))}
      </div>
      <div className="qp-answer-box">
        <span className="qp-answer-label">정답</span>
        {showAnswer && (
          <span className="qp-answer-value">
            <MathRenderer text={q.answer} />
          </span>
        )}
      </div>
    </div>
  );

  // ── Question Item ──
  const QuestionItem = ({ q, textOverride }: { q: QuizQuestion; textOverride?: string }) => {
    const num = String(q.question_number).padStart(2, '0');
    return (
      <div className="qp-item">
        <div className="qp-item-header">
          <span className="qp-num">{num}</span>
          <div className="qp-question-body">
            <span className="qp-question-text">
              <MathRenderer text={textOverride ?? q.question_text} />
            </span>
            {hasTextbookSource && <SourceInfo q={q} />}
          </div>
        </div>
        <WorkspaceArea q={q} showAnswer={showAnswerKey} />
      </div>
    );
  };

  // ── Example Item (larger workspace) ──
  const ExampleItem = ({ q, num }: { q: QuizQuestion; num: number }) => {
    const label = String(num).padStart(2, '0');
    return (
      <div className="qp-item">
        <div className="qp-item-header">
          <span className="qp-num">{label}</span>
          <div className="qp-question-body">
            <span className="qp-question-text">
              <MathRenderer text={q.question_text} />
            </span>
            {hasTextbookSource && <SourceInfo q={q} />}
          </div>
        </div>
        <WorkspaceArea q={q} showAnswer={showAnswerKey} />
      </div>
    );
  };

  // ── Footer ──
  const Footer = () => (
    <div className="qp-footer">
      <p className="qp-footer-text">{cfg.footer}</p>
    </div>
  );

  // ── Page number ──
  const PageNumber = ({ n }: { n: number }) => (
    <div className="qp-page-number">{n}</div>
  );

  // ── Mode renderers ──
  const renderQuestions = (questions: QuizQuestion[], textFn?: (q: QuizQuestion) => string) => {
    const pages: QuizQuestion[][] = [];
    for (let i = 0; i < questions.length; i += questionsPerPage) {
      pages.push(questions.slice(i, i + questionsPerPage));
    }
    return pages.map((pageQs, pi) => {
      const mid = Math.ceil(pageQs.length / 2);
      return (
        <div key={pi} className="qp-page">
          <Header />
          {showAnswerKey && (
            <div className="qp-answer-banner">※ 답지 (정답 포함)</div>
          )}
          <div className="qp-two-col">
            <div className="qp-col">
              {pageQs.slice(0, mid).map(q => (
                <QuestionItem key={q.question_number} q={q} textOverride={textFn?.(q)} />
              ))}
            </div>
            <div className="qp-col">
              {pageQs.slice(mid).map(q => (
                <QuestionItem key={q.question_number} q={q} textOverride={textFn?.(q)} />
              ))}
            </div>
          </div>
          <Footer />
          <PageNumber n={pi + 1} />
        </div>
      );
    });
  };

  const renderExamples = () => {
    const qs = exampleQuestions;
    const pages: QuizQuestion[][] = [];
    for (let i = 0; i < qs.length; i += questionsPerPage) {
      pages.push(qs.slice(i, i + questionsPerPage));
    }
    return pages.map((pageQs, pi) => {
      const mid = Math.ceil(pageQs.length / 2);
      const offset = pi * questionsPerPage;
      return (
        <div key={pi} className="qp-page">
          <Header />
          <p className="qp-example-intro">아래 문제의 풀이 과정을 자세히 작성하세요.</p>
          <div className="qp-two-col">
            <div className="qp-col">
              {pageQs.slice(0, mid).map((q, i) => (
                <ExampleItem key={i} q={q} num={offset + i + 1} />
              ))}
            </div>
            <div className="qp-col">
              {pageQs.slice(mid).map((q, i) => (
                <ExampleItem key={i} q={q} num={offset + mid + i + 1} />
              ))}
            </div>
          </div>
          <Footer />
          <PageNumber n={pi + 1} />
        </div>
      );
    });
  };

  const renderBlank = () => {
    const blankLines = is4 ? 9 : 6;
    const pages: string[][] = [];
    for (let i = 0; i < keywords.length; i += questionsPerPage) {
      pages.push(keywords.slice(i, i + questionsPerPage));
    }
    return pages.map((pageKws, pi) => {
      const mid = Math.ceil(pageKws.length / 2);
      const offset = pi * questionsPerPage;
      return (
        <div key={pi} className="qp-page">
          <Header />
          <p className="qp-example-intro">아래 핵심 키워드의 <strong>정의, 성질, 조건</strong>을 직접 서술하세요.</p>
          <div className="qp-two-col">
            <div className="qp-col">
              {pageKws.slice(0, mid).map((kw, i) => (
                <div key={i} className="qp-item">
                  <div className="qp-item-header">
                    <span className="qp-num">{String(offset + i + 1).padStart(2, '0')}</span>
                    <span className="qp-keyword-chip"><MathRenderer text={kw} /></span>
                  </div>
                  <div className="qp-workspace">
                    <div className="qp-lined-area">
                      {Array.from({ length: blankLines }).map((_, li) => (
                        <div key={li} className="qp-line" />
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="qp-col">
              {pageKws.slice(mid).map((kw, i) => (
                <div key={i} className="qp-item">
                  <div className="qp-item-header">
                    <span className="qp-num">{String(offset + mid + i + 1).padStart(2, '0')}</span>
                    <span className="qp-keyword-chip"><MathRenderer text={kw} /></span>
                  </div>
                  <div className="qp-workspace">
                    <div className="qp-lined-area">
                      {Array.from({ length: blankLines }).map((_, li) => (
                        <div key={li} className="qp-line" />
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <Footer />
          <PageNumber n={pi + 1} />
        </div>
      );
    });
  };

  const renderStudy = () => {
    const pages = renderQuestions(data.questions, toStudyText);
    // Append a memo page at the end
    return (
      <>
        {pages}
        <div className="qp-page">
          <Header />
          <div className="qp-memo-section">
            <p className="qp-memo-title">📝 개념 정리 메모</p>
            <p className="qp-memo-subtitle">이 단원의 핵심 개념을 내 말로 정리해 보세요.</p>
            <div className="qp-lined-area qp-memo-lines">
              {Array.from({ length: 20 }).map((_, i) => (
                <div key={i} className="qp-line" />
              ))}
            </div>
          </div>
          <Footer />
        </div>
      </>
    );
  };

  return (
    <div className="quiz-print-wrapper">
      {/* Toolbar (screen only) */}
      <div className="print:hidden max-w-4xl mx-auto px-4 pt-4 pb-2 flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => window.history.back()}>
          <ArrowLeft className="w-3.5 h-3.5 mr-1" /> 돌아가기
        </Button>
        <div className="h-5 w-px bg-border mx-1" />
        {(Object.entries(MODE_META) as [PrintMode, typeof cfg][]).map(([key, m]) => {
          const Icon = m.icon;
          return (
            <Button
              key={key}
              variant="outline"
              size="sm"
              onClick={() => { setMode(key); setShowAnswerKey(false); }}
              className={mode === key ? 'bg-primary text-primary-foreground hover:bg-primary/90' : ''}
            >
              <Icon className="w-3.5 h-3.5 mr-1" /> {m.label}
            </Button>
          );
        })}
        <div className="h-5 w-px bg-border mx-1" />
        <Select value={layoutDensity} onValueChange={(v) => setLayoutDensity(v as LayoutDensity)}>
          <SelectTrigger className="h-8 w-32 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="4">4문항/페이지</SelectItem>
            <SelectItem value="6">6문항/페이지</SelectItem>
          </SelectContent>
        </Select>
        <div className="h-5 w-px bg-border mx-1" />
        {mode !== 'blank' && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAnswerKey(!showAnswerKey)}
            className={showAnswerKey ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
          >
            {showAnswerKey ? '답지 보기 중' : '답지 보기'}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="w-3.5 h-3.5 mr-1" /> 인쇄
        </Button>
      </div>

      {/* Printable area */}
      <div className="quiz-print-area">
        {mode === 'quiz' && renderQuestions(data.questions)}
        {mode === 'study' && renderStudy()}
        {mode === 'blank' && renderBlank()}
        {mode === 'example' && renderExamples()}
      </div>

      <style>{`
        /* ══════════════════════════════════════════════════
           Quiz Print Stylesheet — Reference-matched design
           ══════════════════════════════════════════════════ */
        .quiz-print-wrapper { font-family: 'Pretendard', sans-serif; }
        .quiz-print-area { max-width: 210mm; margin: 0 auto; }

        /* ── Page ── */
        .qp-page {
          position: relative;
          padding: 28px 32px 48px;
          page-break-after: always;
          min-height: 297mm;
          box-sizing: border-box;
        }

        /* ── Header ── */
        .qp-header {
          position: relative;
          border: 2px solid #1e293b;
          border-radius: 6px;
          padding: 16px 20px 14px 48px;
          margin-bottom: 24px;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
        }
        .qp-date-ribbon {
          position: absolute;
          left: -2px;
          top: 8px;
          writing-mode: vertical-rl;
          text-orientation: mixed;
          background: #1e293b;
          color: #fff;
          font-size: 11px;
          font-weight: 600;
          padding: 8px 5px;
          border-radius: 0 4px 4px 0;
          letter-spacing: 1px;
        }
        .qp-header-left { flex: 1; min-width: 0; }
        .qp-subject-label {
          font-size: 15px;
          font-weight: 700;
          color: #1e293b;
          margin-bottom: 2px;
        }
        .qp-textbook-info {
          font-size: 13px;
          font-weight: 600;
          color: #1e293b;
          margin-bottom: 2px;
        }
        .qp-concept-title {
          font-size: 12px;
          color: #64748b;
        }
        .qp-header-right {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 4px;
          shrink: 0;
        }
        .qp-logo { height: 36px; width: auto; object-fit: contain; }
        .qp-header-meta {
          font-size: 11px;
          color: #64748b;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .qp-version-badge { font-size: 9px !important; }
        .qp-name-field {
          font-size: 12px;
          color: #334155;
          margin-top: 2px;
        }
        .qp-name-underline {
          display: inline-block;
          border-bottom: 1.5px solid #1e293b;
          min-width: 90px;
          margin-left: 4px;
        }
        .qp-qr-float {
          position: absolute;
          right: 20px;
          bottom: -28px;
          background: #fff;
          padding: 3px;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
        }

        /* ── Two-column grid ── */
        .qp-two-col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0 28px;
        }
        .qp-col { display: flex; flex-direction: column; }

        /* ── Question item ── */
        .qp-item {
          break-inside: avoid;
          margin-bottom: ${is4 ? '20px' : '14px'};
        }
        .qp-item-header {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          margin-bottom: 6px;
        }
        .qp-num {
          font-size: 22px;
          font-weight: 800;
          color: #1d4ed8;
          line-height: 1.1;
          min-width: 32px;
          flex-shrink: 0;
        }
        .qp-question-body { flex: 1; min-width: 0; padding-top: 4px; }
        .qp-question-text {
          font-size: 13px;
          line-height: 1.7;
          color: #1e293b;
        }
        .qp-source {
          font-size: 9px;
          color: #94a3b8;
          margin-left: 4px;
        }

        /* ── Workspace (lined + answer box) ── */
        .qp-workspace {
          margin-left: 42px;
          margin-top: 6px;
          position: relative;
        }
        .qp-lined-area {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          padding: 6px 10px 2px;
        }
        .qp-line {
          border-bottom: 1px solid #e2e8f0;
          height: ${is4 ? '26px' : '22px'};
        }
        .qp-answer-box {
          position: absolute;
          right: 0;
          bottom: 0;
          border: 2px solid #1e293b;
          border-radius: 4px;
          min-width: 80px;
          min-height: 32px;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          background: #fff;
        }
        .qp-answer-label {
          font-size: 10px;
          font-weight: 700;
          color: #1e293b;
          white-space: nowrap;
        }
        .qp-answer-value {
          font-size: 13px;
          font-weight: 700;
          color: #1d4ed8;
        }

        /* ── Keyword chip (blank mode) ── */
        .qp-keyword-chip {
          display: inline-block;
          font-size: 13px;
          font-weight: 600;
          border: 1px solid #cbd5e1;
          border-radius: 4px;
          padding: 3px 14px;
          background: #f1f5f9;
          color: #1e293b;
        }

        /* ── Answer banner ── */
        .qp-answer-banner {
          text-align: center;
          font-size: 11px;
          font-weight: 700;
          color: #1d4ed8;
          border: 1px solid #bfdbfe;
          background: #eff6ff;
          border-radius: 4px;
          padding: 4px 0;
          margin-bottom: 14px;
        }

        /* ── Example intro ── */
        .qp-example-intro {
          font-size: 13px;
          font-weight: 500;
          color: #334155;
          margin-bottom: 14px;
        }

        /* ── Memo section (study mode) ── */
        .qp-memo-section {
          border: 2px solid #e2e8f0;
          border-radius: 8px;
          padding: 20px;
          margin-top: 8px;
        }
        .qp-memo-title { font-size: 14px; font-weight: 700; color: #1e293b; margin-bottom: 2px; }
        .qp-memo-subtitle { font-size: 11px; color: #64748b; margin-bottom: 12px; }
        .qp-memo-lines { border: none; padding: 0; background: transparent; }

        /* ── Footer ── */
        .qp-footer {
          position: absolute;
          bottom: 14px;
          left: 0;
          right: 0;
          background: #1e293b;
          color: #fff;
          text-align: center;
          padding: 8px 20px;
          font-size: 11px;
          font-weight: 500;
          border-radius: 0;
        }
        .qp-footer-text { margin: 0; }

        /* ── Page number ── */
        .qp-page-number {
          position: absolute;
          bottom: 0;
          left: 50%;
          transform: translateX(-50%);
          font-size: 10px;
          font-weight: 600;
          color: #1e293b;
          background: #fff;
          padding: 0 8px;
        }

        /* ══ Print overrides ══ */
        @media print {
          @page { margin: 0; size: A4; }
          html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          body * { visibility: hidden; }
          .quiz-print-area, .quiz-print-area * { visibility: visible; }
          .quiz-print-area { position: absolute; left: 0; top: 0; width: 100%; }
          .print\\:hidden { display: none !important; }
          .qp-item { break-inside: avoid; }
          .qp-page { min-height: auto; padding: 20mm 14mm 18mm; }
          .qp-footer { position: relative; bottom: auto; margin-top: 12px; }
          .qp-page-number { position: relative; bottom: auto; margin-top: 4px; text-align: center; }
        }

        /* ══ Screen preview ══ */
        @media screen {
          .qp-page {
            background: #fff;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            margin: 16px auto;
            box-shadow: 0 4px 20px rgba(0,0,0,0.06);
            max-width: 210mm;
            min-height: auto;
          }
        }
      `}</style>
    </div>
  );
}
