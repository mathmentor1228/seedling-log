import { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface Props {
  text: string;
}

/**
 * Renders text with inline LaTeX math expressions.
 * Supports $...$ and \(...\) for inline math, and $$...$$ for display math.
 */
export function MathRenderer({ text }: Props) {
  const rendered = useMemo(() => {
    if (!text) return '';

    // Split on $$...$$, $...$ patterns
    // Process display math ($$...$$) first, then inline ($...$)
    let result = text;

    // Replace ___BLANK___ with styled blank
    result = result.replace(/___BLANK___/g, '<span class="inline-block border-b-2 border-primary min-w-[80px] mx-1 text-center font-bold text-primary">______</span>');

    // Display math: $$...$$
    result = result.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => {
      try {
        return katex.renderToString(math.trim(), { displayMode: true, throwOnError: false });
      } catch {
        return `$$${math}$$`;
      }
    });

    // Inline math: $...$  (not preceded or followed by $)
    result = result.replace(/(?<!\$)\$(?!\$)(.*?)(?<!\$)\$(?!\$)/g, (_, math) => {
      try {
        return katex.renderToString(math.trim(), { displayMode: false, throwOnError: false });
      } catch {
        return `$${math}$`;
      }
    });

    // Also handle \(...\) for inline
    result = result.replace(/\\\((.*?)\\\)/g, (_, math) => {
      try {
        return katex.renderToString(math.trim(), { displayMode: false, throwOnError: false });
      } catch {
        return `\\(${math}\\)`;
      }
    });

    // Handle \[...\] for display
    result = result.replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => {
      try {
        return katex.renderToString(math.trim(), { displayMode: true, throwOnError: false });
      } catch {
        return `\\[${math}\\]`;
      }
    });

    return result;
  }, [text]);

  return <span className="math-renderer" style={{ overflowWrap: 'break-word', wordBreak: 'break-word' }} dangerouslySetInnerHTML={{ __html: rendered }} />;
}
