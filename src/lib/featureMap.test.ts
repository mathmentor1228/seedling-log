import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { FEATURE_MAP, featuresForRole, normalizeRoutePath, signalTables } from './featureMap';

const readSrc = (p: string) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

function appRoutePaths(): string[] {
  const src = readSrc('App.tsx');
  return [...src.matchAll(/path="([^"]+)"/g)].map((m) => normalizeRoutePath(m[1]));
}

function navHrefs(): string[] {
  const src = readSrc('components/layout/AppLayout.tsx');
  return [...src.matchAll(/href:\s*'([^']+)'/g)].map((m) => m[1]);
}

/** 라우트 패턴(:param 포함)과 실제 경로 일치 여부 */
function routeExists(href: string, patterns: string[]): boolean {
  const parts = href.split('/');
  return patterns.some((p) => {
    const pp = p.split('/');
    if (pp.length !== parts.length) return false;
    return pp.every((seg, i) => seg === ':param' || seg === parts[i]);
  });
}

describe('feature map catalog', () => {
  it('has unique hrefs', () => {
    const hrefs = FEATURE_MAP.map((f) => f.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('every feature has a label, description, tier and role', () => {
    for (const f of FEATURE_MAP) {
      expect(f.label.length).toBeGreaterThan(0);
      expect(f.description.length).toBeGreaterThan(0);
      expect(['core', 'asNeeded', 'archive']).toContain(f.tier);
      expect(f.roles.length).toBeGreaterThan(0);
    }
  });

  it('every feature route exists in App.tsx', () => {
    const routes = new Set(appRoutePaths());
    const missing = FEATURE_MAP.map((f) => normalizeRoutePath(f.href)).filter((r) => !routes.has(r));
    expect(missing).toEqual([]);
  });

  it('signal tables are de-duplicated', () => {
    const tables = signalTables().map((s) => s.table);
    expect(new Set(tables).size).toBe(tables.length);
  });

  it('admin and teacher both keep core daily features', () => {
    expect(featuresForRole('admin').some((f) => f.href === '/lessons' && f.tier === 'core')).toBe(true);
    expect(featuresForRole('teacher').some((f) => f.href === '/lessons/close' && f.tier === 'core')).toBe(true);
  });
});

describe('sidebar ↔ route mapping', () => {
  it('every sidebar href resolves to a real route', () => {
    const routes = new Set(appRoutePaths());
    const broken = navHrefs().filter((h) => !routes.has(normalizeRoutePath(h)) && h !== '/dashboard');
    expect(broken).toEqual([]);
  });

  it('every sidebar href is documented in the feature map', () => {
    const documented = new Set(FEATURE_MAP.map((f) => f.href));
    const dynamic = ['/principal', '/teacher', '/assistant', '/dashboard'];
    const undocumented = navHrefs().filter((h) => !documented.has(h) && !dynamic.includes(h));
    expect(undocumented).toEqual([]);
  });
});
