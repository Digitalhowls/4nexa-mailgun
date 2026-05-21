#!/usr/bin/env tsx
/**
 * scanner/index.ts
 * Punto de entrada del escáner. Lee el monorepo y genera reports/scan-results.json.
 */
import * as path from 'path';
import * as fs from 'fs';
import { scanApiRoutes } from './api-scanner';
import { scanUi } from './ui-scanner';

const ROOT = path.resolve(__dirname, '../../..');
const REPORTS_DIR = path.resolve(__dirname, '../../reports');

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function printTable(label: string, rows: Array<[string, string | number]>): void {
  const maxKey = Math.max(...rows.map(([k]) => k.length));
  console.log(`\n  ┌─ ${label}`);
  for (const [k, v] of rows) {
    console.log(`  │  ${k.padEnd(maxKey)}  ${v}`);
  }
  console.log('  └' + '─'.repeat(maxKey + 6));
}

async function main(): Promise<void> {
  console.log('\n🔍  QA Autopilot — Scanner\n');

  // ─── Scan API ────────────────────────────────────────────────────────────
  const controllerDir = path.join(ROOT, 'services', 'control-plane-api', 'src');
  console.log(`  Escaneando controladores en: ${controllerDir}`);
  const apiResult = scanApiRoutes(controllerDir);

  printTable('Backend — Control Plane API', [
    ['Controladores encontrados', apiResult.totalControllers],
    ['Rutas totales', apiResult.totalRoutes],
    ...Object.entries(apiResult.routesByMethod).map(([m, n]) => [`  ${m}`, n] as [string, number]),
  ]);

  // Listar primeras 15 rutas
  console.log('\n  Rutas detectadas (primeras 15):');
  apiResult.controllers
    .flatMap((c) => c.routes)
    .slice(0, 15)
    .forEach((r) => {
      const roles = r.roles.length ? `  [${r.roles.join(', ')}]` : '';
      console.log(`    ${r.method.padEnd(7)} ${r.fullPath}${roles}`);
    });
  if (apiResult.totalRoutes > 15) {
    console.log(`    ... y ${apiResult.totalRoutes - 15} más`);
  }

  // ─── Scan UI ─────────────────────────────────────────────────────────────
  const appsDir = path.join(ROOT, 'apps');
  console.log(`\n  Escaneando apps en: ${appsDir}`);
  const uiResult = scanUi(appsDir);

  printTable('Frontend — Apps', [
    ['Páginas encontradas', uiResult.totalPages],
    ['Componentes encontrados', uiResult.totalComponents],
    ['Páginas con formularios', uiResult.summary.pagesWithForms],
    ['Páginas con autenticación', uiResult.summary.pagesWithAuth],
    ['Páginas con mutaciones', uiResult.summary.pagesWithMutations],
  ]);

  console.log('\n  Páginas detectadas:');
  for (const p of uiResult.pages) {
    const flags = [
      p.hasForm ? 'form' : '',
      p.isAuthProtected ? 'auth' : '',
      p.hasMutation ? 'mut' : '',
    ]
      .filter(Boolean)
      .join(', ');
    console.log(`    [${p.app.padEnd(16)}]  ${p.routePath.padEnd(32)}  ${flags ? `(${flags})` : ''}`);
  }

  // ─── Guardar resultados ───────────────────────────────────────────────────
  ensureDir(REPORTS_DIR);

  const scanResult = {
    scannedAt: new Date().toISOString(),
    api: apiResult,
    ui: uiResult,
  };

  const outFile = path.join(REPORTS_DIR, 'scan-results.json');
  fs.writeFileSync(outFile, JSON.stringify(scanResult, null, 2), 'utf8');
  console.log(`\n  ✅  Resultados guardados en: ${outFile}\n`);
}

main().catch((err) => {
  console.error('  ❌  Error en el scanner:', err);
  process.exit(1);
});
