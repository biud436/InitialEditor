// 워커 분석기의 공통 꼴 (docs/plans/language-server.md 8절 단계 2). 분석기는 글 하나를 읽어 구문 오류와 기호를 돌려준다.
// 위치는 LSP 와 같이 0 부터의 줄과 UTF-16 단위의 열이다.

import type * as lsp from "vscode-languageserver-protocol";

export interface AnalyzedSymbol {
  /** 보이는 이름 (Lua 의 M.add, Ruby 의 self.load) */
  name: string;
  /** 찾을 때 쓰는 끝 이름 (add, load) */
  key: string;
  kind: lsp.SymbolKind;
  range: lsp.Range;
  selectionRange: lsp.Range;
  children: AnalyzedSymbol[];
}

export interface Analysis {
  diagnostics: lsp.Diagnostic[];
  symbols: AnalyzedSymbol[];
}

export interface Analyzer {
  analyze(text: string): Analysis;
}

/** 기호 나무를 한 줄로 */
export function flattenSymbols(symbols: AnalyzedSymbol[], out: AnalyzedSymbol[] = []): AnalyzedSymbol[] {
  for (const s of symbols) {
    out.push(s);
    flattenSymbols(s.children, out);
  }
  return out;
}

/** UTF-8 바이트 위치를 줄과 UTF-16 열로 바꾸는 표 (Prism 의 위치는 바이트다) */
export class ByteLines {
  /** 줄마다 시작의 [바이트, UTF-16] 위치 */
  private readonly starts: Array<[number, number]> = [[0, 0]];

  constructor(private readonly text: string) {
    let bytes = 0;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
        bytes += 4;
        i++;
      } else bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : 3;
      if (code === 10) this.starts.push([bytes, i + 1]);
    }
  }

  position(byteOffset: number): lsp.Position {
    let lo = 0;
    let hi = this.starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.starts[mid][0] <= byteOffset) lo = mid;
      else hi = mid - 1;
    }
    const [lineByte, lineChar] = this.starts[lo];
    let bytes = lineByte;
    let i = lineChar;
    while (bytes < byteOffset && i < this.text.length) {
      const code = this.text.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff && i + 1 < this.text.length) {
        bytes += 4;
        i += 2;
      } else {
        bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : 3;
        i++;
      }
    }
    return { line: lo, character: i - lineChar };
  }

  range(startOffset: number, length: number): lsp.Range {
    return { start: this.position(startOffset), end: this.position(startOffset + length) };
  }
}

/** 그 자리의 낱말 (식별자, Ruby 의 ? ! 끝 포함). 없으면 null */
export function wordAt(text: string, position: lsp.Position): { word: string; range: lsp.Range; receiver: string | null } | null {
  const line = text.split("\n")[position.line];
  if (line === undefined) return null;
  const isWord = (c: string) => /[A-Za-z0-9_]/.test(c);
  let start = position.character;
  let end = position.character;
  while (start > 0 && isWord(line[start - 1])) start--;
  while (end < line.length && isWord(line[end])) end++;
  if (end < line.length && (line[end] === "?" || line[end] === "!") && end > start) end++;
  if (start === end) return null;
  const before = line.slice(0, start);
  const receiver = /([A-Za-z_][A-Za-z0-9_]*)\s*(?:\.|:|::)\s*$/.exec(before)?.[1] ?? null;
  return { word: line.slice(start, end), range: { start: { line: position.line, character: start }, end: { line: position.line, character: end } }, receiver };
}
