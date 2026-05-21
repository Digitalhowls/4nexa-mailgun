/**
 * ui-scanner.ts
 * Escanea las páginas y componentes Next.js de los frontends y extrae metadatos.
 */
import * as fs from 'fs';
import * as path from 'path';

export interface PageInfo {
  app: string;
  routePath: string;
  filePath: string;
  isAuthProtected: boolean;
  hasForm: boolean;
  hasLoginForm: boolean;
  inputCount: number;
  buttonCount: number;
  usesApiClient: boolean;
  usesAuthStore: boolean;
  hasMutation: boolean;
  hasQuery: boolean;
}

export interface ComponentInfo {
  app: string;
  name: string;
  filePath: string;
  hasForm: boolean;
  inputCount: number;
  buttonCount: number;
}

export interface UiScanResult {
  scannedAt: string;
  totalPages: number;
  totalComponents: number;
  pages: PageInfo[];
  components: ComponentInfo[];
  summary: {
    pagesWithForms: number;
    pagesWithAuth: number;
    pagesWithMutations: number;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function findFiles(dir: string, ext: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFiles(full, ext));
    } else if (entry.isFile() && (entry.name.endsWith(ext) || entry.name.endsWith(ext + 'x'))) {
      results.push(full);
    }
  }
  return results;
}

function fileToRoute(filePath: string, appSrcDir: string): string {
  const rel = path.relative(path.join(appSrcDir, 'app'), filePath);
  return (
    '/' +
    rel
      .replace(/\/page\.(tsx?|jsx?)$/, '')
      .replace(/\(.*?\)\//g, '') // Remove route groups like (panel)/
      .replace(/\[([^\]]+)\]/g, ':$1') // [id] → :id
      .replace(/\\/g, '/')
  );
}

function countOccurrences(content: string, pattern: string): number {
  return (content.match(new RegExp(pattern, 'g')) ?? []).length;
}

function analyzePageFile(filePath: string, appDir: string, appName: string): PageInfo {
  const content = fs.readFileSync(filePath, 'utf8');
  const routePath = fileToRoute(filePath, appDir);

  return {
    app: appName,
    routePath,
    filePath,
    isAuthProtected:
      content.includes('useAuthStore') ||
      content.includes('withAuth') ||
      content.includes('redirect') ||
      content.includes('getServerSession'),
    hasForm: /<form|<Form/i.test(content),
    hasLoginForm:
      (/<form|<Form/i.test(content) && /password|senha/i.test(content)) ||
      /LoginForm|login-form/i.test(content),
    inputCount: countOccurrences(content, '<[Ii]nput'),
    buttonCount: countOccurrences(content, '<[Bb]utton'),
    usesApiClient: content.includes('apiClient'),
    usesAuthStore: content.includes('useAuthStore'),
    hasMutation: content.includes('useMutation'),
    hasQuery: content.includes('useQuery'),
  };
}

function analyzeComponentFile(filePath: string, appName: string): ComponentInfo {
  const content = fs.readFileSync(filePath, 'utf8');
  const name = path.basename(filePath, path.extname(filePath));
  return {
    app: appName,
    name,
    filePath,
    hasForm: /<form|<Form/i.test(content),
    inputCount: countOccurrences(content, '<[Ii]nput'),
    buttonCount: countOccurrences(content, '<[Bb]utton'),
  };
}

// ─── Export principal ─────────────────────────────────────────────────────────

export function scanUi(appsDir: string): UiScanResult {
  const pages: PageInfo[] = [];
  const components: ComponentInfo[] = [];

  const appDirs = fs.readdirSync(appsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(appsDir, e.name));

  for (const appDir of appDirs) {
    const appName = path.basename(appDir);
    const srcDir = path.join(appDir, 'src');
    if (!fs.existsSync(srcDir)) continue;

    // Páginas: src/app/**/page.tsx
    const pageFiles = findFiles(path.join(srcDir, 'app'), '.ts')
      .filter((f) => f.endsWith('page.tsx') || f.endsWith('page.ts'));
    for (const f of pageFiles) {
      pages.push(analyzePageFile(f, srcDir, appName));
    }

    // Componentes: src/components/**/*.tsx (excluye ui/ shadcn)
    const componentFiles = findFiles(path.join(srcDir, 'components'), '.ts')
      .filter(
        (f) =>
          (f.endsWith('.tsx') || f.endsWith('.ts')) &&
          !f.includes('/ui/') &&
          !f.endsWith('index.ts'),
      );
    for (const f of componentFiles) {
      components.push(analyzeComponentFile(f, appName));
    }
  }

  return {
    scannedAt: new Date().toISOString(),
    totalPages: pages.length,
    totalComponents: components.length,
    pages,
    components,
    summary: {
      pagesWithForms: pages.filter((p) => p.hasForm).length,
      pagesWithAuth: pages.filter((p) => p.isAuthProtected).length,
      pagesWithMutations: pages.filter((p) => p.hasMutation).length,
    },
  };
}
