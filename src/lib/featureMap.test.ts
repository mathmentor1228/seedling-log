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
    const routes = appRoutePaths();
    const missing = FEATURE_MAP.map((f) => f.href).filter((h) => !routeExists(normalizeRoutePath(h), routes));
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
    const routes = appRoutePaths();
    const broken = navHrefs().filter((h) => !routeExists(h, routes));
    expect(broken).toEqual([]);
  });

  it('every sidebar href is documented in the feature map', () => {
    const documented = new Set(FEATURE_MAP.map((f) => f.href));
    const dynamic = ['/principal', '/teacher', '/assistant', '/dashboard'];
    const undocumented = navHrefs().filter((h) => !documented.has(h) && !dynamic.includes(h));
    expect(undocumented).toEqual([]);
  });
});

describe('assistant feature merge (ASSISTANT-MERGE-V1)', () => {
  const appSrc = readSrc('App.tsx');
  const layoutSrc = readSrc('components/layout/AppLayout.tsx');

  it('keeps /assistant-tasks route as a query-preserving compat redirect', () => {
    expect(appSrc).toMatch(/path="\/assistant-tasks" element=\{<CompatRedirect to="\/assistant-requests" \/>\}/);
    const redirectSrc = readSrc('components/CompatRedirect.tsx');
    expect(redirectSrc).toContain('location.search');
    expect(redirectSrc).toContain('location.hash');
  });

  it('representative screen is /assistant-requests and renders the role-split page', () => {
    expect(appSrc).toMatch(/path="\/assistant-requests" element=\{<AssistantPage \/>\}/);
    const page = readSrc('pages/AssistantPage.tsx');
    expect(page).toContain('AssistantDashboard');
    expect(page).toContain('TeacherAssistantRequestsView');
  });

  it('deprecated AssistantRequestsPage has zero references', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(e.name) && !full.endsWith('AssistantRequestsPage.tsx')) files.push(full);
      }
    };
    walk(path.resolve(__dirname, '..'));
    const refs = files.filter((f) => fs.readFileSync(f, 'utf8').includes('AssistantRequestsPage'));
    expect(refs).toEqual([]);
  });

  it('sidebar exposes only one assistant entry point per role', () => {
    expect([...layoutSrc.matchAll(/href: '\/assistant-tasks'/g)].length).toBe(0);
    const catalog = FEATURE_MAP.filter((f) => f.href.startsWith('/assistant-'));
    expect(catalog.map((f) => f.href)).toEqual(['/assistant-requests']);
    expect(catalog[0].compatHrefs).toContain('/assistant-tasks');
  });

  it('no duplicate hrefs within each role sidebar', () => {
    const [teacherPart, adminPart] = layoutSrc.split('// ADMIN-NAV-FLOW-V2');
    for (const part of [teacherPart, adminPart]) {
      const hrefs = [...part.matchAll(/href: '([^']+)'/g)].map((m) => m[1]);
      expect(new Set(hrefs).size).toBe(hrefs.length);
    }
  });
});

describe('archive group (ARCHIVE-FINALIZE-V1)', () => {
  const layoutSrc = readSrc('components/layout/AppLayout.tsx');

  it('archive groups are flagged and never auto-open', () => {
    expect([...layoutSrc.matchAll(/archive: true/g)].length).toBe(2);
    expect(layoutSrc).toContain('if (group.archive) return false;');
  });

  it('archive features only appear inside the archive groups', () => {
    const archiveHrefs = new Set(FEATURE_MAP.filter((f) => f.tier === 'archive').map((f) => f.href));
    // 보관 그룹은 각 역할 네비게이션의 마지막 그룹이다.
    const outside = layoutSrc
      .split("label: '기타/보관 기능'")
      .filter((_, i, arr) => i < arr.length - 1)
      .map((chunk, i, arr) => (i === arr.length - 1 ? chunk : chunk))
      .join('\n');
    const beforeArchive = layoutSrc.split("label: '기타/보관 기능'");
    const leaked: string[] = [];
    // 첫 조각(teacher 보관 그룹 이전) + 두 번째 조각에서 admin 보관 그룹 이전 부분만 검사
    const scanned = [beforeArchive[0], beforeArchive[1] ?? ''].join('\n');
    for (const href of archiveHrefs) {
      if (scanned.includes(`href: '${href}'`)) leaked.push(href);
    }
    expect(outside.length).toBeGreaterThan(0);
    expect(leaked).toEqual([]);
  });

  it('every archive feature declares a representative replacement', () => {
    const missing = FEATURE_MAP.filter((f) => f.tier === 'archive' && !f.supersededBy).map((f) => f.href);
    expect(missing).toEqual([]);
  });

  it('archive pages render the archive notice', () => {
    const pages = [
      'pages/VocabTestPage.tsx',
      'pages/VocabTestGeneratorPage.tsx',
      'pages/MathConceptPage.tsx',
      'pages/QuizLookupPage.tsx',
      'pages/QuizBulkUploadPage.tsx',
      'pages/StudySessionPage.tsx',
      'pages/QuickLessonEntryPage.tsx',
      'pages/PrivateChannelPage.tsx',
    ];
    for (const p of pages) expect(readSrc(p)).toContain('<ArchiveNotice');
  });
});
