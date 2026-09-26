// 게임 뷰의 실행 한 번. 실행기(RunnerStore)에게는 프로세스와 같은 RunHandle 로 보인다: 출력 줄, 종료, 정지.
// 엔진이 부팅 중에 찍는 줄은 구독자가 붙기 전에 오므로 모아 두었다가 첫 구독자에게 준다.
//
// 끝나는 길은 넷이다.
//   1. stop(): quit() 을 부르고 루프가 멈추기를 기다린 뒤(시간 제한) 정리한다. 종료 코드 null.
//      이미 멈춘 엔진(루프가 멈췄거나 예외로 죽었거나 프레임이 더 돌지 않는다)은 기다리지 않는다
//   2. 게임이 스스로 끝남(System.exit, INITIAL2D_EXIT_AFTER, 치명적 오류): 로더의 onExit(code) 가 있으면 그 코드,
//      없으면 루프가 멈춘 줄로 알고 스크립트 오류 줄이 있었으면 1, 아니면 0
//   3. 예외가 wasm 밖으로 나옴(crash): 읽는 글로 "fatal:" 줄을 찍고 종료 코드 1
//   4. 부팅 실패나 abort: fail(code)

import type { OutputStream, RunHandle } from "@initial-editor/core";
import type { EngineGame } from "./engineAssets";
import { errorText } from "./errorText";

/** 엔진(WebMain.cpp)이 루프를 내리고 정리한 뒤 찍는 줄 */
export const LOOP_STOPPED_LINE = "Initial2D web: main loop stopped";
const SCRIPT_ERROR = /^Lua error in |^mruby: uncaught exception|PANIC|^Aborted\(|^fatal:/;
const DEFAULT_QUIT_TIMEOUT_MS = 1500;
/** quit 뒤 프레임 수가 이만큼 그대로면 루프가 이미 죽은 것으로 본다 (살아 있는 루프는 다음 프레임에 멈춘다) */
const STALL_MS = 200;
const STALL_POLL_MS = 50;
/** 첫 프레임을 기다릴 때 frames()를 보는 간격 */
const STEP_POLL_MS = 16;

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
  /** 예외로 죽었을 때 그 글 (게임 뷰의 안내에 쓴다) */
  crashText: string | null = null;

  private readonly outputs = new Set<OutputListener>();
  private readonly exits = new Set<ExitListener>();
  private buffered: Array<[string, OutputStream]> = [];
  private result: { code: number | null } | null = null;
  private stopping: Promise<void> | null = null;
  private loopStopped = false;
  private loopWaiters: Array<() => void> = [];
  private scriptFailed = false;
  /** 로더의 onExit 가 준 코드 (onExit 를 부르지 않는 로더면 undefined) */
  private engineExit: number | undefined = undefined;
  private endScheduled = false;
  private readonly quitTimeoutMs: number;

  constructor(private readonly opts: GameSessionOptions) {
    this.id = opts.id;
    this.quitTimeoutMs = opts.quitTimeoutMs ?? DEFAULT_QUIT_TIMEOUT_MS;
  }

  /** Module.print (Lua print) */
  readonly print = (line: string): void => this.line(line, "stdout");
  /** Module.printErr (SDL_Log, Lua 오류) */
  readonly printErr = (line: string): void => this.line(line, "stderr");
  /** 로더의 onExit. 엔진의 프레임 콜백 안에서 불리므로 정리는 다음 틱에 */
  readonly exited = (code: number): void => {
    if (this.result) return;
    this.engineExit = code;
    this.onLoopStopped();
  };

  get ended(): boolean {
    return this.result !== null;
  }

  get exitCode(): number | null {
    return this.result?.code ?? null;
  }

  /** 루프가 멈췄거나 예외로 죽었다 (quit 을 불러도 답할 엔진이 없다) */
  get dead(): boolean {
    return this.loopStopped || this.crashText !== null;
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

  /**
   * 예외가 엔진 밖으로 나왔다 (window 까지 올라온 오류, reload 가 던짐). 읽는 글을 "fatal:" 줄로 콘솔에 보내고
   * 종료 코드 1 로 바로 끝낸다. 엔진 콜백 밖(오류 이벤트, 에디터의 호출)에서 불린다. 정지하는 중이면 정지로 끝난다
   */
  crash(e: unknown): void {
    if (this.result || this.crashText !== null) return;
    const text = errorText(e, this.game);
    this.crashText = text;
    this.line(`fatal: ${text}`, "stderr");
    // 오류가 루프 밖(이벤트 처리기)에서 났으면 루프는 아직 돈다. 멈추게 한다. 죽은 엔진이면 던지고, 그것은 무시한다
    try {
      this.game?.quit();
    } catch {
      // 이미 죽었다
    }
    this.releaseLoopWaiters();
    if (!this.stopping) this.finish(1);
  }

  /**
   * 엔진이 프레임을 하나 이상 돌았고 아직 돌면 true, 그 전에 루프가 멈추거나 세션이 끝나면 false.
   * 엔진은 프레임 콜백 안에서 프레임 수를 올린 뒤 같은 콜백에서 루프를 내리므로, 수가 1 이상인데 루프가 멈추지 않았으면
   * 시작 때 걸어 둔 종료 요청(시작 스크립트의 오류)은 없다. frames()가 없는 로더는 알 수 없어서 바로 true
   */
  whenStepped(pollMs = STEP_POLL_MS): Promise<boolean> {
    return new Promise((resolve) => {
      const check = () => {
        if (this.result || this.dead || !this.game) {
          resolve(false);
          return;
        }
        const frames = readFrames(this.game);
        if (frames === null || frames >= 1) resolve(true);
        else setTimeout(check, pollMs);
      };
      check();
    });
  }

  /** reload 의 결과. 스크립트가 깨끗이 다시 떴으면 이전 스크립트 오류는 잊는다 */
  noteReload(ok: boolean | void): void {
    if (ok === true) this.scriptFailed = false;
  }

  private async doStop(): Promise<void> {
    // 스스로 끝나는 정리가 이미 잡혀 있으면 그 종료 코드를 남긴다 (먼저 잡힌 타이머가 먼저 돈다)
    if (this.endScheduled) await new Promise((r) => setTimeout(r, 0));
    if (this.result) return;
    const game = this.game;
    if (game && !this.dead) {
      const before = readFrames(game);
      let quitFailed = false;
      try {
        game.quit();
      } catch (e) {
        quitFailed = true;
        this.line(`quit 실패: ${errorText(e, game)}`, "stderr");
      }
      if (!quitFailed) await this.waitForLoopStop(game, before);
    }
    this.finish(null);
  }

  /** 루프가 멈춘 줄이나 onExit, 프레임이 멈춤(이미 죽은 루프), 시간 제한 중 먼저 오는 것 */
  private waitForLoopStop(game: EngineGame, before: number | null): Promise<void> {
    if (this.dead) return Promise.resolve();
    return new Promise((resolve) => {
      const started = Date.now();
      const timer = setTimeout(done, this.quitTimeoutMs);
      const poll = before === null ? null : setInterval(check, STALL_POLL_MS);
      function check() {
        if (Date.now() - started >= STALL_MS && readFrames(game) === before) done();
      }
      function done() {
        clearTimeout(timer);
        if (poll !== null) clearInterval(poll);
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
    this.releaseLoopWaiters();
    // 스스로 끝났다. 엔진의 프레임 콜백 안이므로 정리는 다음 틱에. 줄과 onExit 가 같은 콜백에서 오므로 그때는 둘 다 와 있다
    if (!this.stopping && !this.endScheduled) {
      this.endScheduled = true;
      setTimeout(() => this.finish(this.engineExit ?? (this.scriptFailed ? 1 : 0)), 0);
    }
  }

  private releaseLoopWaiters(): void {
    const waiters = this.loopWaiters;
    this.loopWaiters = [];
    for (const w of waiters) w();
  }

  private finish(code: number | null): void {
    if (this.result) return;
    this.result = { code };
    this.opts.onEnded(this, code);
    for (const cb of [...this.exits]) cb(code);
  }
}

/** 로더의 frames(). 없거나 실패하면 null */
export function readFrames(game: EngineGame | null | undefined): number | null {
  if (!game || typeof game.frames !== "function") return null;
  try {
    const n = game.frames();
    return typeof n === "number" && Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}
