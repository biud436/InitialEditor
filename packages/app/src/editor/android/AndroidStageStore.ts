// 안드로이드 에셋 스테이징 (docs/plans/e6-packaging.md 6.3). 엔진 저장소를 찾고(engineRepo.ts), 미리 세고, 엔진의
// android/prepare_assets.sh --project <열린 프로젝트> 를 셸(android_stage)로 돌려 출력을 콘솔 source android 에 흘린다.
// 끝나면 STAGED 줄로 토스트와 다음 명령을 남긴다. DOM 을 모르고 셸 명령은 deps 로 받는다 (그래서 Node 로 테스트한다).
// 프로세스를 띄우지 못하는 백엔드(브라우저 폴더, 메모리, 브리지)는 deps 가 없어 명령이 꺼진다.

import type { LogStore, Platform, RunHandle, SettingsStore } from "@initial-editor/core";
import { action, computed, makeObservable, observable, runInAction } from "mobx";
import { isRepoTrusted, repoCandidates, stageDestPath, withTrustedScript, type RepoCandidate } from "./engineRepo";
import {
  countText,
  failureText,
  lineLevel,
  nextCommands,
  parseDryRunLine,
  parseStagedLine,
  RTP_WARNING,
  stagedToast,
  type DryRunSummary,
  type RepoState,
  type StagedSummary,
} from "./stageOutput";

export const ANDROID_LOG_SOURCE = "android";
export const DESKTOP_ONLY = "데스크톱 앱 전용";
export const NEED_PROJECT = "열린 프로젝트 없음";
export const STAGING_BUSY = "스테이징 중";
export const UNTRUSTED = "스크립트 실행 허용 필요";

export interface RepoProbeResult extends RepoState {
  /** android/prepare_assets.sh 가 있다 */
  script: boolean;
}

export interface StageRequest {
  repo: string;
  project: string;
  withRtp: boolean;
  dryRun: boolean;
}

/** 셸 명령 (backend-tauri 의 androidRepoProbe, androidStage) */
export interface AndroidStageDeps {
  probe(paths: string[]): Promise<RepoProbeResult[]>;
  run(req: StageRequest): Promise<RunHandle>;
}

export interface AndroidHost {
  readonly project: { readonly isOpen: boolean; readonly root: string };
  readonly settings: SettingsStore;
  readonly log: LogStore;
  readonly toasts: { success(text: string): unknown; warn(text: string): unknown; error(text: string): unknown };
  readonly platform: Platform;
  /** 실행기가 찾은 엔진. 저장소 후보 하나가 여기서 나온다 */
  engine(): { path: string | null; source: string };
}

/** 찾은 저장소 */
export interface FoundRepo extends RepoCandidate {
  state: RepoState;
}

export interface Discovery {
  found: FoundRepo | null;
  /** 찾아본 후보 (못 찾았을 때 이유에 보인다) */
  searched: RepoCandidate[];
}

interface ToolRun {
  code: number | null;
  stdout: string[];
  stderr: string[];
}

export class AndroidStageStore {
  state: "idle" | "staging" = "idle";
  /** 마지막으로 끝난 스테이징 */
  last: StagedSummary | null = null;

  constructor(
    private readonly host: AndroidHost,
    private readonly deps: AndroidStageDeps | null,
  ) {
    makeObservable<AndroidStageStore, "setState">(this, {
      state: observable,
      last: observable.ref,
      available: computed,
      disabledReason: computed,
      enabled: computed,
      setState: action,
      trust: action,
    });
  }

  /** 셸이 프로세스를 띄울 수 있는가 (Tauri 앱) */
  get available(): boolean {
    return this.deps !== null;
  }

  /** 명령이 꺼진 이유. 켜져 있으면 undefined */
  get disabledReason(): string | undefined {
    if (!this.available) return DESKTOP_ONLY;
    if (!this.host.project.isOpen) return NEED_PROJECT;
    if (this.state !== "idle") return STAGING_BUSY;
    return undefined;
  }

  get enabled(): boolean {
    return this.disabledReason === undefined;
  }

  private setState(state: AndroidStageStore["state"]): void {
    this.state = state;
  }

  /** 후보를 차례로 보고(실행하지 않는다) 스크립트가 있는 첫 저장소 */
  async discover(): Promise<Discovery> {
    const engine = this.host.engine();
    const searched = repoCandidates({
      settingsPath: this.host.settings.settings.engineRepoPath,
      root: this.host.project.root,
      enginePath: engine.path,
      engineSource: engine.source,
      platform: this.host.platform,
    });
    if (!this.deps || searched.length === 0) return { found: null, searched };
    const probes = await this.deps.probe(searched.map((c) => c.repo));
    const i = probes.findIndex((p) => p?.script === true);
    if (i < 0) return { found: null, searched };
    const { sdl, gradlew } = probes[i];
    return { found: { ...searched[i], state: { sdl, gradlew } }, searched };
  }

  /** 이 저장소의 스크립트를 실행해도 되는가 (설정의 저장소이거나 이 프로젝트에서 허용했다) */
  isTrusted(repo: RepoCandidate): boolean {
    return isRepoTrusted(repo, this.host.settings.settings.androidTrust[this.host.project.root]);
  }

  /** 이 프로젝트에서 저장소의 스크립트 실행을 허용하고 앱 설정에 남긴다 */
  trust(repo: RepoCandidate): void {
    if (!repo.needsTrust) return;
    const root = this.host.project.root;
    const map = this.host.settings.settings.androidTrust;
    this.host.settings.update({ androidTrust: { ...map, [root]: withTrustedScript(map[root], repo.script) } });
  }

  /** 프로세스 하나를 끝까지 돌린다. 줄마다 onLine */
  private async runTool(req: StageRequest, onLine?: (line: string, stream: "stdout" | "stderr") => void): Promise<ToolRun> {
    if (!this.deps) throw new Error(DESKTOP_ONLY);
    const handle = await this.deps.run(req);
    const out: ToolRun = { code: null, stdout: [], stderr: [] };
    return new Promise<ToolRun>((resolve) => {
      const offOutput = handle.onOutput((line, stream) => {
        (stream === "stderr" ? out.stderr : out.stdout).push(line);
        onLine?.(line, stream);
      });
      const offExit = handle.onExit((code) => {
        out.code = code;
        offOutput();
        queueMicrotask(() => offExit());
        resolve(out);
      });
    });
  }

  private requireTrusted(repo: RepoCandidate): void {
    if (!this.isTrusted(repo)) throw new Error(`${UNTRUSTED}: ${repo.script}`);
  }

  /** --dry-run 으로 파일 수와 크기를 센다. 실패하면 이유를 던진다 */
  async count(repo: FoundRepo, withRtp: boolean): Promise<DryRunSummary> {
    this.requireTrusted(repo);
    const run = await this.runTool({ repo: repo.repo, project: this.host.project.root, withRtp, dryRun: true });
    const summary = run.code === 0 ? parseDryRunLine(run.stdout[run.stdout.length - 1] ?? "") : null;
    if (!summary) throw new Error(failureText(run.code, run.stderr));
    return summary;
  }

  /** 스테이징. 출력은 콘솔에, 끝나면 토스트와 다음 명령. 실패하면 null (이유는 콘솔과 토스트에) */
  async stage(repo: FoundRepo, withRtp: boolean): Promise<StagedSummary | null> {
    if (this.state !== "idle") return null;
    this.requireTrusted(repo);
    const { log, toasts } = this.host;
    const project = this.host.project.root;
    this.setState("staging");
    try {
      log.info(ANDROID_LOG_SOURCE, `안드로이드 스테이징, 프로젝트: ${project}, 대상: ${stageDestPath(repo.repo)} (RTP 변환 파일 ${withRtp ? "포함" : "제외"})`);
      let run: ToolRun;
      try {
        run = await this.runTool({ repo: repo.repo, project, withRtp, dryRun: false }, (line, stream) => {
          log.append(lineLevel(line, stream), ANDROID_LOG_SOURCE, line);
        });
      } catch (e) {
        const message = (e as Error).message;
        log.error(ANDROID_LOG_SOURCE, `스테이징 시작 실패: ${message}`);
        toasts.error(`안드로이드 스테이징 시작 실패: ${message}`);
        return null;
      }
      const summary = run.code === 0 ? parseStagedLine(run.stdout[run.stdout.length - 1] ?? "") : null;
      if (!summary) {
        const reason = failureText(run.code, run.stderr);
        log.error(ANDROID_LOG_SOURCE, `스테이징 실패: ${reason}`);
        toasts.error(`안드로이드 스테이징 실패: ${reason}`);
        return null;
      }
      runInAction(() => {
        this.last = summary;
      });
      log.info(ANDROID_LOG_SOURCE, `완료: ${countText(summary)}, 스탬프 ${summary.stamp}, ${summary.dest}`);
      log.info(ANDROID_LOG_SOURCE, `다음 셸 명령 (${repo.repo} 에서):`); // terms-ok: 셸 명령
      for (const cmd of nextCommands(repo.state)) log.info(ANDROID_LOG_SOURCE, `  ${cmd}`);
      toasts.success(stagedToast(summary));
      if (summary.rtp) toasts.warn(RTP_WARNING);
      return summary;
    } finally {
      this.setState("idle");
    }
  }
}
