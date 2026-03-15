import { useMemo } from 'react';

interface Props {
  /** e.g. "y = 2x + 1", "y = x^2 - 3", "y = 2^x" */
  expression: string;
  width?: number;
  height?: number;
  xRange?: [number, number];
  yRange?: [number, number];
}

/**
 * SVG coordinate-plane graph renderer.
 * Parses simple math expressions and draws them on a grid.
 */
export function MathGraph({
  expression,
  width = 240,
  height = 240,
  xRange = [-5, 5],
  yRange = [-5, 5],
}: Props) {
  const padding = 30;
  const plotW = width - padding * 2;
  const plotH = height - padding * 2;

  const toSvgX = (x: number) => padding + ((x - xRange[0]) / (xRange[1] - xRange[0])) * plotW;
  const toSvgY = (y: number) => padding + ((yRange[1] - y) / (yRange[1] - yRange[0])) * plotH;

  const evalExpr = useMemo(() => {
    try {
      // Extract RHS of "y = ..."
      let rhs = expression.replace(/\s/g, '');
      const eqIdx = rhs.indexOf('=');
      if (eqIdx !== -1) rhs = rhs.slice(eqIdx + 1);

      // Convert math notation to JS
      rhs = rhs
        .replace(/\^/g, '**')
        .replace(/(\d)(x)/gi, '$1*$2')
        .replace(/\(x\)\*\*/g, '(x)**')
        .replace(/sqrt\(/gi, 'Math.sqrt(')
        .replace(/abs\(/gi, 'Math.abs(')
        .replace(/log\(/gi, 'Math.log(')
        .replace(/ln\(/gi, 'Math.log(')
        .replace(/sin\(/gi, 'Math.sin(')
        .replace(/cos\(/gi, 'Math.cos(')
        .replace(/tan\(/gi, 'Math.tan(')
        .replace(/pi/gi, 'Math.PI')
        .replace(/e\*\*/g, 'Math.E**');

      // eslint-disable-next-line no-new-func
      return new Function('x', `try { return ${rhs}; } catch { return NaN; }`) as (x: number) => number;
    } catch {
      return null;
    }
  }, [expression]);

  const pathData = useMemo(() => {
    if (!evalExpr) return '';
    const steps = 200;
    const dx = (xRange[1] - xRange[0]) / steps;
    const parts: string[] = [];
    let drawing = false;

    for (let i = 0; i <= steps; i++) {
      const x = xRange[0] + i * dx;
      const y = evalExpr(x);
      if (!isFinite(y) || y < yRange[0] - 2 || y > yRange[1] + 2) {
        drawing = false;
        continue;
      }
      const sx = toSvgX(x);
      const sy = toSvgY(y);
      if (!drawing) {
        parts.push(`M${sx.toFixed(1)},${sy.toFixed(1)}`);
        drawing = true;
      } else {
        parts.push(`L${sx.toFixed(1)},${sy.toFixed(1)}`);
      }
    }
    return parts.join(' ');
  }, [evalExpr, xRange, yRange]);

  // Grid lines
  const gridLines: JSX.Element[] = [];
  for (let x = Math.ceil(xRange[0]); x <= Math.floor(xRange[1]); x++) {
    const sx = toSvgX(x);
    gridLines.push(
      <line key={`gx${x}`} x1={sx} y1={padding} x2={sx} y2={padding + plotH}
        stroke="hsl(var(--border))" strokeWidth={x === 0 ? 1.5 : 0.5} strokeDasharray={x === 0 ? '' : '2,2'} />
    );
    if (x !== 0) {
      gridLines.push(
        <text key={`lx${x}`} x={sx} y={toSvgY(0) + 14} textAnchor="middle" fontSize="9" fill="hsl(var(--muted-foreground))">{x}</text>
      );
    }
  }
  for (let y = Math.ceil(yRange[0]); y <= Math.floor(yRange[1]); y++) {
    const sy = toSvgY(y);
    gridLines.push(
      <line key={`gy${y}`} x1={padding} y1={sy} x2={padding + plotW} y2={sy}
        stroke="hsl(var(--border))" strokeWidth={y === 0 ? 1.5 : 0.5} strokeDasharray={y === 0 ? '' : '2,2'} />
    );
    if (y !== 0) {
      gridLines.push(
        <text key={`ly${y}`} x={toSvgX(0) - 6} y={sy + 3} textAnchor="end" fontSize="9" fill="hsl(var(--muted-foreground))">{y}</text>
      );
    }
  }

  if (!evalExpr) {
    return (
      <div className="text-xs text-muted-foreground italic p-2 border rounded" style={{ width }}>
        그래프를 그릴 수 없는 수식입니다.
      </div>
    );
  }

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="math-graph-svg border rounded bg-background">
      {gridLines}
      {/* Axes */}
      <line x1={padding} y1={toSvgY(0)} x2={padding + plotW} y2={toSvgY(0)} stroke="hsl(var(--foreground))" strokeWidth="1.5" />
      <line x1={toSvgX(0)} y1={padding} x2={toSvgX(0)} y2={padding + plotH} stroke="hsl(var(--foreground))" strokeWidth="1.5" />
      {/* Arrow heads */}
      <text x={padding + plotW + 4} y={toSvgY(0) + 4} fontSize="10" fill="hsl(var(--foreground))">x</text>
      <text x={toSvgX(0) + 4} y={padding - 4} fontSize="10" fill="hsl(var(--foreground))">y</text>
      <text x={toSvgX(0) - 8} y={toSvgY(0) + 12} fontSize="9" fill="hsl(var(--muted-foreground))">O</text>
      {/* Curve */}
      {pathData && (
        <path d={pathData} fill="none" stroke="hsl(217, 91%, 60%)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      )}
      {/* Expression label */}
      <text x={padding + 4} y={padding + 14} fontSize="10" fill="hsl(217, 91%, 60%)" fontWeight="bold">
        {expression}
      </text>
    </svg>
  );
}
