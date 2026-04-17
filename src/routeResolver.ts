import * as fs from 'fs';
import * as path from 'path';

// import * as vscode from 'vscode';

export interface ResolvedRoute {
  filePath: string;
  /** Params extracted from dynamic segments, e.g. { id: '123' } */
  params: Record<string, string>;
  isDynamic: boolean;
}

/**
 * All file extensions that can serve as Astro API handlers,
 * in priority order.
 */
const HANDLER_EXTENSIONS = ['.ts', '.js', '.tsx', '.jsx', '.astro'];

/**
 * Given a workspace root and a URL path like "/api/users/42/comments",
 * finds the matching file under `<pagesDir>/api/`, handling:
 *  - static routes:   /api/users         → pages/api/users.ts
 *  - dynamic routes:  /api/users/[id]    → pages/api/users/[id].ts
 *  - catch-all:       /api/[...slug]     → pages/api/[...slug].ts
 *  - nested dynamic:  /api/posts/[id]/comments → pages/api/posts/[id]/comments.ts
 */
export function resolveApiRoute(
  workspaceRoot: string,
  apiUrlPath: string,
  pagesDir: string
): ResolvedRoute | undefined {
  // Normalize: strip query string / hash, ensure leading slash
  const cleanPath = apiUrlPath.split('?')[0].split('#')[0];
  const segments = cleanPath.replace(/^\//, '').split('/').filter(Boolean);
  // segments: ['api', 'users', '42', 'comments']

  const apiBaseDir = path.join(workspaceRoot, pagesDir, 'api');

  if (!fs.existsSync(apiBaseDir)) {
    return undefined;
  }

  // Drop the leading 'api' segment since we're already inside the api dir
  const routeSegments = segments.slice(1); // ['users', '42', 'comments']

  return matchRoute(apiBaseDir, routeSegments, {});
}

/**
 * Recursively walks the filesystem to find a matching route handler.
 * Tries static matches first, then dynamic [param], then catch-all [...param].
 */
function matchRoute(
  currentDir: string,
  remainingSegments: string[],
  collectedParams: Record<string, string>
): ResolvedRoute | undefined {
  if (!fs.existsSync(currentDir)) {
    return undefined;
  }

  // Base case: no more segments → look for index file in current dir
  if (remainingSegments.length === 0) {
    return findIndexFile(currentDir, collectedParams);
  }

  const [head, ...tail] = remainingSegments;

  // 1. Try static file match: e.g. users.ts
  for (const ext of HANDLER_EXTENSIONS) {
    if (tail.length === 0) {
      const staticFile = path.join(currentDir, head + ext);
      if (fs.existsSync(staticFile)) {
        return {
          filePath: staticFile,
          params: collectedParams,
          isDynamic: Object.keys(collectedParams).length > 0,
        };
      }
    }
  }

  // 2. Try static directory match: e.g. users/
  const staticDir = path.join(currentDir, head);
  if (fs.existsSync(staticDir) && fs.statSync(staticDir).isDirectory()) {
    const result = matchRoute(staticDir, tail, collectedParams);
    if (result) {
      return result;
    }
  }

  // 3. Try dynamic [param] file: e.g. [id].ts (only when this is the last segment)
  if (tail.length === 0) {
    const entries = safeReadDir(currentDir);
    for (const entry of entries) {
      const dynamicFileMatch = entry.match(/^\[([^\]\.]+)\](\.[^.]+)$/);
      if (dynamicFileMatch) {
        const paramName = dynamicFileMatch[1];
        const filePath = path.join(currentDir, entry);
        if (HANDLER_EXTENSIONS.includes(dynamicFileMatch[2])) {
          return {
            filePath,
            params: { ...collectedParams, [paramName]: head },
            isDynamic: true,
          };
        }
      }
    }
  }

  // 4. Try dynamic [param] directory: e.g. [id]/
  const entries = safeReadDir(currentDir);
  for (const entry of entries) {
    const dynamicDirMatch = entry.match(/^\[([^\]\.]+)\]$/);
    if (dynamicDirMatch) {
      const paramName = dynamicDirMatch[1];
      const dynamicDir = path.join(currentDir, entry);
      if (fs.statSync(dynamicDir).isDirectory()) {
        const result = matchRoute(dynamicDir, tail, {
          ...collectedParams,
          [paramName]: head,
        });
        if (result) {
          return result;
        }
      }
    }
  }

  // 5. Try catch-all [...slug] file at any nesting level
  for (const entry of entries) {
    const catchAllMatch = entry.match(/^\[\.\.\.([^\]]+)\](\.[^.]+)$/);
    if (catchAllMatch && HANDLER_EXTENSIONS.includes(catchAllMatch[2])) {
      const paramName = catchAllMatch[1];
      const filePath = path.join(currentDir, entry);
      return {
        filePath,
        params: {
          ...collectedParams,
          [paramName]: [head, ...tail].join('/'),
        },
        isDynamic: true,
      };
    }
  }

  // 6. Try catch-all [...slug] directory
  for (const entry of entries) {
    const catchAllDirMatch = entry.match(/^\[\.\.\.([^\]]+)\]$/);
    if (catchAllDirMatch) {
      const paramName = catchAllDirMatch[1];
      const catchAllDir = path.join(currentDir, entry);
      if (fs.statSync(catchAllDir).isDirectory()) {
        const result = matchRoute(catchAllDir, tail, {
          ...collectedParams,
          [paramName]: [head, ...tail].join('/'),
        });
        if (result) {
          return result;
        }
      }
    }
  }

  return undefined;
}

/** Looks for an index file (index.ts, index.js, etc.) inside a directory */
function findIndexFile(
  dir: string,
  params: Record<string, string>
): ResolvedRoute | undefined {
  for (const ext of HANDLER_EXTENSIONS) {
    const indexFile = path.join(dir, 'index' + ext);
    if (fs.existsSync(indexFile)) {
      return {
        filePath: indexFile,
        params,
        isDynamic: Object.keys(params).length > 0,
      };
    }
  }
  return undefined;
}

function safeReadDir(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}