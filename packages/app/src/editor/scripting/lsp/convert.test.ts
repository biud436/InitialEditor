import { describe, expect, it } from "vitest";
import type * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import { completionItems, toCompletionItem, toDocumentSymbols, toHighlights, toHover, toLocations, toMarker, toSignatureHelp, toWorkspaceEdit, workspaceEditFiles } from "./convert";
import { filterDiagnostics } from "./diagnostics";
import { luaSection, nestDotted, TEMPLATE_LUARC, configurationFor } from "./luaSettings";
import { fileUri, filePath, joinPath, relativeTo } from "./uri";

const range = { start: { line: 1, character: 2 }, end: { line: 1, character: 5 } };
const monacoRange = { startLineNumber: 2, startColumn: 3, endLineNumber: 2, endColumn: 6 };
const fakeUri = (s: string) => ({ toString: () => s, path: s }) as unknown as monaco.Uri;

describe("uri", () => {
  it("POSIX 경로와 file URI 를 오간다 (한글과 공백은 인코딩)", () => {
    const uri = fileUri("/Users/u/내 게임/scripts/main.lua");
    expect(uri).toBe("file:///Users/u/%EB%82%B4%20%EA%B2%8C%EC%9E%84/scripts/main.lua");
    expect(filePath(uri)).toBe("/Users/u/내 게임/scripts/main.lua");
    expect(relativeTo("/Users/u/내 게임", filePath(uri)!)).toBe("scripts/main.lua");
    expect(relativeTo("/Users/u/game", "/Users/u/game2/a.lua")).toBeNull();
    expect(relativeTo("/Users/u/game/", "/Users/u/game")).toBe("");
    expect(joinPath("/Users/u/game/", "a/b.lua")).toBe("/Users/u/game/a/b.lua");
  });

  it("Windows 경로: 드라이브 문자의 대소문자와 %3A 를 가리지 않는다", () => {
    expect(fileUri("C:\\Users\\u\\game\\a.lua")).toBe("file:///c%3A/Users/u/game/a.lua");
    expect(filePath(fileUri("C:\\Users\\RUNNER~1\\내 게임\\a.lua"))).toBe("c:/Users/RUNNER~1/내 게임/a.lua");
    expect(relativeTo("C:\\Users\\u\\game", filePath(fileUri("C:\\Users\\u\\game\\scripts\\a.lua"))!)).toBe("scripts/a.lua");
    expect(filePath("file:///c%3A/Users/u/game/a.lua")).toBe("c:/Users/u/game/a.lua");
    expect(relativeTo("C:\\Users\\u\\game", "c:/Users/u/game/a.lua")).toBe("a.lua");
  });

  it("Windows 의 확장 경로 접두사(\\\\?\\)를 뗀다 (셸이 정규화한 프로젝트 루트)", () => {
    expect(fileUri("\\\\?\\D:\\a\\proj")).toBe("file:///d%3A/a/proj");
    expect(fileUri("\\\\?\\D:\\a\\proj\\scripts\\main.lua")).toBe("file:///d%3A/a/proj/scripts/main.lua");
    expect(relativeTo("\\\\?\\D:\\a\\proj", "d:/a/proj/scripts/main.lua")).toBe("scripts/main.lua");
    expect(joinPath("\\\\?\\D:\\a\\proj", "resources/api/initial2d.lua")).toBe("D:/a/proj/resources/api/initial2d.lua");
  });

  it("file URI 가 아니면 null", () => {
    expect(filePath("initial:/a.lua")).toBeNull();
    expect(filePath("file://host/share/a.lua")).toBeNull();
    expect(filePath("file:///%E0%A4%A")).toBeNull();
  });
});

describe("convert", () => {
  it("진단을 마커로: 심각도, 태그, 코드", () => {
    const m = toMarker({ range, severity: 2, message: "Undefined global `x`.", code: "undefined-global", tags: [1], source: "Lua Diagnostics." });
    expect(m).toMatchObject({ ...monacoRange, severity: 4, message: "Undefined global `x`.", code: "undefined-global", tags: [1], source: "LuaLS" });
    expect(toMarker({ range, message: "e" }).severity).toBe(8);
    expect(toMarker({ range, severity: 4, message: "h" }).severity).toBe(1);
  });

  it("표시 범위에 따라 진단을 거른다", () => {
    const syntax = { range, message: "Missed symbol `end`.", source: "Lua Syntax Check." };
    const rule = { range, message: "Unused local", source: "Lua Diagnostics." };
    expect(filterDiagnostics([syntax, rule], "rules")).toHaveLength(2);
    expect(filterDiagnostics([syntax, rule], "syntax")).toEqual([syntax]);
    expect(filterDiagnostics([syntax, rule], "off")).toEqual([]);
  });

  it("완성 항목: 종류, textEdit, 삽입과 바꾸기 범위, 스니펫, 추가 편집, 문서", () => {
    const def = { insert: monacoRange, replace: monacoRange };
    const fn = toCompletionItem({ label: "add(a, b)", kind: 3, insertText: "add", detail: "function", documentation: { kind: "markdown", value: "**더한다**" } }, def);
    expect(fn).toMatchObject({ label: "add(a, b)", kind: 1, insertText: "add", range: def, detail: "function", documentation: { value: "**더한다**" } });
    const edit = toCompletionItem({ label: "x", kind: 6, textEdit: { range, newText: "xx" } }, def);
    expect(edit).toMatchObject({ insertText: "xx", range: monacoRange, kind: 4 });
    const ir = toCompletionItem({ label: "y", textEdit: { newText: "yy", insert: range, replace: range } }, def);
    expect(ir.range).toEqual({ insert: monacoRange, replace: monacoRange });
    const snippet = toCompletionItem({ label: "for", kind: 15, insertTextFormat: 2, insertText: "for ${1:i} do\n\t$0\nend", additionalTextEdits: [{ range, newText: "local M = {}\n" }], tags: [1], command: { title: "t", command: "editor.action.triggerParameterHints" } }, def);
    expect(snippet).toMatchObject({ kind: 27, insertTextRules: 4, additionalTextEdits: [{ range: monacoRange, text: "local M = {}\n" }], tags: [1], command: { id: "editor.action.triggerParameterHints" } });
    const custom = toCompletionItem({ label: "z", command: { title: "t", command: "lua.autoRequire" } }, def);
    expect(custom.command).toBeUndefined();
    expect(completionItems(null)).toEqual({ items: [], incomplete: false });
    expect(completionItems({ isIncomplete: true, items: [{ label: "a" }] })).toEqual({ items: [{ label: "a" }], incomplete: true });
  });

  it("호버: markdown, plaintext, MarkedString 배열, 빈 내용은 null", () => {
    expect(toHover({ contents: { kind: "markdown", value: "```lua\nfunction f()\n```" }, range })).toEqual({ contents: [{ value: "```lua\nfunction f()\n```" }], range: monacoRange });
    expect(toHover({ contents: { kind: "plaintext", value: "a*b" } })?.contents[0].value).toBe("a\\*b");
    expect(toHover({ contents: ["x", { language: "lua", value: "local y" }] })?.contents).toEqual([{ value: "x" }, { value: "```lua\nlocal y\n```" }]);
    expect(toHover({ contents: "" })).toBeNull();
    expect(toHover(null)).toBeNull();
  });

  it("시그니처: 인자 이름과 오프셋 꼴 둘 다", () => {
    const help = toSignatureHelp({ signatures: [{ label: "DrawText(x, y, text)", documentation: "그린다", parameters: [{ label: "x" }, { label: [12, 13] }] }], activeSignature: 0, activeParameter: 1 });
    expect(help).toEqual({ signatures: [{ label: "DrawText(x, y, text)", documentation: "그린다", parameters: [{ label: "x", documentation: undefined }, { label: [12, 13], documentation: undefined }] }], activeSignature: 0, activeParameter: 1 });
    expect(toSignatureHelp({ signatures: [] })).toBeNull();
  });

  it("위치: Location, LocationLink, 루트 밖은 뺀다", () => {
    const map = (u: string) => (u.startsWith("file:///proj/") ? fakeUri(u.replace("file:///proj/", "initial:/")) : null);
    expect(toLocations({ uri: "file:///proj/a.lua", range }, map).map((l) => [String(l.uri), l.range])).toEqual([["initial:/a.lua", monacoRange]]);
    expect(toLocations([{ targetUri: "file:///proj/b.lua", targetRange: range, targetSelectionRange: range }, { targetUri: "file:///lib/x.lua", targetRange: range, targetSelectionRange: range }], map)).toHaveLength(1);
    expect(toLocations(null, map)).toEqual([]);
    expect(toHighlights([{ range, kind: 3 }, { range }])).toEqual([
      { range: monacoRange, kind: 2 },
      { range: monacoRange, kind: 0 },
    ]);
  });

  it("문서 기호: 계층과 평평한 목록, 종류는 하나 작다", () => {
    const tree = toDocumentSymbols([{ name: "M", kind: 2, range, selectionRange: range, children: [{ name: "add", kind: 12, range, selectionRange: range }] }]);
    expect(tree[0]).toMatchObject({ name: "M", kind: 1, children: [{ name: "add", kind: 11 }] });
    const flat = toDocumentSymbols([{ name: "f", kind: 12, location: { uri: "file:///a.lua", range }, containerName: "M" }]);
    expect(flat[0]).toMatchObject({ name: "f", kind: 11, range: monacoRange, containerName: "M" });
  });

  it("이름 바꾸기: changes 와 documentChanges, 파일 작업은 받지 않는다", () => {
    const a = workspaceEditFiles({ changes: { "file:///proj/a.lua": [{ range, newText: "n" }] } });
    expect([...a!.keys()]).toEqual(["file:///proj/a.lua"]);
    const b = workspaceEditFiles({ documentChanges: [{ textDocument: { uri: "file:///proj/b.lua", version: 1 }, edits: [{ range, newText: "n" }] }] });
    expect(b!.get("file:///proj/b.lua")).toHaveLength(1);
    expect(workspaceEditFiles({ documentChanges: [{ kind: "create", uri: "file:///proj/c.lua" }] })).toBeNull();
    const edit = toWorkspaceEdit(b!, (u) => fakeUri(u.replace("file:///proj/", "initial:/")));
    expect(edit.edits).toHaveLength(1);
    expect((edit.edits[0] as monaco.languages.IWorkspaceTextEdit).textEdit).toEqual({ range: monacoRange, text: "n" });
  });
});

describe("luaSettings", () => {
  it("점 이름 키를 겹친 객체로 ($schema 는 뺀다)", () => {
    expect(nestDotted({ $schema: "x", "runtime.version": "Lua 5.3", "a.b.c": 1, "a.b.d": [2] })).toEqual({ runtime: { version: "Lua 5.3" }, a: { b: { c: 1, d: [2] } } });
  });

  it("템플릿의 규칙에 스텁 경로와 앱의 기본값을 더한다", () => {
    expect(TEMPLATE_LUARC["runtime.version"]).toBe("Lua 5.3");
    const lua = luaSection(["/proj/resources/api/initial2d.lua"]) as Record<string, Record<string, unknown>>;
    expect(lua.runtime.version).toBe("Lua 5.3");
    expect(lua.workspace).toEqual({ library: ["/proj/resources/api/initial2d.lua"], checkThirdParty: false });
    expect(lua.diagnostics).toEqual({ groupFileStatus: TEMPLATE_LUARC["diagnostics.groupFileStatus"], disable: TEMPLATE_LUARC["diagnostics.disable"] });
    expect(configurationFor("Lua", [])).toBeTruthy();
    expect(configurationFor("files.exclude", [])).toEqual({});
    expect(configurationFor("editor.semanticHighlighting.enabled", [])).toBe(false);
    expect(configurationFor("unknown", [])).toBeNull();
  });
});
