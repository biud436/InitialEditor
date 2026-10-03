// Ruby 분석기 (Prism wasm, CRuby 의 파서). 구문 오류는 Prism 이 복구하며 여럿 낸다.
// 기호는 module, class, class << self, def(def self.x 포함), 상수 대입이다. Prism 의 위치는 UTF-8 바이트라서 ByteLines 로 바꾼다.
// 엔진의 mruby 4.0 은 자체 파서(parse.y)를 써서 드물게 판정이 다를 수 있다 (mruby 4.1 부터는 Prism 이다).

import { WASI } from "@bjorn3/browser_wasi_shim";
import { ClassNode, ConstantWriteNode, DefNode, ModuleNode, SelfNode, SingletonClassNode, type Node } from "@ruby/prism/src/nodes.js";
import { parsePrism } from "@ruby/prism/src/parsePrism.js";
import type * as lsp from "vscode-languageserver-protocol";
import { ByteLines, type AnalyzedSymbol, type Analysis, type Analyzer } from "./analysis";

export const RUBY_SOURCE = "prism";

const MODULE = 2 as lsp.SymbolKind;
const CLASS = 5 as lsp.SymbolKind;
const METHOD = 6 as lsp.SymbolKind;
const CONSTANT = 14 as lsp.SymbolKind;

/** prism.wasm 바이트로 파서를 만든다 (WASI 는 쓰지 않는 빈 환경) */
export async function loadPrism(wasm: BufferSource): Promise<WebAssembly.Exports> {
  const module = await WebAssembly.compile(wasm);
  const wasi = new WASI([], [], []);
  const instance = await WebAssembly.instantiate(module, { wasi_snapshot_preview1: wasi.wasiImport });
  wasi.initialize(instance as unknown as { exports: { memory: WebAssembly.Memory; _initialize?: () => unknown } });
  return instance.exports;
}

function children(node: Node): Node[] {
  return (node as unknown as { compactChildNodes(): Node[] }).compactChildNodes();
}

function symbolsIn(node: Node, lines: ByteLines): AnalyzedSymbol[] {
  const out: AnalyzedSymbol[] = [];
  for (const child of children(node)) {
    const loc = (n: { startOffset: number; length: number }) => lines.range(n.startOffset, n.length);
    if (child instanceof ClassNode || child instanceof ModuleNode) {
      const name = child.name;
      out.push({ name, key: name, kind: child instanceof ClassNode ? CLASS : MODULE, range: loc(child.location), selectionRange: loc(child.constantPath.location), children: child.body ? symbolsIn(child.body, lines) : [] });
      continue;
    }
    if (child instanceof DefNode) {
      const self = child.receiver instanceof SelfNode;
      const name = self ? `self.${child.name}` : child.name;
      out.push({ name, key: child.name, kind: METHOD, range: loc(child.location), selectionRange: loc(child.nameLoc), children: child.body ? symbolsIn(child.body, lines) : [] });
      continue;
    }
    if (child instanceof SingletonClassNode) {
      // class << self 안의 def 는 클래스 메서드다
      const inner = child.body ? symbolsIn(child.body, lines) : [];
      for (const s of inner) out.push(s.kind === METHOD && !s.name.startsWith("self.") ? { ...s, name: `self.${s.name}` } : s);
      continue;
    }
    if (child instanceof ConstantWriteNode) {
      out.push({ name: child.name, key: child.name, kind: CONSTANT, range: loc(child.location), selectionRange: loc(child.nameLoc), children: [] });
      continue;
    }
    out.push(...symbolsIn(child, lines));
  }
  return out;
}

export function createRubyAnalyzer(prism: WebAssembly.Exports): Analyzer {
  return {
    analyze(text: string): Analysis {
      const result = parsePrism(prism, text);
      const lines = new ByteLines(text);
      const diagnostics: lsp.Diagnostic[] = result.errors.map((e) => ({
        range: lines.range(e.location.startOffset, Math.max(1, e.location.length)),
        severity: 1,
        source: RUBY_SOURCE,
        message: e.message,
      }));
      return { diagnostics, symbols: symbolsIn(result.value as unknown as Node, lines) };
    },
  };
}
