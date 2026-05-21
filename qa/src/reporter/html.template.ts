/**
 * reporter/html.template.ts
 * Genera el HTML del informe QA.
 */

export interface ScanSummary {
  routeCount: number;
  pageCount: number;
  routesWithNoAuth: number;
}

export interface ApiTestSummary {
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
}

export interface PlaywrightSummary {
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
}

export interface PerformanceSummary {
  endpoint: string;
  avgLatencyMs: number;
  p95Ms: number;
  reqPerSecond: number;
}

export interface ReportData {
  generatedAt: string;
  scan?: ScanSummary;
  api?: ApiTestSummary;
  playwright?: PlaywrightSummary;
  performance?: PerformanceSummary[];
}

function badge(label: string, value: string | number, color: string): string {
  return `<span class="badge" style="background:${color};color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600;">${label}: ${value}</span>`;
}

function statusColor(passed: number, total: number): string {
  if (total === 0) return '#6b7280';
  const ratio = passed / total;
  if (ratio === 1) return '#16a34a';
  if (ratio >= 0.8) return '#d97706';
  return '#dc2626';
}

export function generateHtml(data: ReportData): string {
  const { generatedAt, scan, api, playwright, performance } = data;

  const scanSection = scan
    ? `
    <section>
      <h2>📡 Scanner de código</h2>
      <table>
        <tr><th>Rutas API detectadas</th><td>${scan.routeCount}</td></tr>
        <tr><th>Páginas UI detectadas</th><td>${scan.pageCount}</td></tr>
        <tr><th>Rutas sin autenticación declarada</th><td>${badge('', scan.routesWithNoAuth, scan.routesWithNoAuth > 0 ? '#d97706' : '#16a34a')}</td></tr>
      </table>
    </section>`
    : '';

  const apiSection = api
    ? `
    <section>
      <h2>🧪 Tests de API</h2>
      <p>
        ${badge('Total', api.totalTests, '#3b82f6')}
        ${badge('Pasaron', api.passed, '#16a34a')}
        ${badge('Fallaron', api.failed, api.failed > 0 ? '#dc2626' : '#6b7280')}
        ${badge('Omitidos', api.skipped, '#6b7280')}
      </p>
      <p>Duración: <strong>${(api.durationMs / 1000).toFixed(2)}s</strong></p>
      <div class="progress-bar-bg">
        <div class="progress-bar" style="width:${api.totalTests > 0 ? Math.round((api.passed / api.totalTests) * 100) : 0}%;background:${statusColor(api.passed, api.totalTests)}"></div>
      </div>
    </section>`
    : '';

  const e2eSection = playwright
    ? `
    <section>
      <h2>🎭 Tests E2E (Playwright)</h2>
      <p>
        ${badge('Total', playwright.totalTests, '#3b82f6')}
        ${badge('Pasaron', playwright.passed, '#16a34a')}
        ${badge('Fallaron', playwright.failed, playwright.failed > 0 ? '#dc2626' : '#6b7280')}
        ${badge('Omitidos', playwright.skipped, '#6b7280')}
      </p>
      <p>Duración: <strong>${(playwright.durationMs / 1000).toFixed(2)}s</strong></p>
    </section>`
    : '';

  const perfSection = performance && performance.length > 0
    ? `
    <section>
      <h2>⚡ Rendimiento</h2>
      <table>
        <thead><tr><th>Endpoint</th><th>Avg (ms)</th><th>p95 (ms)</th><th>req/s</th></tr></thead>
        <tbody>
          ${performance
            .map(
              (p) =>
                `<tr>
                  <td><code>${p.endpoint}</code></td>
                  <td>${p.avgLatencyMs}</td>
                  <td>${badge('', p.p95Ms, p.p95Ms > 500 ? '#d97706' : '#16a34a')}</td>
                  <td>${p.reqPerSecond}</td>
                </tr>`,
            )
            .join('\n')}
        </tbody>
      </table>
    </section>`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>4Nexa QA Report</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 24px; background: #f8fafc; color: #1e293b; }
    h1 { font-size: 1.8rem; margin-bottom: 4px; }
    .subtitle { color: #64748b; margin-bottom: 32px; font-size: 0.9rem; }
    section { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px 24px; margin-bottom: 20px; }
    h2 { font-size: 1.1rem; margin: 0 0 16px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #f1f5f9; font-size: 0.9rem; }
    th { font-weight: 600; width: 220px; color: #475569; }
    code { font-family: monospace; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 0.85rem; }
    .badge { display: inline-block; margin-right: 6px; }
    .progress-bar-bg { height: 8px; background: #e2e8f0; border-radius: 4px; margin-top: 10px; overflow: hidden; }
    .progress-bar { height: 100%; border-radius: 4px; transition: width 0.4s; }
    .footer { text-align: center; color: #94a3b8; font-size: 0.8rem; margin-top: 32px; }
  </style>
</head>
<body>
  <h1>📋 4Nexa QA Report</h1>
  <p class="subtitle">Generado el ${new Date(generatedAt).toLocaleString('es-ES')}</p>

  ${scanSection}
  ${apiSection}
  ${e2eSection}
  ${perfSection}

  <div class="footer">4nexa-mailgun · QA Autopilot</div>
</body>
</html>`;
}
