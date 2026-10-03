// Lua 분석기 (luaparse, Lua 5.3 문법). 구문 오류는 처음 하나만 나온다 (luaparse 는 오류에서 멈춘다).
// 기호는 함수 선언(function f, function M.f, function M:f, local function f)과 함수를 담는 대입(local f = function, M.f = function)이다.

import { parse, type Expression, type Node, type Statement } from "luaparse";
import type * as lsp from "vscode-languageserver-protocol";
import type { AnalyzedSymbol, Analysis, Analyzer } from "./analysis";

export const LUA_SOURCE = "luaparse";

const FUNCTION = 12 as lsp.SymbolKind;
const METHOD = 6 as lsp.SymbolKind;

interface Loc {
  start: { line: number; column: number };
  end: { line: number; column: number };
}

function range(loc: Loc | undefined): lsp.Range {
  if (!loc) return { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
  return { start: { line: loc.start.line - 1, character: loc.start.column }, end: { line: loc.end.line - 1, character: loc.end.column } };
}

/** 식의 이름 (a, a.b, a:b). 이름으로 쓸 수 없는 식이면 null */
function nameOf(expr: Expression | null | undefined): { name: string; key: string; method: boolean; loc: Loc | undefined } | null {
  if (!expr) return null;
  if (expr.type === "Identifier") return { name: expr.name, key: expr.name, method: false, loc: expr.loc as Loc | undefined };
  if (expr.type === "MemberExpression") {
    const base = nameOf(expr.base);
    if (!base) return null;
    return { name: `${base.name}${expr.indexer}${expr.identifier.name}`, key: expr.identifier.name, method: expr.indexer === ":", loc: expr.identifier.loc as Loc | undefined };
  }
  return null;
}

function bodyOf(node: Node): Statement[] {
  const n = node as { body?: unknown; clauses?: Array<{ body: Statement[] }> };
  if (Array.isArray(n.body)) return n.body as Statement[];
  if (Array.isArray(n.clauses)) return n.clauses.flatMap((c) => c.body);
  return [];
}

function functionSymbol(name: { name: string; key: string; method: boolean; loc: Loc | undefined }, fn: Node): AnalyzedSymbol {
  return {
    name: name.name,
    key: name.key,
    kind: name.method ? METHOD : FUNCTION,
    range: range(fn.loc as Loc | undefined),
    selectionRange: range(name.loc ?? (fn.loc as Loc | undefined)),
    children: symbolsIn(bodyOf(fn)),
  };
}

function symbolsIn(statements: Statement[]): AnalyzedSymbol[] {
  const out: AnalyzedSymbol[] = [];
  for (const st of statements) {
    if (st.type === "FunctionDeclaration") {
      const name = nameOf(st.identifier as Expression | null);
      if (name) out.push(functionSymbol(name, st));
      else out.push(...symbolsIn(st.body));
      continue;
    }
    if (st.type === "LocalStatement" || st.type === "AssignmentStatement") {
      st.init.forEach((init, i) => {
        if (init.type !== "FunctionDeclaration") return;
        const name = nameOf(st.variables[i] as Expression | undefined);
        if (name) out.push(functionSymbol(name, init));
      });
      continue;
    }
    // 블록 안의 함수 (if, do, while, for)
    out.push(...symbolsIn(bodyOf(st)));
  }
  return out;
}

/** "[3:5] unexpected symbol near 'x'" 의 머리를 뗀다 */
function message(e: { message: string }): string {
  return e.message.replace(/^\[\d+:\d+\]\s*/, "");
}

export function analyzeLua(text: string): Analysis {
  try {
    const chunk = parse(text, { luaVersion: "5.3", locations: true, comments: false, scope: false });
    return { diagnostics: [], symbols: symbolsIn(chunk.body) };
  } catch (e) {
    const err = e as { message: string; line?: number; column?: number };
    if (typeof err.line !== "number") throw e;
    const line = Math.max(0, err.line - 1);
    const column = Math.max(0, err.column ?? 0);
    const lineText = text.split("\n")[line] ?? "";
    let end = column;
    while (end < lineText.length && /[A-Za-z0-9_]/.test(lineText[end])) end++;
    if (end === column) end = Math.min(lineText.length, column + 1);
    const diagnostic: lsp.Diagnostic = {
      range: { start: { line, character: column }, end: { line, character: Math.max(end, column) } },
      severity: 1,
      source: LUA_SOURCE,
      message: message(err),
    };
    return { diagnostics: [diagnostic], symbols: [] };
  }
}

export const luaAnalyzer: Analyzer = { analyze: analyzeLua };
