/**
 * api-scanner.ts
 * Escanea los controladores NestJS del control-plane-api y extrae el mapa de rutas.
 */
import * as fs from 'fs';
import * as path from 'path';

export interface Route {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  fullPath: string;
  controllerFile: string;
  controllerClass: string;
  handlerName: string;
  roles: string[];
  hasBody: boolean;
  hasParam: boolean;
  hasQuery: boolean;
}

export interface ControllerInfo {
  name: string;
  basePath: string;
  file: string;
  routes: Route[];
}

export interface ApiScanResult {
  scannedAt: string;
  totalControllers: number;
  totalRoutes: number;
  controllers: ControllerInfo[];
  routesByMethod: Record<string, number>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function findFiles(dir: string, ext: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFiles(full, ext));
    } else if (entry.isFile() && entry.name.endsWith(ext)) {
      results.push(full);
    }
  }
  return results;
}

function extractBasePath(content: string): string {
  const m = content.match(/@Controller\(\s*['"`]([^'"`]*)['"`]/);
  return m?.[1] ? `/${m[1].replace(/^\//, '')}` : '/';
}

function extractClassName(content: string): string {
  const m = content.match(/export\s+class\s+(\w+)/);
  return m?.[1] ?? 'Unknown';
}

function extractRoles(block: string): string[] {
  const m = block.match(/@Roles\s*\(([^)]+)\)/);
  if (!m?.[1]) return [];
  return m[1]
    .replace(/UserRole\./g, '')
    .split(',')
    .map((r) => r.replace(/['"`\s]/g, '').trim())
    .filter(Boolean);
}

const HTTP_METHODS = ['Get', 'Post', 'Put', 'Patch', 'Delete'] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];
const METHOD_MAP: Record<HttpMethod, Route['method']> = {
  Get: 'GET', Post: 'POST', Put: 'PUT', Patch: 'PATCH', Delete: 'DELETE',
};

function parseRoutes(content: string, basePath: string, file: string, controllerClass: string): Route[] {
  const routes: Route[] = [];

  // Divide el archivo en bloques de método (de @Get/Post/... hasta el siguiente o fin de clase)
  const methodRegex = /@(Get|Post|Put|Patch|Delete)\(([^)]*)\)\s*([\s\S]*?)(?=\s*@(?:Get|Post|Put|Patch|Delete|Roles|UseGuards|Public|ApiOperation|ApiResponse|Body|Param|Query)|(?:\s*}(?:\s*\/\/[^\n]*)?\s*$))/g;

  let match;
  while ((match = methodRegex.exec(content)) !== null) {
    const httpMethodStr = match[1] as HttpMethod;
    const routeArg = match[2] ?? '';
    const block = match[3] ?? '';

    const method = METHOD_MAP[httpMethodStr];
    const routePath = routeArg.replace(/['"`]/g, '').trim() || '';
    const fullPath = `/api/v1${basePath}${routePath ? `/${routePath}` : ''}`.replace(/\/+/g, '/');

    // Extraer nombre del handler
    const handlerMatch = block.match(/(?:async\s+)?(\w+)\s*\(/);
    const handlerName = handlerMatch?.[1] ?? 'unknown';

    // Buscar @Roles en el bloque previo (30 chars hacia atrás en el content)
    const startIdx = match.index;
    const precedingBlock = content.slice(Math.max(0, startIdx - 300), startIdx);
    const roles = extractRoles(precedingBlock);

    routes.push({
      method,
      path: routePath,
      fullPath,
      controllerFile: file,
      controllerClass,
      handlerName,
      roles,
      hasBody: /@Body\(/.test(block) || content.slice(startIdx, startIdx + 200).includes('@Body('),
      hasParam: /@Param\(/.test(block) || content.slice(startIdx, startIdx + 200).includes('@Param('),
      hasQuery: /@Query\(/.test(block) || content.slice(startIdx, startIdx + 200).includes('@Query('),
    });
  }

  return routes;
}

// ─── Export principal ─────────────────────────────────────────────────────────

export function scanApiRoutes(controllerDir: string): ApiScanResult {
  const controllerFiles = findFiles(controllerDir, '.controller.ts').filter(
    (f) => !f.includes('.spec.') && !f.includes('.test.'),
  );

  const controllers: ControllerInfo[] = [];

  for (const file of controllerFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const basePath = extractBasePath(content);
    const className = extractClassName(content);
    const routes = parseRoutes(content, basePath, path.relative(controllerDir, file), className);

    controllers.push({ name: className, basePath, file: path.relative(controllerDir, file), routes });
  }

  const allRoutes = controllers.flatMap((c) => c.routes);
  const routesByMethod: Record<string, number> = {};
  for (const r of allRoutes) {
    routesByMethod[r.method] = (routesByMethod[r.method] ?? 0) + 1;
  }

  return {
    scannedAt: new Date().toISOString(),
    totalControllers: controllers.length,
    totalRoutes: allRoutes.length,
    controllers,
    routesByMethod,
  };
}
