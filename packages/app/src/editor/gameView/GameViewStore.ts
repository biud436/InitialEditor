// 게임 뷰 (docs/plans/e4-embedded-play.md 마일스톤 2 ~ 4). 웹 엔진(WASM)을 에디터의 게임 탭 canvas 에 올린다.
// 실행기(RunnerStore)가 내장 실행일 때 launch 를 부르고, 돌려받은 GameSession 을 프로세스처럼 다룬다.
//
// 실행 한 번의 순서:
//   1. 게임 탭을 열고(있으면 앞으로) 새 canvas(id="canvas")를 만든다. 뷰가 그것을 탭 안에 붙인다
//   2. 백엔드로 파일을 읽어 모은다 (staging.ts, 진행은 "파일 올리는 중 42/155")
//   3. canvas 가 문서에 붙기를 기다린다 (SDL 이 document.querySelector("#canvas") 로 찾는다)
//   4. bootInitial2D. 출력은 세션이 받아 실행기가 콘솔(source engine)로 보낸다
// 끝나면(정지, 게임 종료, 실패) 모듈을 버리고 WebGL 컨텍스트와 오디오를 돌려주고 canvas 를 뗀다. 다시 실행하면 새 canvas 와 새 인스턴스다.

import type { DocumentRegistry, LogStore, Project, ProjectBackend, RunHandle } from "@initial-editor/core";
import { action, makeObservable, observable, runInAction } from "mobx";
import { RELOAD_ON_SAVE_DIRS } from "../runner/reloadOnSave";
import { captureCanvasStats, releaseEngineResources, type CanvasStats } from "./canvasTools";
import { createEngineRuntimeLoader, shortCommit, type EngineManifest, type EngineRuntime } from "./engineAssets";
import { GAME_KIND, GameDocument } from "./GameDocument";
import { GameSession } from "./GameSession";
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
}

const LOG = "runner";
export const CANVAS_ID = "canvas";
const DEFAULT_ATTACH_TIMEOUT_MS = 5000;

export class GameViewStore {
  phase: GamePhase = "idle";
  canvas: HTMLCanvasElement | null = null;
  /** 파일 올리는 중의 진행 */
  progress: { done: number; total: number } | null = null;
  /** 끝났거나 실패했을 때 뷰에 보일 글 */
  message: string | null = null;
  /** 초당 프레임 (requestAnimationFrame 수, 엔진 루프가 같은 박자로 돈다). 모르면 null */
  fps: number | null = null;
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

  constructor(
    private readonly editor: GameViewHost,
    opts: GameViewOptions = {},
  ) {
    this.loadRuntime = opts.loadRuntime ?? createEngineRuntimeLoader();
    this.createCanvas = opts.createCanvas ?? (() => document.createElement("canvas"));
    this.attachTimeoutMs = opts.attachTimeoutMs ?? DEFAULT_ATTACH_TIMEOUT_MS;
    this.quitTimeoutMs = opts.quitTimeoutMs;
    this.concurrency = opts.concurrency;
    makeObservable<GameViewStore, "setPhase">(this, {
      phase: observable,
      canvas: observable.ref,
      progress: observable.ref,
      message: observable,
      fps: observable,
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
      const game = await runtime.boot({
        canvas,
        files: read.files,
        env: opts.env,
        print: current.print,
        printErr: current.printErr,
        moduleOverrides: { onAbort: () => current.fail(1) },
      });
      current.attach(game);
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
      if (session && !session.ended) await session.stop();
      this.dropCanvas();
      runInAction(() => {
        if (this.session === session) this.session = null;
      });
      this.setPhase(aborted ? "idle" : "failed", { message: aborted ? null : `실행하지 못했다: ${(e as Error).message}` });
      throw aborted ? new StageAbortedError() : e;
    } finally {
      if (this.abortController === controller) this.abortController = null;
    }
  }

  /** 파일을 올리는 중이면 그만둔다 */
  abort(): void {
    this.abortController?.abort();
  }

  /** paths 를 다시 올리고 VM 을 다시 시작한다. paths 가 없으면 scripts 와 씬과 맵 전부. 올린 파일 수 */
  async reload(paths?: readonly string[]): Promise<number> {
    const game = this.session?.game;
    if (!game || this.phase !== "running") throw new Error("에디터 안 엔진이 실행 중이 아니다");
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
    if (this.session?.game !== game) throw new Error("그사이 게임이 끝났다");
    game.reload(read.files);
    return Object.keys(read.files).length;
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

  /** 테스트와 검수용: 다음 프레임의 canvas 픽셀 통계. 실행 중이 아니면 null */
  async capture(): Promise<CanvasStats | null> {
    if (!this.canvas || this.phase !== "running") return null;
    return captureCanvasStats(this.canvas);
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
  }

  // ---- 안쪽 ----

  private setPhase(phase: GamePhase, extra: { progress?: GameViewStore["progress"]; message?: string | null } = {}): void {
    this.phase = phase;
    this.progress = extra.progress ?? null;
    if (extra.message !== undefined) this.message = extra.message;
    else if (phase === "staging") this.message = null;
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

  private onSessionEnded(session: GameSession, code: number | null): void {
    if (session !== this.session) {
      releaseEngineResources(null, session.game?.module ?? null);
      return;
    }
    this.stopMeters();
    releaseEngineResources(this.canvas, session.game?.module ?? null);
    const message =
      code === null
        ? "정지했다. F5 로 다시 실행한다"
        : code === 0
          ? "게임이 끝났다. F5 로 다시 실행한다"
          : `게임이 오류로 끝났다 (종료 코드 ${code}). 콘솔의 오류 줄을 누르면 그 자리로 간다`;
    session.game = null;
    runInAction(() => {
      this.canvas = null;
      this.session = null;
    });
    this.setPhase("ended", { message });
  }

  /** FPS 와 오디오 상태를 1초마다 갱신한다. 탭이 숨으면 requestAnimationFrame 과 함께 멈춘다 */
  private startMeters(): void {
    this.stopMeters();
    if (typeof requestAnimationFrame !== "function") return;
    let frames = 0;
    let last = performance.now();
    const tick = (t: number) => {
      frames++;
      if (t - last >= 1000) {
        const fps = Math.round((frames * 1000) / (t - last));
        const state = this.session?.game?.module.SDL2?.audioContext?.state;
        runInAction(() => {
          this.fps = fps;
          this.audioSuspended = state === "suspended";
        });
        frames = 0;
        last = t;
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
