import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DELETION_REVIEW_CANDIDATES, FEATURE_MAP, featuresByTier, featuresForRole, normalizeRoutePath, signalTables } from './featureMap';

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


/** 역할별 네비게이션 소스 조각 (teacher / admin) */
function roleNavParts(): string[] {
  const src = readSrc('components/layout/AppLayout.tsx');
  const teacher = src.slice(src.indexOf('TEACHER-NAV-FLOW-V2'), src.indexOf('ADMIN-NAV-FLOW-V2'));
  const admin = src.slice(src.indexOf('ADMIN-NAV-FLOW-V2'));
  return [teacher, admin];
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
      expect(['core', 'asNeeded', 'archive', 'technical']).toContain(f.tier);
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
        else if (/\.(ts|tsx)$/.test(e.name) && !full.endsWith('AssistantRequestsPage.tsx') && !full.endsWith('featureMap.test.ts')) files.push(full);
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
    for (const part of roleNavParts()) {
      const hrefs = [...part.matchAll(/href: '([^']+)'/g)].map((m) => m[1]);
      expect(new Set(hrefs).size).toBe(hrefs.length);
    }
  });
});

describe('feature cleanup 2nd pass (FEATURE-MAP-V2)', () => {
  const layoutSrc = readSrc('components/layout/AppLayout.tsx');

  it('기술 전용 기능은 admin 에게만 보인다', () => {
    const technical = FEATURE_MAP.filter((f) => f.tier === 'technical');
    expect(technical.length).toBeGreaterThan(0);
    for (const f of technical) expect(f.roles).toEqual(['admin']);
  });

  it('admin 메뉴는 목적별 그룹으로 정리되어 있다', () => {
    const admin = layoutSrc.slice(layoutSrc.indexOf('ADMIN-NAV-FLOW-V2'));
    for (const g of ['오늘 운영', '학생·반', '수업·출결', '리포트·상담', '운영설정']) {
      expect(admin).toContain(`label: '${g}'`);
    }
  });

  it('핵심 동선(수업 마감·리포트 발송 확인)이 강사 메뉴 상단에 있다', () => {
    const teacher = layoutSrc.slice(layoutSrc.indexOf('TEACHER-NAV-FLOW-V2'), layoutSrc.indexOf('ADMIN-NAV-FLOW-V2'));
    expect(teacher).toContain("href: '/lessons/close'");
    expect(teacher).toContain("href: '/reports/status'");
  });

  it('실사용이 확인된 단어시험지 제작은 보관후보가 아니다', () => {
    const f = FEATURE_MAP.find((x) => x.href === '/vocab-generator');
    expect(f?.tier).toBe('asNeeded');
    expect(f?.hasEntryPoint).toBe(true);
  });

  it('보관후보는 접근 경로가 명시되어 있고 라우트가 유지된다', () => {
    const routes = appRoutePaths();
    for (const f of featuresByTier('admin', 'archive')) {
      expect(routeExists(normalizeRoutePath(f.href), routes)).toBe(true);
      expect(f.accessPath || f.supersededBy).toBeTruthy();
    }
  });

  it('삭제 검토 후보는 보고만 하고 접근 경로를 남긴다', () => {
    expect(DELETION_REVIEW_CANDIDATES.length).toBeGreaterThan(0);
    for (const c of DELETION_REVIEW_CANDIDATES) {
      expect(c.reason.length).toBeGreaterThan(0);
      expect(c.access.length).toBeGreaterThan(0);
    }
  });

  it('기존 라우트는 하나도 제거되지 않았다', () => {
    const appSrc = readSrc('App.tsx');
    for (const href of ['/vocab-test', '/math-concepts', '/quiz-lookup', '/quiz-bulk-upload', '/study-sessions', '/private-channel', '/lessons/quick', '/assistant-tasks']) {
      expect(appSrc).toContain(`path="${href}"`);
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
    const archiveHrefs = FEATURE_MAP.filter((f) => f.tier === 'archive').map((f) => f.href);
    const leaked: string[] = [];
    for (const part of roleNavParts()) {
      const beforeArchive = part.split("label: '기타/보관 기능'")[0];
      for (const href of archiveHrefs) {
        if (beforeArchive.includes(`href: '${href}'`)) leaked.push(href);
      }
    }
    expect(leaked).toEqual([]);
  });

  it('every archive feature declares a representative replacement', () => {
    const missing = FEATURE_MAP.filter((f) => f.tier === 'archive' && !f.supersededBy).map((f) => f.href);
    expect(missing).toEqual([]);
  });

  it('archive pages render the archive notice', () => {
    const pages = [
      'pages/VocabTestPage.tsx',
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
