import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Printer, ArrowLeft, BookOpen, ClipboardCheck, FileText, Calculator, Copy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { MathRenderer } from '@/components/math/MathRenderer';
import { useToast } from '@/hooks/use-toast';
import logoImg from '@/assets/logo-thementor.png';

type PrintMode = 'study' | 'quiz' | 'blank' | 'example' | 'eng_vocab' | 'eng_translation' | 'eng_reading';

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
  video_url?: string | null;
  english_mode?: string;
  vocab_direction?: string;
  category?: string;
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
  answerCode: string | null;
  subtitle: string | null;
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

const CIRCLED = ['①', '②', '③', '④', '⑤'];

function parseChoices(text: string): { body: string; choices: string[] } | null {
  const regex = /([①②③④⑤])\s*/g;
  const indices: { idx: number; marker: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    indices.push({ idx: m.index, marker: m[1] });
  }
  if (indices.length < 2) return null;

  const body = text.slice(0, indices[0].idx).trim();
  const choices: string[] = [];
  for (let i = 0; i < indices.length; i++) {
    const start = indices[i].idx + indices[i].marker.length;
    const end = i + 1 < indices.length ? indices[i + 1].idx : text.length;
    choices.push(text.slice(start, end).trim());
  }
  return { body, choices };
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
  eng_vocab: {
    label: '🔤 단어 시험지',
    icon: ClipboardCheck,
    subtitle: '영단어 시험입니다',
    footer: '빈칸에 정답을 정자로 깔끔하게 적어주세요! 단어가 실력의 기초! 📚',
  },
  eng_translation: {
    label: '📝 해석 시험지',
    icon: FileText,
    subtitle: '영어 문장을 해석하세요',
    footer: '문장의 의미를 자연스러운 한국어로 옮겨보세요! ✍️',
  },
  eng_reading: {
    label: '📖 독해 시험지',
    icon: BookOpen,
    subtitle: '지문을 읽고 문제에 답하세요',
    footer: '지문을 꼼꼼히 읽고 정답의 근거를 찾아보세요! 🔍',
  },
};

/* ── Line height is FIXED at ~8.5mm. We compute how many lines fit. ── */
const LINE_HEIGHT_MM = 8.5;
const PAGE_HEIGHT_MM = 297;
const PAGE_MARGIN_MM = 15 * 2; // top+bottom @page margin
const HEADER_HEIGHT_MM = 42;   // first-page header block (increased top margin)
const FOOTER_HEIGHT_MM = 12;   // footer bar
const QUESTION_OVERHEAD_MM = 22; // question text + number + gaps per item

/** Count (1), (2)… sub-question markers in text */
function countSubQuestions(text: string): number {
  const matches = text.match(/\(([0-9]{1,2})\)|⑴|⑵|⑶|⑷|⑸|⑹|⑺|⑻|⑼|⑽/g);
  return matches ? matches.length : 0;
}

function computeLineCount(isFirst: boolean, itemsPerCol: number, extraSubLines = 0): number {
  const usable = PAGE_HEIGHT_MM - PAGE_MARGIN_MM - FOOTER_HEIGHT_MM - (isFirst ? HEADER_HEIGHT_MM : 0);
  const totalOverhead = QUESTION_OVERHEAD_MM * itemsPerCol;
  const spaceForLines = usable - totalOverhead - (extraSubLines * LINE_HEIGHT_MM);
  const linesPerItem = Math.max(4, Math.floor(spaceForLines / itemsPerCol / LINE_HEIGHT_MM));
  return linesPerItem;
}

export default function QuizPrintPage() {
  const [searchParams] = useSearchParams();
  const quizId = searchParams.get('quiz_id');
  const studentId = searchParams.get('student_id');
  const studentName = searchParams.get('student_name') || '';
  const [data, setData] = useState<PrintData | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<PrintMode>('quiz');
  const [showAnswerKey, setShowAnswerKey] = useState(false);
  const [answerDetail, setAnswerDetail] = useState<'quick' | 'full'>('quick');
  const { toast } = useToast();

  // Detect if this is an English quiz
  const isEnglishQuiz = useMemo(() => {
    if (!data) return false;
    return data.questions.some(q => (q as any).english_mode);
  }, [data]);

  const englishMode = useMemo(() => {
    if (!data) return null;
    const first = data.questions.find(q => (q as any).english_mode);
    return first ? (first as any).english_mode : null;
  }, [data]);

  const vocabDirection = useMemo(() => {
    if (!data) return 'mixed';
    const first = data.questions.find(q => (q as any).vocab_direction);
    return first ? (first as any).vocab_direction : 'mixed';
  }, [data]);

  useEffect(() => {
    if (!quizId) { setLoading(false); return; }
    (async () => {
      const { data: quiz, error } = await supabase
        .from('math_concept_quizzes')
        .select('id, questions, version_number, version_label, answer_code, subtitle, math_concepts(title, course, grade, subject)')
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
        answerCode: (quiz as any).answer_code || null,
        subtitle: (quiz as any).subtitle || null,
      });
      setLoading(false);
    })();
  }, [quizId]);

  // Auto-detect English mode and set initial print mode
  useEffect(() => {
    if (!data) return;
    const firstQ = data.questions[0] as any;
    if (firstQ?.english_mode === 'vocab') setMode('eng_vocab');
    else if (firstQ?.english_mode === 'translation') setMode('eng_translation');
    else if (firstQ?.english_mode === 'reading') setMode('eng_reading');
  }, [data]);

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

  if (loading) return <div className="flex items-center justify-center min-h-screen text-muted-foreground">로딩 중...</div>;
  if (!data) return <div className="flex items-center justify-center min-h-screen text-destructive">퀴즈를 찾을 수 없습니다.</div>;

  const cfg = MODE_META[mode];

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

  /* Source info — only visible on answer key (teacher view) */
  const SourceInfo = ({ q }: { q: QuizQuestion }) => {
    if (!showAnswerKey) return null;
    const src = q as any;
    if (!src.source_textbook) return null;
    return (
      <span className="qp-source">
        [{src.source_textbook}{src.source_page ? ` p.${src.source_page}` : ''}{src.source_problem ? ` ${src.source_problem}` : ''}]
      </span>
    );
  };

  /* ── Strict choice renderer: if ANY choice > 15 chars → ALL vertical ── */
  const ChoicesRenderer = ({ choices }: { choices: string[] }) => {
    const maxLen = Math.max(...choices.map(c => stripHtml(c).length));
    const forceVertical = maxLen > 15;

    if (forceVertical) {
      return (
        <div className="qp-choices qp-choices-vertical">
          {choices.map((c, i) => (
            <div key={i} className="qp-choice-row">
              <span className="qp-choice-marker">{CIRCLED[i]}</span>
              <span className="qp-choice-text"><MathRenderer text={c} /></span>
            </div>
          ))}
        </div>
      );
    }
    const rows: string[][] = [];
    for (let i = 0; i < choices.length; i += 2) {
      rows.push(choices.slice(i, i + 2));
    }
    return (
      <div className="qp-choices qp-choices-grid">
        {rows.map((row, ri) => (
          <div key={ri} className="qp-choice-grid-row">
            {row.map((c, ci) => (
              <div key={ci} className="qp-choice-cell">
                <span className="qp-choice-marker">{CIRCLED[ri * 2 + ci]}</span>
                <span className="qp-choice-text"><MathRenderer text={c} /></span>
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  };

  /* ── Full Header — borderless, QR+code left, name/date right ── */
  const FullHeader = () => (
    <div className="qp-header">
      <div className="qp-header-left">
        <div className="qp-header-qr">
          <QRCodeSVG value={qrPayload} size={50} level="M" />
          {data.answerCode && (
            <span className="qp-answer-code-label">{data.answerCode}</span>
          )}
        </div>
        <div className="qp-name-date-fields">
          <div className="qp-field-row">
            <span className="qp-field-label">이름</span>
            <span className="qp-field-underline">{studentName || '\u00A0'}</span>
          </div>
          <div className="qp-field-row">
            <span className="qp-field-label">날짜</span>
            <span className="qp-field-underline">{today.replace(/\./g, '. ')}</span>
          </div>
        </div>
      </div>
      <div className="qp-header-center">
        <p className="qp-subject-label">{cfg.label}</p>
        <p className="qp-textbook-info">{data.course} · {data.grade} · {data.subject}</p>
        <p className="qp-concept-title">{data.conceptTitle}</p>
        {data.subtitle && <p className="qp-subtitle" style={{ fontSize: '9pt', color: '#666', marginTop: '1px' }}>{data.subtitle}</p>}
        <div className="qp-header-meta">
          <span>{data.questions.length}문제</span>
          <Badge variant="secondary" className="qp-version-badge">V{data.versionNumber}</Badge>
        </div>
      </div>
      <div className="qp-header-right">
        <img src={logoImg} alt="더멘토" className="qp-logo print-logo" />
      </div>
    </div>
  );

  /* ── Workspace: lined note area with FIXED line height, variable count ── */
  const WorkspaceArea = ({ q, showAnswer, lines, subCount }: { q: QuizQuestion; showAnswer: boolean; lines: number; subCount?: number }) => {
    // Add extra lines proportional to sub-question count
    const extraLines = subCount && subCount > 1 ? Math.min((subCount - 1) * 2, 8) : 0;
    const totalLines = lines + extraLines;
    return (
      <div className="qp-workspace">
        <div className="qp-lined-area">
          {Array.from({ length: totalLines }).map((_, i) => (
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
  };

  const QuestionItem = ({ q, textOverride, lines }: { q: QuizQuestion; textOverride?: string; lines: number }) => {
    const num = String(q.question_number).padStart(2, '0');
    const raw = textOverride ?? q.question_text;
    const parsed = parseChoices(raw);
    const subCount = countSubQuestions(raw);

    return (
      <div className="qp-item">
        <div className="qp-item-header">
          <span className="qp-num">{num}</span>
          <div className="qp-question-body">
            <span className="qp-question-text">
              <MathRenderer text={parsed ? parsed.body : raw} autoSubBreak={true} />
            </span>
            <SourceInfo q={q} />
            {parsed && <ChoicesRenderer choices={parsed.choices} />}
            {/* Video QR code inline */}
            {q.video_url && (
              <div className="qp-video-qr">
                <QRCodeSVG value={q.video_url} size={28} level="L" />
                <span className="qp-video-qr-label">해설영상</span>
              </div>
            )}
          </div>
        </div>
        <WorkspaceArea q={q} showAnswer={showAnswerKey} lines={lines} subCount={subCount} />
      </div>
    );
  };

  const Footer = ({ pageNum, totalPages }: { pageNum: number; totalPages: number }) => (
    <div className="qp-footer">
      <span className="qp-footer-brand">더 멘토 학원 | 대표 황은지</span>
      <span className="qp-footer-divider">·</span>
      <span className="qp-footer-text">{cfg.footer}</span>
      <span className="qp-footer-divider">·</span>
      <span className="qp-footer-page">{pageNum} / {totalPages}</span>
    </div>
  );

  const paginateQuestions = (questions: QuizQuestion[]) => {
    const pages: { questions: QuizQuestion[]; isFirst: boolean }[] = [];
    if (questions.length === 0) return pages;
    const firstCount = Math.min(4, questions.length);
    pages.push({ questions: questions.slice(0, firstCount), isFirst: true });
    for (let i = firstCount; i < questions.length; i += 6) {
      pages.push({ questions: questions.slice(i, i + 6), isFirst: false });
    }
    return pages;
  };

  const renderQuestions = (questions: QuizQuestion[], textFn?: (q: QuizQuestion) => string) => {
    const pages = paginateQuestions(questions);
    const totalPages = pages.length;
    return pages.map((page, pi) => {
      const mid = Math.ceil(page.questions.length / 2);
      const itemsPerCol = mid; // max items in a single column
      const lines = computeLineCount(page.isFirst, itemsPerCol);
      return (
        <div key={pi} className="qp-page">
          {page.isFirst && <FullHeader />}
          {showAnswerKey && (
            <div className="qp-answer-banner">※ 답지 (정답 포함){data.answerCode && ` — ${data.answerCode}`}</div>
          )}
          <div className="qp-two-col">
            <div className="qp-col">
              {page.questions.slice(0, mid).map(q => (
                <QuestionItem key={q.question_number} q={q} textOverride={textFn?.(q)} lines={lines} />
              ))}
            </div>
            <div className="qp-col">
              {page.questions.slice(mid).map(q => (
                <QuestionItem key={q.question_number} q={q} textOverride={textFn?.(q)} lines={lines} />
              ))}
            </div>
          </div>
          <Footer pageNum={pi + 1} totalPages={totalPages} />
        </div>
      );
    });
  };

  const renderExamples = () => {
    const qs = exampleQuestions;
    const pages = paginateQuestions(qs);
    const totalPages = pages.length;
    return pages.map((page, pi) => {
      const mid = Math.ceil(page.questions.length / 2);
      const itemsPerCol = mid;
      const lines = computeLineCount(page.isFirst, itemsPerCol);
      return (
        <div key={pi} className="qp-page">
          {page.isFirst && <FullHeader />}
          {!page.isFirst && (
            <p className="qp-example-intro">아래 문제의 풀이 과정을 자세히 작성하세요.</p>
          )}
          <div className="qp-two-col">
            <div className="qp-col">
              {page.questions.slice(0, mid).map((q, i) => (
                <QuestionItem key={i} q={q} lines={lines} />
              ))}
            </div>
            <div className="qp-col">
              {page.questions.slice(mid).map((q, i) => (
                <QuestionItem key={i} q={q} lines={lines} />
              ))}
            </div>
          </div>
          <Footer pageNum={pi + 1} totalPages={totalPages} />
        </div>
      );
    });
  };

  const renderBlank = () => {
    const pages = paginateQuestions(
      keywords.map((kw, i) => ({
        question_number: i + 1,
        question_type: 'short_answer' as const,
        question_text: kw,
        answer: '',
        explanation: '',
        difficulty: 'medium' as const,
      }))
    );
    const totalPages = pages.length;
    return pages.map((page, pi) => {
      const mid = Math.ceil(page.questions.length / 2);
      const mid2 = Math.ceil(page.questions.length / 2);
      const blankLines = computeLineCount(page.isFirst, mid2);
      return (
        <div key={pi} className="qp-page">
          {page.isFirst && <FullHeader />}
          {page.isFirst && (
            <p className="qp-example-intro">아래 핵심 키워드의 <strong>정의, 성질, 조건</strong>을 직접 서술하세요.</p>
          )}
          <div className="qp-two-col">
            <div className="qp-col">
              {page.questions.slice(0, mid).map(q => (
                <div key={q.question_number} className="qp-item">
                  <div className="qp-item-header">
                    <span className="qp-num">{String(q.question_number).padStart(2, '0')}</span>
                    <span className="qp-keyword-chip"><MathRenderer text={q.question_text} /></span>
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
              {page.questions.slice(mid).map(q => (
                <div key={q.question_number} className="qp-item">
                  <div className="qp-item-header">
                    <span className="qp-num">{String(q.question_number).padStart(2, '0')}</span>
                    <span className="qp-keyword-chip"><MathRenderer text={q.question_text} /></span>
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
          <Footer pageNum={pi + 1} totalPages={totalPages} />
        </div>
      );
    });
  };

  const renderStudy = () => {
    const pages = renderQuestions(data.questions, toStudyText);
    return (
      <>
        {pages}
        <div className="qp-page">
          <div className="qp-memo-section">
            <p className="qp-memo-title">📝 개념 정리 메모</p>
            <p className="qp-memo-subtitle">이 단원의 핵심 개념을 내 말로 정리해 보세요.</p>
            <div className="qp-lined-area qp-memo-lines">
              {Array.from({ length: 20 }).map((_, i) => (
                <div key={i} className="qp-line qp-line-tall" />
              ))}
            </div>
          </div>
          <Footer pageNum={1} totalPages={1} />
        </div>
      </>
    );
  };

  /* ════ English: Vocab — 3-column layout ════ */
  const renderVocab = () => {
    const qs = data.questions;
    const dir = vocabDirection;
    const ITEMS_PER_PAGE_FIRST = 45; // 3 cols × 15 rows
    const ITEMS_PER_PAGE = 54; // 3 cols × 18 rows

    const pages: { questions: QuizQuestion[]; isFirst: boolean }[] = [];
    if (qs.length === 0) return null;
    pages.push({ questions: qs.slice(0, ITEMS_PER_PAGE_FIRST), isFirst: true });
    for (let i = ITEMS_PER_PAGE_FIRST; i < qs.length; i += ITEMS_PER_PAGE) {
      pages.push({ questions: qs.slice(i, i + ITEMS_PER_PAGE), isFirst: false });
    }
    const totalPages = pages.length;

    return pages.map((page, pi) => {
      const colSize = Math.ceil(page.questions.length / 3);
      const cols = [
        page.questions.slice(0, colSize),
        page.questions.slice(colSize, colSize * 2),
        page.questions.slice(colSize * 2),
      ];
      return (
        <div key={pi} className="qp-page">
          {page.isFirst && <FullHeader />}
          {showAnswerKey && (
            <div className="qp-answer-banner">
              ※ 답지 ({answerDetail === 'quick' ? '빠른 정답' : '해설 포함'}){data.answerCode && ` — ${data.answerCode}`}
            </div>
          )}
          <div className="qp-vocab-grid">
            {cols.map((col, ci) => (
              <div key={ci} className="qp-vocab-col">
                {col.map((q, qi) => {
                  const num = q.question_number;
                  const isEnToKr = dir === 'en_to_kr' || (dir === 'mixed' && qi % 2 === 0);
                  const prompt = isEnToKr ? q.question_text : q.answer;
                  const answer = isEnToKr ? q.answer : q.question_text;
                  return (
                    <div key={q.question_number} className="qp-vocab-row">
                      <span className="qp-vocab-num">{num}</span>
                      <span className="qp-vocab-prompt">{prompt}</span>
                      <span className="qp-vocab-answer-space">
                        {showAnswerKey ? (
                          <span className="qp-vocab-answer-text">{answer}</span>
                        ) : null}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          {showAnswerKey && answerDetail === 'full' && (
            <div className="qp-vocab-explanations">
              {page.questions.filter(q => q.explanation).map(q => (
                <div key={q.question_number} className="qp-vocab-exp-row">
                  <span className="qp-vocab-exp-num">{q.question_number}.</span>
                  <span className="qp-vocab-exp-word">{q.question_text}</span>
                  <span className="qp-vocab-exp-text">{q.explanation}</span>
                </div>
              ))}
            </div>
          )}
          <Footer pageNum={pi + 1} totalPages={totalPages} />
        </div>
      );
    });
  };

  /* ════ English: Translation — sentence with lined answer space ════ */
  const renderTranslation = () => {
    const qs = data.questions;
    const ITEMS_PER_PAGE_FIRST = 6;
    const ITEMS_PER_PAGE = 8;

    const pages: { questions: QuizQuestion[]; isFirst: boolean }[] = [];
    if (qs.length === 0) return null;
    pages.push({ questions: qs.slice(0, ITEMS_PER_PAGE_FIRST), isFirst: true });
    for (let i = ITEMS_PER_PAGE_FIRST; i < qs.length; i += ITEMS_PER_PAGE) {
      pages.push({ questions: qs.slice(i, i + ITEMS_PER_PAGE), isFirst: false });
    }
    const totalPages = pages.length;

    return pages.map((page, pi) => (
      <div key={pi} className="qp-page">
        {page.isFirst && <FullHeader />}
        {showAnswerKey && (
          <div className="qp-answer-banner">
            ※ 답지 ({answerDetail === 'quick' ? '빠른 정답' : '해설 포함'}){data.answerCode && ` — ${data.answerCode}`}
          </div>
        )}
        <div className="qp-translation-list">
          {page.questions.map(q => (
            <div key={q.question_number} className="qp-translation-item">
              <div className="qp-translation-header">
                <span className="qp-num">{String(q.question_number).padStart(2, '0')}</span>
                <span className="qp-translation-sentence">{q.question_text}</span>
              </div>
              {showAnswerKey ? (
                <div className="qp-translation-answer-area">
                  <div className="qp-translation-answer-text">→ {q.answer}</div>
                  {answerDetail === 'full' && q.explanation && (
                    <div className="qp-translation-explanation">💡 {q.explanation}</div>
                  )}
                </div>
              ) : (
                <div className="qp-translation-lines">
                  <div className="qp-line" />
                  <div className="qp-line" />
                  <div className="qp-line" />
                </div>
              )}
            </div>
          ))}
        </div>
        <Footer pageNum={pi + 1} totalPages={totalPages} />
      </div>
    ));
  };

  /* ════ English: Reading — passage + questions, single-column layout ════ */
  const renderReading = () => {
    const qs = data.questions;
    // Single-column: 3 items per first page, 4 per subsequent
    const ITEMS_FIRST = 3;
    const ITEMS_REST = 4;
    const pages: { questions: QuizQuestion[]; isFirst: boolean }[] = [];
    if (qs.length === 0) return null;
    pages.push({ questions: qs.slice(0, ITEMS_FIRST), isFirst: true });
    for (let i = ITEMS_FIRST; i < qs.length; i += ITEMS_REST) {
      pages.push({ questions: qs.slice(i, i + ITEMS_REST), isFirst: false });
    }
    const totalPages = pages.length;

    return pages.map((page, pi) => (
      <div key={pi} className="qp-page qp-reading-page">
        {page.isFirst && <FullHeader />}
        {showAnswerKey && (
          <div className="qp-answer-banner">
            ※ 답지 ({answerDetail === 'quick' ? '빠른 정답' : '해설 포함'}){data.answerCode && ` — ${data.answerCode}`}
          </div>
        )}
        <div className="qp-reading-list">
          {page.questions.map(q => {
            const text = q.question_text;
            const passageMatch = text.match(/\[지문\]\s*([\s\S]*?)\s*\[문제\]\s*([\s\S]*)/);
            return (
              <div key={q.question_number} className="qp-reading-item">
                <div className="qp-reading-num-bar">
                  <span className="qp-reading-num">{String(q.question_number).padStart(2, '0')}</span>
                </div>
                {passageMatch ? (
                  <>
                    <div className="qp-reading-passage">
                      <MathRenderer text={passageMatch[1].trim()} />
                    </div>
                    <div className="qp-reading-question-text">
                      <MathRenderer text={passageMatch[2].trim()} />
                    </div>
                  </>
                ) : (
                  <div className="qp-reading-question-text">
                    <MathRenderer text={text} />
                  </div>
                )}
                {showAnswerKey ? (
                  <div className="qp-reading-answer">
                    <strong>정답:</strong> {q.answer}
                    {answerDetail === 'full' && q.explanation && (
                      <div className="qp-reading-explanation">💡 {q.explanation}</div>
                    )}
                  </div>
                ) : (
                  <div className="qp-reading-workspace">
                    <div className="qp-reading-lines">
                      <div className="qp-line" />
                      <div className="qp-line" />
                      <div className="qp-line" />
                      <div className="qp-line" />
                    </div>
                    <div className="qp-answer-box">
                      <span className="qp-answer-label">정답</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <Footer pageNum={pi + 1} totalPages={totalPages} />
      </div>
    ));
  };

  const copyAnswerCode = () => {
    if (data.answerCode) {
      navigator.clipboard.writeText(data.answerCode);
      toast({ title: '복사 완료', description: `정답 확인 코드 ${data.answerCode}가 클립보드에 복사되었습니다.` });
    }
  };

  return (
    <div className="quiz-print-wrapper">
      {/* Toolbar (screen only) */}
      <div className="print:hidden max-w-4xl mx-auto px-4 pt-4 pb-2 flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => window.history.back()}>
          <ArrowLeft className="w-3.5 h-3.5 mr-1" /> 돌아가기
        </Button>
        <div className="h-5 w-px bg-border mx-1" />
        {(Object.entries(MODE_META) as [PrintMode, typeof cfg][])
          .filter(([key]) => {
            // Show only relevant modes
            if (isEnglishQuiz) return key.startsWith('eng_') || key === 'quiz';
            return !key.startsWith('eng_');
          })
          .map(([key, m]) => {
            const Icon = m.icon;
            return (
              <Button
                key={key}
                variant="outline"
                size="sm"
                onClick={() => { setMode(key as PrintMode); setShowAnswerKey(false); }}
                className={mode === key ? 'bg-primary text-primary-foreground hover:bg-primary/90' : ''}
              >
                <Icon className="w-3.5 h-3.5 mr-1" /> {m.label}
              </Button>
            );
          })}
        <div className="h-5 w-px bg-border mx-1" />
        {mode !== 'blank' && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAnswerKey(!showAnswerKey)}
              className={showAnswerKey ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
            >
              {showAnswerKey ? '답지 보기 중' : '답지 보기'}
            </Button>
            {showAnswerKey && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAnswerDetail(prev => prev === 'quick' ? 'full' : 'quick')}
                className={answerDetail === 'full' ? 'bg-amber-100 border-amber-300 text-amber-800' : ''}
              >
                {answerDetail === 'quick' ? '빠른정답' : '해설포함'}
              </Button>
            )}
          </>
        )}
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="w-3.5 h-3.5 mr-1" /> 인쇄
        </Button>
        {data.answerCode && (
          <Button variant="secondary" size="sm" onClick={copyAnswerCode}>
            <Copy className="w-3.5 h-3.5 mr-1" /> {data.answerCode}
          </Button>
        )}
      </div>

      {/* Printable area */}
      <div className="quiz-print-area">
        {mode === 'quiz' && renderQuestions(data.questions)}
        {mode === 'study' && renderStudy()}
        {mode === 'blank' && renderBlank()}
        {mode === 'example' && renderExamples()}
        {mode === 'eng_vocab' && renderVocab()}
        {mode === 'eng_translation' && renderTranslation()}
        {mode === 'eng_reading' && renderReading()}
      </div>

      <style>{`
        /* ══════════════════════════════════════════════════
           Quiz Print Stylesheet v6 — Full A4 space utilization
           ══════════════════════════════════════════════════ */
        .quiz-print-wrapper { font-family: 'Pretendard', 'Apple SD Gothic Neo', sans-serif; }
        .quiz-print-area { max-width: 210mm; margin: 0 auto; }

        /* ── Page container — flex column to fill A4 height ── */
        .qp-page {
          display: flex;
          flex-direction: column;
          padding: 16px 22px 12px;
          page-break-after: always;
          box-sizing: border-box;
          min-height: 297mm;
        }

        /* ── Header — refined, bottom accent line ── */
        .qp-header {
          padding: 14px 0 10px;
          margin-bottom: 12px;
          margin-top: 6px;
          display: flex;
          align-items: center;
          gap: 16px;
          border-bottom: 2.5px solid #1e293b;
          flex-shrink: 0;
        }
        .qp-header-left {
          display: flex;
          align-items: center;
          gap: 14px;
          flex-shrink: 0;
        }
        .qp-header-qr {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 3px;
          flex-shrink: 0;
        }
        .qp-answer-code-label {
          font-size: 7.5px;
          font-weight: 700;
          color: #64748b;
          letter-spacing: 0.5px;
        }
        .qp-name-date-fields {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .qp-field-row {
          display: flex;
          align-items: baseline;
          gap: 6px;
          font-size: 11px;
          color: #334155;
        }
        .qp-field-label {
          font-weight: 700;
          white-space: nowrap;
          min-width: 26px;
        }
        .qp-field-underline {
          display: inline-block;
          border-bottom: 1.5px solid #94a3b8;
          min-width: 100px;
          padding-bottom: 2px;
        }
        .qp-header-center {
          flex: 1;
          min-width: 0;
          text-align: center;
        }
        .qp-subject-label { font-size: 16px; font-weight: 800; color: #1e293b; margin-bottom: 2px; letter-spacing: -0.3px; }
        .qp-textbook-info { font-size: 11.5px; font-weight: 600; color: #475569; margin-bottom: 1px; }
        .qp-concept-title { font-size: 11px; color: #64748b; margin-bottom: 3px; }
        .qp-header-meta { font-size: 10px; color: #64748b; display: flex; align-items: center; justify-content: center; gap: 6px; }
        .qp-version-badge { font-size: 9px !important; }
        .qp-header-right {
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .qp-logo { height: 48px; width: auto; object-fit: contain; }

        /* ── Two-column grid — FLEX GROW to fill page ── */
        .qp-two-col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0 20px;
          flex: 1;
        }
        .qp-col {
          display: flex;
          flex-direction: column;
        }

        /* ── Question item — flex item, workspace grows ── */
        .qp-item {
          break-inside: avoid;
          page-break-inside: avoid;
          -webkit-column-break-inside: avoid;
          display: flex;
          flex-direction: column;
          flex: 1;
          margin-bottom: 4px;
        }
        .qp-item-header {
          display: flex;
          align-items: flex-start;
          gap: 6px;
          margin-bottom: 2px;
          flex-shrink: 0;
        }
        .qp-num {
          font-size: 20px;
          font-weight: 800;
          color: #3b82f6;
          line-height: 1.1;
          min-width: 28px;
          flex-shrink: 0;
        }
        .qp-question-body { flex: 1; min-width: 0; padding-top: 3px; overflow: visible; }
        .qp-question-text {
          font-size: 13px;
          line-height: 1.7;
          color: #1e293b;
          overflow-wrap: break-word;
          word-break: break-word;
        }
        .qp-question-text .math-renderer {
          display: inline;
          overflow: visible;
        }
        .qp-source {
          font-size: 8px;
          color: #94a3b8;
          margin-left: 4px;
          font-style: italic;
        }
        .qp-video-qr {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          margin-left: 6px;
          vertical-align: middle;
        }
        .qp-video-qr-label {
          font-size: 7px;
          color: #64748b;
          writing-mode: vertical-rl;
          letter-spacing: 1px;
        }

        /* ── Sub-question auto line-break styling ── */
        .mr-sub-break {
          display: block;
          height: 6px;
        }
        .mr-sub-marker {
          font-weight: 700;
          color: #334155;
          margin-right: 4px;
        }
        /* Answer blank after each sub-question */
        .mr-sub-marker::after {
          content: '';
          display: inline-block;
          border-bottom: 1.5px solid #94a3b8;
          min-width: 60px;
          margin-left: 6px;
          vertical-align: middle;
        }

        /* ── ㄱㄴㄷ Boxed items ── */
        .mr-boxed-item {
          display: block;
          border: 1.5px solid #cbd5e1;
          border-radius: 5px;
          padding: 4px 10px;
          margin: 4px 0;
          background: #f8fafc;
          font-size: 12.5px;
          line-height: 1.7;
        }
        .mr-boxed-marker {
          font-weight: 800;
          color: #3b82f6;
          margin-right: 4px;
        }

        /* ── <보기> Box ── */
        .mr-bogi-box {
          display: block;
          border: 2px solid #334155;
          border-radius: 6px;
          padding: 8px 12px;
          margin: 8px 0;
          background: #fafbfc;
          position: relative;
        }
        .mr-bogi-label {
          font-size: 11px;
          font-weight: 800;
          color: #1e293b;
          display: block;
          margin-bottom: 4px;
          letter-spacing: 0.5px;
        }
        .mr-bogi-content {
          font-size: 13px;
          line-height: 1.8;
          color: #1e293b;
        }
        .mr-bogi-content .katex {
          font-size: 1.15em !important;
        }

        /* ── Circled letter markers (ⓐⓑⓒ…) ── */
        .mr-circled-letter {
          font-weight: 700;
          color: #334155;
          margin: 0 2px;
          font-size: 13px;
        }

        /* ── Formula visual separation — display math gets extra spacing & weight ── */
        .qp-question-text .katex-display {
          margin: 8px 0 6px !important;
        }
        .qp-question-text .katex {
          font-size: 1.15em !important;
          font-weight: 500;
        }
        .qp-answer-value .katex {
          font-size: 1.1em !important;
        }

        /* ── Smart choices ── */
        .qp-choices { margin-top: 5px; padding-left: 2px; }
        .qp-choices-vertical { display: flex; flex-direction: column; gap: 2px; }
        .qp-choice-row {
          display: flex;
          align-items: baseline;
          gap: 6px;
        }
        .qp-choices-grid { display: flex; flex-direction: column; gap: 2px; }
        .qp-choice-grid-row { display: flex; gap: 16px; }
        .qp-choice-cell {
          display: flex;
          align-items: baseline;
          gap: 5px;
          min-width: 0;
          flex: 1;
        }
        .qp-choice-marker {
          font-size: 12px;
          font-weight: 700;
          color: #334155;
          flex-shrink: 0;
          min-width: 14px;
          text-align: center;
        }
        .qp-choice-text { font-size: 11.5px; color: #1e293b; line-height: 1.55; }

        /* ── Workspace — FIXED line height, answer box bottom-right ── */
        .qp-workspace {
          margin-left: 34px;
          margin-top: 3px;
          position: relative;
        }
        .qp-lined-area {
          padding: 2px 6px 1px;
        }
        .qp-line {
          border-bottom: 1px solid #e2e8f0;
          height: 8.5mm;
          box-sizing: border-box;
        }
        .qp-line-tall { height: 10mm; }
        .qp-answer-box {
          position: absolute;
          right: 0; bottom: 0;
          border: 1.5px solid #334155;
          border-radius: 3px;
          min-width: 72px; min-height: 28px;
          display: flex; align-items: center; gap: 5px;
          padding: 3px 8px;
          background: #fff;
          z-index: 1;
        }
        .qp-answer-label { font-size: 9px; font-weight: 700; color: #1e293b; white-space: nowrap; }
        .qp-answer-value { font-size: 12px; font-weight: 700; color: #3b82f6; }

        /* ── Keyword chip (blank mode) ── */
        .qp-keyword-chip {
          display: inline-block;
          font-size: 12px; font-weight: 600;
          border: 1px solid #cbd5e1; border-radius: 4px;
          padding: 2px 12px;
          background: #f1f5f9; color: #1e293b;
        }

        /* ── Answer banner ── */
        .qp-answer-banner {
          text-align: center;
          font-size: 10px; font-weight: 700;
          color: #3b82f6;
          border: 1px solid #bfdbfe;
          background: #eff6ff;
          border-radius: 4px;
          padding: 3px 0;
          margin-bottom: 6px;
          flex-shrink: 0;
        }

        /* ── Example intro ── */
        .qp-example-intro {
          font-size: 12px; font-weight: 500;
          color: #334155; margin-bottom: 6px;
          flex-shrink: 0;
        }

        /* ── Memo section ── */
        .qp-memo-section {
          border: 1.5px solid #e2e8f0; border-radius: 6px;
          padding: 16px; margin-top: 8px; flex: 1;
        }
        .qp-memo-title { font-size: 13px; font-weight: 700; color: #1e293b; margin-bottom: 2px; }
        .qp-memo-subtitle { font-size: 10px; color: #64748b; margin-bottom: 10px; }
        .qp-memo-lines { border: none; padding: 0; background: transparent; }

        /* ── Footer — navy bar with page number integrated ── */
        .qp-footer {
          background: #1e293b;
          color: #fff;
          text-align: center;
          padding: 6px 16px;
          font-size: 9.5px; font-weight: 500;
          border-radius: 3px;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          flex-shrink: 0;
          margin-top: 8px;
        }
        .qp-footer-brand { font-weight: 700; white-space: nowrap; }
        .qp-footer-divider { opacity: 0.4; }
        .qp-footer-text { margin: 0; flex: 1; }
        .qp-footer-page {
          font-weight: 700;
          font-size: 13px;
          letter-spacing: 1.5px;
          white-space: nowrap;
        }

        /* ── KaTeX: Computer Modern, enlarged for readability ── */
        .qp-question-text .katex,
        .qp-choice-text .katex,
        .qp-answer-value .katex {
          font-size: 1.15em;
          font-weight: 500;
        }
        }

        /* ══════════════════════════════════════════════════
           English: Vocab 3-column layout
           ══════════════════════════════════════════════════ */
        .qp-vocab-grid {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 0 16px;
          flex: 1;
        }
        .qp-vocab-col {
          display: flex;
          flex-direction: column;
        }
        .qp-vocab-row {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 3px 2px;
          border-bottom: 1px solid #f1f5f9;
          min-height: 22px;
        }
        .qp-vocab-row:nth-child(odd) { background: #fafbfc; }
        .qp-vocab-num {
          font-size: 9px;
          font-weight: 700;
          color: #94a3b8;
          min-width: 18px;
          text-align: right;
          flex-shrink: 0;
        }
        .qp-vocab-prompt {
          font-size: 11px;
          font-weight: 600;
          color: #1e293b;
          flex: 1;
          min-width: 0;
        }
        .qp-vocab-answer-space {
          flex: 1;
          min-width: 0;
          border-bottom: 1px solid #cbd5e1;
          min-height: 16px;
          margin-left: 4px;
        }
        .qp-vocab-answer-text {
          font-size: 10.5px;
          color: #3b82f6;
          font-weight: 600;
        }
        .qp-vocab-explanations {
          margin-top: 8px;
          padding: 6px 8px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          columns: 2;
          column-gap: 16px;
        }
        .qp-vocab-exp-row {
          font-size: 9px;
          color: #64748b;
          break-inside: avoid;
          padding: 1px 0;
        }
        .qp-vocab-exp-num { font-weight: 700; margin-right: 2px; }
        .qp-vocab-exp-word { font-weight: 600; color: #334155; margin-right: 4px; }
        .qp-vocab-exp-text { font-style: italic; }

        /* ══════════════════════════════════════════════════
           English: Translation — sentence + lined answer
           ══════════════════════════════════════════════════ */
        .qp-translation-list {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .qp-translation-item {
          break-inside: avoid;
          page-break-inside: avoid;
          margin-bottom: 2px;
        }
        .qp-translation-header {
          display: flex;
          align-items: flex-start;
          gap: 6px;
          margin-bottom: 2px;
        }
        .qp-translation-sentence {
          font-size: 12px;
          line-height: 1.7;
          color: #1e293b;
          font-weight: 500;
          padding-top: 3px;
        }
        .qp-translation-lines {
          margin-left: 34px;
          padding: 2px 6px;
        }
        .qp-translation-lines .qp-line {
          border-bottom: 1px solid #d4d8dd;
          height: 10mm;
        }
        .qp-translation-answer-area {
          margin-left: 34px;
          padding: 4px 8px;
          background: #eff6ff;
          border-radius: 4px;
          border-left: 3px solid #3b82f6;
        }
        .qp-translation-answer-text {
          font-size: 11px;
          color: #1e40af;
          font-weight: 500;
          line-height: 1.6;
        }
        .qp-translation-explanation {
          font-size: 10px;
          color: #64748b;
          margin-top: 2px;
          font-style: italic;
        }

        /* ══════════════════════════════════════════════════
           English: Reading — passage with proper typography
           ══════════════════════════════════════════════════ */
        .qp-reading-page .qp-reading-list {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .qp-reading-item {
          break-inside: avoid;
          page-break-inside: avoid;
        }
        .qp-reading-header {
          display: flex;
          align-items: flex-start;
          gap: 6px;
          margin-bottom: 4px;
        }
        .qp-reading-passage {
          font-size: 10.5pt;
          line-height: 1.6;
          color: #1e293b;
          padding: 8px 12px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          margin-left: 34px;
          margin-bottom: 6px;
          white-space: pre-wrap;
        }
        .qp-reading-question {
          font-size: 11.5px;
          line-height: 1.6;
          color: #1e293b;
          margin-left: 34px;
          font-weight: 500;
          white-space: pre-wrap;
        }
        .qp-reading-answer {
          margin-left: 34px;
          margin-top: 4px;
          padding: 4px 8px;
          background: #eff6ff;
          border-radius: 4px;
          font-size: 11px;
          color: #1e40af;
          border-left: 3px solid #3b82f6;
        }
        .qp-reading-explanation {
          font-size: 10px;
          color: #64748b;
          margin-top: 2px;
          font-style: italic;
        }


           ══════════════════════════════════════════════════ */
        @media print {
          @page {
            size: A4 portrait;
            margin: 15mm 10mm;
          }
          html, body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            margin: 0; padding: 0;
          }
          body * { visibility: hidden; }
          .quiz-print-area, .quiz-print-area * { visibility: visible; }
          .quiz-print-area {
            position: absolute;
            left: 0; top: 0;
            width: 100%;
          }
          .print\\:hidden { display: none !important; }

          .qp-page {
            min-height: auto;
            height: 100%;
            padding: 0;
            page-break-after: always;
          }

          .qp-item {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          /* Slight font shrink for dense pages (high school) */
          .qp-question-text { font-size: 11.5px; }
          .qp-choice-text { font-size: 11px; }
          .qp-num { font-size: 18px; }
          .qp-line { height: 8.5mm; }
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
            min-height: 297mm;
          }
        }
      `}</style>
    </div>
  );
}
