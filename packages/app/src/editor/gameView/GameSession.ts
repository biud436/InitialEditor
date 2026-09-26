// 게임 뷰의 실행 한 번. 실행기(RunnerStore)에게는 프로세스와 같은 RunHandle 로 보인다: 출력 줄, 종료, 정지.
// 엔진이 부팅 중에 찍는 줄은 구독자가 붙기 전에 오므로 모아 두었다가 첫 구독자에게 준다.
//
// 끝나는 길은 셋이다.
//   1. stop(): quit() 을 부르고 루프가 내려갔다는 줄을 기다린 뒤(시간 제한) 정리한다. 종료 코드 null
//   2. 게임이 스스로 끝남(Lua 오류, System.exit, INITIAL2D_EXIT_AFTER): 루프가 멈춘 줄이 온다. 스크립트 오류가 있었으면 1, 아니면 0
//   3. 부팅 실패나 abort: fail(code)

import type { OutputStream, RunHandle } from "@initial-editor/core";
import type { EngineGame } from "./engineAssets";

/** 엔진(WebMain.cpp)이 루프를 내리고 정리한 뒤 찍는 줄 */
export const LOOP_STOPPED_LINE = "Initial2D web: main loop stopped";
const SCRIPT_ERROR = /^Lua error in |^mruby: uncaught exception|PANIC|^Aborted\(/;
const DEFAULT_QUIT_TIMEOUT_MS = 1500;

export interface GameSessionOptions {
  id: number;
  /** 끝났을 때 한 번. 게임 뷰가 모듈과 canvas 를 버린다 (종료 구독자보다 먼저) */
  onEnded(session: GameSession, code: number | null): void;
  quitTimeoutMs?: number;
}

type OutputListener = (line: string, stream: OutputStream) => void;
type ExitListener = (code: number | null) => void;

export class GameSession implements RunHandle {
  readonly id: number;
  readonly pid = undefined;
  game: EngineGame | null = null;

  private readonly outputs = new Set<OutputListener>();
  private readonly exits = new Set<ExitListener>();
  private buffered: Array<[string, OutputStream]> = [];
  private result: { code: number | null } | null = null;
  private stopping: Promise<void> | null = null;
  private loopStopped = false;
  private loopWaiters: Array<() => void> = [];
  private scriptFailed = false;
  private readonly quitTimeoutMs: number;

  constructor(private readonly opts: GameSessionOptions) {
    this.id = opts.id;
    this.quitTimeoutMs = opts.quitTimeoutMs ?? DEFAULT_QUIT_TIMEOUT_MS;
  }

  /** Module.print (Lua print) */
  readonly print = (line: string): void => this.line(line, "stdout");
  /** Module.printErr (SDL_Log, Lua 오류) */
  readonly printErr = (line: string): void => this.line(line, "stderr");

  get ended(): boolean {
    return this.result !== null;
  }

  get exitCode(): number | null {
    return this.result?.code ?? null;
  }

  attach(game: EngineGame): void {
    this.game = game;
  }

  onOutput(cb: OutputListener): () => void {
    this.outputs.add(cb);
    if (this.buffered.length > 0) {
      const lines = this.buffered;
      this.buffered = [];
      for (const [line, stream] of lines) cb(line, stream);
    }
    return () => void this.outputs.delete(cb);
  }

  onExit(cb: ExitListener): () => void {
    this.exits.add(cb);
    if (this.result) {
      const code = this.result.code;
      queueMicrotask(() => cb(code));
    }
    return () => void this.exits.delete(cb);
  }

  /** 정지. 이미 끝났으면 아무것도 하지 않는다 */
  stop(): Promise<void> {
    if (this.result) return Promise.resolve();
    if (!this.stopping) this.stopping = this.doStop();
    return this.stopping;
  }

  /** 부팅 실패, abort, main 의 0 아닌 반환. 다음 틱에 끝낸다 (엔진 콜백 안에서 부를 수 있다) */
  fail(code: number): void {
    setTimeout(() => this.finish(code), 0);
  }

  private async doStop(): Promise<void> {
    if (this.game && !this.loopStopped) {
      try {
        this.game.quit();
      } catch (e) {
        this.line(`quit 실패: ${(e as Error).message}`, "stderr");
      }
      await this.waitForLoopStop();
    }
    this.finish(null);
  }

  private waitForLoopStop(): Promise<void> {
    if (this.loopStopped) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(done, this.quitTimeoutMs);
      function done() {
        clearTimeout(timer);
        resolve();
      }
      this.loopWaiters.push(done);
    });
  }

  private line(text: string, stream: OutputStream): void {
    if (SCRIPT_ERROR.test(text)) this.scriptFailed = true;
    if (this.outputs.size === 0) this.buffered.push([text, stream]);
    else for (const cb of this.outputs) cb(text, stream);
    if (text.includes(LOOP_STOPPED_LINE)) this.onLoopStopped();
  }

  private onLoopStopped(): void {
    this.loopStopped = true;
    const waiters = this.loopWaiters;
    this.loopWaiters = [];
    for (const w of waiters) w();
    // 스스로 끝났다. 엔진의 프레임 콜백 안이므로 정리는 다음 틱에
    if (!this.stopping) this.fail(this.scriptFailed ? 1 : 0);
  }

  private finish(code: number | null): void {
    if (this.result) return;
    this.result = { code };
    this.opts.onEnded(this, code);
    for (const cb of [...this.exits]) cb(code);
  }
}
