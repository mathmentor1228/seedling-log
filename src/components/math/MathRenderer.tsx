import { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface Props {
  text: string;
}

/**
 * Strips unwanted HTML tags from AI-generated text,
 * then renders LaTeX math expressions via KaTeX.
 */
export function MathRenderer({ text }: Props) {
  const rendered = useMemo(() => {
    if (!text) return '';

    let result = text;

    // ── Step 1: Decode HTML entities that AI sometimes produces ──
    result = result
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    // ── Step 2: Strip all HTML tags EXCEPT our own blank placeholder ──
    // Remove any <span ...>, </span>, <div>, <br>, <p>, etc.
    result = result.replace(/<\/?[a-zA-Z][^>]*>/g, '');

    // ── Step 3: Replace ___BLANK___ with styled blank ──
    result = result.replace(
      /___BLANK___/g,
      '<span style="display:inline-block;border-bottom:2px solid hsl(217,91%,60%);min-width:80px;margin:0 4px;text-align:center;font-weight:bold;color:hsl(217,91%,60%)">______</span>'
    );

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
  }, [text]);

  return (
    <span
      className="math-renderer"
      style={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}
      dangerouslySetInnerHTML={{ __html: rendered }}
    />
  );
}
