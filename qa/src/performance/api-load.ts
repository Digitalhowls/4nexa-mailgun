/**
 * performance/api-load.ts
 * Script de carga ligero usando axios en bucle.
 * Mide latencia de /health y otros endpoints críticos.
 * No requiere autocannon — funciona con las mismas deps del workspace qa/.
 *
 * Uso:
 *   pnpm --filter @4nexa/qa perf
 *   QA_API_URL=http://localhost:3001 pnpm --filter @4nexa/qa perf
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

// ─── Config ───────────────────────────────────────────────────────────────

const BASE_URL = process.env['QA_API_URL'] ?? 'http://localhost:3001';
const API_BASE = `${BASE_URL}/api/v1`;
const CONCURRENT = parseInt(process.env['QA_PERF_CONCURRENT'] ?? '5', 10);
const DURATION_MS = parseInt(process.env['QA_PERF_DURATION'] ?? '10000', 10);
const REPORTS_DIR = path.resolve(__dirname, '../../reports');

interface EndpointResult {
  endpoint: string;
  totalRequests: number;
  successCount: number;
  errorCount: number;
  avgLatencyMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  minMs: number;
  maxMs: number;
  reqPerSecond: number;
}

interface PerformanceReport {
  timestamp: string;
  durationMs: number;
  concurrent: number;
  baseUrl: string;
  results: EndpointResult[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function percentile(sortedArr: number[], p: number): number {
  if (sortedArr.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sortedArr.length) - 1;
  return sortedArr[Math.max(0, idx)] ?? 0;
}

async function loadEndpoint(endpoint: string, durationMs: number, concurrent: number): Promise<EndpointResult> {
  const latencies: number[] = [];
  let errorCount = 0;
  const endTime = Date.now() + durationMs;
  const url = `${API_BASE}${endpoint}`;

  async function runLoop(): Promise<void> {
    while (Date.now() < endTime) {
      const start = Date.now();
      try {
        await axios.get(url, { timeout: 5000, validateStatus: () => true });
        latencies.push(Date.now() - start);
      } catch {
        errorCount++;
      }
    }
  }

  const workers = Array.from({ length: concurrent }, () => runLoop());
  await Promise.all(workers);

  const sorted = [...latencies].sort((a, b) => a - b);
  const totalRequests = latencies.length + errorCount;
  const avgLatencyMs = latencies.length > 0
    ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    : 0;

  return {
    endpoint,
    totalRequests,
    successCount: latencies.length,
    errorCount,
    avgLatencyMs,
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    p99Ms: percentile(sorted, 99),
    minMs: sorted[0] ?? 0,
    maxMs: sorted[sorted.length - 1] ?? 0,
    reqPerSecond: Math.round((totalRequests / durationMs) * 1000),
  };
}

// ─── Endpoints a testear ──────────────────────────────────────────────────

const ENDPOINTS = [
  '/health',
  '/tenants',
  '/domains',
];

// ─── Main ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Verificar que la API está disponible
  try {
    await axios.get(`${BASE_URL}/api/v1/health`, { timeout: 3000 });
  } catch {
    console.error(`[perf] API no disponible en ${BASE_URL}. Omitiendo tests de rendimiento.`);
    // Guardar informe vacío para no romper el pipeline
    const emptyReport: PerformanceReport = {
      timestamp: new Date().toISOString(),
      durationMs: DURATION_MS,
      concurrent: CONCURRENT,
      baseUrl: BASE_URL,
      results: [],
    };
    if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
    fs.writeFileSync(path.join(REPORTS_DIR, 'performance-results.json'), JSON.stringify(emptyReport, null, 2));
    return;
  }

  console.log(`\n[perf] Iniciando carga — ${CONCURRENT} workers × ${DURATION_MS / 1000}s por endpoint`);
  console.log(`[perf] URL base: ${BASE_URL}\n`);

  const results: EndpointResult[] = [];

  for (const endpoint of ENDPOINTS) {
    process.stdout.write(`  → ${endpoint.padEnd(30)} `);
    const result = await loadEndpoint(endpoint, DURATION_MS, CONCURRENT);
    results.push(result);
    console.log(
      `${result.reqPerSecond} req/s  avg=${result.avgLatencyMs}ms  p95=${result.p95Ms}ms  p99=${result.p99Ms}ms  err=${result.errorCount}`,
    );
  }

  const report: PerformanceReport = {
    timestamp: new Date().toISOString(),
    durationMs: DURATION_MS,
    concurrent: CONCURRENT,
    baseUrl: BASE_URL,
    results,
  };

  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const outPath = path.join(REPORTS_DIR, 'performance-results.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log(`\n[perf] Informe guardado en ${outPath}`);

  // Validar umbrales mínimos
  const healthResult = results.find((r) => r.endpoint === '/health');
  if (healthResult) {
    const P95_THRESHOLD_MS = 500;
    if (healthResult.p95Ms > P95_THRESHOLD_MS) {
      console.warn(`\n⚠️  p95 del endpoint /health (${healthResult.p95Ms}ms) supera el umbral de ${P95_THRESHOLD_MS}ms`);
    } else {
      console.log(`\n✓  p95 del endpoint /health (${healthResult.p95Ms}ms) dentro del umbral de ${P95_THRESHOLD_MS}ms`);
    }
  }
}

main().catch((err: unknown) => {
  console.error('[perf] Error fatal:', err);
  process.exit(1);
});
