import * as vscode from 'vscode';

export interface ApiCallMatch {
  /** The resolved static portion of the path, e.g. "/api/users" (interpolations stripped) */
  apiPath: string;
  /**
   * The full raw URL text as written in source, including any template expressions.
   * e.g. "/api/dependencies?package=${pkg}" or "/api/users/${id}/comments"
   */
  rawUrl: string;
  /** Whether the URL contained template literal interpolations like ${expr} */
  hasInterpolations: boolean;
  /** Range of the URL string in the document (for underline / Ctrl+Click area) */
  range: vscode.Range;
  /** Raw line text */
  lineText: string;
}

// ---------------------------------------------------------------------------
// Internal pattern type
// ---------------------------------------------------------------------------
interface PatternEntry {
  /** Regex that matches the entire call. Must NOT use backreferences to quote char
   *  in the URL group — we handle both static strings and template literals separately. */
  regex: RegExp;
  /** Capture group index holding the URL/path value */
  urlGroup: number;
  label: string;
}

/**
 * Patterns for STATIC strings: '/api/...' or "/api/..."
 * The quote character is captured in group 1, URL in group 2.
 * Template literals (backtick) are handled separately below.
 */
const STATIC_PATTERNS: PatternEntry[] = [
  { regex: /\bfetch\s*\(\s*(['"])(\/api\/[^'"?#\s]*)\1/,                                              urlGroup: 2, label: 'fetch' },
  { regex: /\$fetch\s*\(\s*(['"])(\/api\/[^'"?#\s]*)\1/,                                              urlGroup: 2, label: '$fetch' },
  { regex: /\baxios\s*\.\s*(?:get|post|put|patch|delete|head|options)\s*\(\s*(['"])(\/api\/[^'"?#\s]*)\1/i, urlGroup: 2, label: 'axios.method' },
  { regex: /\baxios\s*\(\s*\{[^}]*url\s*:\s*(['"])(\/api\/[^'"?#\s]*)\1/,                            urlGroup: 2, label: 'axios config' },
  { regex: /\buseFetch\s*\(\s*(['"])(\/api\/[^'"?#\s]*)\1/,                                           urlGroup: 2, label: 'useFetch' },
  { regex: /\buseQuery\s*\(\s*(?:\[[^\]]*,\s*)?(['"])(\/api\/[^'"?#\s]*)\1/,                         urlGroup: 2, label: 'useQuery' },
  { regex: /\buseSWR\s*\(\s*(['"])(\/api\/[^'"?#\s]*)\1/,                                             urlGroup: 2, label: 'useSWR' },
  { regex: /\bky\s*\.\s*(?:get|post|put|patch|delete|head)\s*\(\s*(['"])(\/api\/[^'"?#\s]*)\1/i,     urlGroup: 2, label: 'ky' },
  { regex: /\bgot\s*\.\s*(?:get|post|put|patch|delete|head)\s*\(\s*(['"])(\/api\/[^'"?#\s]*)\1/i,    urlGroup: 2, label: 'got' },
  { regex: /\bwretch\s*\(\s*(['"])(\/api\/[^'"?#\s]*)\1/,                                            urlGroup: 2, label: 'wretch' },
  // Svelte: load({ fetch }) pattern — same native fetch, already covered above, but
  // also handle the common `$app/navigation` goto('/api/...') indirectly via fetch.
];

/**
 * Patterns for TEMPLATE LITERALS: `/api/users/${id}/comments`
 *
 * Strategy: match the opening backtick + /api/ prefix, then capture everything
 * up to the closing backtick. Interpolations ${...} are captured as-is and
 * later stripped to recover the static route skeleton.
 *
 * Each pattern captures the raw template content (without surrounding backticks)
 * in group 1.
 */
const TEMPLATE_PATTERNS: PatternEntry[] = [
  { regex: /\bfetch\s*\(\s*`(\/api\/[^`]*)`/,                                                         urlGroup: 1, label: 'fetch template' },
  { regex: /\$fetch\s*\(\s*`(\/api\/[^`]*)`/,                                                         urlGroup: 1, label: '$fetch template' },
  { regex: /\baxios\s*\.\s*(?:get|post|put|patch|delete|head|options)\s*\(\s*`(\/api\/[^`]*)`/i,      urlGroup: 1, label: 'axios.method template' },
  { regex: /\baxios\s*\(\s*\{[^}]*url\s*:\s*`(\/api\/[^`]*)`/,                                        urlGroup: 1, label: 'axios config template' },
  { regex: /\buseFetch\s*\(\s*`(\/api\/[^`]*)`/,                                                       urlGroup: 1, label: 'useFetch template' },
  { regex: /\buseQuery\s*\(\s*(?:\[[^\]]*,\s*)?`(\/api\/[^`]*)`/,                                     urlGroup: 1, label: 'useQuery template' },
  { regex: /\buseSWR\s*\(\s*`(\/api\/[^`]*)`/,                                                         urlGroup: 1, label: 'useSWR template' },
  { regex: /\bky\s*\.\s*(?:get|post|put|patch|delete|head)\s*\(\s*`(\/api\/[^`]*)`/i,                 urlGroup: 1, label: 'ky template' },
  { regex: /\bgot\s*\.\s*(?:get|post|put|patch|delete|head)\s*\(\s*`(\/api\/[^`]*)`/i,                urlGroup: 1, label: 'got template' },
  { regex: /\bwretch\s*\(\s*`(\/api\/[^`]*)`/,                                                         urlGroup: 1, label: 'wretch template' },
];

// ---------------------------------------------------------------------------
// Template literal normalisation
// ---------------------------------------------------------------------------

/**
 * Given the raw content of a template literal (the part between backticks),
 * returns the "static skeleton" suitable for route resolution.
 *
 * Rules:
 *  1. Strip query string and hash   →  /api/users/${id}?foo=1  →  /api/users/${id}
 *  2. Replace ${...} in PATH segments with a placeholder token "__var__"
 *     so the route resolver can match it against dynamic [param] segments.
 *  3. Leave the path prefix intact.
 *
 * Examples:
 *   `/api/dependencies?package=${pkg}`  →  /api/dependencies
 *   `/api/users/${id}/comments`         →  /api/users/__var__/comments
 *   `/api/${section}/${id}`             →  /api/__var__/__var__
 */
export function normaliseTemplateLiteral(raw: string): string {
  // 1. Strip query string / hash (anything after ? or # that follows the path)
  //    But only strip if the ? or # is NOT inside a ${...} expression.
  //    Simple heuristic: strip from the first ? or # that appears outside ${}
  const pathOnly = stripQueryAndHash(raw);

  // 2. Replace ${...} interpolations in path segments with __var__
  return pathOnly.replace(/\$\{[^}]*\}/g, '__var__');
}

/**
 * Strips the query string and hash fragment from a raw template literal value.
 * Handles the fact that interpolations may themselves contain ? characters.
 *
 * e.g.  "/api/search?q=${term}&page=1"  →  "/api/search"
 *       "/api/users/${id}"              →  "/api/users/${id}"
 */
function stripQueryAndHash(raw: string): string {
  // Walk character by character, tracking interpolation depth
  let depth = 0;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '$' && raw[i + 1] === '{') {
      depth++;
      i++; // skip '{'
      continue;
    }
    if (raw[i] === '}' && depth > 0) {
      depth--;
      continue;
    }
    if (depth === 0 && (raw[i] === '?' || raw[i] === '#')) {
      return raw.slice(0, i);
    }
  }
  return raw;
}

// ---------------------------------------------------------------------------
// Core scanning logic
// ---------------------------------------------------------------------------

/**
 * Scans a single line and returns all API call matches found.
 * Handles multiple calls on the same line, static strings, and template literals.
 */
export function findApiCallsInLine(
  document: vscode.TextDocument,
  lineIndex: number
): ApiCallMatch[] {
  const line = document.lineAt(lineIndex);
  const lineText = line.text;
  const results: ApiCallMatch[] = [];

  // Skip comment lines
  const trimmed = lineText.trimStart();
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('#')) {
    return [];
  }

  // --- Static string patterns ---
  for (const pattern of STATIC_PATTERNS) {
    const globalRegex = new RegExp(pattern.regex.source, 'gi');
    let match: RegExpExecArray | null;
    while ((match = globalRegex.exec(lineText)) !== null) {
      const urlValue = match[pattern.urlGroup];
      if (!urlValue) { continue; }
      const urlStart = match.index + match[0].lastIndexOf(urlValue);
      results.push({
        apiPath: urlValue,
        rawUrl: urlValue,
        hasInterpolations: false,
        range: new vscode.Range(
          new vscode.Position(lineIndex, urlStart),
          new vscode.Position(lineIndex, urlStart + urlValue.length)
        ),
        lineText,
      });
    }
  }

  // --- Template literal patterns ---
  for (const pattern of TEMPLATE_PATTERNS) {
    const globalRegex = new RegExp(pattern.regex.source, 'gi');
    let match: RegExpExecArray | null;
    while ((match = globalRegex.exec(lineText)) !== null) {
      const rawUrl = match[pattern.urlGroup];
      if (!rawUrl) { continue; }

      const hasInterpolations = /\$\{[^}]*\}/.test(rawUrl);
      const apiPath = hasInterpolations ? normaliseTemplateLiteral(rawUrl) : rawUrl;

      // Position: find the backtick-enclosed span in the line
      const urlStart = match.index + match[0].lastIndexOf(rawUrl);
      results.push({
        apiPath,
        rawUrl,
        hasInterpolations,
        range: new vscode.Range(
          new vscode.Position(lineIndex, urlStart),
          new vscode.Position(lineIndex, urlStart + rawUrl.length)
        ),
        lineText,
      });
    }
  }

  // Deduplicate by range start (a URL shouldn't match both a static and template pattern)
  const seen = new Set<number>();
  return results.filter((r) => {
    const key = r.range.start.character;
    if (seen.has(key)) { return false; }
    seen.add(key);
    return true;
  });
}

/**
 * Returns whether the given position in a document is inside an API call
 * URL string, and if so returns the match details.
 */
export function getApiCallAtPosition(
  document: vscode.TextDocument,
  position: vscode.Position
): ApiCallMatch | undefined {
  const matches = findApiCallsInLine(document, position.line);
  return matches.find(
    (m) =>
      m.range.start.character <= position.character &&
      position.character <= m.range.end.character
  );
}