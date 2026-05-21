/**
 * reporter/index.ts
 * Lee los resultados de scan, API tests, Playwright y performance
 * y genera el informe HTML unificado.
 *
 * Uso:
 *   pnpm --filter @4nexa/qa report
 */

import * as fs from 'fs';
import * as path from 'path';
import { generateHtml, ReportData, ApiTestSummary, PlaywrightSummary, PerformanceSummary } from './html.template';

const REPORTS_DIR = path.resolve(__dirname, '../../reports');

// ─── Lectura de resultados Jest ────────────────────────────────────────────

interface JestResult {
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  testResults: Array<{ testResults: Array<{ duration?: number }> }>;
}

function readJestResult(file: string): ApiTestSummary | undefined {
  const fullPath = path.join(REPORTS_DIR, file);
  if (!fs.existsSync(fullPath)) return undefined;
  try {
    const raw = JSON.parse(fs.readFileSync(fullPath, 'utf-8')) as JestResult;
    const durationMs = raw.testResults
      ?.flatMap((suite) => suite.testResults)
      .reduce((acc: number, t) => acc + (t.duration ?? 0), 0) ?? 0;
    return {
      totalTests: raw.numTotalTests,
      passed: raw.numPassedTests,
      failed: raw.numFailedTests,
      skipped: raw.numPendingTests,
      durationMs,
    };
  } catch {
    return undefined;
  }
}

// ─── Lectura de resultados Playwright ─────────────────────────────────────

interface PlaywrightResult {
  stats?: {
    expected?: number;
    unexpected?: number;
    skipped?: number;
    duration?: number;
  };
  suites?: unknown[];
}

function readPlaywrightResult(): PlaywrightSummary | undefined {
  const fullPath = path.join(REPORTS_DIR, 'playwright-results.json');
  if (!fs.existsSync(fullPath)) return undefined;
  try {
    const raw = JSON.parse(fs.readFileSync(fullPath, 'utf-8')) as PlaywrightResult;
    const stats = raw.stats ?? {};
    return {
      totalTests: (stats.expected ?? 0) + (stats.unexpected ?? 0) + (stats.skipped ?? 0),
      passed: stats.expected ?? 0,
      failed: stats.unexpected ?? 0,
      skipped: stats.skipped ?? 0,
      durationMs: stats.duration ?? 0,
    };
  } catch {
    return undefined;
  }
}

// ─── Lectura de scan ──────────────────────────────────────────────────────

interface ScanFile {
  api?: { routes?: unknown[] };
  ui?: { pages?: unknown[] };
}

function readScanResult() {
  const fullPath = path.join(REPORTS_DIR, 'scan-results.json');
  if (!fs.existsSync(fullPath)) return undefined;
  try {
    const raw = JSON.parse(fs.readFileSync(fullPath, 'utf-8')) as ScanFile;
    const routes = raw.api?.routes ?? [];
    const pages = raw.ui?.pages ?? [];
    return {
      routeCount: routes.length,
      pageCount: pages.length,
      routesWithNoAuth: (routes as Array<{ roles?: string[] }>).filter((r) => !r.roles || r.roles.length === 0).length,
    };
  } catch {
    return undefined;
  }
}

// ─── Lectura de performance ────────────────────────────────────────────────

interface PerfFile {
  results?: PerformanceSummary[];
}

function readPerfResult(): PerformanceSummary[] | undefined {
  const fullPath = path.join(REPORTS_DIR, 'performance-results.json');
  if (!fs.existsSync(fullPath)) return undefined;
  try {
    const raw = JSON.parse(fs.readFileSync(fullPath, 'utf-8')) as PerfFile;
    return raw.results?.map((r) => ({
      endpoint: r.endpoint,
      avgLatencyMs: r.avgLatencyMs,
      p95Ms: r.p95Ms,
      reqPerSecond: r.reqPerSecond,
    }));
  } catch {
    return undefined;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────

function main(): void {
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }

  const data: ReportData = {
    generatedAt: new Date().toISOString(),
    scan: readScanResult(),
    api: readJestResult('api-results.json'),
    playwright: readPlaywrightResult(),
    performance: readPerfResult(),
  };

  const html = generateHtml(data);
  const outPath = path.join(REPORTS_DIR, 'qa-report.html');
  fs.writeFileSync(outPath, html, 'utf-8');

  console.log(`\n[reporter] Informe generado: ${outPath}`);

  // Resumen en consola
  if (data.api) {
    const { passed, totalTests, failed } = data.api;
    console.log(`[reporter] API tests:     ${passed}/${totalTests} pasaron${failed > 0 ? ` (${failed} fallaron)` : ''}`);
  }
  if (data.playwright) {
    const { passed, totalTests, failed } = data.playwright;
    console.log(`[reporter] E2E Playwright: ${passed}/${totalTests} pasaron${failed > 0 ? ` (${failed} fallaron)` : ''}`);
  }
}

main();
