import { useMemo } from 'react';
import katex from 'katex';
import DOMPurify from 'dompurify';
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

    // ── Step 1.5: Preserve <보기> tags before HTML stripping ──
    // Detect <보기> ... content and wrap in a styled box
    result = result.replace(
      /<보기>\s*([\s\S]*?)(?=(?:①|②|③|④|⑤|\n\n|$))/g,
      '<BOGI_START>$1<BOGI_END>'
    );
    // Also handle standalone <보기> marker
    result = result.replace(/<보기>/g, '<BOGI_MARKER>');

    // ── Step 2: Strip all HTML tags, attributes, and code artifacts ──
    result = result.replace(/\s*(class|style|data-[\w-]+)\s*=\s*"[^"]*"/gi, '');
    result = result.replace(/\s*(class|style|data-[\w-]+)\s*=\s*'[^']*'/gi, '');
    result = result.replace(/<\/?[a-zA-Z][^>]*>/g, '');
    result = result.replace(/\bmath-render(er)?\b/gi, '');

    // ── Step 2.3: Restore <보기> as styled box ──
    result = result.replace(
      /BOGI_START([\s\S]*?)BOGI_END/g,
      '<div class="mr-bogi-box"><span class="mr-bogi-label">&lt;보기&gt;</span><div class="mr-bogi-content">$1</div></div>'
    );
    result = result.replace(
      /BOGI_MARKER/g,
      '<span class="mr-bogi-label">&lt;보기&gt;</span>'
    );

    // ── Step 2.4: Handle circled letters ⓐⓑⓒⓓⓔⓕ as styled markers ──
    result = result.replace(
      /([ⓐⓑⓒⓓⓔⓕⓖⓗⓘⓙ])\s*/g,
      '<span class="mr-circled-letter">$1</span> '
    );

    // ── Step 2.5: Normalize recurring-dot notation ──
    result = result.replace(/([0-9])\u0307/g, '\\dot{$1}');

    // ── Step 2.55: Convert Unicode math symbols to LaTeX ──
    // √ followed by number/expression → \sqrt{...}
    // Handle √(expr)
    result = result.replace(/√\(([^)]+)\)/g, (_, inner) => `$\\sqrt{${inner}}$`);
    // Handle √number (e.g. √4, √81, √1.44, √12)
    result = result.replace(/√([0-9]+(?:\.[0-9]+)?)/g, (_, num) => `$\\sqrt{${num}}$`);
    // Handle −√ (negative sqrt)
    result = result.replace(/−√\(([^)]+)\)/g, (_, inner) => `$-\\sqrt{${inner}}$`);
    result = result.replace(/−√([0-9]+(?:\.[0-9]+)?)/g, (_, num) => `$-\\sqrt{${num}}$`);
    // Handle -√ (ASCII minus)
    result = result.replace(/-√\(([^)]+)\)/g, (_, inner) => `$-\\sqrt{${inner}}$`);
    result = result.replace(/-√([0-9]+(?:\.[0-9]+)?)/g, (_, num) => `$-\\sqrt{${num}}$`);

    // Superscript ² ³ → ^2 ^3 (only outside $ delimiters, near numbers/parens)
    result = result.replace(/\)²/g, ')^{2}');
    result = result.replace(/\)³/g, ')^{3}');
    result = result.replace(/([0-9])²/g, '$1^{2}');
    result = result.replace(/([0-9])³/g, '$1^{3}');

    // Unicode × → \times
    result = result.replace(/×/g, '\\times ');
    // Unicode ÷ → \div
    result = result.replace(/÷/g, '\\div ');
    // Unicode ± → \pm
    result = result.replace(/±/g, '\\pm ');
    // Unicode ≤ ≥ ≠ → LaTeX
    result = result.replace(/≤/g, '\\leq ');
    result = result.replace(/≥/g, '\\geq ');
    result = result.replace(/≠/g, '\\neq ');

    // ── Step 2.6: Normalize lim notation ──
    result = result.replace(/(?<!\\)lim\s*_\s*\{([^}]+)\}/g, '\\lim_{$1}');
    result = result.replace(/(?<!\\)lim\s*_\s*([a-zA-Z])/g, '\\lim_{$1}');
    result = result.replace(/→/g, '\\to ');
    result = result.replace(/∞/g, '\\infty ');
    result = result.replace(/(?<!\\)lim([_{(])/g, '\\lim$1');

    // ── Step 2.7: Box for ㄱ,ㄴ,ㄷ,ㄹ,ㅁ,ㅂ composite answer items ──
    result = result.replace(
      /([ㄱㄴㄷㄹㅁㅂ])\.\s*([^\n]*)/g,
      '<span class="mr-boxed-item"><span class="mr-boxed-marker">$1.</span> $2</span>'
    );

    // ── Step 2.8: Render markdown tables ──
    result = result.replace(
      /(?:^|\n)((?:\|[^\n]+\|\s*\n){2,})/g,
      (_, tableBlock: string) => {
        const rows = tableBlock.trim().split('\n').filter(r => r.trim());
        // Skip separator rows (|---|---|)
        const dataRows = rows.filter(r => !/^\|[\s\-:|]+\|$/.test(r.trim()));
        if (dataRows.length === 0) return tableBlock;
        const html = dataRows.map((row, ri) => {
          const cells = row.split('|').filter((c, i, a) => i > 0 && i < a.length - 1);
          const tag = ri === 0 ? 'th' : 'td';
          return `<tr>${cells.map(c => `<${tag} class="mr-table-cell">${c.trim()}</${tag}>`).join('')}</tr>`;
        }).join('');
        return `<table class="mr-table"><tbody>${html}</tbody></table>`;
      }
    );

    // ── Step 3: Replace ___BLANK___ with styled blank ──
    result = result.replace(
      /___BLANK___/g,
      '<span class="mr-blank" style="display:inline-block;border-bottom:2px solid hsl(217,91%,60%);min-width:80px;margin:0 4px;text-align:center;font-weight:bold;color:hsl(217,91%,60%)">______</span>'
    );

    // ── Step 3.5: Sub-question auto line-break ──
    if (autoSubBreak) {
      result = result.replace(
        /(?<!^)\s*(\(([0-9]{1,2})\)|⑴|⑵|⑶|⑷|⑸|⑹|⑺|⑻|⑼|⑽)/g,
        '<div class="mr-sub-break"></div><span class="mr-sub-marker">$1</span>'
      );
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

    // Inline math: $...$ — improved to avoid double-rendering from step 2.55
    result = result.replace(/(?<!\$)\$(?!\$)((?:[^$]|\\\$)*?)(?<!\$)\$(?!\$)/g, (_, math) => {
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

    // ── Step 5: Sanitize final HTML to prevent XSS ──
    return DOMPurify.sanitize(result, {
      ADD_TAGS: ['math', 'semantics', 'annotation', 'mrow', 'mi', 'mn', 'mo', 'ms', 'mtext', 'msup', 'msub', 'mfrac', 'msqrt', 'mroot', 'munder', 'mover', 'munderover'],
      ADD_ATTR: ['class', 'style', 'aria-hidden', 'xmlns'],
    });
  }, [text, autoSubBreak]);

  return (
    <span
      className="math-renderer"
      style={{ overflowWrap: 'break-word', wordBreak: 'break-word', fontSize: 'inherit' }}
      dangerouslySetInnerHTML={{ __html: rendered }}
    />
  );
}
