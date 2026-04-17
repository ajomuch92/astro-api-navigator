import * as path from 'path';
import * as vscode from 'vscode';

import { buildNavigationDescription, detectHttpMethod, findHandlerPosition } from './methodDetector';
import { findApiCallsInLine, getApiCallAtPosition } from './apiCallDetector';

import { resolveApiRoute } from './routeResolver';

// ---------------------------------------------------------------------------
// File types we activate on
// ---------------------------------------------------------------------------
const SUPPORTED_LANGUAGES = [
  'typescript',
  'javascript',
  'typescriptreact',
  'javascriptreact',
  'vue',
  'astro',
];

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------
export function activate(context: vscode.ExtensionContext): void {
  console.log('[Astro API Navigator] Extension activated');

  const definitionProvider = new AstroApiDefinitionProvider();
  const hoverProvider = new AstroApiHoverProvider();
  const decorationProvider = new AstroApiDecorationProvider();

  const selector = SUPPORTED_LANGUAGES.map((lang) => ({ language: lang }));

  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(selector, definitionProvider),
    vscode.languages.registerHoverProvider(selector, hoverProvider),

    // Re-run decorations when editor changes
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        decorationProvider.updateDecorations(editor);
      }
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      const editor = vscode.window.activeTextEditor;
      if (editor && event.document === editor.document) {
        decorationProvider.updateDecorations(editor);
      }
    }),

    // Register the decoration type for cleanup on deactivate
    decorationProvider
  );

  // Run on the currently open editor immediately
  if (vscode.window.activeTextEditor) {
    decorationProvider.updateDecorations(vscode.window.activeTextEditor);
  }
}

export function deactivate(): void {}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getConfig() {
  return vscode.workspace.getConfiguration('astroApiNavigator');
}

function getPagesDir(): string {
  return getConfig().get<string>('pagesDir') ?? 'src/pages';
}

function getWorkspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

// ---------------------------------------------------------------------------
// Definition Provider  (Ctrl+Click / F12)
// ---------------------------------------------------------------------------
class AstroApiDefinitionProvider implements vscode.DefinitionProvider {
  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.Location | undefined> {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
      return;
    }

    const apiCall = getApiCallAtPosition(document, position);
    if (!apiCall) {
      return;
    }

    const resolved = resolveApiRoute(workspaceRoot, apiCall.apiPath, getPagesDir());
    if (!resolved) {
      vscode.window.showInformationMessage(
        `[Astro API Navigator] No handler found for ${apiCall.apiPath}`
      );
      return;
    }

    const uri = vscode.Uri.file(resolved.filePath);
    const targetDoc = await vscode.workspace.openTextDocument(uri);
    const method = detectHttpMethod(document, position.line);
    const handlerPos = findHandlerPosition(targetDoc, method);

    return new vscode.Location(uri, handlerPos);
  }
}

// ---------------------------------------------------------------------------
// Hover Provider
// ---------------------------------------------------------------------------
class AstroApiHoverProvider implements vscode.HoverProvider {
  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.Hover | undefined> {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
      return;
    }

    const apiCall = getApiCallAtPosition(document, position);
    if (!apiCall) {
      return;
    }

    const resolved = resolveApiRoute(workspaceRoot, apiCall.apiPath, getPagesDir());

    if (!resolved) {
      const md = new vscode.MarkdownString(
        `**Astro API Navigator**\n\n⚠️ No handler found for \`${apiCall.apiPath}\``
      );
      return new vscode.Hover(md, apiCall.range);
    }

    const method = detectHttpMethod(document, position.line);
    const relativePath = path.relative(workspaceRoot, resolved.filePath);
    const description = buildNavigationDescription(
      apiCall.apiPath,
      method,
      relativePath,
      resolved.isDynamic,
      resolved.params
    );

    const md = new vscode.MarkdownString(
      `**Astro API Navigator**\n\n${description}\n\n` +
      `📄 \`${relativePath}\`\n\n` +
      `*Ctrl+Click to navigate*`
    );
    md.isTrusted = true;

    return new vscode.Hover(md, apiCall.range);
  }
}

// ---------------------------------------------------------------------------
// Decoration Provider  (underlines API URLs in the editor)
// ---------------------------------------------------------------------------
class AstroApiDecorationProvider implements vscode.Disposable {
  private readonly decorationType = vscode.window.createTextEditorDecorationType({
    textDecoration: 'underline',
    color: new vscode.ThemeColor('textLink.foreground'),
    cursor: 'pointer',
  });

  updateDecorations(editor: vscode.TextEditor): void {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
      return;
    }

    if (!SUPPORTED_LANGUAGES.includes(editor.document.languageId)) {
      return;
    }

    const decorations: vscode.DecorationOptions[] = [];

    for (let i = 0; i < editor.document.lineCount; i++) {
      const matches = findApiCallsInLine(editor.document, i);
      for (const match of matches) {
        const resolved = resolveApiRoute(workspaceRoot, match.apiPath, getPagesDir());
        if (!resolved) {
          continue;
        }

        decorations.push({
          range: match.range,
          hoverMessage: new vscode.MarkdownString(
            `**Astro API Navigator** — Ctrl+Click to go to handler`
          ),
        });
      }
    }

    editor.setDecorations(this.decorationType, decorations);
  }

  dispose(): void {
    this.decorationType.dispose();
  }
}