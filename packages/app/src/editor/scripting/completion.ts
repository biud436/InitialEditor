// ApiSpec 을 Monaco 공급자로 감싼다: 자동완성, 시그니처 도움말, 호버. 후보를 고르는 규칙은 completionModel.ts 에
// 있고 여기서는 Monaco 의 모양으로 바꾸기만 한다. 명세가 바뀌면(reloadSpec) 돌려받은 함수로 떼고 다시 건다.

import type { ApiSpec } from "./apiSpec";
import { analyzePrefix, buildIndex, callContext, candidates, describe, lookupCallable, lookupHover, pickSignature, type Lang, type LangIndex, type Signature, type Suggestion } from "./completionModel";
import { monaco } from "./monaco";

type CompletionKind = monaco.languages.CompletionItemKind;

function kindOf(s: Suggestion): CompletionKind {
  const K = monaco.languages.CompletionItemKind;
  switch (s.kind) {
    case "module":
      return K.Module;
    case "class":
      return K.Class;
    case "function":
      return K.Function;
    case "method":
      return K.Method;
    case "constructor":
      return K.Constructor;
    case "property":
      return K.Property;
    case "constant":
      return K.Constant;
    case "hook":
      return K.Snippet;
    case "symbol":
      return K.EnumMember;
  }
}

function docMarkdown(s: Suggestion): monaco.IMarkdownString | undefined {
  const value = describe(s);
  return value ? { value } : undefined;
}

function toItem(s: Suggestion, range: monaco.IRange, index: number): monaco.languages.CompletionItem {
  const item: monaco.languages.CompletionItem = {
    label: s.label,
    kind: kindOf(s),
    detail: s.detail,
    documentation: docMarkdown(s),
    insertText: s.insert,
    range,
    sortText: `${s.kind === "hook" ? "0" : "1"}${String(index).padStart(4, "0")}`,
  };
  if (s.snippet) item.insertTextRules = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;
  if (s.kind === "symbol") item.filterText = s.label.replace(/^:"?/, "");
  return item;
}

function linePrefix(model: monaco.editor.ITextModel, position: monaco.Position): string {
  return model.getValueInRange({ startLineNumber: position.lineNumber, startColumn: 1, endLineNumber: position.lineNumber, endColumn: position.column });
}

function signatureOf(sig: Signature, doc: string): monaco.languages.SignatureInformation {
  return {
    label: sig.label,
    documentation: doc ? { value: doc } : undefined,
    parameters: sig.params.map((p) => ({ label: p.range, documentation: p.doc || undefined })),
  };
}

function registerLanguage(lang: Lang, index: LangIndex): monaco.IDisposable[] {
  const triggerCharacters = lang === "ruby" ? [".", ":"] : ["."];
  const completion = monaco.languages.registerCompletionItemProvider(lang, {
    triggerCharacters,
    provideCompletionItems(model, position) {
      const prefix = linePrefix(model, position);
      const ctx = analyzePrefix(prefix, lang);
      const list = candidates(index, ctx, lang, model.getValue());
      if (!list.length) return { suggestions: [] };
      // 치던 단어를 통째로 바꾼다. Symbol 은 `:` 부터
      const wordStart = position.column - ctx.word.length - (ctx.symbolArg && prefix.endsWith(":" + ctx.word) ? 1 : 0);
      const range: monaco.IRange = { startLineNumber: position.lineNumber, startColumn: Math.max(1, wordStart), endLineNumber: position.lineNumber, endColumn: position.column };
      return { suggestions: list.map((s, i) => toItem(s, range, i)) };
    },
  });
  const signatures = monaco.languages.registerSignatureHelpProvider(lang, {
    signatureHelpTriggerCharacters: ["(", ","],
    signatureHelpRetriggerCharacters: [","],
    provideSignatureHelp(model, position) {
      const call = callContext(linePrefix(model, position));
      if (!call) return null;
      const s = lookupCallable(index, call.callee);
      if (!s || s.signatures.length === 0) return null;
      const active = pickSignature(s.signatures, call.activeParameter);
      const count = s.signatures[active].params.length;
      return {
        value: { signatures: s.signatures.map((sig) => signatureOf(sig, s.doc)), activeSignature: active, activeParameter: Math.min(call.activeParameter, Math.max(0, count - 1)) },
        dispose() {},
      };
    },
  });
  const hover = monaco.languages.registerHoverProvider(lang, {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) return null;
      // 단어 앞의 받는 쪽 (Graphics. 이나 Keys::)
      const before = model.getValueInRange({ startLineNumber: position.lineNumber, startColumn: 1, endLineNumber: position.lineNumber, endColumn: word.startColumn });
      const receiver = /([A-Za-z_]\w*)\s*(?:\.|::)\s*$/.exec(before)?.[1] ?? null;
      // Ruby 술어의 ? 와 setter 의 = 는 단어에 안 들어온다
      const after = model.getValueInRange({ startLineNumber: position.lineNumber, startColumn: word.endColumn, endLineNumber: position.lineNumber, endColumn: word.endColumn + 1 });
      const name = lang === "ruby" && after === "?" ? `${word.word}?` : word.word;
      const s = lookupHover(index, receiver, name);
      if (!s) return null;
      const md = docMarkdown(s);
      if (!md) return null;
      return { range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn), contents: [md] };
    },
  });
  return [completion, signatures, hover];
}

/** 명세로 Lua 와 Ruby 공급자를 건다. 돌려주는 함수로 뗀다 */
export function registerApiProviders(spec: ApiSpec): () => void {
  const disposables = [...registerLanguage("lua", buildIndex(spec, "lua")), ...registerLanguage("ruby", buildIndex(spec, "ruby"))];
  return () => {
    for (const d of disposables) d.dispose();
  };
}
