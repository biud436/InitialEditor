// E1 엔진 실행기 (docs/plans/03-project-and-runtime.md 4절 모드 A, docs/plans/e1-scripting.md 마일스톤 2와 3).
// 엔진 실행 파일을 프로젝트 루트를 작업 폴더로 띄우고, 출력을 줄 단위로 콘솔에 흘리고, 핫 리로드 묶음을 보낸다.
// DOM 을 모르고 백엔드와 프로젝트와 설정과 로그만 본다 (그래서 Node 로 테스트한다). 커맨드와 이벤트 연결은
// index.ts 와 runCommands.ts 가 한다.
//
// 동시에 하나만 띄운다. 실행 중에 start 를 부르면 재시작이다. 정지는 백엔드가 SIGTERM 뒤 시간 제한을 두고 강제
// 종료하고(src-tauri/src/engine.rs), 여기서는 종료 이벤트가 오지 않아도 일정 시간 뒤 상태를 정리한다.
//
// 실행 방식은 둘이다 (settings.runMode). process 는 위의 엔진 프로세스, embedded 는 웹 엔진을 에디터의 게임 탭에서
// 돌린다 (E4, gameView/GameViewStore.ts 가 EmbeddedEngine 을 구현한다). 프로세스를 띄우지 못하는 백엔드(브라우저)는
// 늘 embedded 다. 게임 탭의 세션도 RunHandle 이라 출력, 종료, 정지는 두 방식이 같은 길을 쓴다.
// 프로세스 방식인데 엔진 실행 파일을 못 찾으면 그 실행만 에디터 안으로 넘어간다 (E6 2.3 절. 설정은 그대로).
//
// 엔진 탐색(E6 2.3 절): 설정 > .initial-editor/engine > build/ > 앱에 든 엔진 > 형제 폴더. 프로젝트가 가리키는 후보는
// 신뢰를 받은 뒤에만 실행한다 (engineTrust.ts). 앱에 든 엔진은 첫 실행의 격리 검사로 느릴 수 있어 15초를 주고 한 번 더 찌른다.

import type { BundledEngine } from "@initial-editor/backend-tauri";
import {
  BackendError,
  classifyEngineLine,
  type EngineTrustRecord,
  type HmrFile,
  type LogStore,
  type Platform,
  type Project,
  type ProjectBackend,
  type RunHandle,
  type RunMode,
  type SettingsStore,
} from "@initial-editor/core";
import { action, computed, makeObservable, observable, runInAction } from "mobx";
import { errorText } from "../gameView/errorText";
import { ENGINE_FILE, ENGINE_SOURCE_LABELS, engineCandidates, type EngineCandidate, type EngineSource } from "./engineCandidates";
import { decideTrust, mergeTrust, type TrustAnswer, type TrustDecision, type TrustQuestion } from "./engineTrust";
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

/** 에디터 안 리로드의 결과 */
export interface EmbeddedReload {
  /** 다시 올린 파일 수 */
  count: number;
  /** 스크립트 오류로 VM 이 다시 뜨지 못했다 (오류 줄은 이미 콘솔에 있고 엔진은 계속 돈다) */
  scriptsFailed: boolean;
  /** 게임이 끝났거나 끝나는 중이라(reload 밖의 스크립트 오류가 종료를 요청해 두었다) 올리지 않았다 */
  dropped?: boolean;
}

/** 에디터 안 실행 (게임 탭의 웹 엔진) */
export interface EmbeddedEngine {
  /** 웹 엔진의 기능 ("lua", "mruby", "wasm"). engine/MANIFEST.json 에서 읽는다 */
  loadFeatures(): Promise<string[]>;
  /** 게임 탭을 열고 파일을 올리고 엔진을 띄운다. 그만두면 name 이 AbortError 인 오류를 던진다 */
  launch(opts: { env: Record<string, string> }): Promise<RunHandle>;
  /** 시작 중(파일 올리는 중)이면 그만둔다 */
  abort(): void;
  /**
   * paths(없으면 scripts 와 씬과 맵 전부)를 다시 올리고 VM 을 다시 시작한다. 게임이 끝났거나 끝나는 중이면 올리지 않고
   * dropped 로 답한다. 엔진이 예외로 죽으면 던진다
   */
  reload(paths?: readonly string[]): Promise<EmbeddedReload>;
  /**
   * launch가 돌려준 실행의 엔진이 프레임을 하나 이상 돌았고 끝나는 중이 아니면 true, 그 전에 끝나거나 끝나는 중이면 false.
   * 시작 스크립트나 첫 프레임의 오류는 루프에 종료를 요청해 두므로, 그 뒤에 올린 고침은 받아들여지고도 게임이 끝난다
   */
  whenStepped(handle: RunHandle): Promise<boolean>;
  /** 상태 바 툴팁 (웹 엔진의 기능과 커밋) */
  readonly description: string | null;
}

export interface ProbeOptions {
  /** 없으면 셸의 기본 5초 */
  timeoutMs?: number;
}

export interface RunnerOptions {
  /** `exe --features` 를 부른다 (Tauri 의 engineFeatures). 없으면 엔진을 찾지 못한다 */
  probe?: (exe: string, opts?: ProbeOptions) => Promise<string[]>;
  /** 경로마다 파일이 있는지 (Tauri 의 engineExists). 실행하지 않는다. 신뢰를 묻기 전에 본다 */
  exists?: (paths: string[]) => Promise<boolean[]>;
  /** 앱에 든 엔진 (Tauri 의 engineBundled). 없으면 그 후보가 없다 */
  bundled?: () => Promise<BundledEngine | null>;
  /** 프로젝트가 가리키는 엔진을 실행할지 묻는다 (EngineTrustDialog.tsx). 없으면 그 후보는 늘 건너뛴다 */
  askTrust?: (q: TrustQuestion) => Promise<TrustAnswer>;
  /** backend.capabilities.run 이 false 일 때 사용자에게 보일 이유 */
  unavailableReason?: string;
  /** 정지 뒤 종료 이벤트를 기다리는 시간 */
  stopTimeoutMs?: number;
  now?: () => number;
  /** 에디터 안 실행. 없으면 process 만 있다 */
  embedded?: EmbeddedEngine;
}

export interface ReloadOptions {
  /** 저장 시 리로드 (SaveReloader). 브리지 너머에 엔진이 없으면(연결 거부) 토스트 없이 한 줄만 남긴다 */
  fromSave?: boolean;
}

/** 엔진을 띄우지 못하는 백엔드로 프로젝트를 열 때 콘솔에 남기는 안내. 수동 리로드는 밖의 엔진으로 보낼 길이 있을 때만 적는다 */
export function browserRunNotice(canPush: boolean): string {
  const run = "브라우저 모드: 실행(F5)은 에디터 안 게임 탭에서 웹 엔진으로 돈다.";
  return canPush
    ? `${run} 터미널에서 INITIAL2D_HMR=1 로 띄운 엔진에는 수동 리로드(Ctrl+Shift+R)가 간다`
    : `${run} 밖에서 띄운 엔진으로는 보내지 않고, 저장한 파일은 게임 탭이 돌 때 다시 읽는다`;
}

/** 브리지가 전한 핫 리로드 실패가 엔진 쪽 포트의 연결 거부인가 (엔진이 떠 있지 않다) */
export function isHmrRefused(e: unknown): boolean {
  const err = e as BackendError | null;
  return err?.code === "hmr_unreachable" && /ECONNREFUSED|connection refused/i.test(err.message ?? "");
}

/**
 * 실행 하나를 지켜보는 것 (타일맵 확장의 PlayWatch 와 같은 모양, 실행 제공자가 만든다). 게임이 찍은 줄마다 line 을 부르고
 * 멈출 이유를 돌려주면 그 글을 콘솔과 알림에 남기고 게임을 멈춘다. 게임이 끝나면 exit 가 알릴 실패를 돌려줄 수 있다.
 * 핫 리로드로 스크립트가 처음부터 다시 돌면 restarted 를 부른다
 */
export interface RunWatch {
  line(text: string): string | undefined;
  exit?(code: number | null): string | undefined;
  restarted?(): void;
}

export interface StartOptions {
  /** INITIAL2D_SCENE (E2 의 현재 씬부터 실행) */
  scene?: string;
  /** 기본 변수(INITIAL2D_HMR, INITIAL2D_SCRIPT, INITIAL2D_SCENE) 뒤에 덧씌우는 환경 변수 (맵의 여기서 실행) */
  env?: Record<string, string>;
  /** 실행을 지켜볼 것을 만든다 (다시 시작할 때마다 새로). 맵의 실행 제공자가 준다 */
  watch?: () => RunWatch;
  /** 이 실행만의 방식 (자가 검사). 없으면 설정. 설정의 runMode 는 바꾸지 않는다 */
  mode?: RunMode;
}

export const NO_MRUBY = "이 엔진 빌드에는 mruby 가 없다";
export const WASM_NO_MRUBY = "이 웹 엔진 빌드에는 mruby 가 없다. game.json 의 script 를 lua 로 바꾸거나, mruby 를 넣은 웹 빌드를 yarn sync:engine-web 으로 가져오거나, 실행 방식을 프로세스로";
export const EMBEDDED_HINT = "에디터 안 게임 탭에서 돈다 (웹 엔진)";
export const RUN_MODE_LABELS: Record<RunMode, string> = { process: "프로세스", embedded: "에디터 안" };
export const HMR_UNREACHABLE_HINT = "게임이 INITIAL2D_HMR=1 로 실행 중인지 확인";
export const HMR_NO_ENGINE_SKIPPED = "엔진이 떠 있지 않아 리로드를 건너뛰었다";
export const START_ENDED_RELOAD_DROPPED = "핫 리로드: 게임이 뜨는 중에 끝나서 저장한 파일을 올리지 않았다. F5로 다시 실행하면 저장한 내용으로 돈다";
export const ENDED_RELOAD_DROPPED = "핫 리로드: 게임이 끝나서 저장한 파일을 올리지 않았다. F5로 다시 실행하면 저장한 내용으로 돈다";
/** 프로세스 방식인데 엔진을 못 찾아 그 실행을 에디터 안으로 넘길 때 (E6 2.3 절) */
export const FALLBACK_NOTICE = "엔진 실행 파일을 찾지 못해 에디터 안에서 돈다";
/** 앱에 든 엔진의 --features 시간 제한. 다운로드한 앱의 첫 실행은 macOS 의 격리 검사로 몇 초 걸린다 */
export const BUNDLED_PROBE_TIMEOUT_MS = 15_000;
const LOG_SOURCE = "runner";
const DEFAULT_STOP_TIMEOUT_MS = 4000;

/** "앱에 든 엔진 v2.0.0-alpha.1 (abc1234, lua mruby)". 태그가 없으면 커밋만 */
export function bundledEngineLabel(bundled: BundledEngine | null, features: string[] | null): string {
  const meta = bundled?.meta ?? null;
  const words = (features ?? meta?.features ?? []).join(" ");
  const parts = [meta ? meta.engineCommit.slice(0, 7) : "", words].filter(Boolean);
  const tag = meta?.engineTag ? ` ${meta.engineTag}` : "";
  return `${ENGINE_SOURCE_LABELS.bundled}${tag}${parts.length ? ` (${parts.join(", ")})` : ""}`;
}

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

/** 띄울 언어. 덧씌운 INITIAL2D_SCRIPT 가 있으면 그것이다 (게임 설정이 mruby 여도 맵의 실행 변수가 lua 로 덮을 수 있다) */
export function runLanguage(gameScript: unknown, env?: Record<string, string>): "lua" | "mruby" {
  return (env?.INITIAL2D_SCRIPT ?? gameScript) === "mruby" ? "mruby" : "lua";
}

/** 덧씌운 환경 변수를 로그 한 줄로: ", A=1 B=2" */
function envSuffix(env: Record<string, string> | undefined, open = ", ", close = ""): string {
  if (!env || Object.keys(env).length === 0) return "";
  return `${open}${Object.entries(env).map(([k, v]) => `${k}=${v}`).join(" ")}${close}`;
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
  /** 지금(또는 마지막) 실행의 방식. 실행 중에 설정을 바꿔도 이것은 그대로다 */
  activeMode: RunMode | null = null;
  /** 지금(또는 마지막) 실행이 프로세스 방식으로 시작해 엔진을 못 찾고 넘어간 방식. 넘어가지 않았으면 null */
  fallback: RunMode | null = null;
  /** 앱에 든 엔진 (마지막 탐색에서 본 것). 개발 빌드는 null */
  bundled: BundledEngine | null = null;
  /** 마지막 탐색에서 파일은 있지만 신뢰하지 않아 찌르지 않은 후보 */
  skipped: EngineCandidate[] = [];

  private readonly probe: ((exe: string, opts?: ProbeOptions) => Promise<string[]>) | null;
  private readonly exists: ((paths: string[]) => Promise<boolean[]>) | null;
  private readonly findBundled: (() => Promise<BundledEngine | null>) | null;
  private readonly askTrust: ((q: TrustQuestion) => Promise<TrustAnswer>) | null;
  /** 떠 있는 신뢰 질문. 탐색이 겹쳐도 같은 질문을 두 번 띄우지 않는다 */
  private pendingTrust: { key: string; answer: Promise<TrustAnswer> } | null = null;
  /** 진행 중인 신뢰 결정 (파일 보기, 기록 읽기, 묻기, 답 남기기). 겹친 탐색은 같은 후보 무리의 결정을 기다려 나눠 쓴다 */
  private readonly trustInFlight = new Map<string, Promise<TrustDecision>>();
  private readonly unavailableText: string;
  private readonly stopTimeoutMs: number;
  private readonly clock: () => number;
  private readonly embedded: EmbeddedEngine | null;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private startPromise: Promise<void> | null = null;
  private lastStart: StartOptions = {};
  private resolveToken = 0;
  /** 돌고 있는 가장 새 탐색. 실행은 새로 찾지 않고 이것을 기다린다 (신뢰 질문이 떠 있는 동안 F5 를 눌러도 한 번만 묻는다) */
  private resolveInFlight: Promise<string | null> | null = null;
  private exitWaiters: Array<() => void> = [];
  /** 에디터 안 엔진이 뜨는 중에 들어온 리로드. 첫 프레임을 돈 뒤 한 번에 올린다 ("all" 은 scripts 와 씬과 맵 전부) */
  private queuedReload: Set<string> | "all" | null = null;
  /** 떴지만 아직 첫 프레임을 돌지 않은 에디터 안 실행. 그동안의 리로드도 모은다 */
  private awaitingFrame: RunHandle | null = null;
  /** 지금 실행을 지켜보는 것과, 그것이 멈추게 했는가 */
  private watch: { handle: RunHandle; watch: RunWatch; stopped: boolean } | null = null;

  constructor(
    private readonly host: RunnerHost,
    opts: RunnerOptions = {},
  ) {
    this.probe = opts.probe ?? null;
    this.exists = opts.exists ?? null;
    this.findBundled = opts.bundled ?? null;
    this.askTrust = opts.askTrust ?? null;
    this.unavailableText = opts.unavailableReason ?? "이 백엔드는 엔진을 띄우지 못한다";
    this.stopTimeoutMs = opts.stopTimeoutMs ?? DEFAULT_STOP_TIMEOUT_MS;
    this.clock = opts.now ?? (() => Date.now());
    this.embedded = opts.embedded ?? null;
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
      activeMode: observable,
      fallback: observable,
      bundled: observable.ref,
      skipped: observable.ref,
      mode: computed,
      engineDescription: computed,
      trustRecord: computed,
      shownMode: computed,
      modeHint: computed,
      embeddedRunning: computed,
      embeddedActive: computed,
      isRunning: computed,
      unavailableReason: computed,
      canRun: computed,
      startHint: computed,
      canReload: computed,
      canPush: computed,
      reloadHint: computed,
      elapsedMs: computed,
      elapsedText: computed,
      statusText: computed,
      statusTitle: computed,
      indicatorText: computed,
      indicatorTitle: computed,
      setEngine: action,
      tick: action,
    });
  }

  // ---- 상태 ----

  /** 다음 실행의 방식. 프로세스를 띄우지 못하는 백엔드는 embedded, 아니면 설정 */
  get mode(): RunMode {
    return this.pickMode(this.host.settings.settings.runMode);
  }

  /** 원하는 방식을 이 백엔드와 실행기가 할 수 있는 것으로 */
  private pickMode(wanted: RunMode | undefined): RunMode {
    if (!this.embedded) return "process";
    if (!this.host.backend.capabilities.run) return "embedded";
    return wanted === "embedded" ? "embedded" : "process";
  }

  /** 프로세스 방식인데 찾아본 뒤에도 엔진이 없어 F5 가 에디터 안으로 넘어가는 상태 */
  private get fallsBack(): boolean {
    return this.mode === "process" && !!this.embedded && !this.enginePath && !this.resolving && this.candidates.length > 0;
  }

  /** 찾은 엔진 한 줄: 앱에 든 엔진은 판, 나머지는 경로와 기능과 출처. 없으면 null */
  get engineDescription(): string | null {
    if (!this.enginePath) return null;
    if (this.engineSource === "bundled") return bundledEngineLabel(this.bundled, this.features);
    const features = this.features?.length ? ` (${this.features.join(" ")})` : "";
    return `${this.enginePath}${features}, ${ENGINE_SOURCE_LABELS[this.engineSource]}`;
  }

  /** 못 찾았을 때의 한 줄: 찾아본 곳과 신뢰하지 않아 건너뛴 곳 */
  private notFoundText(lead: string): string {
    const skipped = new Set(this.skipped.map((c) => c.path));
    const tried = this.candidates.filter((c) => !skipped.has(c.path)).map((c) => c.path).join(", ");
    const rest = this.skipped.length ? `. 신뢰하지 않아 건너뛴 곳: ${this.skipped.map((c) => c.path).join(", ")}` : "";
    return `${lead}. 찾아본 곳: ${tried || "(없음)"}${rest}`;
  }

  /** 상태 바에 보일 방식: 실행 중이거나 종료 코드를 보일 때는 그 실행의 방식 */
  get shownMode(): RunMode {
    return (this.state !== "idle" || this.exitCode !== null) && this.activeMode ? this.activeMode : this.mode;
  }

  /** 실행 버튼이 켜져 있을 때 툴팁에 붙는 설명 */
  get modeHint(): string | undefined {
    if (this.mode === "embedded") return EMBEDDED_HINT;
    return this.fallsBack ? FALLBACK_NOTICE : undefined;
  }

  /** 에디터 안 엔진이 돌고 있다 (리로드가 그쪽으로 간다) */
  get embeddedRunning(): boolean {
    return this.activeMode === "embedded" && this.state === "running";
  }

  /** 에디터 안 엔진이 뜨는 중(파일 올리는 중, 부팅 중)이거나 돌고 있다. 뜨는 중의 리로드는 뜬 뒤에 올린다 */
  get embeddedActive(): boolean {
    return this.activeMode === "embedded" && (this.state === "starting" || this.state === "running");
  }

  /** 시작 중이거나 실행 중 (정지 버튼이 켜지는 조건) */
  get isRunning(): boolean {
    return this.state === "running" || this.state === "starting";
  }

  /** 엔진을 못 띄우는 백엔드면 그 이유, 아니면 null (에디터 안 실행이 있으면 늘 띄울 수 있다) */
  get unavailableReason(): string | null {
    return this.host.backend.capabilities.run || this.mode === "embedded" ? null : this.unavailableText;
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
    if (this.mode === "embedded") return undefined; // mruby 는 시작할 때 이유를 알린다
    if (!this.enginePath) {
      if (this.resolving) return "엔진을 찾는 중이다";
      if (this.embedded) return undefined; // 에디터 안으로 넘어간다 (modeHint)
      return `${this.notFoundText("엔진을 찾지 못했다")}. 설정의 엔진 경로에 적는다`;
    }
    if (this.host.project.gameJson.script === "mruby" && this.features && !this.features.includes("mruby")) return NO_MRUBY;
    return undefined;
  }

  /** 리로드: 브리지 모드는 프로젝트가 열려 있으면 늘, Tauri 는 실행 중일 때만, 메모리와 웹판은 게임 탭이 뜨는 중이거나 돌 때만 */
  get canReload(): boolean {
    return this.reloadHint === undefined;
  }

  get reloadHint(): string | undefined {
    if (!this.host.project.isOpen) return "프로젝트를 먼저 연다";
    if (this.state === "running" || this.embeddedActive) return undefined;
    if (this.host.backend.capabilities.run) return "엔진이 실행 중일 때 보낼 수 있다";
    if (!this.canPush) return "게임 탭에서 실행 중일 때 다시 읽는다";
    return undefined;
  }

  /**
   * 밖에서 띄운 엔진의 핫 리로드 서버로 보낼 길이 있는가. 백엔드가 안다 (capabilities.hmr): 브라우저 폴더(웹판)와
   * 메모리 백엔드(메모리 모드, 웹판의 샘플. 엔진이 없다)에는 없다
   */
  get canPush(): boolean {
    return this.host.backend.capabilities.hmr;
  }

  /** 에디터 안 엔진이 뜨는 중이다: 파일 올리는 중, 부팅 중, 또는 떴지만 아직 첫 프레임 전 */
  private get embeddedStarting(): boolean {
    if (this.activeMode !== "embedded") return false;
    return this.state === "starting" || (this.state === "running" && this.handle !== null && this.awaitingFrame === this.handle);
  }

  get elapsedMs(): number {
    return this.startedAt === null ? 0 : Math.max(0, this.now - this.startedAt);
  }

  get elapsedText(): string {
    return formatElapsed(this.elapsedMs);
  }

  /**
   * 상태 바 문구: 엔진: 없음 / 대기 / 시작 중 / 실행 중 PID 1234 00:42 / 정지 중 / 종료 코드 1.
   * 에디터 안 실행이 있으면 방식을 붙인다: 엔진 (에디터 안): 실행 중 00:42, 엔진 (프로세스): 대기
   */
  get statusText(): string {
    const embedded = this.shownMode === "embedded";
    const label = this.embedded ? `엔진 (${RUN_MODE_LABELS[this.shownMode]})` : "엔진";
    switch (this.state) {
      case "starting":
        return `${label}: 시작 중`;
      case "running":
        return embedded ? `${label}: 실행 중 ${this.elapsedText}` : `${label}: 실행 중 PID ${this.pid ?? "?"} ${this.elapsedText}`;
      case "stopping":
        return `${label}: 정지 중`;
      default:
        break;
    }
    if (this.exitCode !== null) return `${label}: 종료 코드 ${this.exitCode}`;
    if (!embedded && !this.enginePath) return `${label}: 없음`;
    return `${label}: 대기`;
  }

  /** 상태 바 툴팁: 없는 이유나 엔진 경로 (에디터 안이면 웹 엔진 설명) */
  get statusTitle(): string | undefined {
    if (this.shownMode === "embedded") return `${EMBEDDED_HINT}. ${this.embedded?.description ?? ""}`.trim();
    if (this.unavailableReason) return this.unavailableReason;
    if (!this.enginePath) {
      if (!this.host.project.isOpen) return undefined;
      return this.fallsBack ? this.notFoundText(FALLBACK_NOTICE) : this.startHint;
    }
    return this.engineDescription ?? undefined;
  }

  /** 툴바의 실행 표시: PID 1234 00:42 또는 에디터 안 00:42 */
  get indicatorText(): string {
    if (this.state === "starting") return "시작 중";
    return this.activeMode === "embedded" ? `에디터 안 ${this.elapsedText}` : `PID ${this.pid ?? "?"} ${this.elapsedText}`;
  }

  get indicatorTitle(): string {
    if (this.state === "starting") return "엔진을 띄우는 중";
    return this.activeMode === "embedded" ? "에디터 안 게임 탭에서 실행 중 (웹 엔진)" : `${this.enginePath ?? "엔진"} 실행 중 (PID ${this.pid ?? "?"})`;
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
   * 프로젝트가 가리키는 후보는 신뢰를 받은 것만 찌른다 (engineTrust.ts). askTrust 가 거짓이면 이번에는 묻지 않고 건너뛴다.
   * 결과는 콘솔에 남긴다. 브라우저 모드는 찾지 않는다.
   */
  resolveEngine(opts: { askTrust?: boolean } = {}): Promise<string | null> {
    const search = this.searchEngine(opts);
    this.resolveInFlight = search;
    const clear = () => {
      if (this.resolveInFlight === search) this.resolveInFlight = null;
    };
    search.then(clear, clear);
    return search;
  }

  /**
   * 실행이 쓸 엔진을 정한다. 이미 찾았으면 그대로, 탐색이 돌고 있으면(프로젝트를 열자마자 실행, 자가 검사) 새로 찾지 않고 그 탐색이
   * 끝나기를 기다려 그 결과를 쓴다. 새로 찾으면 신뢰 질문을 닫은 직후의 실행이 같은 질문을 한 번 더 띄운다
   */
  private async engineForStart(): Promise<void> {
    if (this.enginePath) return;
    let waited = false;
    while (this.resolveInFlight) {
      waited = true;
      await this.resolveInFlight.catch(() => null);
    }
    if (!waited && !this.enginePath) await this.resolveEngine();
  }

  private async searchEngine(opts: { askTrust?: boolean }): Promise<string | null> {
    const token = ++this.resolveToken;
    const { backend, project, settings, log } = this.host;
    if (!backend.capabilities.run || !this.probe) {
      runInAction(() => {
        this.setEngine(null, "none", null);
        this.candidates = [];
        this.skipped = [];
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
    let bundled: BundledEngine | null = null;
    try {
      bundled = this.findBundled ? await this.findBundled() : null;
    } catch {
      bundled = null;
    }
    const root = project.root;
    const candidates = engineCandidates({ root, settingsPath: settings.settings.enginePath, projectFile, platform: this.host.platform, bundledPath: bundled?.path ?? null });
    // 신뢰는 신뢰가 필요 없는 후보 사이의 무리마다 정한다: .initial-editor/engine 과 build/ 가 한 무리, 앱에 든 엔진 뒤의 형제가
    // 또 한 무리다. 앞의 무리에 닿으면 그 무리만 묻고, 앱에 든 엔진이 답하면 형제는 묻지도 보지도 않는다. 앱에 든 엔진이 없으면
    // (개발 빌드) 셋이 한 무리라 한 번에 묻는다
    const allowed = new Set<string>();
    const skipped: EngineCandidate[] = [];
    let decidedUntil = -1;
    let found: { candidate: EngineCandidate; features: string[] } | null = null;
    const failures: string[] = [];
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      if (candidate.needsTrust) {
        if (i > decidedUntil) {
          let end = i;
          while (end + 1 < candidates.length && candidates[end + 1].needsTrust) end++;
          const group = candidates.slice(i, end + 1);
          const laterBundled = candidates.slice(end + 1).some((c) => c.source === "bundled");
          const decision = await this.decideTrustShared(root, group, opts.askTrust !== false, laterBundled);
          if (token !== this.resolveToken) return this.enginePath; // 묻는 사이 다시 탐색했다
          decidedUntil = end;
          for (const p of decision.allowed) allowed.add(p);
          skipped.push(...decision.skipped);
        }
        if (!allowed.has(candidate.path)) continue;
      }
      try {
        const features = await this.probeCandidate(candidate);
        found = { candidate, features };
        break;
      } catch (e) {
        failures.push(`${candidate.path}: ${errorText(e)}`);
      }
    }
    if (token !== this.resolveToken) return this.enginePath; // 그사이 다시 탐색했다
    runInAction(() => {
      this.candidates = candidates;
      this.skipped = skipped;
      this.bundled = bundled;
      this.resolving = false;
      if (found) this.setEngine(found.candidate.path, found.candidate.source, found.features);
      else this.setEngine(null, "none", null);
    });
    if (skipped.length) {
      log.info(LOG_SOURCE, `프로젝트가 가리키는 엔진을 신뢰하지 않아 실행하지 않았다: ${skipped.map((c) => c.path).join(", ")}. 설정에서 다시 물을 수 있다`);
    }
    if (found) {
      const label = found.candidate.source === "bundled" ? bundledEngineLabel(bundled, []) : ENGINE_SOURCE_LABELS[found.candidate.source];
      log.info(LOG_SOURCE, `엔진: ${found.candidate.path} (${label}, 기능: ${found.features.join(" ") || "(없음)"})`);
    } else {
      const lead = this.embedded && this.mode === "process" ? FALLBACK_NOTICE : "엔진을 찾지 못했다";
      log.warn(LOG_SOURCE, `${this.notFoundText(lead)}. 설정의 엔진 경로에 적는다`);
      for (const f of failures) log.append("debug", LOG_SOURCE, f);
    }
    return this.enginePath;
  }

  /** 후보 하나를 찌른다. 앱에 든 엔진은 15초를 주고, 파일이 없는 것 말고의 실패(시간 초과)면 한 번 더 */
  private async probeCandidate(candidate: { path: string; source: EngineSource }): Promise<string[]> {
    const probe = this.probe!;
    if (candidate.source !== "bundled") return probe(candidate.path);
    try {
      return await probe(candidate.path, { timeoutMs: BUNDLED_PROBE_TIMEOUT_MS });
    } catch (e) {
      if ((e as BackendError | null)?.code === "engine_not_found") throw e;
      this.host.log.append("debug", LOG_SOURCE, `${candidate.path}: ${errorText(e)}. 한 번 더 찔러 본다`);
      return probe(candidate.path, { timeoutMs: BUNDLED_PROBE_TIMEOUT_MS });
    }
  }

  /**
   * 후보 무리 하나의 신뢰 결정. 같은 프로젝트의 같은 무리를 정하는 중이면(프로젝트 열기와 설정 바꾸기가 겹치면) 그 결정을
   * 기다려 같은 답을 쓴다. 기록은 파일을 본 뒤에 읽고, 답은 그사이 다시 탐색했어도 한 번 남긴다 (사람이 고른 것이다)
   */
  private decideTrustShared(root: string, group: EngineCandidate[], ask: boolean, hasBundled: boolean): Promise<TrustDecision> {
    const key = `${root}\n${ask ? "ask" : "quiet"}\n${group.map((c) => c.path).join("\n")}`;
    const pending = this.trustInFlight.get(key);
    if (pending) return pending;
    const { settings } = this.host;
    const decision = decideTrust({
      root,
      candidates: group,
      exists: this.exists ?? undefined,
      record: () => settings.settings.engineTrust[root],
      askTrust: this.askTrust ? (q) => this.askOnce(q) : undefined,
      ask,
      hasBundled,
    })
      .then((d) => {
        if (d.record) settings.setEngineTrust(root, mergeTrust(settings.settings.engineTrust[root], d.record));
        return d;
      })
      .finally(() => this.trustInFlight.delete(key));
    this.trustInFlight.set(key, decision);
    return decision;
  }

  /** 같은 질문이 떠 있으면 그 답을 기다린다 */
  private askOnce(q: TrustQuestion): Promise<TrustAnswer> {
    const key = `${q.root}\n${q.candidates.map((c) => c.path).join("\n")}`;
    if (this.pendingTrust?.key === key) return this.pendingTrust.answer;
    const answer = this.askTrust!(q).finally(() => {
      if (this.pendingTrust?.key === key) this.pendingTrust = null;
    });
    this.pendingTrust = { key, answer };
    return answer;
  }

  /** 열린 프로젝트가 가리키는 엔진에 대한 답 (설정). 없으면 null */
  get trustRecord(): EngineTrustRecord | null {
    const { project, settings } = this.host;
    if (!project.isOpen) return null;
    return settings.settings.engineTrust[project.root] ?? null;
  }

  /** 신뢰 취소: 답을 지우고 이번에는 묻지 않고 다시 찾는다 (다음에 열 때 다시 묻는다) */
  async revokeTrust(): Promise<void> {
    const { project, settings } = this.host;
    if (!project.isOpen) return;
    settings.clearEngineTrust(project.root);
    await this.resolveEngine({ askTrust: false });
  }

  /** 거절한 답을 지우고 지금 다시 묻는다 */
  async askTrustAgain(): Promise<void> {
    const { project, settings } = this.host;
    if (!project.isOpen) return;
    settings.clearEngineTrust(project.root);
    await this.resolveEngine();
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
    const { project, log, toasts } = this.host;
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
    let mode = this.pickMode(opts.mode ?? this.host.settings.settings.runMode);
    runInAction(() => {
      this.state = "starting";
      this.exitCode = null;
      this.activeMode = mode;
      this.fallback = null;
    });
    // 프로세스 방식인데 엔진이 없으면 이 실행만 에디터 안으로 (설정은 그대로)
    if (mode === "process" && this.embedded) {
      await this.engineForStart();
      if (!this.enginePath) {
        mode = "embedded";
        log.info(LOG_SOURCE, `${this.notFoundText(FALLBACK_NOTICE)}. 설정의 실행 방식은 그대로다`);
        runInAction(() => {
          this.activeMode = "embedded";
          this.fallback = "embedded";
        });
      }
    }

    const launched = mode === "embedded" ? await this.launchEmbedded(opts) : await this.launchProcess(opts);
    if (!launched) {
      this.queuedReload = null;
      runInAction(() => (this.state = "idle"));
      return;
    }
    const { handle, summary } = launched;
    runInAction(() => {
      this.handle = handle;
      this.pid = handle.pid ?? null;
      this.startedAt = this.clock();
      this.now = this.startedAt;
      this.state = "running";
    });
    this.startTicker();
    log.info(LOG_SOURCE, summary);
    const watch = opts.watch?.() ?? null;
    this.watch = watch ? { handle, watch, stopped: false } : null;
    handle.onOutput((line) => {
      log.append(classifyEngineLine(line), "engine", line);
      this.watchLine(handle, line);
    });
    if (mode === "embedded") this.awaitingFrame = handle;
    handle.onExit((code) => this.onExit(handle, code));
    if (mode === "embedded") void this.reloadQueuedAfterFirstFrame(handle);
  }

  /** 지켜보는 것에 줄을 넘기고, 멈출 이유가 오면 콘솔과 알림에 남기고 멈춘다 (한 번만) */
  private watchLine(handle: RunHandle, line: string): void {
    const w = this.watch;
    if (!w || w.handle !== handle || w.stopped || this.handle !== handle) return;
    const reason = w.watch.line(line);
    if (!reason) return;
    w.stopped = true;
    this.host.log.warn(LOG_SOURCE, reason);
    this.host.toasts.warn(reason);
    void this.stop();
  }

  /**
   * 뜨는 중에 모아 둔 리로드는 엔진이 첫 프레임을 돌고 끝나는 중이 아닐 때 올린다. 시작 스크립트나 첫 프레임이 오류로 끝나면
   * 엔진은 이미 종료를 요청해 두어서 그 뒤에 올린 고침도 다음 프레임에 함께 끝난다. 그러면 버리고 한 줄 남긴다 (F5가 저장한 글로 돈다)
   */
  private async reloadQueuedAfterFirstFrame(handle: RunHandle): Promise<void> {
    const stepped = await this.embedded!.whenStepped(handle);
    if (this.awaitingFrame !== handle) return; // 끝나서 onExit가 이미 정리했다
    if (!stepped || this.handle !== handle || !this.embeddedRunning) {
      this.dropQueuedReload();
      return;
    }
    this.awaitingFrame = null;
    const queued = this.queuedReload;
    this.queuedReload = null;
    if (queued) await this.reloadEmbedded(queued === "all" ? undefined : [...queued], START_ENDED_RELOAD_DROPPED);
  }

  /** 첫 프레임 전에 게임이 끝났다. 모아 둔 리로드가 있으면 버리고 한 줄 남긴다 */
  private dropQueuedReload(): void {
    this.awaitingFrame = null;
    if (!this.queuedReload) return;
    this.queuedReload = null;
    this.host.log.info(LOG_SOURCE, START_ENDED_RELOAD_DROPPED);
  }

  /** 실패를 콘솔과 토스트에 알리고 null */
  private failStart(message: string, toast: string = message): null {
    this.host.log.error(LOG_SOURCE, message);
    this.host.toasts.error(toast);
    return null;
  }

  /** 엔진 프로세스를 띄운다 (모드 A) */
  private async launchProcess(opts: StartOptions): Promise<{ handle: RunHandle; summary: string } | null> {
    const { backend, project } = this.host;
    await this.engineForStart();
    const exe = this.enginePath;
    if (!exe) return this.failStart(this.startHint ?? "엔진을 찾지 못했다");

    // 실행 직전에 기능을 다시 묻는다 (그사이 다시 빌드했을 수 있다)
    if (this.probe) {
      try {
        const features = await this.probeCandidate({ path: exe, source: this.engineSource });
        runInAction(() => (this.features = features));
      } catch (e) {
        runInAction(() => this.setEngine(null, "none", null));
        return this.failStart(`엔진을 부를 수 없다: ${errorText(e)}`);
      }
    }
    const script = runLanguage(project.gameJson.script, opts.env);
    if (script === "mruby" && this.features && !this.features.includes("mruby")) {
      return this.failStart(`${NO_MRUBY} (--features: ${this.features.join(" ") || "(없음)"}). 언어를 Lua 로 바꾸거나 mruby 를 넣어 빌드한다`, NO_MRUBY);
    }

    const env: Record<string, string> = { INITIAL2D_HMR: "1", INITIAL2D_SCRIPT: script };
    if (opts.scene) env.INITIAL2D_SCENE = opts.scene;
    if (opts.env) Object.assign(env, opts.env);
    let handle: RunHandle;
    try {
      handle = await backend.run({ exe, cwd: project.root, env, args: [] });
    } catch (e) {
      const err = e as BackendError;
      if (err.code === "engine_not_found") runInAction(() => this.setEngine(null, "none", null));
      return this.failStart(err.code === "engine_not_found" ? `엔진 실행 파일이 없다: ${exe}` : `엔진을 띄우지 못했다: ${err.message}`);
    }
    const summary = `엔진 시작: PID ${handle.pid ?? "?"}, ${exe}, 언어 ${script}${opts.scene ? `, 씬 ${opts.scene}` : ""} (INITIAL2D_HMR=1${envSuffix(opts.env)})`;
    return { handle, summary };
  }

  /** 웹 엔진을 게임 탭에서 띄운다 (모드 B, E4) */
  private async launchEmbedded(opts: StartOptions): Promise<{ handle: RunHandle; summary: string } | null> {
    const embedded = this.embedded!;
    let features: string[];
    try {
      features = await embedded.loadFeatures();
    } catch (e) {
      return this.failStart(errorText(e));
    }
    const script = runLanguage(this.host.project.gameJson.script, opts.env);
    if (script === "mruby" && !features.includes("mruby")) {
      return this.failStart(this.host.backend.capabilities.run ? WASM_NO_MRUBY : `${WASM_NO_MRUBY} (프로세스 실행은 데스크톱 앱에서)`);
    }
    const env: Record<string, string> = { INITIAL2D_SCRIPT: script };
    if (opts.scene) env.INITIAL2D_SCENE = opts.scene;
    if (opts.env) Object.assign(env, opts.env);
    let handle: RunHandle;
    try {
      handle = await embedded.launch({ env });
    } catch (e) {
      if ((e as Error | null)?.name === "AbortError") {
        this.host.log.info(LOG_SOURCE, "실행을 그만뒀다");
        return null;
      }
      return this.failStart(`에디터 안 엔진을 띄우지 못했다: ${errorText(e)}`);
    }
    const summary = `엔진 시작: 에디터 안 (웹 엔진, ${features.join(" ")}), 언어 ${script}${opts.scene ? `, 씬 ${opts.scene}` : ""}${envSuffix(opts.env, " (", ")")}`;
    return { handle, summary };
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
    const w = this.watch?.handle === handle ? this.watch : null;
    this.watch = null;
    // 지켜보는 것이 멈추게 한 실행은 이미 이유를 남겼다
    const failure = w && !w.stopped ? w.watch.exit?.(code) : undefined;
    if (failure) {
      log.error(LOG_SOURCE, failure);
      toasts.warn(failure);
    }
    if (this.awaitingFrame === handle) this.dropQueuedReload();
  }

  /** 정지. 시작 중이면 시작이 끝나기를 기다렸다가 정지한다. 이미 멈춰 있으면 아무것도 하지 않는다 */
  async stop(): Promise<void> {
    // 게임 탭이 파일을 올리는 중이면 기다리지 않고 그만둔다
    if (this.startPromise && this.state === "starting" && this.activeMode === "embedded") this.embedded?.abort();
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
      this.host.log.warn(LOG_SOURCE, `정지 요청이 실패했다: ${errorText(e)}`);
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
   * 에디터 안 엔진이 돌고 있으면 그쪽으로 paths 를 다시 올린다 (paths 가 없으면 scripts 와 씬과 맵 전부).
   * 에디터 안 엔진이 뜨는 중이면(첫 프레임 전까지) 모아 두었다가 첫 프레임 뒤에 올린다. 보낼 길이 없는 백엔드
   * (메모리, 웹판)는 보내지 않는다.
   */
  async reload(paths?: readonly string[], opts: ReloadOptions = {}): Promise<{ count: number } | null> {
    const { backend, project, log, toasts } = this.host;
    if (!project.isOpen) return null;
    if (this.embeddedStarting) {
      this.queueReload(paths);
      log.info(LOG_SOURCE, "핫 리로드: 에디터 안 엔진이 뜨는 중이다. 뜨면 바뀐 파일을 다시 올린다");
      return null;
    }
    if (this.embeddedRunning) return this.reloadEmbedded(paths);
    if (!this.canPush && this.state !== "running") return null;
    let files: HmrFile[] = [];
    if (backend.kind === "tauri") {
      try {
        files = await collectHmrFiles(backend);
      } catch (e) {
        const message = `핫 리로드 묶음을 모으지 못했다: ${errorText(e)}`;
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
      // 스크립트가 처음부터 다시 돈다: 지켜보는 것에 먼저 알린다 (새 판의 줄이 리로드 응답보다 먼저 올 수 있다)
      this.watch?.watch.restarted?.();
      const result = await backend.hmrPush(files);
      runInAction(() => (this.lastReload = { count: result.count, at: this.clock() }));
      log.info(LOG_SOURCE, `핫 리로드: ${result.count}개 파일을 보냈다. 엔진이 VM 을 다시 시작한다 (씬 상태는 처음으로)`);
      return result;
    } catch (e) {
      const err = e as BackendError;
      if (opts.fromSave && backend.kind === "bridge" && isHmrRefused(err)) {
        log.info(LOG_SOURCE, HMR_NO_ENGINE_SKIPPED);
        return null;
      }
      const message = err.code === "hmr_unreachable" || err.code === "network" ? `핫 리로드 실패: ${HMR_UNREACHABLE_HINT} (${err.message})` : `핫 리로드 실패: ${err.message}`;
      log.error(LOG_SOURCE, message);
      toasts.error(message);
      return null;
    }
  }

  /** 뜨는 중에 들어온 리로드를 모은다. 경로가 없으면(수동 리로드) 전부 */
  private queueReload(paths?: readonly string[]): void {
    if (!paths || this.queuedReload === "all") {
      this.queuedReload = "all";
      return;
    }
    const set = this.queuedReload ?? new Set<string>();
    for (const p of paths) set.add(p);
    this.queuedReload = set;
  }

  /**
   * 에디터 안 엔진: 바뀐 파일(없으면 scripts 와 씬과 맵)을 다시 올리고 VM 을 다시 시작한다.
   * 스크립트 오류면 경고만 하고 게임은 계속 돈다. 게임이 끝났거나 끝나는 중이라 올리지 않았으면 droppedLine 한 줄만 남긴다.
   * 엔진이 예외로 죽었으면 세션은 이미 끝났고 종료 알림이 토스트를 띄운다
   */
  private async reloadEmbedded(paths?: readonly string[], droppedLine = ENDED_RELOAD_DROPPED): Promise<{ count: number } | null> {
    const { log, toasts } = this.host;
    try {
      this.watch?.watch.restarted?.();
      const { count, scriptsFailed, dropped } = await this.embedded!.reload(paths);
      if (dropped) {
        log.info(LOG_SOURCE, droppedLine);
        return null;
      }
      runInAction(() => (this.lastReload = { count, at: this.clock() }));
      if (scriptsFailed) {
        log.warn(LOG_SOURCE, `핫 리로드: 에디터 안 엔진, ${count}개 파일을 다시 올렸지만 스크립트 오류로 VM 이 다시 뜨지 못했다. 위의 오류 줄을 누르면 그 자리로 간다`);
        toasts.warn("핫 리로드: 스크립트 오류. 콘솔의 오류 줄을 본다");
      } else {
        log.info(LOG_SOURCE, `핫 리로드: 에디터 안 엔진, ${count}개 파일을 다시 올렸다. VM 을 다시 시작한다 (씬 상태는 처음으로)`);
      }
      return { count };
    } catch (e) {
      const message = `핫 리로드 실패: ${errorText(e)}`;
      log.error(LOG_SOURCE, message);
      if (this.embeddedRunning) toasts.error(message);
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
      this.skipped = [];
      this.exitCode = null;
      this.fallback = null;
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
