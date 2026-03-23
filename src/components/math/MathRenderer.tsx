import { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface Props {
  text: string;
  /** Enable sub-question (1),(2)… auto line-break with answer blanks */
  autoSubBreak?: boolean;
}

/**
 * Strips unwanted HTML tags from AI-generated text,
 * then renders LaTeX math expressions via KaTeX.
 * Supports recurring-dot notation (\dot{}, \overset{\cdot}{}).
 */
export function MathRenderer({ text, autoSubBreak = false }: Props) {
  const rendered = useMemo(() => {
    if (!text) return '';

    let result = text;

    // ── Step 1: Decode HTML entities that AI sometimes produces ──
    result = result
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ');

    // ── Step 2: Strip all HTML tags, attributes, and code artifacts ──
    result = result.replace(/\s*(class|style|data-[\w-]+)\s*=\s*"[^"]*"/gi, '');
    result = result.replace(/\s*(class|style|data-[\w-]+)\s*=\s*'[^']*'/gi, '');
    result = result.replace(/<\/?[a-zA-Z][^>]*>/g, '');
    result = result.replace(/\bmath-render(er)?\b/gi, '');

    // ── Step 2.5: Normalize recurring-dot notation ──
    result = result.replace(/([0-9])\u0307/g, '\\dot{$1}');

    // ── Step 2.6: Normalize lim notation ──
    // Convert plain "lim_{...}" or "lim_{ ... }" to proper LaTeX \lim_{...}
    // Also handle "lim_{n→∞}" with Unicode arrow
    result = result.replace(/(?<!\\)lim\s*_\s*\{([^}]+)\}/g, '\\lim_{$1}');
    result = result.replace(/(?<!\\)lim\s*_\s*([a-zA-Z])/g, '\\lim_{$1}');
    // Convert Unicode arrow → to \to inside math contexts
    result = result.replace(/→/g, '\\to ');
    // Convert ∞ to \infty
    result = result.replace(/∞/g, '\\infty ');
    // Wrap standalone \lim not inside $ with inline math if needed
    // Handle "lim" followed by subscript-like patterns without braces
    result = result.replace(/(?<!\\)lim([_{(])/g, '\\lim$1');

    // ── Step 2.7: Box for ㄱ,ㄴ,ㄷ composite answer items ──
    // Detect lines starting with ㄱ. / ㄴ. / ㄷ. / ㄹ. and wrap in styled box
    result = result.replace(
      /([ㄱㄴㄷㄹ])\.\s*([^\n]*)/g,
      '<span class="mr-boxed-item"><span class="mr-boxed-marker">$1.</span> $2</span>'
    );

    // ── Step 3: Replace ___BLANK___ with styled blank ──
    result = result.replace(
      /___BLANK___/g,
      '<span class="mr-blank" style="display:inline-block;border-bottom:2px solid hsl(217,91%,60%);min-width:80px;margin:0 4px;text-align:center;font-weight:bold;color:hsl(217,91%,60%)">______</span>'
    );

    // ── Step 3.5: Sub-question auto line-break ──
    if (autoSubBreak) {
      // Match patterns like (1), (2), ⑴, ⑵, or ① ② at start or after content
      // Insert a styled line break before each sub-question marker (except the first occurrence at the very start)
      result = result.replace(
        /(?<!^)\s*(\(([0-9]{1,2})\)|⑴|⑵|⑶|⑷|⑸|⑹|⑺|⑻|⑼|⑽)/g,
        '<div class="mr-sub-break"></div><span class="mr-sub-marker">$1</span>'
      );
      // Handle the first sub-question at the very beginning
      result = result.replace(
        /^(\(([0-9]{1,2})\)|⑴|⑵|⑶|⑷|⑸|⑹|⑺|⑻|⑼|⑽)/,
        '<span class="mr-sub-marker">$1</span>'
      );
    }

    // ── Step 4: KaTeX rendering ──
    // Display math: $$...$$
    result = result.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => {
      try {
        return katex.renderToString(math.trim(), { displayMode: true, throwOnError: false });
      } catch {
        return `$$${math}$$`;
      }
    });

    // Inline math: $...$
    result = result.replace(/(?<!\$)\$(?!\$)(.*?)(?<!\$)\$(?!\$)/g, (_, math) => {
      try {
        return katex.renderToString(math.trim(), { displayMode: false, throwOnError: false });
      } catch {
        return `$${math}$`;
      }
    });

    // \(...\) inline
    result = result.replace(/\\\((.*?)\\\)/g, (_, math) => {
      try {
        return katex.renderToString(math.trim(), { displayMode: false, throwOnError: false });
      } catch {
        return `\\(${math}\\)`;
      }
    });

    // \[...\] display
    result = result.replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => {
      try {
        return katex.renderToString(math.trim(), { displayMode: true, throwOnError: false });
      } catch {
        return `\\[${math}\\]`;
      }
    });

    return result;
  }, [text, autoSubBreak]);

  return (
    <span
      className="math-renderer"
      style={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}
      dangerouslySetInnerHTML={{ __html: rendered }}
    />
  );
}
