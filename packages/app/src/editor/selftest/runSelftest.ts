// 자가 검사 흐름 (docs/plans/e6-packaging.md 5절). 계획의 프로젝트마다 새 프로젝트 쓰기(대화상자 없이, 새 프로젝트
// 대화상자와 같은 writeProjectTemplate), 열기, 진입 스크립트 열기(Monaco), 맵 문서 편집과 저장, 실행 목록(runner.start 에
// mode 를 넘긴다), 실행별 전체 로그, 맵 뷰 뽑기를 차례로 하고 보고서를 셸에 넘긴다. 판정은 scripts/selftest-check.mjs 가
// 로그와 스크린샷으로 다시 한다. 여기의 ok 는 앱이 본 것이고 종료 코드에만 쓴다.
// 모달이 뜨면(신뢰 확인, 저장 여부 등) 그 제목을 dialogs 에 적고 닫는다. 그 자체가 실패다.
// 계획의 probe 는 확장의 탐침(ext-tilemap 의 MapSelftestProbe)이 맵에 붙인 것을 보고서에 적고, 실행의 play 는 탐침이 만든 요청을
// 앱의 맵 실행 길(여기서 실행과 같은 길)로 띄운다. 계획의 mode 와 env 만 더한다.
// 계획의 languageServer 는 진입 스크립트를 연 뒤 앱에 든 언어 서버가 뜨기를 기다려, 진입 스크립트의 "Json." 뒤 완성과 호버를 묻는다.

import type { Document, LogEntry, ProjectBackend, RunMode, SaveOutcome } from "@initial-editor/core";
import type { MapSelftestProbe, PlayRequest } from "@initial-editor/ext-tilemap";
import { MapDocument, singleBrush, stamp } from "@initial-editor/ext-tilemap/model";
import type { EngineSource } from "../runner/engineCandidates";
import type { ProjectTemplateOptions } from "../scene/projectTemplates";
import { encodeBmp32 } from "./bmp";
import type { CspViolation } from "./csp";
import { projectRoot, runLogName, type MapCaptureSpec, type PlanProbe, type PlanProject, type PlanRun, type SelftestPlan } from "./plan";

export interface SelftestRunner {
  readonly state: "idle" | "starting" | "running" | "stopping";
  readonly exitCode: number | null;
  readonly engineSource: EngineSource;
  readonly enginePath: string | null;
  readonly features: string[] | null;
  readonly fallback: RunMode | null;
  readonly activeMode: RunMode | null;
  readonly bundled: { path: string; meta: unknown } | null;
  start(opts: { mode?: RunMode; env?: Record<string, string>; scene?: string }): Promise<void>;
  stop(): Promise<void>;
}

export interface SelftestModal {
  id: number;
  title: string;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TilePixels {
  width: number;
  height: number;
  pixels: ArrayLike<number>;
}

/** 언어 서버의 상태와 요청 (자가 검사가 쓰는 것만) */
export interface SelftestLanguageServer {
  readonly state: string;
  readonly version: string | null;
  readonly reason: string;
  /** 프로젝트 상대 경로의 그 자리(0부터)에서 완성 후보의 이름들 */
  completion(path: string, line: number, character: number): Promise<string[]>;
  /** 그 자리의 호버 글 (없으면 빈 문자열) */
  hover(path: string, line: number, character: number): Promise<string>;
}

export interface MapViewStatus {
  ready: boolean;
  error: string | null;
  warning: string | null;
}

/** 에디터에서 자가 검사가 쓰는 것만 (index.ts 가 Editor 를 이 꼴로 감싼다) */
export interface SelftestHost {
  readonly app: { version: string; commit: string; platform: string; mode: string; backend: string };
  readonly backend: ProjectBackend;
  readonly runner: SelftestRunner;
  openProject(root: string): Promise<boolean>;
  closeProject(): Promise<boolean>;
  openPath(path: string): Promise<void>;
  findDocument(path: string): Document | null;
  saveDocument(doc: Document): Promise<SaveOutcome>;
  logEntries(): readonly LogEntry[];
  modals(): readonly SelftestModal[];
  closeModal(id: number): void;
  writeTemplate(backend: ProjectBackend, options: ProjectTemplateOptions): Promise<string[]>;
  /** 맵 문서의 뷰 상태 (뷰가 아직 없으면 null) */
  mapViewStatus(doc: MapDocument): MapViewStatus | null;
  /** 맵 뷰의 타일 레이어만 월드 좌표 rect 로 1배 (뷰가 없거나 타일셋이 아직이면 null) */
  captureMapTiles(doc: MapDocument, rect: Rect): Promise<TilePixels | null>;
  cspViolations(): readonly CspViolation[];
  /** 확장의 내보내기에 있는 탐침 (없으면 null) */
  extensionProbe(extensionId: string): MapSelftestProbe | null;
  /** 확장의 실행 요청을 앱의 맵 실행 길로 띄운다. 러너에는 mode 와 env 를 더한다 (요청의 변수가 이긴다). 띄웠으면 true */
  playMap(doc: MapDocument, request: PlayRequest, opts: { mode: RunMode; env: Record<string, string> }): Promise<boolean>;
  /** Lua 언어 서버. 서버를 띄울 수 없는 실행 환경이면 null */
  languageServer(): SelftestLanguageServer | null;
}

export interface SelftestShell {
  progress(step: Record<string, unknown>): Promise<void>;
  /** logs/<name> 에 쓰고 쓴 절대 경로를 돌려준다 */
  writeLog(name: string, data: string | Uint8Array): Promise<string>;
  finish(report: string, code: number): Promise<void>;
}

export interface SelftestDeps {
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** 모달을 살피는 간격 (ms) */
  pollMs?: number;
  /** 맵 뷰가 준비되기를 기다리는 시간. 창이 숨었으면 짧게 보고 넘어간다 */
  mapViewWaitMs?: number;
  /** 언어 서버가 뜨기를 기다리는 시간 */
  languageServerWaitMs?: number;
}

export interface RunReport {
  mode: RunMode;
  optional: boolean;
  check: string;
  ok: boolean;
  problems: string[];
  engine: { source: EngineSource; path: string | null; features: string[] | null; meta: unknown } | null;
  activeMode: RunMode | null;
  fallback: RunMode | null;
  exitCode: number | null;
  durationMs: number;
  lineCount: number;
  log: string | null;
  editorLog: string | null;
  screenshot: string | null;
  errorLines: string[];
  tail: string[];
  mapCapture: { file: string; rect: Rect; placementX: number } | null;
  /** 확장의 실행 요청으로 띄운 실행 (계획의 play) */
  play: { extension: string; map: string; args: Record<string, unknown>; label: string | null; refused: string | null } | null;
}

export interface ProjectReport {
  id: string;
  root: string;
  template: string | null;
  language: string;
  files: number;
  entryScript: { path: string; opened: boolean };
  /** cellBefore: 칠하기 전 그 칸의 gid (판정이 칠하기 전 맵의 그림을 셈할 때 쓴다), cellAfter: 저장한 파일을 다시 읽은 칸 */
  edit: { map: string; layer: number; x: number; y: number; gid: number; cellBefore: number | null; dirtyAfterPaint: boolean; saved: SaveOutcome | null; dirtyAfterSave: boolean; cellAfter: number | null } | null;
  mapView: { path: string; ready: boolean; error: string | null; warning: string | null; width: number; height: number; pixelWidth: number; pixelHeight: number; objects: number } | null;
  /** 확장의 탐침이 적은 것 (계획의 probe). result 는 마지막 describe */
  probe: { extension: string; map: string; ready: boolean; waitedMs: number; result: unknown } | null;
  /** 계획의 languageServer: 서버 상태, 기다린 시간, 진입 스크립트의 "Json." 뒤 완성 후보(앞 20개)와 호버 */
  languageServer: { state: string; version: string | null; reason: string; waitedMs: number; at: { line: number; character: number } | null; completion: string[]; hover: string } | null;
  problems: string[];
  runs: RunReport[];
}

export interface SelftestReport {
  version: 1;
  ok: boolean;
  app: SelftestHost["app"];
  showWindow: boolean;
  startedAt: string;
  durationMs: number;
  cspViolations: CspViolation[];
  dialogs: string[];
  projects: ProjectReport[];
  error?: string;
}

const TAIL_LINES = 40;
const STEP_TIMEOUT_MS = 60_000;

/** 엔진 테스트 러너와 같은 기준 (scripts/lib/flappyChecks.mjs 의 errorLines): iCCP 경고를 빼고 error, panic 등 */
export function errorLines(lines: readonly string[]): string[] {
  return lines.filter((l) => !/iccp/i.test(l)).filter((l) => /error|panic|uncaught exception|scene: /i.test(l));
}

/** 로그에서 placement 정규식이 잡은 마지막 숫자 무리 (옮긴 자리가 있으면 그것) */
export function placementX(lines: readonly string[], pattern: string): number | null {
  const re = new RegExp(pattern);
  let found: number | null = null;
  for (const line of lines) {
    const m = re.exec(line);
    if (!m) continue;
    for (let i = m.length - 1; i >= 1; i--) {
      if (m[i] !== undefined && m[i] !== "" && Number.isFinite(Number(m[i]))) {
        found = Number(m[i]);
        break;
      }
    }
  }
  return found;
}

/** 게임과 같은 카메라: x 를 가운데에 두고 맵 안으로 자른 뒤 내림, y 는 0 */
export function followCamera(x: number, spec: Pick<MapCaptureSpec, "width" | "height">, mapPixelWidth: number): Rect {
  const cam = Math.floor(Math.max(0, Math.min(x - spec.width / 2, mapPixelWidth - spec.width)));
  return { x: cam, y: 0, width: spec.width, height: spec.height };
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${what}: 시간 초과 (${ms} ms)`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function runSelftest(plan: SelftestPlan, host: SelftestHost, shell: SelftestShell, deps: SelftestDeps = {}): Promise<SelftestReport> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? (() => Date.now());
  const pollMs = deps.pollMs ?? 100;
  const mapViewWaitMs = deps.mapViewWaitMs ?? (plan.showWindow ? 30_000 : 5_000);
  const languageServerWaitMs = deps.languageServerWaitMs ?? 60_000;
  const started = now();
  const report: SelftestReport = {
    version: 1,
    ok: false,
    app: host.app,
    showWindow: plan.showWindow,
    startedAt: new Date(started).toISOString(),
    durationMs: 0,
    cspViolations: [],
    dialogs: [],
    projects: [],
  };

  // 모달은 기다리는 단계 안에서도 뜰 수 있으므로 따로 살핀다 (뜨면 적고 닫는다: 신뢰 확인은 이번만 건너뛰기)
  const seen = new Set<number>();
  let current: ProjectReport | null = null;
  const watcher = setInterval(() => {
    for (const m of host.modals()) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      report.dialogs.push(m.title);
      current?.problems.push(`unexpected_dialog: ${m.title}`);
      host.closeModal(m.id);
    }
  }, pollMs);

  const progress = (step: Record<string, unknown>) => shell.progress(step).catch(() => {});

  try {
    for (const project of plan.projects) {
      const pr = await runProject(project);
      report.projects.push(pr);
    }
  } catch (e) {
    report.error = message(e);
  } finally {
    clearInterval(watcher);
  }

  report.cspViolations = [...host.cspViolations()];
  report.durationMs = now() - started;
  const requiredOk = report.projects.every((p) => p.problems.length === 0 && p.runs.every((r) => r.ok || r.optional));
  report.ok = !report.error && requiredOk && report.dialogs.length === 0 && report.cspViolations.length === 0;
  await progress({ step: "finish", ok: report.ok });
  await shell.finish(JSON.stringify(report, null, 2) + "\n", report.ok ? 0 : 1);
  return report;

  async function runProject(project: PlanProject): Promise<ProjectReport> {
    const root = projectRoot(plan, project);
    const pr: ProjectReport = {
      id: project.id,
      root,
      template: project.template,
      language: project.language,
      files: 0,
      entryScript: { path: project.entry, opened: false },
      edit: null,
      mapView: null,
      probe: null,
      languageServer: null,
      problems: [],
      runs: [],
    };
    current = pr;
    try {
      if (project.template) {
        await progress({ project: project.id, step: "create" });
        const backend = host.backend;
        await backend.open(root);
        try {
          const written = await host.writeTemplate(backend, { template: project.template, language: project.language, name: project.id });
          pr.files = written.length;
        } finally {
          await backend.close().catch(() => {});
        }
      }
      await progress({ project: project.id, step: "open" });
      const opened = await withTimeout(host.openProject(root), STEP_TIMEOUT_MS, "프로젝트 열기");
      if (!opened) {
        pr.problems.push(`open_failed: ${root}`);
        return pr;
      }
      await progress({ project: project.id, step: "entry" });
      await withTimeout(host.openPath(project.entry), STEP_TIMEOUT_MS, "진입 스크립트 열기");
      pr.entryScript.opened = host.findDocument(project.entry) !== null;
      if (!pr.entryScript.opened) pr.problems.push(`entry_not_opened: ${project.entry}`);

      if (project.languageServer) await checkLanguageServer(project, pr);
      if (project.edit) await applyEdit(project, pr);
      if (project.openMap) await openMapView(project.openMap, pr);
      if (project.probe) await describeProbe(project.probe, pr);

      for (let i = 0; i < project.runs.length; i++) {
        pr.runs.push(await runOnce(project, project.runs[i], i + 1));
      }
      await progress({ project: project.id, step: "close" });
      await withTimeout(host.closeProject(), STEP_TIMEOUT_MS, "프로젝트 닫기");
    } catch (e) {
      pr.problems.push(`error: ${message(e)}`);
    } finally {
      current = null;
    }
    return pr;
  }

  async function checkLanguageServer(project: PlanProject, pr: ProjectReport): Promise<void> {
    await progress({ project: project.id, step: "language-server" });
    const server = host.languageServer();
    if (!server) {
      pr.problems.push("language_server_missing: 이 실행 환경에는 언어 서버를 실행하는 방법이 없습니다");
      return;
    }
    const t0 = now();
    const deadline = t0 + languageServerWaitMs;
    while ((server.state === "idle" || server.state === "starting") && now() < deadline) await sleep(pollMs);
    const lr: NonNullable<ProjectReport["languageServer"]> = { state: server.state, version: server.version, reason: server.reason, waitedMs: now() - t0, at: null, completion: [], hover: "" };
    pr.languageServer = lr;
    if (server.state !== "running") {
      pr.problems.push(`language_server_not_running: ${server.state} ${server.reason}`.trim());
      return;
    }
    const doc = host.findDocument(project.entry) as (Document & { text?: string }) | null;
    const text = doc?.text ?? "";
    const index = text.indexOf("Json.");
    if (index < 0) {
      pr.problems.push(`language_server_no_anchor: ${project.entry} 에 "Json." 이 없습니다`);
      return;
    }
    const lines = text.slice(0, index + "Json.".length).split("\n");
    lr.at = { line: lines.length - 1, character: lines[lines.length - 1].length };
    // 서버는 작업 공간을 다 읽기 전에는 빈 완성이나 문서의 낱말 목록, "Workspace loading" 호버를 준다. 답이 나올 때까지 다시 묻는다
    const answerDeadline = now() + languageServerWaitMs;
    try {
      for (;;) {
        lr.completion = (await withTimeout(server.completion(project.entry, lr.at.line, lr.at.character), STEP_TIMEOUT_MS, "언어 서버 완성")).slice(0, 20);
        lr.hover = (await withTimeout(server.hover(project.entry, lr.at.line, lr.at.character + 1), STEP_TIMEOUT_MS, "언어 서버 호버")).slice(0, 400);
        if ((lr.completion.some((l) => l.startsWith("Load")) && lr.hover.includes("Load")) || now() >= answerDeadline) break;
        await sleep(pollMs * 5);
      }
    } catch (e) {
      pr.problems.push(`language_server_request: ${message(e)}`);
      return;
    }
    lr.waitedMs = now() - t0;
    if (!lr.completion.some((l) => l.startsWith("Load"))) pr.problems.push(`language_server_completion: "Json." 뒤에 Load 가 없습니다 (${lr.completion.join(", ")})`);
    if (!lr.hover.includes("Load")) pr.problems.push(`language_server_hover: Json.Load 의 호버가 비어 있습니다`);
  }

  async function mapDocument(path: string): Promise<MapDocument> {
    await progress({ step: "map-open", map: path });
    await withTimeout(host.openPath(path), STEP_TIMEOUT_MS, "맵 열기");
    await progress({ step: "map-opened", map: path });
    const doc = host.findDocument(path);
    if (!(doc instanceof MapDocument)) throw new Error(`맵 문서로 열기 실패: ${path}`);
    return doc;
  }

  /** 맵 뷰가 준비되기를 기다린다. 끝내 준비되지 않으면 마지막 상태 */
  async function waitMapView(doc: MapDocument): Promise<MapViewStatus> {
    const deadline = now() + mapViewWaitMs;
    let status = host.mapViewStatus(doc);
    let said = 0;
    while (!(status?.ready || status?.error) && now() < deadline) {
      await sleep(pollMs);
      status = host.mapViewStatus(doc);
      if (now() - said >= 1000) {
        said = now();
        await progress({ step: "map-view-wait", view: status ? "있음" : "없음", ready: status?.ready ?? false });
      }
    }
    return status ?? { ready: false, error: "맵 뷰 없음", warning: null };
  }

  function noteMapView(path: string, doc: MapDocument, status: MapViewStatus, pr: ProjectReport): void {
    const m = doc.model;
    pr.mapView = { path, ready: status.ready, error: status.error, warning: status.warning, width: m.width, height: m.height, pixelWidth: m.pixelWidth, pixelHeight: m.pixelHeight, objects: m.objects.length };
    // 창이 보이면 맵 뷰(PIXI, WebGL)가 떠야 한다. 숨은 창은 프레임이 멈출 수 있어 적기만 한다
    if (status.error) pr.problems.push(`map_view_error: ${status.error}`);
    else if (plan.showWindow && !status.ready) pr.problems.push(`map_view_not_ready: ${path}`);
  }

  async function applyEdit(project: PlanProject, pr: ProjectReport): Promise<void> {
    const edit = project.edit!;
    await progress({ project: project.id, step: "edit", map: edit.map });
    const doc = await mapDocument(edit.map);
    noteMapView(edit.map, doc, await waitMapView(doc), pr);
    const index = edit.y * doc.model.width + edit.x;
    const cellBefore = doc.model.layers[edit.layer]?.data[index] ?? null;
    doc.setTarget({ kind: "layer", index: edit.layer });
    doc.setBrush(singleBrush(edit.gid));
    doc.apply(doc.model.paintCells(edit.layer, stamp(doc.model, doc.brush, edit.x, edit.y), "selftest-pen"));
    const dirtyAfterPaint = doc.dirty;
    const saved = await withTimeout(host.saveDocument(doc), STEP_TIMEOUT_MS, "맵 저장");
    let cellAfter: number | null = null;
    try {
      const disk = JSON.parse(await host.backend.readText(edit.map)) as { layers?: Array<{ data?: number[] }> };
      cellAfter = disk.layers?.[edit.layer]?.data?.[index] ?? null;
    } catch (e) {
      pr.problems.push(`edit_read_back: ${message(e)}`);
    }
    pr.edit = { ...edit, cellBefore, dirtyAfterPaint, saved, dirtyAfterSave: doc.dirty, cellAfter };
    if (saved !== "saved") pr.problems.push(`edit_not_saved: ${saved}`);
    if (cellAfter !== edit.gid) pr.problems.push(`edit_cell: 저장한 타일 gid ${cellAfter} (기대 ${edit.gid})`);
  }

  async function openMapView(path: string, pr: ProjectReport): Promise<void> {
    await progress({ project: pr.id, step: "map", map: path });
    const doc = await mapDocument(path);
    noteMapView(path, doc, await waitMapView(doc), pr);
  }

  function probeOf(extension: string): MapSelftestProbe {
    const probe = host.extensionProbe(extension);
    if (!probe) throw new Error(`탐침 없음: 확장 ${extension}`);
    return probe;
  }

  /** 탐침의 describe 가 ready 일 때까지 묻는다. 창이 숨었으면 짧게 보고 넘어간다 */
  async function describeProbe(spec: PlanProbe, pr: ProjectReport): Promise<void> {
    await progress({ project: pr.id, step: "probe", extension: spec.extension, map: spec.map });
    const probe = probeOf(spec.extension);
    const doc = await mapDocument(spec.map);
    const t0 = now();
    const deadline = t0 + mapViewWaitMs;
    let result = probe.describe(doc);
    while (!result.ready && now() < deadline) {
      await sleep(pollMs);
      result = probe.describe(doc);
    }
    pr.probe = { extension: spec.extension, map: spec.map, ready: result.ready, waitedMs: now() - t0, result };
    if (!result.ready && plan.showWindow) pr.problems.push(`probe_not_ready: ${spec.extension} ${spec.map}`);
  }

  /** 계획의 play: 탐침이 만든 요청을 앱의 맵 실행 길로 띄운다. 띄웠으면 true */
  async function startPlay(run: PlanRun, rr: RunReport): Promise<boolean> {
    const spec = run.play!;
    const doc = await mapDocument(spec.map);
    const request = probeOf(spec.extension).playRequest(doc, spec.args);
    rr.play = { extension: spec.extension, map: spec.map, args: spec.args, label: typeof request === "string" ? null : request.label, refused: typeof request === "string" ? request : null };
    if (typeof request === "string") {
      rr.problems.push(`play_refused: ${request}`);
      return false;
    }
    return host.playMap(doc, request, { mode: run.mode, env: run.env });
  }

  async function runOnce(project: PlanProject, run: PlanRun, n: number): Promise<RunReport> {
    const runner = host.runner;
    await progress({ project: project.id, step: "run", run: n, mode: run.mode });
    const entries = host.logEntries();
    const startId = entries.length ? entries[entries.length - 1].id : 0;
    const t0 = now();
    const rr: RunReport = {
      mode: run.mode,
      optional: run.optional,
      check: run.check,
      ok: false,
      problems: [],
      engine: null,
      activeMode: null,
      fallback: null,
      exitCode: null,
      durationMs: 0,
      lineCount: 0,
      log: null,
      editorLog: null,
      screenshot: run.env.INITIAL2D_SCREENSHOT ?? null,
      errorLines: [],
      tail: [],
      mapCapture: null,
      play: null,
    };
    const dialogsBefore = report.dialogs.length;
    let started = false;
    try {
      if (run.play) {
        const played = await withTimeout(startPlay(run, rr), run.timeoutMs, "실행 시작");
        started = played && (runner.state !== "idle" || runner.exitCode !== null);
      } else {
        await withTimeout(runner.start({ mode: run.mode, env: run.env, ...(run.scene ? { scene: run.scene } : {}) }), run.timeoutMs, "실행 시작");
        started = runner.state !== "idle" || runner.exitCode !== null;
      }
      if (!started) rr.problems.push("start_failed");
      const deadline = t0 + run.timeoutMs;
      while (runner.state !== "idle" && now() < deadline) await sleep(pollMs);
      if (runner.state !== "idle") {
        rr.problems.push(`timeout: ${run.timeoutMs} ms`);
        await withTimeout(runner.stop(), STEP_TIMEOUT_MS, "실행 정지").catch((e: unknown) => rr.problems.push(`stop: ${message(e)}`));
      }
    } catch (e) {
      rr.problems.push(`error: ${message(e)}`);
    }
    rr.durationMs = now() - t0;
    rr.exitCode = runner.exitCode;
    rr.activeMode = runner.activeMode;
    rr.fallback = runner.fallback;
    rr.engine = { source: runner.engineSource, path: runner.enginePath, features: runner.features, meta: runner.engineSource === "bundled" ? (runner.bundled?.meta ?? null) : null };

    const during = host.logEntries().filter((e) => e.id > startId);
    const engineLines = during.filter((e) => e.source === "engine").map((e) => e.text);
    rr.lineCount = engineLines.length;
    rr.errorLines = errorLines(engineLines);
    rr.tail = engineLines.slice(-TAIL_LINES);
    rr.log = await shell.writeLog(runLogName(project.id, n), engineLines.join("\n") + (engineLines.length ? "\n" : ""));
    rr.editorLog = await shell.writeLog(runLogName(project.id, n, "editor.log"), during.map((e) => `${e.level} ${e.source}: ${e.text}`).join("\n") + "\n");
    if (!started) {
      const why = during.filter((e) => e.level === "error" || e.level === "warn").map((e) => e.text);
      if (why.length) rr.problems.push(`reason: ${why.join(" | ")}`);
    }

    if (run.mapCapture) await captureFrame(project, run.mapCapture, n, engineLines, rr);

    // 앱이 본 판정 (종료 코드에만 쓴다. 전체 판정은 selftest-check.mjs 가 로그로 다시 한다)
    if (rr.exitCode !== 0) rr.problems.push(`exit_code: ${rr.exitCode}`);
    if (rr.errorLines.length) rr.problems.push(`error_lines: ${rr.errorLines.length}`);
    const expectSource = run.expectEngineSource;
    if (expectSource && rr.engine.source !== expectSource) rr.problems.push(`engine_source: ${rr.engine.source} (기대 ${expectSource})`);
    if (rr.fallback !== run.expectFallback) rr.problems.push(`fallback: ${rr.fallback} (기대 ${run.expectFallback})`);
    if (report.dialogs.length > dialogsBefore) rr.problems.push(`unexpected_dialog: ${report.dialogs.slice(dialogsBefore).join(", ")}`);
    rr.ok = rr.problems.length === 0;
    return rr;
  }

  async function captureFrame(project: PlanProject, spec: MapCaptureSpec, n: number, lines: readonly string[], rr: RunReport): Promise<void> {
    await progress({ project: project.id, step: "capture", run: n, map: spec.map });
    const x = placementX(lines, spec.placement);
    if (x === null) {
      rr.problems.push(`capture: 로그에 위치 줄 없음 (${spec.placement})`);
      return;
    }
    let doc: MapDocument;
    try {
      doc = await mapDocument(spec.map);
    } catch (e) {
      rr.problems.push(`capture: ${message(e)}`);
      return;
    }
    const rect = followCamera(x, spec, doc.model.pixelWidth);
    const deadline = now() + mapViewWaitMs;
    let tiles = await host.captureMapTiles(doc, rect);
    while (!tiles && now() < deadline) {
      await sleep(pollMs);
      tiles = await host.captureMapTiles(doc, rect);
    }
    if (!tiles) {
      rr.problems.push("capture: 맵 뷰에서 타일 추출 실패");
      return;
    }
    const file = await shell.writeLog(runLogName(project.id, n, "map.bmp"), encodeBmp32(tiles.width, tiles.height, tiles.pixels));
    rr.mapCapture = { file, rect, placementX: x };
  }
}
