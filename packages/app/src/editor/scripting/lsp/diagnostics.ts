// 진단의 표시 범위 (docs/plans/language-server.md 5절). 서버는 규칙(프로젝트의 .luarc.json, 없으면 템플릿의 규칙)대로
// 진단을 보내고, 에디터는 설정(scriptDiagnostics)에 따라 그중 무엇을 마커로 보일지 고른다.

import type { ScriptDiagnostics } from "@initial-editor/core";
import type * as lsp from "vscode-languageserver-protocol";

export type DiagnosticsMode = ScriptDiagnostics;

/** 구문 오류의 출처 (LuaLS 는 구문 검사와 규칙 진단의 source 가 다르다) */
const SYNTAX_SOURCES = new Set(["Lua Syntax Check."]);

export function isSyntaxDiagnostic(d: lsp.Diagnostic): boolean {
  return d.source !== undefined && SYNTAX_SOURCES.has(d.source);
}

export function filterDiagnostics(list: lsp.Diagnostic[], mode: DiagnosticsMode): lsp.Diagnostic[] {
  if (mode === "off") return [];
  if (mode === "syntax") return list.filter(isSyntaxDiagnostic);
  return list;
}
