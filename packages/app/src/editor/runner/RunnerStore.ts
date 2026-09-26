// E1 엔진 실행기 (docs/plans/03-project-and-runtime.md 4절 모드 A, docs/plans/e1-scripting.md 마일스톤 2와 3).
// 엔진 실행 파일을 프로젝트 루트를 작업 폴더로 띄우고, 출력을 줄 단위로 콘솔에 흘리고, 핫 리로드 묶음을 보낸다.
// DOM 을 모르고 백엔드와 프로젝트와 설정과 로그만 본다 (그래서 Node 로 테스트한다). 커맨드와 이벤트 연결은
// index.ts 와 runCommands.ts 가 한다.
//
// 동시에 하나만 띄운다. 실행 중에 start 를 부르면 재시작이다. 정지는 백엔드가 SIGTERM 뒤 시간 제한을 두고 강제
// 종료하고(src-tauri/src/engine.rs), 여기서는 종료 이벤트가 오지 않아도 일정 시간 뒤 상태를 정리한다.

import {
  BackendError,
  classifyEngineLine,
  type HmrFile,
  type LogStore,
  type Platform,
  type Project,
  type ProjectBackend,
  type RunHandle,
  type SettingsStore,
} from "@initial-editor/core";
import { action, computed, makeObservable, observable, runInAction } from "mobx";
import { ENGINE_FILE, ENGINE_SOURCE_LABELS, engineCandidates, type EngineCandidate, type EngineSource } from "./engineCandidates";
import { collectHmrFiles } from "./hmrCollect";

export type RunnerState = "idle" | "starting" | "running" | "stopping";

export interface RunnerHost {
  readonly backend: ProjectBackend;
  readonly project: Project;
  readonly settings: SettingsStore;
  readonly log: LogStore;
  readonly toasts: { info(text: string): unknown; success(text: string): unknown; warn(text: string): unknown; error(text: string): unknown };
  readonly platform: Platform;
}

export interface RunnerOptions {
  /** `exe --features` 를 부른다 (Tauri 의 engineFeatures). 없으면 엔진을 찾지 못한다 */
  probe?: (exe: string) => Promise<string[]>;
  /** backend.capabilities.run 이 false 일 때 사용자에게 보일 이유 */
  unavailableReason?: string;
  /** 정지 뒤 종료 이벤트를 기다리는 시간 */
  stopTimeoutMs?: number;
  now?: () => number;
}

export interface StartOptions {
  /** INITIAL2D_SCENE (E2 의 현재 씬부터 실행) */
  scene?: string;
  /** 기본 변수(INITIAL2D_HMR, INITIAL2D_SCRIPT, INITIAL2D_SCENE) 뒤에 덧씌우는 환경 변수 (맵의 여기서 실행) */
  env?: Record<string, string>;
}

export const NO_MRUBY = "이 엔진 빌드에는 mruby 가 없다";
export const HMR_UNREACHABLE_HINT = "게임이 INITIAL2D_HMR=1 로 실행 중인지 확인";
const LOG_SOURCE = "runner";
const DEFAULT_STOP_TIMEOUT_MS = 4000;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** 42초 → "00:42", 1시간 2분 3초 → "01:02:03" */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${pad2(h)}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}

export class RunnerStore {
  state: RunnerState = "idle";
  handle: RunHandle | null = null;
  pid: number | null = null;
  startedAt: number | null = null;
  /** 마지막 종료 코드. 아직 끝난 적 없거나 시그널로 죽었으면 null. 다음 시작에서 지운다 */
  exitCode: number | null = null;
  /** `exe --features` 의 단어들 ("lua", "mruby"). 아직 모르면 null */
  features: string[] | null = null;
  enginePath: string | null = null;
  engineSource: EngineSource = "none";
  /** 마지막 탐색에서 찔러 본 후보 (툴팁에 보인다) */
  candidates: EngineCandidate[] = [];
  resolving = false;
  /** 마지막 핫 리로드 결과 */
  lastReload: { count: number; at: number } | null = null;
  /** 경과 시간 표시용. 실행 중 1초마다 갱신 */
  now: number;

  private readonly probe: ((exe: string) => Promise<string[]>) | null;
  private readonly unavailableText: string;
  private readonly stopTimeoutMs: number;
  private readonly clock: () => number;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private startPromise: Promise<void> | null = null;
  private lastStart: StartOptions = {};
  private resolveToken = 0;
  private exitWaiters: Array<() => void> = [];

  constructor(
    private readonly host: RunnerHost,
    opts: RunnerOptions = {},
  ) {
    this.probe = opts.probe ?? null;
    this.unavailableText = opts.unavailableReason ?? "이 백엔드는 엔진을 띄우지 못한다";
    this.stopTimeoutMs = opts.stopTimeoutMs ?? DEFAULT_STOP_TIMEOUT_MS;
    this.clock = opts.now ?? (() => Date.now());
    this.now = this.clock();
    makeObservable(this, {
      state: observable,
      handle: observable.ref,
      pid: observable,
      startedAt: observable,
      exitCode: observable,
      features: observable.ref,
      enginePath: observable,
      engineSource: observable,
      candidates: observable.ref,
      resolving: observable,
      lastReload: observable.ref,
      now: observable,
      isRunning: computed,
      unavailableReason: computed,
      canRun: computed,
      startHint: computed,
      canReload: computed,
      reloadHint: computed,
      elapsedMs: computed,
      elapsedText: computed,
      statusText: computed,
      statusTitle: computed,
      setEngine: action,
      tick: action,
    });
  }

  // ---- 상태 ----

  /** 시작 중이거나 실행 중 (정지 버튼이 켜지는 조건) */
  get isRunning(): boolean {
    return this.state === "running" || this.state === "starting";
  }

  /** 엔진을 못 띄우는 백엔드면 그 이유, 아니면 null */
  get unavailableReason(): string | null {
    return this.host.backend.capabilities.run ? null : this.unavailableText;
  }

  get canRun(): boolean {
    return this.startHint === undefined;
  }

  /** 실행 버튼이 비활성인 이유. 켜도 되면 undefined */
  get startHint(): string | undefined {
    const reason = this.unavailableReason;
    if (reason) return reason;
    if (!this.host.project.isOpen) return "프로젝트를 먼저 연다";
    if (this.state === "stopping") return "정지하는 중이다";
    if (!this.enginePath) {
      if (this.resolving) return "엔진을 찾는 중이다";
      const tried = this.candidates.map((c) => c.path).join(", ");
      return `엔진을 찾지 못했다. 찾아본 곳: ${tried || "(없음)"}. 설정의 엔진 경로에 적는다`;
    }
    if (this.host.project.gameJson.script === "mruby" && this.features && !this.features.includes("mruby")) return NO_MRUBY;
    return undefined;
  }

  /** 리로드: 브리지 모드는 프로젝트가 열려 있으면 늘, Tauri 는 실행 중일 때만 */
  get canReload(): boolean {
    return this.reloadHint === undefined;
  }

  get reloadHint(): string | undefined {
    if (!this.host.project.isOpen) return "프로젝트를 먼저 연다";
    if (this.host.backend.capabilities.run && this.state !== "running") return "엔진이 실행 중일 때 보낼 수 있다";
    return undefined;
  }

  get elapsedMs(): number {
    return this.startedAt === null ? 0 : Math.max(0, this.now - this.startedAt);
  }

  get elapsedText(): string {
    return formatElapsed(this.elapsedMs);
  }

  /** 상태 바 문구: 엔진: 없음 / 대기 / 시작 중 / 실행 중 PID 1234 00:42 / 정지 중 / 종료 코드 1 */
  get statusText(): string {
    switch (this.state) {
      case "starting":
        return "엔진: 시작 중";
      case "running":
        return `엔진: 실행 중 PID ${this.pid ?? "?"} ${this.elapsedText}`;
      case "stopping":
        return "엔진: 정지 중";
      default:
        break;
    }
    if (this.exitCode !== null) return `엔진: 종료 코드 ${this.exitCode}`;
    if (!this.enginePath) return "엔진: 없음";
    return "엔진: 대기";
  }

  /** 상태 바 툴팁: 없는 이유나 엔진 경로 */
  get statusTitle(): string | undefined {
    if (this.unavailableReason) return this.unavailableReason;
    if (!this.enginePath) return this.host.project.isOpen ? this.startHint : undefined;
    const features = this.features?.length ? ` (${this.features.join(" ")})` : "";
    return `${this.enginePath}${features}, ${ENGINE_SOURCE_LABELS[this.engineSource]}`;
  }

  setEngine(path: string | null, source: EngineSource, features: string[] | null): void {
    this.enginePath = path;
    this.engineSource = source;
    this.features = features;
  }

  tick(): void {
    this.now = this.clock();
  }

  // ---- 엔진 탐색 ----

  /**
   * 후보를 순서대로 `exe --features` 로 찔러 본다 (engineCandidates.ts). 처음 응답하는 것이 엔진이다.
   * 결과는 콘솔에 남긴다. 브라우저 모드는 찾지 않는다.
   */
  async resolveEngine(): Promise<string | null> {
    const token = ++this.resolveToken;
    const { backend, project, settings, log } = this.host;
    if (!backend.capabilities.run || !this.probe) {
      runInAction(() => {
        this.setEngine(null, "none", null);
        this.candidates = [];
      });
      return null;
    }
    if (!project.isOpen) return null;
    runInAction(() => (this.resolving = true));
    let projectFile: string | null = null;
    try {
      projectFile = await backend.readText(ENGINE_FILE);
    } catch {
      projectFile = null; // 없는 것이 보통이다
    }
    const candidates = engineCandidates({ root: project.root, settingsPath: settings.settings.enginePath, projectFile, platform: this.host.platform });
    let found: { candidate: EngineCandidate; features: string[] } | null = null;
    const failures: string[] = [];
    for (const candidate of candidates) {
      try {
        const features = await this.probe(candidate.path);
        found = { candidate, features };
        break;
      } catch (e) {
        failures.push(`${candidate.path}: ${(e as Error).message}`);
      }
    }
    if (token !== this.resolveToken) return this.enginePath; // 그사이 다시 탐색했다
    runInAction(() => {
      this.candidates = candidates;
      this.resolving = false;
      if (found) this.setEngine(found.candidate.path, found.candidate.source, found.features);
      else this.setEngine(null, "none", null);
    });
    if (found) {
      log.info(LOG_SOURCE, `엔진: ${found.candidate.path} (${ENGINE_SOURCE_LABELS[found.candidate.source]}, 기능: ${found.features.join(" ") || "(없음)"})`);
    } else {
      log.warn(LOG_SOURCE, `엔진을 찾지 못했다. 찾아본 곳: ${candidates.map((c) => c.path).join(", ")}. 설정의 엔진 경로에 적는다`);
      for (const f of failures) log.append("debug", LOG_SOURCE, f);
    }
    return this.enginePath;
  }

  // ---- 실행 ----

  /** 엔진을 띄운다. 실행 중이면 재시작. 못 띄우면 이유를 토스트와 콘솔에 */
  start(opts: StartOptions = {}): Promise<void> {
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.doStart(opts).finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  private async doStart(opts: StartOptions): Promise<void> {
    const { backend, project, log, toasts } = this.host;
    const reason = this.unavailableReason;
    if (reason) {
      toasts.warn(reason);
      return;
    }
    if (!project.isOpen) {
      toasts.warn("프로젝트를 먼저 연다");
      return;
    }
    if (this.state !== "idle") {
      log.info(LOG_SOURCE, "실행 중이라 다시 시작한다");
      await this.stopCurrent();
    }
    this.lastStart = opts;
    runInAction(() => {
      this.state = "starting";
      this.exitCode = null;
    });

    if (!this.enginePath) await this.resolveEngine();
    const exe = this.enginePath;
    if (!exe) {
      runInAction(() => (this.state = "idle"));
      const message = this.startHint ?? "엔진을 찾지 못했다";
      log.error(LOG_SOURCE, message);
      toasts.error(message);
      return;
    }

    // 실행 직전에 기능을 다시 묻는다 (그사이 다시 빌드했을 수 있다)
    if (this.probe) {
      try {
        const features = await this.probe(exe);
        runInAction(() => (this.features = features));
      } catch (e) {
        const message = `엔진을 부를 수 없다: ${(e as Error).message}`;
        runInAction(() => {
          this.state = "idle";
          this.setEngine(null, "none", null);
        });
        log.error(LOG_SOURCE, message);
        toasts.error(message);
        return;
      }
    }
    const script = project.gameJson.script === "mruby" ? "mruby" : "lua";
    if (script === "mruby" && this.features && !this.features.includes("mruby")) {
      runInAction(() => (this.state = "idle"));
      log.error(LOG_SOURCE, `${NO_MRUBY} (--features: ${this.features.join(" ") || "(없음)"}). 언어를 Lua 로 바꾸거나 mruby 를 넣어 빌드한다`);
      toasts.error(NO_MRUBY);
      return;
    }

    const env: Record<string, string> = { INITIAL2D_HMR: "1", INITIAL2D_SCRIPT: script };
    if (opts.scene) env.INITIAL2D_SCENE = opts.scene;
    if (opts.env) Object.assign(env, opts.env);
    let handle: RunHandle;
    try {
      handle = await backend.run({ exe, cwd: project.root, env, args: [] });
    } catch (e) {
      const err = e as BackendError;
      const message = err.code === "engine_not_found" ? `엔진 실행 파일이 없다: ${exe}` : `엔진을 띄우지 못했다: ${err.message}`;
      runInAction(() => {
        this.state = "idle";
        if (err.code === "engine_not_found") this.setEngine(null, "none", null);
      });
      log.error(LOG_SOURCE, message);
      toasts.error(message);
      return;
    }

    runInAction(() => {
      this.handle = handle;
      this.pid = handle.pid ?? null;
      this.startedAt = this.clock();
      this.now = this.startedAt;
      this.state = "running";
    });
    this.startTicker();
    const extra = opts.env && Object.keys(opts.env).length > 0 ? `, ${Object.entries(opts.env).map(([k, v]) => `${k}=${v}`).join(" ")}` : "";
    log.info(LOG_SOURCE, `엔진 시작: PID ${handle.pid ?? "?"}, ${exe}, 언어 ${script}${opts.scene ? `, 씬 ${opts.scene}` : ""} (INITIAL2D_HMR=1${extra})`);
    handle.onOutput((line) => {
      log.append(classifyEngineLine(line), "engine", line);
    });
    handle.onExit((code) => this.onExit(handle, code));
  }

  private onExit(handle: RunHandle, code: number | null): void {
    if (handle !== this.handle) return; // 이미 정리한(재시작한) 프로세스다
    const elapsed = this.elapsedText;
    runInAction(() => {
      this.handle = null;
      this.pid = null;
      this.state = "idle";
      this.exitCode = code;
      this.startedAt = null;
    });
    this.stopTicker();
    const waiters = this.exitWaiters;
    this.exitWaiters = [];
    for (const w of waiters) w();
    const { log, toasts } = this.host;
    if (code === 0) log.info(LOG_SOURCE, `엔진 종료 (코드 0, 경과 ${elapsed})`);
    else if (code === null) log.info(LOG_SOURCE, `엔진 정지 (경과 ${elapsed})`);
    else {
      log.error(LOG_SOURCE, `엔진 종료 코드 ${code} (경과 ${elapsed}). 위의 오류 줄을 누르면 그 자리로 간다`);
      toasts.error(`엔진이 종료 코드 ${code} 로 끝났다. 콘솔을 본다`);
    }
  }

  /** 정지. 시작 중이면 시작이 끝나기를 기다렸다가 정지한다. 이미 멈춰 있으면 아무것도 하지 않는다 */
  async stop(): Promise<void> {
    if (this.startPromise) await this.startPromise;
    await this.stopCurrent();
  }

  private async stopCurrent(): Promise<void> {
    const handle = this.handle;
    if (!handle || this.state === "idle") return;
    if (this.state === "stopping") {
      await this.waitForExit(handle);
      return;
    }
    runInAction(() => (this.state = "stopping"));
    const exited = this.waitForExit(handle);
    try {
      await handle.stop();
    } catch (e) {
      this.host.log.warn(LOG_SOURCE, `정지 요청이 실패했다: ${(e as Error).message}`);
    }
    if (!(await exited) && this.handle === handle) {
      this.host.log.warn(LOG_SOURCE, "종료 이벤트가 오지 않아 상태를 정리한다");
      this.onExit(handle, null);
    }
  }

  /** 종료 이벤트를 기다린다. 시간 안에 오면 true */
  private waitForExit(handle: RunHandle): Promise<boolean> {
    if (this.handle !== handle) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), this.stopTimeoutMs);
      this.exitWaiters.push(() => {
        clearTimeout(timer);
        resolve(true);
      });
    });
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start(this.lastStart);
  }

  // ---- 핫 리로드 ----

  /**
   * 묶음을 엔진의 핫 리로드 서버로 보낸다. Tauri 는 여기서 모으고(hmrCollect.ts), 브리지는 서버가 모으므로 빈 목록.
   * 엔진은 받으면 VM 을 통째로 다시 시작한다 (씬 상태는 날아간다). 결과나 실패 이유를 콘솔에 남긴다.
   */
  async reload(): Promise<{ count: number } | null> {
    const { backend, project, log, toasts } = this.host;
    if (!project.isOpen) return null;
    let files: HmrFile[] = [];
    if (backend.kind === "tauri") {
      try {
        files = await collectHmrFiles(backend);
      } catch (e) {
        const message = `핫 리로드 묶음을 모으지 못했다: ${(e as Error).message}`;
        log.error(LOG_SOURCE, message);
        toasts.error(message);
        return null;
      }
      if (files.length === 0) {
        log.warn(LOG_SOURCE, "보낼 스크립트가 없다 (scripts/ 아래의 .lua 와 .rb)");
        return null;
      }
    }
    try {
      const result = await backend.hmrPush(files);
      runInAction(() => (this.lastReload = { count: result.count, at: this.clock() }));
      log.info(LOG_SOURCE, `핫 리로드: ${result.count}개 파일을 보냈다. 엔진이 VM 을 다시 시작한다 (씬 상태는 처음으로)`);
      return result;
    } catch (e) {
      const err = e as BackendError;
      const message = err.code === "hmr_unreachable" || err.code === "network" ? `핫 리로드 실패: ${HMR_UNREACHABLE_HINT} (${err.message})` : `핫 리로드 실패: ${err.message}`;
      log.error(LOG_SOURCE, message);
      toasts.error(message);
      return null;
    }
  }

  // ---- 수명 ----

  /** 프로젝트를 닫을 때: 실행 중이면 끄고 엔진 정보를 지운다 */
  async onProjectClosed(): Promise<void> {
    if (this.state !== "idle") {
      this.host.log.info(LOG_SOURCE, "프로젝트를 닫아 엔진을 정지한다");
      await this.stop();
    }
    runInAction(() => {
      this.setEngine(null, "none", null);
      this.candidates = [];
      this.exitCode = null;
    });
  }

  dispose(): void {
    this.stopTicker();
    this.exitWaiters = [];
  }

  private startTicker(): void {
    this.stopTicker();
    this.ticker = setInterval(() => this.tick(), 1000);
  }

  private stopTicker(): void {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
  }
}
