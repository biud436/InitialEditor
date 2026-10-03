// 분석기 워커를 띄우는 ServerLauncher (docs/plans/language-server.md 8절 단계 2).
// 워커는 디스크를 모르므로 서버가 보는 루트는 언제나 /project 이고, 파일은 에디터가 initial/workspaceFiles 와 initial/readFile 로 준다.

import type { MessageTransport } from "../rpc";
import type { ServerLauncher } from "../LanguageServer";
import LuaWorker from "./lua.worker?worker";
import RubyWorker from "./ruby.worker?worker";

export const WORKER_ROOT = "/project";

function workerTransport(worker: Worker): MessageTransport {
  const closes = new Set<(reason: string) => void>();
  let closed = false;
  const finish = (reason: string) => {
    if (closed) return;
    closed = true;
    for (const l of closes) l(reason);
  };
  worker.addEventListener("error", (e) => finish(`분석기 워커 오류: ${e.message}`));
  return {
    send: (text) => {
      if (!closed) worker.postMessage(text);
    },
    onMessage(listener) {
      const handler = (e: MessageEvent) => {
        if (typeof e.data === "string") listener(e.data);
      };
      worker.addEventListener("message", handler);
      return () => worker.removeEventListener("message", handler);
    },
    onClose(listener) {
      closes.add(listener);
      return () => closes.delete(listener);
    },
    close: () => {
      worker.terminate();
      finish("닫음");
    },
  };
}

export function workerLauncher(language: "lua" | "ruby"): ServerLauncher {
  return {
    name: language === "lua" ? "Lua 분석기" : "Ruby 분석기",
    replacesSpec: false,
    available: async () => ({ version: null }),
    launch: async () => {
      const worker = language === "lua" ? new LuaWorker() : new RubyWorker();
      return { transport: workerTransport(worker), root: WORKER_ROOT, library: null, version: null };
    },
  };
}
