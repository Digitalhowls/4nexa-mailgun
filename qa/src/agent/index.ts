/**
 * agent/index.ts
 * CLI orquestador del QA Autopilot.
 * Ejecuta todos los pasos en secuencia y genera el informe final.
 *
 * Uso:
 *   pnpm --filter @4nexa/qa all          # interactivo
 *   pnpm --filter @4nexa/qa all:ci       # modo CI (--ci flag)
 */

import { execSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// ─── Config ───────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '../..');
const REPORTS_DIR = path.join(ROOT, 'reports');
const IS_CI = process.argv.includes('--ci') || process.env['CI'] === 'true';

// Colores ANSI (desactivados en CI si no hay soporte)
const CLR = {
  reset: '\x1b[0m',
  bold:  '\x1b[1m',
  green: '\x1b[32m',
  red:   '\x1b[31m',
  yellow: '\x1b[33m',
  cyan:  '\x1b[36m',
  gray:  '\x1b[90m',
};

function c(color: keyof typeof CLR, text: string): string {
  if (IS_CI && !process.stdout.isTTY) return text;
  return `${CLR[color]}${text}${CLR.reset}`;
}

// ─── Tipos ────────────────────────────────────────────────────────────────

interface StepResult {
  name: string;
  success: boolean;
  durationMs: number;
  output?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function ensureReportsDir(): void {
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }
}

function runStep(name: string, cmd: string, options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): StepResult {
  console.log(`\n${c('bold', `▶ ${name}`)}`);
  console.log(c('gray', `  $ ${cmd}`));

  const start = Date.now();
  const result = spawnSync(cmd, {
    shell: true,
    cwd: options.cwd ?? ROOT,
    env: { ...process.env, ...options.env },
    stdio: IS_CI ? 'inherit' : 'inherit',
  });
  const durationMs = Date.now() - start;
  const success = result.status === 0;

  if (success) {
    console.log(c('green', `  ✓ Completado en ${(durationMs / 1000).toFixed(1)}s`));
  } else {
    console.log(c('red', `  ✗ Falló (código ${result.status ?? '?'}) en ${(durationMs / 1000).toFixed(1)}s`));
  }

  return { name, success, durationMs };
}

// ─── Pasos del pipeline ───────────────────────────────────────────────────

function buildPipelineSteps(): Array<{ name: string; cmd: string; optional?: boolean }> {
  return [
    {
      name: 'Scanner estático (API + UI)',
      cmd: 'npx tsx src/scanner/index.ts',
      optional: true, // No falla el pipeline si el scan tiene errores
    },
    {
      name: 'Tests de API (Jest)',
      cmd: `npx jest --config jest.api.config.ts --passWithNoTests --forceExit --json --outputFile=${path.join(REPORTS_DIR, 'api-results.json')}`,
    },
    {
      name: 'Tests de seguridad (Jest)',
      cmd: `npx jest --config jest.security.config.ts --passWithNoTests --forceExit --json --outputFile=${path.join(REPORTS_DIR, 'security-results.json')}`,
    },
    {
      name: 'Tests E2E (Playwright)',
      cmd: `npx playwright test --reporter=json,html,list`,
      optional: IS_CI, // En CI puede no haber browser; marcamos como opcional
    },
    {
      name: 'Tests de rendimiento',
      cmd: 'npx tsx src/performance/api-load.ts',
      optional: true,
    },
    {
      name: 'Generación de informe HTML',
      cmd: 'npx tsx src/reporter/index.ts',
    },
  ];
}

// ─── Resumen final ────────────────────────────────────────────────────────

function printSummary(results: StepResult[]): void {
  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const totalMs = results.reduce((a, r) => a + r.durationMs, 0);

  console.log(`\n${'─'.repeat(55)}`);
  console.log(c('bold', '  Resumen del QA Autopilot'));
  console.log('─'.repeat(55));

  for (const r of results) {
    const icon = r.success ? c('green', '✓') : c('red', '✗');
    const dur  = c('gray', `(${(r.durationMs / 1000).toFixed(1)}s)`);
    console.log(`  ${icon} ${r.name.padEnd(40)} ${dur}`);
  }

  console.log('─'.repeat(55));
  console.log(`  ${c('bold', 'Total:')} ${c('green', `${passed} completados`)}  ${failed > 0 ? c('red', `${failed} fallaron`) : c('gray', '0 fallaron')}  ${c('gray', `${(totalMs / 1000).toFixed(1)}s`)}`);

  const reportPath = path.join(REPORTS_DIR, 'qa-report.html');
  if (fs.existsSync(reportPath)) {
    console.log(`\n  ${c('cyan', 'Informe HTML:')} ${reportPath}`);
    if (!IS_CI) {
      try {
        execSync(`open "${reportPath}"`, { stdio: 'ignore' });
      } catch { /* No hay open en Linux/CI */ }
    }
  }
  console.log();
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(c('bold', '\n  4Nexa — QA Autopilot'));
  console.log(c('gray', `  Modo: ${IS_CI ? 'CI' : 'local'}  ·  ${new Date().toLocaleString('es-ES')}\n`));

  ensureReportsDir();

  const steps = buildPipelineSteps();
  const results: StepResult[] = [];
  let hasCriticalFailure = false;

  for (const step of steps) {
    const result = runStep(step.name, step.cmd, { cwd: ROOT });
    results.push(result);

    if (!result.success && !step.optional) {
      hasCriticalFailure = true;
      if (IS_CI) {
        // En CI detenemos el pipeline ante el primer fallo crítico
        console.log(c('red', '\n  Pipeline detenido por fallo crítico.\n'));
        break;
      }
    }
  }

  printSummary(results);

  process.exit(hasCriticalFailure ? 1 : 0);
}

main().catch((err: unknown) => {
  console.error(c('red', '\n[agent] Error fatal:'), err);
  process.exit(1);
});
