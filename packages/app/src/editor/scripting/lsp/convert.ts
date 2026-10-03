// LSP 의 값과 Monaco 의 값 사이 (docs/plans/language-server.md 4.3절). Monaco 를 불러오지 않는 순수 함수라서
// 열거형은 Monaco 의 숫자 값을 그대로 쓴다 (monaco.d.ts 의 enum 과 같다). 줄과 열은 LSP 가 0 부터, Monaco 가 1 부터이고
// 둘 다 UTF-16 단위다.

import type * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import type * as lsp from "vscode-languageserver-protocol";

export type UriMapper = (uri: string) => monaco.Uri | null;

export function toPosition(p: lsp.Position): monaco.IPosition {
  return { lineNumber: p.line + 1, column: p.character + 1 };
}

export function fromPosition(p: monaco.IPosition): lsp.Position {
  return { line: p.lineNumber - 1, character: p.column - 1 };
}

export function toRange(r: lsp.Range): monaco.IRange {
  return { startLineNumber: r.start.line + 1, startColumn: r.start.character + 1, endLineNumber: r.end.line + 1, endColumn: r.end.character + 1 };
}

export function fromRange(r: monaco.IRange): lsp.Range {
  return { start: { line: r.startLineNumber - 1, character: r.startColumn - 1 }, end: { line: r.endLineNumber - 1, character: r.endColumn - 1 } };
}

// ---- 진단 ----

const MARKER_SEVERITY: Record<number, number> = { 1: 8, 2: 4, 3: 2, 4: 1 };

export function toMarker(d: lsp.Diagnostic): monaco.editor.IMarkerData {
  const range = toRange(d.range);
  const marker: monaco.editor.IMarkerData = {
    ...range,
    severity: (MARKER_SEVERITY[d.severity ?? 1] ?? 8) as monaco.MarkerSeverity,
    message: typeof d.message === "string" ? d.message : d.message.value,
    source: "LuaLS",
  };
  if (d.code !== undefined && d.code !== null) marker.code = String(d.code);
  const tags = (d.tags ?? []).filter((t) => t === 1 || t === 2) as number[];
  if (tags.length) marker.tags = tags as monaco.MarkerTag[];
  return marker;
}

// ---- 완성 ----

/** LSP CompletionItemKind(1~25) 를 Monaco CompletionItemKind 로 */
const COMPLETION_KIND: Record<number, number> = {
  1: 18, 2: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5, 8: 7, 9: 8, 10: 9, 11: 12, 12: 13, 13: 15,
  14: 17, 15: 27, 16: 19, 17: 20, 18: 21, 19: 23, 20: 16, 21: 14, 22: 6, 23: 10, 24: 11, 25: 24,
};
const INSERT_AS_SNIPPET = 4;
/** Monaco 에 있는 커맨드만 넘긴다 (서버 고유의 커맨드는 실행할 곳이 없다) */
const PASS_COMMANDS = new Set(["editor.action.triggerParameterHints", "editor.action.triggerSuggest"]);

export function toDocumentation(doc: string | lsp.MarkupContent | undefined): string | monaco.IMarkdownString | undefined {
  if (doc === undefined || doc === null) return undefined;
  if (typeof doc === "string") return doc;
  return doc.kind === "markdown" ? { value: doc.value } : doc.value;
}

function isInsertReplace(edit: lsp.TextEdit | lsp.InsertReplaceEdit): edit is lsp.InsertReplaceEdit {
  return "insert" in edit;
}

export function toCompletionItem(item: lsp.CompletionItem, defaultRange: monaco.IRange | { insert: monaco.IRange; replace: monaco.IRange }): monaco.languages.CompletionItem {
  let range: monaco.languages.CompletionItem["range"] = defaultRange;
  let insertText = item.insertText ?? item.label;
  if (item.textEdit) {
    insertText = item.textEdit.newText;
    range = isInsertReplace(item.textEdit) ? { insert: toRange(item.textEdit.insert), replace: toRange(item.textEdit.replace) } : toRange(item.textEdit.range);
  }
  const label: monaco.languages.CompletionItem["label"] = item.labelDetails
    ? { label: item.label, detail: item.labelDetails.detail, description: item.labelDetails.description }
    : item.label;
  const out: monaco.languages.CompletionItem = {
    label,
    kind: (COMPLETION_KIND[item.kind ?? 1] ?? 18) as monaco.languages.CompletionItemKind,
    insertText,
    range,
  };
  if (item.detail) out.detail = item.detail;
  const documentation = toDocumentation(item.documentation);
  if (documentation !== undefined) out.documentation = documentation;
  if (item.sortText) out.sortText = item.sortText;
  if (item.filterText) out.filterText = item.filterText;
  if (item.preselect) out.preselect = true;
  if (item.commitCharacters) out.commitCharacters = item.commitCharacters;
  if (item.insertTextFormat === 2) out.insertTextRules = INSERT_AS_SNIPPET as monaco.languages.CompletionItemInsertTextRule;
  if (item.tags?.includes(1) || item.deprecated) out.tags = [1 as monaco.languages.CompletionItemTag];
  if (item.additionalTextEdits?.length) out.additionalTextEdits = item.additionalTextEdits.map((e) => ({ range: toRange(e.range), text: e.newText }));
  if (item.command && PASS_COMMANDS.has(item.command.command)) out.command = { id: item.command.command, title: item.command.title };
  return out;
}

export function completionItems(result: lsp.CompletionList | lsp.CompletionItem[] | null): { items: lsp.CompletionItem[]; incomplete: boolean } {
  if (!result) return { items: [], incomplete: false };
  if (Array.isArray(result)) return { items: result, incomplete: false };
  return { items: result.items ?? [], incomplete: !!result.isIncomplete };
}

// ---- 호버와 시그니처 ----

function markedToMarkdown(m: lsp.MarkedString): monaco.IMarkdownString {
  return typeof m === "string" ? { value: m } : { value: "```" + m.language + "\n" + m.value + "\n```" };
}

export function toHover(hover: lsp.Hover | null): monaco.languages.Hover | null {
  if (!hover) return null;
  const c = hover.contents;
  let contents: monaco.IMarkdownString[];
  if (Array.isArray(c)) contents = c.map(markedToMarkdown);
  else if (typeof c === "object" && "kind" in c) contents = [{ value: c.kind === "markdown" ? c.value : escapeMarkdown(c.value) }];
  else contents = [markedToMarkdown(c)];
  contents = contents.filter((m) => m.value.trim() !== "");
  if (!contents.length) return null;
  const out: monaco.languages.Hover = { contents };
  if (hover.range) out.range = toRange(hover.range);
  return out;
}

function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+\-.!|<>]/g, "\\$&");
}

export function toSignatureHelp(help: lsp.SignatureHelp | null): monaco.languages.SignatureHelp | null {
  if (!help || !help.signatures?.length) return null;
  return {
    signatures: help.signatures.map((s) => {
      const out: monaco.languages.SignatureInformation = {
        label: s.label,
        parameters: (s.parameters ?? []).map((p) => ({ label: p.label, documentation: toDocumentation(p.documentation) })),
      };
      const doc = toDocumentation(s.documentation);
      if (doc !== undefined) out.documentation = doc;
      if (s.activeParameter !== undefined && s.activeParameter !== null) out.activeParameter = s.activeParameter;
      return out;
    }),
    activeSignature: help.activeSignature ?? 0,
    activeParameter: help.activeParameter ?? 0,
  };
}

// ---- 위치 ----

export function toLocations(result: lsp.Location | lsp.Location[] | lsp.LocationLink[] | null, mapUri: UriMapper): monaco.languages.Location[] {
  if (!result) return [];
  const list = Array.isArray(result) ? result : [result];
  const out: monaco.languages.Location[] = [];
  for (const loc of list) {
    if ("targetUri" in loc) {
      const uri = mapUri(loc.targetUri);
      if (uri) out.push({ uri, range: toRange(loc.targetSelectionRange ?? loc.targetRange) });
    } else {
      const uri = mapUri(loc.uri);
      if (uri) out.push({ uri, range: toRange(loc.range) });
    }
  }
  return out;
}

const HIGHLIGHT_KIND: Record<number, number> = { 1: 0, 2: 1, 3: 2 };

export function toHighlights(result: lsp.DocumentHighlight[] | null): monaco.languages.DocumentHighlight[] {
  return (result ?? []).map((h) => ({ range: toRange(h.range), kind: (HIGHLIGHT_KIND[h.kind ?? 1] ?? 0) as monaco.languages.DocumentHighlightKind }));
}

// ---- 문서 기호 ----

function toSymbol(s: lsp.DocumentSymbol): monaco.languages.DocumentSymbol {
  return {
    name: s.name,
    detail: s.detail ?? "",
    kind: Math.max(0, (s.kind ?? 13) - 1) as monaco.languages.SymbolKind,
    tags: s.tags?.includes(1) ? [1 as monaco.languages.SymbolTag] : [],
    range: toRange(s.range),
    selectionRange: toRange(s.selectionRange),
    children: (s.children ?? []).map(toSymbol),
  };
}

export function toDocumentSymbols(result: lsp.DocumentSymbol[] | lsp.SymbolInformation[] | null): monaco.languages.DocumentSymbol[] {
  if (!result) return [];
  return result.map((s) =>
    "location" in s
      ? {
          name: s.name,
          detail: "",
          kind: Math.max(0, s.kind - 1) as monaco.languages.SymbolKind,
          tags: [],
          range: toRange(s.location.range),
          selectionRange: toRange(s.location.range),
          containerName: s.containerName,
        }
      : toSymbol(s),
  );
}

// ---- 이름 바꾸기 ----

/** 파일 URI 마다 고칠 곳. 파일 만들기와 지우기가 든 편집은 받지 않는다 (null) */
export function workspaceEditFiles(edit: lsp.WorkspaceEdit | null): Map<string, lsp.TextEdit[]> | null {
  const out = new Map<string, lsp.TextEdit[]>();
  if (!edit) return out;
  if (edit.documentChanges) {
    for (const change of edit.documentChanges) {
      if (!("textDocument" in change)) return null;
      const list = out.get(change.textDocument.uri) ?? [];
      list.push(...(change.edits as lsp.TextEdit[]));
      out.set(change.textDocument.uri, list);
    }
  } else if (edit.changes) {
    for (const [uri, edits] of Object.entries(edit.changes)) out.set(uri, [...(out.get(uri) ?? []), ...edits]);
  }
  return out;
}

export function toWorkspaceEdit(files: Map<string, lsp.TextEdit[]>, mapUri: UriMapper): monaco.languages.WorkspaceEdit {
  const edits: monaco.languages.IWorkspaceTextEdit[] = [];
  for (const [uri, list] of files) {
    const resource = mapUri(uri);
    if (!resource) continue;
    for (const e of list) edits.push({ resource, textEdit: { range: toRange(e.range), text: e.newText }, versionId: undefined });
  }
  return { edits };
}
