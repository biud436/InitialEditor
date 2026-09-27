// 게임 뷰 (docs/plans/e4-embedded-play.md 마일스톤 2 ~ 4). 웹 엔진(WASM)을 에디터의 게임 탭 canvas 에 올린다.
// 실행기(RunnerStore)가 내장 실행일 때 launch 를 부르고, 돌려받은 GameSession 을 프로세스처럼 다룬다.
//
// 실행 한 번의 순서:
//   1. 게임 탭을 열고(있으면 앞으로) 새 canvas(id="canvas")를 만든다. 뷰가 그것을 탭 안에 붙인다
//   2. 백엔드로 파일을 읽어 모은다 (staging.ts, 진행은 "파일 올리는 중 42/155")
//   3. canvas 가 문서에 붙기를 기다린다 (SDL 이 document.querySelector("#canvas") 로 찾는다)
//   4. bootInitial2D. 출력은 세션이 받아 실행기가 콘솔(source engine)로 보낸다
// 끝나면(정지, 게임 종료, 실패) 모듈을 버리고 WebGL 컨텍스트와 오디오를 돌려주고 canvas 를 뗀다. 다시 실행하면 새 canvas 와 새 인스턴스다.
//
// 엔진이 죽는 것을 아는 길: 로더의 onExit(있을 때), 루프가 멈춘 줄, 실행 중 window 까지 올라온 엔진의 오류와
// 처리되지 않은 거부(예외가 wasm 밖으로 나왔다: 세션을 종료 코드 1 로 끝낸다), reload 가 던짐(같다).
// reload 가 false 를 돌려주면 스크립트 오류다. 오류 줄은 이미 콘솔에 있고 엔진은 네이티브처럼 계속 돈다.
// 세션이 끝났거나 끝나는 중(reload 밖의 스크립트 오류, GameSession.ending)이면 reload 하지 않고 dropped 로 답한다.

import type { DocumentRegistry, LogStore, Project, ProjectBackend, RunHandle } from "@initial-editor/core";
import { action, makeObservable, observable, runInAction } from "mobx";
import { RELOAD_ON_SAVE_DIRS } from "../runner/reloadOnSave";
import type { EmbeddedReload } from "../runner/RunnerStore";
import { captureCanvasStats, releaseEngineResources, type CanvasStats } from "./canvasTools";
import { createEngineRuntimeLoader, shortCommit, type EngineManifest, type EngineRuntime } from "./engineAssets";
import { errorText, isEngineError } from "./errorText";
import { GAME_KIND, GameDocument } from "./GameDocument";
import { GameSession, readFrames } from "./GameSession";
import { formatBytes, listStageFiles, readStageFiles, StageAbortedError, type StageEntry } from "./staging";

export type GamePhase = "idle" | "staging" | "booting" | "running" | "ended" | "failed";

export interface GameViewHost {
  readonly backend: ProjectBackend;
  readonly project: Project;
  readonly documents: DocumentRegistry;
  readonly log: LogStore;
}

export interface GameViewOptions {
  /** 웹 엔진 부팅 함수와 MANIFEST (테스트는 가짜 로더를 준다) */
  loadRuntime?: () => Promise<EngineRuntime>;
  createCanvas?: () => HTMLCanvasElement;
  /** canvas 가 문서에 붙기를 기다리는 시간 */
  attachTimeoutMs?: number;
  quitTimeoutMs?: number;
  concurrency?: number;
  /** 엔진의 오류를 들을 창 (테스트는 가짜를 준다). 기본은 window */
  errorTarget?: Pick<Window, "addEventListener" | "removeEventListener"> | null;
}

const LOG = "runner";
export const CANVAS_ID = "canvas";
const DEFAULT_ATTACH_TIMEOUT_MS = 5000;
/** 게임이 끝났거나 끝나는 중이라 올리지 않은 리로드 */
const DROPPED_RELOAD: EmbeddedReload = { count: 0, scriptsFailed: false, dropped: true };

export class GameViewStore {
  phase: GamePhase = "idle";
  canvas: HTMLCanvasElement | null = null;
  /** 파일 올리는 중의 진행 */
  progress: { done: number; total: number } | null = null;
  /** 끝났거나 실패했을 때 뷰에 보일 글 */
  message: string | null = null;
  /** 초당 프레임. 로더에 frames() 가 있으면 엔진이 돈 프레임, 없으면 이 페이지의 requestAnimationFrame 수. 모르면 null */
  fps: number | null = null;
  /** 마지막 실행의 종료 코드 (정지는 null). 상태 띠가 오류로 끝났는지 보인다 */
  lastExitCode: number | null = null;
  /** 브라우저 정책으로 소리가 멈춰 있다 (사용자 제스처가 필요하다) */
  audioSuspended = false;
  /** game.json 의 창 크기 (canvas 크기) */
  gameSize = { width: 768, height: 896 };
  manifest: EngineManifest | null = null;
  session: GameSession | null = null;

  private readonly loadRuntime: () => Promise<EngineRuntime>;
  private readonly createCanvas: () => HTMLCanvasElement;
  private readonly attachTimeoutMs: number;
  private readonly quitTimeoutMs: number | undefined;
  private readonly concurrency: number | undefined;
  private abortController: AbortController | null = null;
  private nextId = 1;
  private host: HTMLElement | null = null;
  private meterFrame: number | null = null;
  private readonly errorTarget: Pick<Window, "addEventListener" | "removeEventListener"> | null;
  private unwatchErrors: (() => void) | null = null;

  constructor(
    private readonly editor: GameViewHost,
    opts: GameViewOptions = {},
  ) {
    this.loadRuntime = opts.loadRuntime ?? createEngineRuntimeLoader();
    this.createCanvas = opts.createCanvas ?? (() => document.createElement("canvas"));
    this.attachTimeoutMs = opts.attachTimeoutMs ?? DEFAULT_ATTACH_TIMEOUT_MS;
    this.quitTimeoutMs = opts.quitTimeoutMs;
    this.concurrency = opts.concurrency;
    this.errorTarget = opts.errorTarget !== undefined ? opts.errorTarget : typeof window === "undefined" ? null : window;
    makeObservable<GameViewStore, "setPhase">(this, {
      phase: observable,
      canvas: observable.ref,
      progress: observable.ref,
      message: observable,
      fps: observable,
      lastExitCode: observable,
      audioSuspended: observable,
      gameSize: observable.ref,
      manifest: observable.ref,
      session: observable.ref,
      setPhase: action,
    });
  }

  // ---- 실행기에게 보이는 쪽 (RunnerStore 의 EmbeddedEngine) ----

  /** 웹 엔진의 기능 목록 (MANIFEST 의 features) */
  async loadFeatures(): Promise<string[]> {
    const runtime = await this.loadRuntime();
    runInAction(() => (this.manifest = runtime.manifest));
    return runtime.manifest.features;
  }

  /** 상태 바 툴팁 */
  get description(): string | null {
    const m = this.manifest;
    return m ? `기능 ${m.features.join(" ")}, 엔진 커밋 ${shortCommit(m)}` : null;
  }

  get isRunning(): boolean {
    return this.phase === "running";
  }

  /** 게임 탭을 열고 파일을 올리고 엔진을 띄운다. 실패하거나 abort 되면 던진다 */
  async launch(opts: { env: Record<string, string> }): Promise<RunHandle> {
    if (this.session && !this.session.ended) await this.session.stop();
    this.abortController?.abort();
    const controller = new AbortController();
    this.abortController = controller;
    const { signal } = controller;
    const { backend, project, log } = this.editor;
    const started = Date.now();

    this.openDocument();
    const canvas = this.freshCanvas(project.gameJson.windowWidth, project.gameJson.windowHeight);
    this.setPhase("staging", { progress: { done: 0, total: 0 } });
    let session: GameSession | null = null;
    try {
      const runtimePromise = this.loadRuntime();
      runtimePromise.catch(() => {}); // 기다리는 쪽에서 받는다
      const listed = await listStageFiles(backend);
      for (const f of listed.tooLarge) log.warn(LOG, `${f.path} (${formatBytes(f.size ?? 0)}) 은(는) 32 MB 를 넘어 올리지 않았다`);
      const read = await readStageFiles(backend, listed.files, {
        concurrency: this.concurrency,
        signal,
        onProgress: (done, total) => runInAction(() => (this.progress = { done, total })),
      });
      for (const p of read.tooLarge) log.warn(LOG, `${p} 은(는) 32 MB 를 넘어 올리지 않았다`);
      const runtime = await runtimePromise;
      if (signal.aborted) throw new StageAbortedError();
      runInAction(() => (this.manifest = runtime.manifest));
      this.setPhase("booting");
      await this.waitForAttach(canvas, signal);

      session = new GameSession({ id: this.nextId++, quitTimeoutMs: this.quitTimeoutMs, onEnded: (s, code) => this.onSessionEnded(s, code) });
      const current = session;
      runInAction(() => (this.session = current));
      this.watchErrors(current);
      const game = await runtime.boot({
        canvas,
        files: read.files,
        env: opts.env,
        print: current.print,
        printErr: current.printErr,
        onExit: current.exited,
        moduleOverrides: { onAbort: () => current.fail(1) },
      });
      current.attach(game);
      if (current.ended) {
        // 부팅하는 사이 엔진의 예외로 이미 끝났다. 남은 루프와 오디오를 거둔다
        try {
          game.quit();
        } catch {
          // 이미 죽었다
        }
        releaseEngineResources(null, game.module);
        throw new Error(current.crashText ?? "엔진이 부팅 중에 끝났다");
      }
      if (signal.aborted) {
        await current.stop();
        throw new StageAbortedError();
      }
      this.setPhase("running");
      this.startMeters();
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      log.info(LOG, `에디터 안 엔진: ${Object.keys(read.files).length}개 파일 ${formatBytes(read.bytes)} 올림, ${seconds} 초`);
      if (game.exitCode !== 0) current.fail(game.exitCode);
      return current;
    } catch (e) {
      const aborted = e instanceof StageAbortedError || signal.aborted;
      const text = errorText(e, session?.game);
      if (session && !session.ended) await session.stop();
      if (session && this.session === session) this.unwatch();
      this.dropCanvas();
      runInAction(() => {
        if (this.session === session) this.session = null;
      });
      this.setPhase(aborted ? "idle" : "failed", { message: aborted ? null : `실행하지 못했다: ${text}` });
      if (aborted) throw new StageAbortedError();
      throw e instanceof Error && e.message ? e : new Error(text);
    } finally {
      if (this.abortController === controller) this.abortController = null;
    }
  }

  /** 파일을 올리는 중이면 그만둔다 */
  abort(): void {
    this.abortController?.abort();
  }

  /**
   * paths 를 다시 올리고 VM 을 다시 시작한다. paths 가 없으면 scripts 와 씬과 맵 전부. 올린 파일 수와 스크립트 오류 여부.
   * 세션이 끝났거나 끝나는 중이면(파일을 읽는 사이에 그렇게 되었어도) 올리지 않고 dropped 로 답한다.
   * 엔진이 예외를 던지면 세션을 종료 코드 1 로 끝내고 읽는 글로 던진다
   */
  async reload(paths?: readonly string[]): Promise<EmbeddedReload> {
    const session = this.session;
    const game = session?.game;
    if (!session || !game || this.phase !== "running") throw new Error("에디터 안 엔진이 실행 중이 아니다");
    if (session.ending) return DROPPED_RELOAD;
    const { backend } = this.editor;
    let entries: StageEntry[];
    if (paths) {
      entries = [];
      for (const p of paths) {
        if (await backend.exists(p).catch(() => false)) entries.push({ path: p });
      }
    } else {
      entries = (await listStageFiles(backend, RELOAD_ON_SAVE_DIRS)).files;
    }
    const read = await readStageFiles(backend, entries, { concurrency: this.concurrency });
    if (this.session !== session || session.game !== game || session.ending) return DROPPED_RELOAD;
    let result: boolean | void;
    try {
      result = session.reloadWith(() => game.reload(read.files));
    } catch (e) {
      session.crash(e);
      throw new Error(`엔진이 예외로 멈췄다: ${session.crashText ?? errorText(e, game)}`);
    }
    session.noteReload(result);
    return { count: Object.keys(read.files).length, scriptsFailed: result === false };
  }

  /** launch가 돌려준 실행의 엔진이 첫 프레임을 돌았고 끝나는 중이 아니면 true, 그 전에 끝나는 중이 되면 false (GameSession.whenStepped) */
  whenStepped(handle: RunHandle): Promise<boolean> {
    return handle instanceof GameSession ? handle.whenStepped() : Promise.resolve(false);
  }

  // ---- 뷰에게 보이는 쪽 ----

  /** 뷰가 canvas 를 담을 요소를 알린다. 돌려주는 함수로 뗀다 */
  attachHost(el: HTMLElement): () => void {
    this.host = el;
    if (this.canvas && this.canvas.parentElement !== el) el.appendChild(this.canvas);
    return () => {
      if (this.host === el) this.host = null;
    };
  }

  /** 멈춘 소리를 켠다 (사용자 제스처 안에서 불려야 한다) */
  resumeAudio(): void {
    const ctx = this.session?.game?.module.SDL2?.audioContext;
    if (!ctx || ctx.state !== "suspended") return;
    void ctx.resume().then(
      () => runInAction(() => (this.audioSuspended = ctx.state === "suspended")),
      () => {},
    );
  }

  /**
   * 테스트와 검수용: 다음 프레임의 canvas 픽셀 통계. 실행 중이 아니거나 그 프레임 전에 게임이 끝났으면(SDL 이 창을
   * 닫아 canvas 크기가 0 이다) null. 그 밖에 읽지 못하면 "게임 화면을 읽지 못했다" 로 던진다
   */
  async capture(): Promise<CanvasStats | null> {
    const canvas = this.canvas;
    if (!canvas || this.phase !== "running") return null;
    try {
      return await captureCanvasStats(canvas, () => this.canvas === canvas && this.phase === "running");
    } catch (e) {
      throw new Error(`게임 화면을 읽지 못했다: ${errorText(e)}`);
    }
  }

  /** canvas 가 키를 받게 한다 (게임 탭을 누르거나 탭이 앞으로 올 때). 도킹이 내용을 다시 붙이는 동안은 다음 프레임들에서 다시 해 본다 */
  focusCanvas(): () => void {
    const canvas = this.canvas;
    if (!canvas || this.phase !== "running" || typeof requestAnimationFrame !== "function") return () => {};
    let frame = 0;
    let tries = 0;
    const focus = () => {
      if (this.canvas !== canvas) return;
      if (canvas.isConnected) canvas.focus({ preventScroll: true });
      else if (tries++ < 30) frame = requestAnimationFrame(focus);
    };
    if (canvas.isConnected) canvas.focus({ preventScroll: true });
    frame = requestAnimationFrame(focus);
    return () => cancelAnimationFrame(frame);
  }

  /** 게임 탭을 열거나 앞으로 */
  openDocument(): GameDocument {
    const { documents } = this.editor;
    const existing = documents.documents.find((d) => d.kind === GAME_KIND);
    if (existing instanceof GameDocument) {
      documents.activate(existing);
      return existing;
    }
    const doc = new GameDocument();
    documents.open(doc);
    return doc;
  }

  dispose(): void {
    this.abort();
    if (this.session && !this.session.ended) void this.session.stop();
    this.stopMeters();
    this.unwatch();
  }

  // ---- 안쪽 ----

  private setPhase(phase: GamePhase, extra: { progress?: GameViewStore["progress"]; message?: string | null } = {}): void {
    this.phase = phase;
    this.progress = extra.progress ?? null;
    if (extra.message !== undefined) this.message = extra.message;
    else if (phase === "staging") this.message = null;
    if (phase === "staging") this.lastExitCode = null;
    if (phase !== "running") {
      this.fps = null;
      this.audioSuspended = false;
    }
  }

  private freshCanvas(width: number, height: number): HTMLCanvasElement {
    this.dropCanvas();
    const canvas = this.createCanvas();
    canvas.id = CANVAS_ID;
    canvas.className = "game-canvas";
    canvas.tabIndex = 0;
    canvas.width = width;
    canvas.height = height;
    canvas.setAttribute("data-testid", "game-canvas");
    canvas.addEventListener("pointerdown", () => this.resumeAudio());
    canvas.addEventListener("keydown", () => this.resumeAudio());
    // 오른쪽 클릭 메뉴는 게임이 쓴다
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    runInAction(() => {
      this.canvas = canvas;
      this.gameSize = { width, height };
    });
    if (this.host) this.host.appendChild(canvas);
    return canvas;
  }

  private dropCanvas(): void {
    const canvas = this.canvas;
    if (!canvas) return;
    releaseEngineResources(canvas, null);
    runInAction(() => (this.canvas = null));
  }

  private waitForAttach(canvas: HTMLCanvasElement, signal: AbortSignal): Promise<void> {
    if (canvas.isConnected) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + this.attachTimeoutMs;
      const poll = () => {
        if (signal.aborted) reject(new StageAbortedError());
        else if (canvas.isConnected) resolve();
        else if (Date.now() > deadline) reject(new Error("게임 탭의 canvas 가 화면에 붙지 않았다"));
        else setTimeout(poll, 16);
      };
      poll();
    });
  }

  /** 실행 중 window 까지 올라온 엔진의 오류와 처리되지 않은 거부를 그 세션의 죽음으로 받는다 */
  private watchErrors(session: GameSession): void {
    this.unwatch();
    const target = this.errorTarget;
    if (!target) return;
    const onError = (ev: Event) => {
      const { error, message, filename } = ev as ErrorEvent;
      if (session.ended || !isEngineError(error, filename)) return;
      session.crash(error ?? message);
    };
    const onRejection = (ev: Event) => {
      const { reason } = ev as PromiseRejectionEvent;
      if (session.ended || !isEngineError(reason)) return;
      session.crash(reason);
    };
    target.addEventListener("error", onError);
    target.addEventListener("unhandledrejection", onRejection);
    this.unwatchErrors = () => {
      target.removeEventListener("error", onError);
      target.removeEventListener("unhandledrejection", onRejection);
    };
  }

  private unwatch(): void {
    this.unwatchErrors?.();
    this.unwatchErrors = null;
  }

  private onSessionEnded(session: GameSession, code: number | null): void {
    if (session !== this.session) {
      releaseEngineResources(null, session.game?.module ?? null);
      return;
    }
    this.unwatch();
    this.stopMeters();
    releaseEngineResources(this.canvas, session.game?.module ?? null);
    const message =
      code === null
        ? "정지했다. F5 로 다시 실행한다"
        : code === 0
          ? "게임이 끝났다. F5 로 다시 실행한다"
          : session.crashText !== null
            ? `엔진이 예외로 멈췄다 (종료 코드 ${code}): ${session.crashText}. F5 로 다시 실행한다`
            : `게임이 오류로 끝났다 (종료 코드 ${code}). 콘솔의 오류 줄을 누르면 그 자리로 간다`;
    session.game = null;
    runInAction(() => {
      this.canvas = null;
      this.session = null;
      this.lastExitCode = code;
    });
    this.setPhase("ended", { message });
  }

  /**
   * FPS 와 오디오 상태를 1초마다 갱신한다. 로더에 frames() 가 있으면 엔진이 돈 프레임 수의 차이로 재서 죽은 엔진은 0 이다.
   * 없으면 이 페이지의 requestAnimationFrame 을 센다. 탭이 숨으면 requestAnimationFrame 과 함께 멈춘다
   */
  private startMeters(): void {
    this.stopMeters();
    if (typeof requestAnimationFrame !== "function") return;
    let ticks = 0;
    let last = performance.now();
    let lastFrames = readFrames(this.session?.game);
    const tick = (t: number) => {
      ticks++;
      if (t - last >= 1000) {
        const game = this.session?.game;
        const frames = readFrames(game);
        const counted = frames !== null && lastFrames !== null ? Math.max(0, frames - lastFrames) : ticks;
        const fps = Math.round((counted * 1000) / (t - last));
        const state = game?.module.SDL2?.audioContext?.state;
        runInAction(() => {
          this.fps = fps;
          this.audioSuspended = state === "suspended";
        });
        ticks = 0;
        last = t;
        lastFrames = frames;
      }
      this.meterFrame = requestAnimationFrame(tick);
    };
    this.meterFrame = requestAnimationFrame(tick);
  }

  private stopMeters(): void {
    if (this.meterFrame !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.meterFrame);
    this.meterFrame = null;
  }
}
