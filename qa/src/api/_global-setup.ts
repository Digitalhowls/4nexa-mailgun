/**
 * _global-setup.ts
 * Verifica que el servidor esté disponible antes de ejecutar los tests API.
 * Si no está disponible, muestra un aviso pero no interrumpe la suite (los tests
 * individuales usarán beforeAll con skipIf para evitar falsos negativos).
 */
import { isApiReachable, BASE_URL } from './_client';

export default async function globalSetup(): Promise<void> {
  const reachable = await isApiReachable();
  if (!reachable) {
    console.warn(
      `\n⚠️  QA API tests: el servidor en ${BASE_URL} NO está disponible.\n` +
      `   Los tests que requieren conexión se marcarán como skipped.\n` +
      `   Para ejecutar todos los tests: pnpm --filter control-plane-api dev\n`,
    );
    // Almacenamos flag para que los tests puedan hacer skipIf
    process.env['QA_API_REACHABLE'] = 'false';
  } else {
    console.log(`\n✅  QA API tests: servidor disponible en ${BASE_URL}\n`);
    process.env['QA_API_REACHABLE'] = 'true';
  }
}
