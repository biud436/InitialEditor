// 앱에 든 언어 서버(LuaLS)의 셸 명령 (src-tauri/src/lsp.rs, docs/plans/language-server.md 3절).
//   lsp_available() → { exe, version } | null
//   lsp_start(root, channel, library?) → { id, pid, exe, version, library }
//   lsp_send(id, text), lsp_stop(id)
// 서버의 메시지(JSON 문자열)와 끝은 lsp_start 에 넘긴 채널로 순서대로 온다. Content-Length 머리는 셸이 다룬다.

import { Channel, invoke } from "@tauri-apps/api/core";
import { toBackendError } from "./index";

export interface LspAvailable {
  exe: string;
  version: string | null;
}

export interface LspInfo {
  id: number;
  pid: number;
  exe: string;
  version: string | null;
  /** 셸이 앱 캐시에 쓴 엔진 API 스텁 (start 에 library 를 주었을 때) */
  library: string | null;
}

type LspEvent = { kind: "message"; text: string } | { kind: "exit"; code: number | null; stderr: string[] };

/** 앱에 든 LuaLS. 개발 빌드에서 src-tauri/luals 가 없으면 null */
export async function lspAvailable(): Promise<LspAvailable | null> {
  try {
    return await invoke<LspAvailable | null>("lsp_available");
  } catch (e) {
    throw toBackendError(e);
  }
}

/** 띄운 서버 하나. 메시지 단위로 주고받는다 */
export class TauriLanguageServer {
  private readonly messageListeners = new Set<(text: string) => void>();
  private readonly closeListeners = new Set<(reason: string) => void>();
  /** 듣는 쪽이 붙기 전에 온 메시지 */
  private early: string[] | null = [];
  private closedReason: string | null = null;

  private constructor(readonly info: LspInfo) {}

  /** root 에서 LuaLS 를 띄운다. library 는 프로젝트에 스텁이 없을 때 셸이 앱 캐시에 쓸 스텁의 글이다 */
  static async start(root: string, library?: string): Promise<TauriLanguageServer> {
    let server: TauriLanguageServer | null = null;
    const pending: LspEvent[] = [];
    const channel = new Channel<LspEvent>();
    channel.onmessage = (event) => {
      if (server) server.receive(event);
      else pending.push(event);
    };
    let info: LspInfo;
    try {
      info = await invoke<LspInfo>("lsp_start", { root, channel, library: library ?? null });
    } catch (e) {
      throw toBackendError(e);
    }
    server = new TauriLanguageServer(info);
    for (const event of pending) server.receive(event);
    return server;
  }

  send(text: string): void {
    if (this.closedReason !== null) return;
    invoke("lsp_send", { id: this.info.id, text }).catch((e) => this.close(`쓰기 실패: ${toBackendError(e).message}`));
  }

  onMessage(listener: (text: string) => void): () => void {
    this.messageListeners.add(listener);
    if (this.early) {
      const early = this.early;
      this.early = null;
      for (const text of early) listener(text);
    }
    return () => this.messageListeners.delete(listener);
  }

  onClose(listener: (reason: string) => void): () => void {
    if (this.closedReason !== null) {
      listener(this.closedReason);
      return () => {};
    }
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  /** 서버를 끝낸다 (입력을 닫고, 남아 있으면 셸이 kill) */
  close(reason = "닫음"): void {
    if (this.closedReason === null) void invoke("lsp_stop", { id: this.info.id }).catch(() => {});
    this.finish(reason);
  }

  private receive(event: LspEvent): void {
    if (event.kind === "message") {
      if (this.early) this.early.push(event.text);
      else for (const listener of this.messageListeners) listener(event.text);
      return;
    }
    const tail = event.stderr.length ? `: ${event.stderr[event.stderr.length - 1]}` : "";
    this.finish(`언어 서버가 종료되었습니다 (종료 코드 ${event.code ?? "없음"}${tail})`);
  }

  private finish(reason: string): void {
    if (this.closedReason !== null) return;
    this.closedReason = reason;
    for (const listener of this.closeListeners) listener(reason);
    this.closeListeners.clear();
  }
}
