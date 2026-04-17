import * as vscode from 'vscode';

export interface ApiCallMatch {
  /** The URL path, e.g. "/api/users/42" */
  apiPath: string;
  /** Range of the URL string in the document (for underline / Ctrl+Click area) */
  range: vscode.Range;
  /** Raw line text */
  lineText: string;
}

/**
 * All patterns we look for in a single line.
 * Each entry has a regex and the capture group index that contains the URL.
 *
 * The patterns cover:
 *  - Native fetch()
 *  - $fetch() (Nuxt / ofetch)
 *  - axios.METHOD()
 *  - axios({ url: ... })
 *  - useFetch() (Nuxt/Vue Query)
 *  - useQuery/useSWR/React Query with URL
 *  - ky.get() / ky.post() (ky HTTP client)
 *  - got.get() (got HTTP client)
 *  - wretch() (wretch client)
 */
const API_PATTERNS: Array<{
  regex: RegExp;
  urlGroup: number;
  label: string;
}> = [
  // fetch('/api/...')  or  fetch(`/api/...`)
  {
    regex: /\bfetch\s*\(\s*(['"`])(\/api\/[^'"`?#\s]*)\1/,
    urlGroup: 2,
    label: 'fetch',
  },
  // $fetch('/api/...')
  {
    regex: /\$fetch\s*\(\s*(['"`])(\/api\/[^'"`?#\s]*)\1/,
    urlGroup: 2,
    label: '$fetch',
  },
  // axios.get('/api/...') / axios.post(...) / etc.
  {
    regex: /\baxios\s*\.\s*(?:get|post|put|patch|delete|head|options)\s*\(\s*(['"`])(\/api\/[^'"`?#\s]*)\1/i,
    urlGroup: 2,
    label: 'axios.method',
  },
  // axios({ url: '/api/...' })
  {
    regex: /\baxios\s*\(\s*\{[^}]*url\s*:\s*(['"`])(\/api\/[^'"`?#\s]*)\1/,
    urlGroup: 2,
    label: 'axios config',
  },
  // useFetch('/api/...')
  {
    regex: /\buseFetch\s*\(\s*(['"`])(\/api\/[^'"`?#\s]*)\1/,
    urlGroup: 2,
    label: 'useFetch',
  },
  // useQuery(['key', '/api/...'])  or  useQuery('/api/...')
  {
    regex: /\buseQuery\s*\(\s*(?:\[[^\]]*,\s*)?(['"`])(\/api\/[^'"`?#\s]*)\1/,
    urlGroup: 2,
    label: 'useQuery',
  },
  // useSWR('/api/...')
  {
    regex: /\buseSWR\s*\(\s*(['"`])(\/api\/[^'"`?#\s]*)\1/,
    urlGroup: 2,
    label: 'useSWR',
  },
  // ky.get('/api/...') / ky.post(...)
  {
    regex: /\bky\s*\.\s*(?:get|post|put|patch|delete|head)\s*\(\s*(['"`])(\/api\/[^'"`?#\s]*)\1/i,
    urlGroup: 2,
    label: 'ky',
  },
  // got.get('/api/...')
  {
    regex: /\bgot\s*\.\s*(?:get|post|put|patch|delete|head)\s*\(\s*(['"`])(\/api\/[^'"`?#\s]*)\1/i,
    urlGroup: 2,
    label: 'got',
  },
  // wretch('/api/...')
  {
    regex: /\bwretch\s*\(\s*(['"`])(\/api\/[^'"`?#\s]*)\1/,
    urlGroup: 2,
    label: 'wretch',
  },
];

/**
 * Scans a single line and returns all API call matches found.
 * Handles multiple calls on the same line.
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

  for (const pattern of API_PATTERNS) {
    // Use a global version of the regex to find all occurrences
    const globalRegex = new RegExp(pattern.regex.source, 'gi');
    let match: RegExpExecArray | null;

    while ((match = globalRegex.exec(lineText)) !== null) {
      const urlValue = match[pattern.urlGroup];
      if (!urlValue) {
        continue;
      }

      // Find the exact position of the URL string in the line
      const urlStart = match.index + match[0].lastIndexOf(urlValue);
      const urlEnd = urlStart + urlValue.length;

      results.push({
        apiPath: urlValue,
        range: new vscode.Range(
          new vscode.Position(lineIndex, urlStart),
          new vscode.Position(lineIndex, urlEnd)
        ),
        lineText,
      });
    }
  }

  return results;
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