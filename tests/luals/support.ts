// 진짜 LuaLS 를 Node 에서 띄우는 도우미 (yarn test:luals 와 e2e language-server.spec.ts).
// 실행 파일은 INITIAL_EDITOR_LUALS, 없으면 yarn luals:fetch 가 받은 src-tauri/luals/bin/lua-language-server 다.

import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Playwright 는 CJS 로, vitest 는 vite-node 로 읽으므로 둘 다 주는 __dirname 을 쓴다
const REPO = path.resolve(__dirname, "..", "..");

export function lualsExe(): string | null {
  const env = process.env.INITIAL_EDITOR_LUALS;
  if (env) return fs.existsSync(env) ? env : null;
  const exe = path.join(REPO, "src-tauri", "luals", "bin", process.platform === "win32" ? "lua-language-server.exe" : "lua-language-server");
  return fs.existsSync(exe) ? exe : null;
}

export const LUALS_MISSING = "LuaLS 실행 파일이 없습니다. yarn luals:fetch 로 받거나 INITIAL_EDITOR_LUALS 에 경로를 줍니다";

/** 메시지 단위의 LuaLS 연결. 머리(Content-Length)는 여기서 붙이고 뗀다 */
export class NodeLuals {
  readonly child: ChildProcess;
  private buffer = Buffer.alloc(0);
  private readonly messageListeners = new Set<(text: string) => void>();
  private readonly closeListeners = new Set<(reason: string) => void>();
  private closed = false;
  readonly work: string;

  constructor(exe: string, cwd: string) {
    this.work = fs.mkdtempSync(path.join(os.tmpdir(), "initial-luals-"));
    this.child = spawn(exe, [`--logpath=${path.join(this.work, "log")}`, `--metapath=${path.join(this.work, "meta")}`], { cwd, stdio: ["pipe", "pipe", "pipe"] });
    this.child.stdout!.on("data", (chunk: Buffer) => this.read(chunk));
    this.child.stderr!.on("data", () => {});
    this.child.on("exit", (code) => this.finish(`LuaLS 종료 (코드 ${code})`));
    this.child.on("error", (e) => this.finish(`LuaLS 실행 실패: ${e.message}`));
  }

  send(text: string): void {
    if (this.closed) return;
    this.child.stdin!.write(`Content-Length: ${Buffer.byteLength(text)}\r\n\r\n${text}`);
  }

  onMessage(listener: (text: string) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  onClose(listener: (reason: string) => void): () => void {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  close(): void {
    if (!this.closed) {
      this.child.stdin!.end();
      setTimeout(() => this.child.kill(), 2000).unref();
    }
    this.finish("닫음");
  }

  cleanup(): void {
    this.child.kill();
    fs.rmSync(this.work, { recursive: true, force: true });
  }

  private read(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    for (;;) {
      const head = this.buffer.indexOf("\r\n\r\n");
      if (head < 0) return;
      const match = /Content-Length:\s*(\d+)/i.exec(this.buffer.subarray(0, head).toString("ascii"));
      if (!match) throw new Error("LuaLS 출력에 Content-Length 가 없다");
      const length = Number(match[1]);
      if (this.buffer.length < head + 4 + length) return;
      const text = this.buffer.subarray(head + 4, head + 4 + length).toString("utf8");
      this.buffer = this.buffer.subarray(head + 4 + length);
      for (const l of this.messageListeners) l(text);
    }
  }

  private finish(reason: string): void {
    if (this.closed) return;
    this.closed = true;
    for (const l of this.closeListeners) l(reason);
  }
}

/** 임시 폴더에 파일을 쓴다 ({ 상대 경로: 글 }) */
export function writeProject(files: Record<string, string>): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "initial-luals-project-")));
  for (const [rel, text] of Object.entries(files)) {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
  return root;
}
