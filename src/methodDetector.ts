import * as vscode from 'vscode';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

/**
 * Detects the HTTP method used in a line of code.
 * Checks for:
 *  - axios.post(...), axios.get(...)
 *  - fetch(..., { method: 'POST' })  ← checks surrounding lines too
 *  - $fetch(..., { method: 'PUT' })
 *  - useQuery/useMutation patterns
 *  - HTML form method attributes
 */
export function detectHttpMethod(
  document: vscode.TextDocument,
  lineIndex: number
): HttpMethod {
  const line = document.lineAt(lineIndex).text;

  // axios.METHOD( shorthand
  const axiosMethodMatch = line.match(/axios\.(get|post|put|patch|delete|head)\s*\(/i);
  if (axiosMethodMatch) {
    return axiosMethodMatch[1].toUpperCase() as HttpMethod;
  }

  // Inline method: fetch('/api', { method: 'POST' })
  const inlineMethod = line.match(/method\s*:\s*['"`](GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)['"`]/i);
  if (inlineMethod) {
    return inlineMethod[1].toUpperCase() as HttpMethod;
  }

  // Look ahead up to 5 lines for method option (multiline fetch calls)
  const lookaheadEnd = Math.min(document.lineCount - 1, lineIndex + 5);
  for (let i = lineIndex + 1; i <= lookaheadEnd; i++) {
    const aheadLine = document.lineAt(i).text;
    const aheadMethod = aheadLine.match(/method\s*:\s*['"`](GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)['"`]/i);
    if (aheadMethod) {
      return aheadMethod[1].toUpperCase() as HttpMethod;
    }
    // Stop if we hit a closing parenthesis/brace that likely ends the call
    if (/^\s*[)\}]/.test(aheadLine) && i > lineIndex + 1) {
      break;
    }
  }

  // useMutation implies POST/mutating operations
  if (/useMutation|useAction/.test(line)) {
    return 'POST';
  }

  return 'GET';
}

interface HandlerMatch {
  lineIndex: number;
  method: HttpMethod;
  exportType: 'named' | 'default';
}

/**
 * Finds the line number of the exported handler function for a given HTTP method.
 *
 * Supports Astro/Next.js/Nuxt style:
 *   export function GET({ request }) { ... }
 *   export const POST = async ({ request }) => { ... }
 *   export async function DELETE(...) { ... }
 *
 * Also supports Next.js App Router / catch-all:
 *   export default function handler(req, res) { ... }  ← fallback
 *
 * For .vue files, looks inside <script setup> blocks for defineEventHandler
 * For React (.tsx/.jsx), looks for named exports matching the method
 */
export function findHandlerPosition(
  document: vscode.TextDocument,
  method: HttpMethod
): vscode.Position {
  const fileExt = document.fileName.split('.').pop()?.toLowerCase();

  if (fileExt === 'vue') {
    return findVueHandler(document, method);
  }

  if (fileExt === 'svelte') {
    return findSvelteHandler(document, method);
  }

  return findJsTsHandler(document, method);
}

function findJsTsHandler(
  document: vscode.TextDocument,
  method: HttpMethod
): vscode.Position {
  const candidates: HandlerMatch[] = [];

  for (let i = 0; i < document.lineCount; i++) {
    const line = document.lineAt(i).text;

    // export function GET / export async function GET
    const namedFnMatch = line.match(
      /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*[(<]/
    );
    if (namedFnMatch) {
      candidates.push({
        lineIndex: i,
        method: namedFnMatch[1] as HttpMethod,
        exportType: 'named',
      });
      continue;
    }

    // export const GET = / export const GET: APIRoute =
    const namedConstMatch = line.match(
      /export\s+const\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*[=:]/
    );
    if (namedConstMatch) {
      candidates.push({
        lineIndex: i,
        method: namedConstMatch[1] as HttpMethod,
        exportType: 'named',
      });
      continue;
    }

    // Next.js: export default function handler
    if (/export\s+default\s+(?:async\s+)?function/.test(line)) {
      candidates.push({ lineIndex: i, method: 'GET', exportType: 'default' });
    }
  }

  // Exact method match first
  const exact = candidates.find((c) => c.method === method);
  if (exact) {
    return new vscode.Position(exact.lineIndex, 0);
  }

  // Fallback: default export (catches all methods)
  const defaultExport = candidates.find((c) => c.exportType === 'default');
  if (defaultExport) {
    return new vscode.Position(defaultExport.lineIndex, 0);
  }

  // Last resort: first handler found
  if (candidates.length > 0) {
    return new vscode.Position(candidates[0].lineIndex, 0);
  }

  return new vscode.Position(0, 0);
}

/**
 * For Vue files (Nuxt server routes), looks for:
 *   defineEventHandler(async (event) => { ... })
 *   export default defineEventHandler(...)
 *   Also checks for method guards: getMethod(event) === 'POST'
 */
function findVueHandler(
  document: vscode.TextDocument,
  method: HttpMethod
): vscode.Position {
  let defineEventHandlerLine = -1;
  let methodGuardLine = -1;

  for (let i = 0; i < document.lineCount; i++) {
    const line = document.lineAt(i).text;

    if (/defineEventHandler/.test(line) && defineEventHandlerLine === -1) {
      defineEventHandlerLine = i;
    }

    // getMethod(event) === 'POST' style guard
    const methodGuard = line.match(
      /getMethod\(event\)\s*===?\s*['"`](GET|POST|PUT|PATCH|DELETE)['"`]/
    );
    if (methodGuard && methodGuard[1] === method) {
      methodGuardLine = i;
    }
  }

  if (methodGuardLine !== -1) {
    return new vscode.Position(methodGuardLine, 0);
  }

  if (defineEventHandlerLine !== -1) {
    return new vscode.Position(defineEventHandlerLine, 0);
  }

  return new vscode.Position(0, 0);
}

/**
 * For Svelte files used as SvelteKit server routes (+server.ts / +server.js),
 * looks for:
 *   export function GET({ request }) { ... }
 *   export const POST: RequestHandler = async ({ request }) => { ... }
 *
 * SvelteKit uses the exact same named-export convention as Astro, so we reuse
 * findJsTsHandler. This function exists as a named entry point for clarity and
 * future SvelteKit-specific additions (e.g. +page.server.ts load/actions).
 */
function findSvelteHandler(
  document: vscode.TextDocument,
  method: HttpMethod
): vscode.Position {
  // SvelteKit server files use the same export pattern as Astro API routes.
  // Additionally, handle SvelteKit `actions` default export in +page.server.ts:
  //   export const actions = { default: async ({ request }) => { ... } }
  // For plain +server.ts, the JS/TS scanner handles it perfectly.
  return findJsTsHandler(document, method);
}


export function buildNavigationDescription(
  apiPath: string,
  method: HttpMethod,
  resolvedFile: string,
  isDynamic: boolean,
  params: Record<string, string>
): string {
  const fileName = resolvedFile.split('/').pop() ?? resolvedFile;
  let desc = `→ **${method}** handler in \`${fileName}\``;

  if (isDynamic && Object.keys(params).length > 0) {
    const paramList = Object.entries(params)
      .map(([k, v]) => `\`${k}\` = \`${v}\``)
      .join(', ');
    desc += `\n\nDynamic route params: ${paramList}`;
  }

  return desc;
}