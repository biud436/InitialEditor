// 자가 검사 계획 (docs/plans/e6-packaging.md 5절). scripts/selftest-plan.mjs 가 만들고 셸(src-tauri/src/selftest.rs)이
// 읽어 폴더를 만든 뒤 selftest_plan 으로 넘긴다. 여기서는 모양을 검사하고 앱이 쓰는 꼴로 바꾼다.

import type { RunMode } from "@initial-editor/core";
import type { EngineSource } from "../runner/engineCandidates";
import type { ProjectTemplateId } from "../scene/templateManifest";

export type SelftestCheck = "flappy" | "tilemapPixel" | "mapFrame" | "eventFront" | "eventProbe";
export const CHECKS: readonly SelftestCheck[] = ["flappy", "tilemapPixel", "mapFrame", "eventFront", "eventProbe"];
export const TEMPLATES: readonly ProjectTemplateId[] = ["empty", "flappy", "tilemap"];
export const ENGINE_SOURCES: readonly EngineSource[] = ["settings", "project-file", "project-build", "bundled", "sibling", "none"];

/** 맵 문서에서 칸 하나를 칠하고 저장한다 (펜 한 번, 되돌리기 스택으로) */
export interface PlanEdit {
  kind: "paintTile";
  map: string;
  layer: number;
  x: number;
  y: number;
  gid: number;
}

/**
 * 실행이 끝난 뒤 맵 뷰의 타일 레이어를 게임과 같은 카메라로 뽑는다. 카메라는 로그에서 placement 정규식이 잡은 x 를
 * 가운데에 두고 맵 안으로 자른 자리(내림)이고 y 는 0 이다. width, height 는 게임의 논리 화면 크기다
 */
export interface MapCaptureSpec {
  map: string;
  width: number;
  height: number;
  placement: string;
}

/** 확장의 탐침(MapSelftestProbe)에 맵 하나를 묻는다: 맵 뷰로 열고 describe 가 ready 일 때까지 기다려 보고서에 적는다 */
export interface PlanProbe {
  extension: string;
  map: string;
}

/** 러너를 직접 시작하지 않고 확장의 탐침이 만든 실행 요청을 앱의 맵 실행 길(여기서 실행과 같은 길)로 띄운다 */
export interface PlanPlay {
  extension: string;
  map: string;
  args: Record<string, unknown>;
}

export interface PlanRun {
  mode: RunMode;
  optional: boolean;
  /** 엔진 후보 탐색이 고를 출처. none 은 못 찾는다는 뜻 */
  expectEngineSource: EngineSource | null;
  /** 넘어갈 방식. null 이면 넘어가지 않아야 한다 */
  expectFallback: RunMode | null;
  check: SelftestCheck;
  env: Record<string, string>;
  scene: string | null;
  timeoutMs: number;
  mapCapture: MapCaptureSpec | null;
  play: PlanPlay | null;
}

export interface PlanProject {
  id: string;
  /** 템플릿으로 새로 만든다. root 를 주면 이미 있는 폴더를 연다 */
  template: ProjectTemplateId | null;
  language: "lua" | "mruby";
  root: string | null;
  /** 편집기로 열 진입 스크립트 (없으면 언어의 main) */
  entry: string;
  edit: PlanEdit | null;
  /** 맵 뷰로 열어 둘 맵 (실행 뒤 뽑기에 쓴다) */
  openMap: string | null;
  probe: PlanProbe | null;
  runs: PlanRun[];
}

export interface SelftestPlan {
  version: 1;
  workDir: string;
  report: string;
  totalTimeoutMs: number;
  showWindow: boolean;
  projects: PlanProject[];
}

function fail(message: string): never {
  throw new Error(`자가 검사 계획: ${message}`);
}

function obj(v: unknown, where: string): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) fail(`${where}: 객체여야 함`);
  return v as Record<string, unknown>;
}

function str(v: unknown, where: string): string {
  if (typeof v !== "string" || v === "") fail(`${where}: 비어 있지 않은 문자열이어야 함`);
  return v;
}

function int(v: unknown, where: string, min: number): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min) fail(`${where}: ${min} 이상의 정수여야 함`);
  return v;
}

function optStr(v: unknown, where: string): string | null {
  return v == null ? null : str(v, where);
}

function oneOf<T extends string>(v: unknown, list: readonly T[], where: string): T {
  if (typeof v !== "string" || !(list as readonly string[]).includes(v)) fail(`${where}: ${list.join(", ")} 중 하나여야 함`);
  return v as T;
}

function parseEnv(v: unknown, where: string): Record<string, string> {
  if (v == null) return {};
  const o = obj(v, where);
  const out: Record<string, string> = {};
  for (const [k, value] of Object.entries(o)) {
    if (typeof value !== "string") fail(`${where}.${k}: 문자열이어야 함`);
    out[k] = value;
  }
  return out;
}

function parseRun(v: unknown, where: string): PlanRun {
  const r = obj(v, where);
  const mode = oneOf(r.mode, ["process", "embedded"] as const, `${where}.mode`);
  const check = oneOf(r.check, CHECKS, `${where}.check`);
  let mapCapture: MapCaptureSpec | null = null;
  if (r.mapCapture != null) {
    const m = obj(r.mapCapture, `${where}.mapCapture`);
    const placement = str(m.placement, `${where}.mapCapture.placement`);
    try {
      new RegExp(placement, "m");
    } catch {
      fail(`${where}.mapCapture.placement: 정규식 구문 오류`);
    }
    mapCapture = { map: str(m.map, `${where}.mapCapture.map`), width: int(m.width, `${where}.mapCapture.width`, 1), height: int(m.height, `${where}.mapCapture.height`, 1), placement };
  }
  if (check === "mapFrame" && !mapCapture) fail(`${where}: check mapFrame 에는 mapCapture 필요`);
  let play: PlanPlay | null = null;
  if (r.play != null) {
    const p = obj(r.play, `${where}.play`);
    play = { extension: str(p.extension, `${where}.play.extension`), map: str(p.map, `${where}.play.map`), args: p.args == null ? {} : obj(p.args, `${where}.play.args`) };
  }
  if ((check === "eventFront" || check === "eventProbe") && !play) fail(`${where}: check ${check} 에는 play 필요`);
  return {
    mode,
    optional: r.optional === true,
    expectEngineSource: r.expectEngineSource == null ? null : oneOf(r.expectEngineSource, ENGINE_SOURCES, `${where}.expectEngineSource`),
    expectFallback: r.expectFallback == null ? null : oneOf(r.expectFallback, ["process", "embedded"] as const, `${where}.expectFallback`),
    check,
    env: parseEnv(r.env, `${where}.env`),
    scene: optStr(r.scene, `${where}.scene`),
    timeoutMs: int(r.timeoutMs, `${where}.timeoutMs`, 1000),
    mapCapture,
    play,
  };
}

function parseEdit(v: unknown, where: string): PlanEdit {
  const e = obj(v, where);
  if (e.kind !== "paintTile") fail(`${where}.kind: paintTile 이어야 함`);
  return { kind: "paintTile", map: str(e.map, `${where}.map`), layer: int(e.layer, `${where}.layer`, 0), x: int(e.x, `${where}.x`, 0), y: int(e.y, `${where}.y`, 0), gid: int(e.gid, `${where}.gid`, 0) };
}

function parseProbe(v: unknown, where: string): PlanProbe {
  const p = obj(v, where);
  return { extension: str(p.extension, `${where}.extension`), map: str(p.map, `${where}.map`) };
}

export function entryScript(language: "lua" | "mruby"): string {
  return language === "mruby" ? "scripts/ruby/main.rb" : "scripts/lua/main.lua";
}

export function parsePlan(raw: unknown): SelftestPlan {
  const p = obj(raw, "계획");
  if (p.version !== 1) fail("version: 1 이어야 함");
  const projectsRaw = p.projects;
  if (!Array.isArray(projectsRaw) || projectsRaw.length === 0) fail("projects: 비어 있지 않은 배열이어야 함");
  const ids = new Set<string>();
  const projects = projectsRaw.map((v, i): PlanProject => {
    const where = `projects[${i}]`;
    const o = obj(v, where);
    const id = str(o.id, `${where}.id`);
    if (ids.has(id)) fail(`프로젝트 id 중복: ${id}`);
    ids.add(id);
    const root = optStr(o.root, `${where}.root`);
    const template = o.template == null ? null : oneOf(o.template, TEMPLATES, `${where}.template`);
    if (!root && !template) fail(`${where}: template 이나 root 필요`);
    const language = o.language == null ? "lua" : oneOf(o.language, ["lua", "mruby"] as const, `${where}.language`);
    const runsRaw = o.runs;
    if (!Array.isArray(runsRaw) || runsRaw.length === 0) fail(`${where}.runs: 비어 있지 않은 배열이어야 함`);
    return {
      id,
      template,
      language,
      root,
      entry: optStr(o.entry, `${where}.entry`) ?? entryScript(language),
      edit: o.edit == null ? null : parseEdit(o.edit, `${where}.edit`),
      openMap: optStr(o.openMap, `${where}.openMap`),
      probe: o.probe == null ? null : parseProbe(o.probe, `${where}.probe`),
      runs: runsRaw.map((r, j) => parseRun(r, `${where}.runs[${j}]`)),
    };
  });
  return {
    version: 1,
    workDir: str(p.workDir, "workDir"),
    report: str(p.report, "report"),
    totalTimeoutMs: int(p.totalTimeoutMs, "totalTimeoutMs", 1000),
    showWindow: p.showWindow === true,
    projects,
  };
}

/** 절대 경로에 이름 하나를 붙인다 (경로에 쓰인 구분자를 따른다) */
export function joinPath(base: string, name: string): string {
  const sep = base.includes("\\") && !base.includes("/") ? "\\" : "/";
  return base.endsWith(sep) ? base + name : base + sep + name;
}

export function projectRoot(plan: SelftestPlan, project: PlanProject): string {
  return project.root ?? joinPath(plan.workDir, project.id);
}

/** 실행 n(1부터)의 로그 이름 */
export function runLogName(projectId: string, n: number, suffix = "log"): string {
  return `${projectId}-${n}.${suffix}`;
}
