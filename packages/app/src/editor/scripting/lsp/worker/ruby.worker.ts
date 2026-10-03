// Ruby 분석기 워커 (Prism wasm). 세 실행 환경 모두에서 쓴다. prism.wasm 은 initialize 때 받는다.

import wasmUrl from "@ruby/prism/src/prism.wasm?url";
import { RpcConnection } from "../rpc";
import { createRubyAnalyzer, loadPrism } from "./rubyAnalyzer";
import { selfTransport } from "./selfTransport";
import { AnalyzerServer } from "./server";

async function load() {
  const res = await fetch(wasmUrl);
  if (!res.ok) throw new Error(`prism.wasm 요청 실패 (HTTP ${res.status})`);
  return createRubyAnalyzer(await loadPrism(await res.arrayBuffer()));
}

const transport = selfTransport();
const server = new AnalyzerServer(new RpcConnection(transport), load, { name: "prism", version: "1.9.0" });
server.onExit(() => transport.close());
server.install();
