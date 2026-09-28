// 엔진 탐색의 신뢰 규칙, 앱에 든 엔진, 넘어가기 (docs/plans/e6-packaging.md 2.3 절).
// 가짜 probe 가 부른 경로를 기록한다: 신뢰하지 않은 프로젝트를 열면 프로젝트 안과 형제 경로를 한 번도 부르지 않는다.

import type { BundledEngine } from "@initial-editor/backend-tauri";
import { BackendError, LogStore, MemorySettingsStorage, Project, SettingsStore, type OutputStream, type ProjectBackend, type RunHandle, type RunSpec } from "@initial-editor/core";
import { MemoryBackend } from "@initial-editor/core/testing";
import { describe, expect, it } from "vitest";
import type { TrustAnswer, TrustQuestion } from "./engineTrust";
import { BUNDLED_PROBE_TIMEOUT_MS, FALLBACK_NOTICE, RunnerStore, WASM_NO_MRUBY, bundledEngineLabel, type EmbeddedEngine, type ProbeOptions, type RunnerHost } from "./RunnerStore";

const ROOT = "/home/u/game";
const BUILD = "/home/u/game/build/Initial2D";
const SIBLING = "/home/u/Initial2D/build/Initial2D";
const PROJECT_FILE = "/home/u/engines/Initial2D";
const SETTINGS = "/opt/engine/Initial2D";
const BUNDLED = "/Applications/InitialEditor.app/Contents/MacOS/Initial2D";
const COMMIT = "cac4b94e2dab79e13e5fd2ebdb6686fd23cfd33f";

class FakeHandle implements RunHandle {
  id = 1;
  pid = 4321;
  private exits = new Set<(code: number | null) => void>();
  constructor(readonly spec: RunSpec | null = null) {}
  onOutput(_cb: (line: string, stream: OutputStream) => void) {
    return () => {};
  }
  onExit(cb: (code: number | null) => void) {
    this.exits.add(cb);
    return () => void this.exits.delete(cb);
  }
  async stop() {
    queueMicrotask(() => {
      for (const cb of this.exits) cb(null);
    });
  }
}

class FakeEmbedded implements EmbeddedEngine {
  launches: Array<Record<string, string>> = [];
  features = ["lua", "wasm"];
  description = "기능 lua wasm";
  async loadFeatures() {
    return this.features;
  }
  async launch(opts: { env: Record<string, string> }) {
    this.launches.push(opts.env);
    return new FakeHandle();
  }
  abort() {}
  async reload() {
    return { count: 0, scriptsFailed: false };
  }
  async whenStepped() {
    return true;
  }
}

interface Setup {
  /** 파일이 있는 경로 (exists 가 참) */
  files?: string[];
  /** --features 에 답하는 경로 */
  engines?: Record<string, string[]>;
  /** 신뢰 모달의 답 (차례로). 다 쓰면 null */
  answers?: TrustAnswer[];
  projectFile?: string;
  enginePath?: string;
  bundled?: BundledEngine | null;
  embedded?: boolean;
  script?: "lua" | "mruby";
  /** probe 가 이 경로에서 먼저 이만큼 io 오류를 낸다 (시간 초과처럼) */
  slow?: Record<string, number>;
  /** 모달을 막아 두는 약속 (겹친 탐색) */
  gate?: Promise<void>;
  /** n 번째(0 부터) engine_exists 가 답하기 전에 기다릴 약속 */
  existsGate?: (call: number) => Promise<void> | undefined;
  /** 이 경로의 --features 가 답하기 전에 기다릴 약속 */
  probeGate?: Record<string, Promise<void>>;
}

async function setup(o: Setup = {}) {
  const files: Record<string, string> = {
    "game.json": JSON.stringify({ script: o.script ?? "lua" }),
    "scripts/lua/main.lua": "print('main')",
  };
  if (o.projectFile) files[".initial-editor/engine"] = o.projectFile;
  const mem = new MemoryBackend(files);
  const specs: RunSpec[] = [];
  const backend: ProjectBackend = Object.assign(Object.create(mem) as MemoryBackend, {
    kind: "tauri",
    capabilities: { run: true, pickFolder: true, watch: true, hmr: true },
    run: async (spec: RunSpec) => {
      specs.push(spec);
      return new FakeHandle(spec);
    },
  });
  const project = new Project(backend);
  const storage = new MemorySettingsStorage();
  const settings = new SettingsStore(storage);
  if (o.enginePath) settings.update({ enginePath: o.enginePath }, false);
  const log = new LogStore();
  const toasts: string[] = [];
  const toast = (level: string) => (text: string) => void toasts.push(`${level}: ${text}`);
  const host: RunnerHost = { backend, project, settings, log, platform: "mac", toasts: { info: toast("info"), success: toast("success"), warn: toast("warn"), error: toast("error") } };
  await project.open(ROOT);

  const probed: Array<[string, number | undefined]> = [];
  const questions: TrustQuestion[] = [];
  const existsCalls: string[][] = [];
  const answers = [...(o.answers ?? [])];
  const slow = { ...(o.slow ?? {}) };
  const present = new Set(o.files ?? []);
  const embedded = o.embedded ? new FakeEmbedded() : undefined;
  const runner = new RunnerStore(host, {
    probe: async (exe: string, opts?: ProbeOptions) => {
      probed.push([exe, opts?.timeoutMs]);
      await o.probeGate?.[exe];
      if ((slow[exe] ?? 0) > 0) {
        slow[exe]--;
        throw new BackendError(`${exe} --features 응답 시간 초과 (15초)`, "io", exe);
      }
      const features = o.engines?.[exe];
      if (!features) throw new BackendError(`엔진 실행 파일 없음: ${exe}`, "engine_not_found", exe);
      return features;
    },
    exists: async (paths) => {
      const call = existsCalls.length;
      existsCalls.push(paths);
      await o.existsGate?.(call);
      return paths.map((p) => present.has(p));
    },
    bundled: async () => o.bundled ?? null,
    askTrust: async (q) => {
      questions.push(q);
      if (o.gate) await o.gate;
      return answers.shift() ?? null;
    },
    embedded,
  });
  return { runner, host, settings, storage, log, toasts, specs, probed, questions, existsCalls, embedded, present };
}

const paths = (probed: Array<[string, number | undefined]>) => probed.map(([p]) => p);
const texts = (log: LogStore) => log.entries.map((e) => `${e.level}/${e.source}: ${e.text}`);

function bundledEngine(tag: string | null = "v2.0.0-alpha.1"): BundledEngine {
  return { path: BUNDLED, meta: { engineTag: tag, engineCommit: COMMIT, describe: tag ?? COMMIT.slice(0, 7), target: "aarch64-apple-darwin", sha256: "0".repeat(64), features: ["lua", "mruby"] } };
}

describe("신뢰하지 않은 프로젝트", () => {
  it("프로젝트 안과 형제 경로의 실행 파일은 한 번도 찌르지 않고 설정과 앱에 든 엔진만 찌른다. 앱에 든 엔진 앞의 무리만 묻는다", async () => {
    const t = await setup({
      projectFile: PROJECT_FILE,
      enginePath: SETTINGS,
      files: [PROJECT_FILE, BUILD, SIBLING],
      engines: { [PROJECT_FILE]: ["lua"], [BUILD]: ["lua"], [SIBLING]: ["lua"], [BUNDLED]: ["lua", "mruby"] },
      bundled: bundledEngine(),
      answers: ["deny"],
    });
    expect(await t.runner.resolveEngine()).toBe(BUNDLED);
    expect(paths(t.probed)).toEqual([SETTINGS, BUNDLED]);
    expect(t.runner.engineSource).toBe("bundled");
    // 묻기 전에 실행하지 않고 파일만 보았다. 형제는 앱에 든 엔진이 답해 보지도 않았다
    expect(t.existsCalls).toEqual([[PROJECT_FILE, BUILD]]);
    expect(t.questions).toHaveLength(1);
    expect(t.questions[0].root).toBe(ROOT);
    expect(t.questions[0].hasBundled).toBe(true);
    expect(t.questions[0].candidates.map((c) => [c.source, c.path])).toEqual([
      ["project-file", PROJECT_FILE],
      ["project-build", BUILD],
    ]);
    // 답은 앱 설정에 남는다 (프로젝트 폴더에는 쓰지 않는다)
    expect(t.settings.settings.engineTrust).toEqual({ [ROOT]: { allow: false, exes: [PROJECT_FILE, BUILD] } });
    expect((await t.host.backend.list(".initial-editor")).map((e) => e.name)).toEqual(["engine"]);
    expect(texts(t.log)).toContainEqual(`info/runner: 프로젝트가 가리키는 엔진을 신뢰하지 않아 실행 안 함: ${PROJECT_FILE}, ${BUILD}. 설정에서 다시 확인 가능`);
  });

  it("앱에 든 엔진이 답하면 형제 폴더의 엔진은 묻지도 보지도 않는다 (build/ 도 .initial-editor/engine 도 없는 프로젝트)", async () => {
    const t = await setup({ files: [SIBLING], engines: { [SIBLING]: ["lua"], [BUNDLED]: ["lua", "mruby"] }, bundled: bundledEngine(), answers: ["allow"] });
    expect(await t.runner.resolveEngine()).toBe(BUNDLED);
    expect(t.questions).toEqual([]);
    expect(t.existsCalls).toEqual([[BUILD]]);
    expect(paths(t.probed)).toEqual([BUNDLED]);
    expect(t.runner.skipped).toEqual([]);
    expect(t.settings.settings.engineTrust).toEqual({});
    expect(texts(t.log).some((l) => l.includes("신뢰하지 않아"))).toBe(false);
  });

  it("build/ 와 형제가 다 있어도 앱에 든 엔진 앞의 build/ 만 묻는다", async () => {
    const t = await setup({ files: [BUILD, SIBLING], engines: { [BUILD]: ["lua"], [SIBLING]: ["lua"], [BUNDLED]: ["lua"] }, bundled: bundledEngine(), answers: ["deny"] });
    expect(await t.runner.resolveEngine()).toBe(BUNDLED);
    expect(t.questions.map((q) => q.candidates.map((c) => c.path))).toEqual([[BUILD]]);
    expect(t.settings.settings.engineTrust[ROOT]).toEqual({ allow: false, exes: [BUILD] });
    expect(t.runner.skipped.map((c) => c.path)).toEqual([BUILD]);
  });

  it("앱에 든 엔진이 없으면(개발 빌드) build/ 와 형제를 한 번에 묻는다", async () => {
    const t = await setup({ files: [BUILD, SIBLING], engines: { [SIBLING]: ["lua"] }, answers: ["allow"] });
    expect(await t.runner.resolveEngine()).toBe(SIBLING);
    expect(t.questions.map((q) => [q.hasBundled, q.candidates.map((c) => c.path)])).toEqual([[false, [BUILD, SIBLING]]]);
    expect(paths(t.probed)).toEqual([BUILD, SIBLING]);
  });

  it("거절을 기억한다: 다시 열어도 묻지 않고 찌르지 않는다", async () => {
    const t = await setup({ files: [BUILD], engines: { [BUILD]: ["lua"], [BUNDLED]: ["lua"] }, bundled: bundledEngine(), answers: ["deny"] });
    await t.runner.resolveEngine();
    await t.runner.resolveEngine();
    await t.runner.resolveEngine();
    expect(t.questions).toHaveLength(1);
    expect(paths(t.probed)).toEqual([BUNDLED, BUNDLED, BUNDLED]);
    expect(t.runner.skipped.map((c) => c.path)).toEqual([BUILD]);
  });

  it("프로젝트가 가리키는 실행 파일이 하나도 없으면 묻지 않는다", async () => {
    const t = await setup({ engines: { [BUNDLED]: ["lua"] }, bundled: bundledEngine() });
    expect(await t.runner.resolveEngine()).toBe(BUNDLED);
    expect(t.questions).toEqual([]);
    expect(t.settings.settings.engineTrust).toEqual({});
    expect(paths(t.probed)).toEqual([BUNDLED]);
  });

  it("설정의 엔진이 먼저 답하면 프로젝트 쪽은 묻지도 보지도 않는다", async () => {
    const t = await setup({ enginePath: SETTINGS, files: [BUILD], engines: { [SETTINGS]: ["lua"] } });
    expect(await t.runner.resolveEngine()).toBe(SETTINGS);
    expect(t.questions).toEqual([]);
    expect(t.existsCalls).toEqual([]);
  });

  it("답 없이 닫으면 이번만 건너뛰고 기억하지 않는다 (다음에 다시 묻는다)", async () => {
    const t = await setup({ files: [BUILD], engines: { [BUILD]: ["lua"] }, answers: [null, "allow"] });
    expect(await t.runner.resolveEngine()).toBeNull();
    expect(t.settings.settings.engineTrust).toEqual({});
    expect(paths(t.probed)).toEqual([]);
    expect(await t.runner.resolveEngine()).toBe(BUILD);
    expect(t.questions).toHaveLength(2);
  });

  it("앱에 든 엔진이 없으면(개발 빌드) 거절 단추의 글이 다르다", async () => {
    const t = await setup({ files: [BUILD], answers: ["deny"] });
    await t.runner.resolveEngine();
    expect(t.questions[0].hasBundled).toBe(false);
  });
});

describe("허용한 프로젝트", () => {
  it("허용한 뒤에는 순서대로 부른다: 설정 > .initial-editor/engine > build/ > 앱에 든 엔진 > 형제. 앱에 든 엔진이 답하지 않으면 형제를 따로 묻는다", async () => {
    const t = await setup({
      projectFile: PROJECT_FILE,
      enginePath: SETTINGS,
      files: [PROJECT_FILE, BUILD, SIBLING],
      engines: { [SIBLING]: ["lua"] },
      bundled: bundledEngine(),
      answers: ["allow", "allow"],
    });
    expect(await t.runner.resolveEngine()).toBe(SIBLING);
    expect(paths(t.probed)).toEqual([SETTINGS, PROJECT_FILE, BUILD, BUNDLED, SIBLING]);
    expect(t.runner.engineSource).toBe("sibling");
    // 앱에 든 엔진이 답하지 않았으니 형제 무리는 그 단추 없이 따로 묻는다
    expect(t.questions.map((q) => [q.hasBundled, q.candidates.map((c) => c.path)])).toEqual([
      [true, [PROJECT_FILE, BUILD]],
      [false, [SIBLING]],
    ]);
    // 같은 답은 합쳐 남긴다
    expect(t.settings.settings.engineTrust[ROOT]).toEqual({ allow: true, exes: [PROJECT_FILE, BUILD, SIBLING] });
    // 두 번째부터는 묻지 않는다
    await t.runner.resolveEngine();
    expect(t.questions).toHaveLength(2);
  });

  it("허용한 엔진 저장소의 build/ 가 앱에 든 엔진보다 먼저다 (저자가 엔진 저장소를 열 때)", async () => {
    const t = await setup({ files: [BUILD], engines: { [BUILD]: ["lua", "mruby"], [BUNDLED]: ["lua", "mruby"] }, bundled: bundledEngine(), answers: ["allow"] });
    expect(await t.runner.resolveEngine()).toBe(BUILD);
    expect(t.runner.engineSource).toBe("project-build");
    expect(paths(t.probed)).toEqual([BUILD]);
  });

  it("후보 경로가 바뀌면 다시 묻는다 (.initial-editor/engine 이 다른 파일을 가리킨다)", async () => {
    const other = "/tmp/evil/Initial2D";
    const t = await setup({ projectFile: PROJECT_FILE, files: [PROJECT_FILE, other], engines: { [PROJECT_FILE]: ["lua"], [other]: ["lua"] }, answers: ["allow", "deny"] });
    expect(await t.runner.resolveEngine()).toBe(PROJECT_FILE);
    await t.host.backend.writeText(".initial-editor/engine", other);
    expect(await t.runner.resolveEngine()).toBeNull();
    expect(t.questions).toHaveLength(2);
    expect(t.questions[1].candidates.map((c) => c.path)).toEqual([other]);
    expect(paths(t.probed)).toEqual([PROJECT_FILE]);
    expect(t.settings.settings.engineTrust[ROOT]).toEqual({ allow: false, exes: [other] });
  });

  it("허용한 경로가 사라지기만 하면 다시 묻지 않는다", async () => {
    const t = await setup({ files: [BUILD, SIBLING], engines: { [SIBLING]: ["lua"] }, answers: ["allow"] });
    await t.runner.resolveEngine();
    // build/ 를 지웠다: 남은 형제는 이미 허용한 경로다
    t.present.delete(BUILD);
    expect(await t.runner.resolveEngine()).toBe(SIBLING);
    expect(t.questions).toHaveLength(1);
    expect(paths(t.probed)).toEqual([BUILD, SIBLING, SIBLING]);
  });

  it("묻는 사이 설정의 엔진으로 다시 찾았어도 답은 남긴다", async () => {
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    const t = await setup({ files: [BUILD], engines: { [BUILD]: ["lua"], [SETTINGS]: ["lua"] }, answers: ["deny"], gate });
    const first = t.runner.resolveEngine();
    await new Promise((r) => setTimeout(r, 0));
    t.settings.update({ enginePath: SETTINGS }, false);
    expect(await t.runner.resolveEngine()).toBe(SETTINGS);
    open();
    await first;
    expect(t.runner.enginePath).toBe(SETTINGS);
    expect(t.settings.settings.engineTrust[ROOT]).toEqual({ allow: false, exes: [BUILD] });
  });

  it("겹친 탐색이 묻는 동안 파일을 보고 있었어도 두 번 묻지 않고 허용한 build/ 를 쓴다", async () => {
    // 탐색 1 이 묻고 기다리는 사이 탐색 2 가 시작해 engine_exists 를 기다린다. 탐색 1 의 답이 난 뒤에야 탐색 2 의 exists 가 돌아온다
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    let answered!: () => void;
    const afterAnswer = new Promise<void>((r) => (answered = r));
    const t = await setup({
      files: [BUILD],
      engines: { [BUILD]: ["lua"], [BUNDLED]: ["lua"] },
      bundled: bundledEngine(),
      answers: ["allow"],
      gate,
      existsGate: (call) => (call === 1 ? afterAnswer : undefined),
    });
    const first = t.runner.resolveEngine();
    await new Promise((r) => setTimeout(r, 0));
    expect(t.questions).toHaveLength(1);
    const second = t.runner.resolveEngine();
    await new Promise((r) => setTimeout(r, 0));
    open();
    await first;
    answered();
    await second;
    expect(t.questions).toHaveLength(1);
    expect(t.runner.enginePath).toBe(BUILD);
    expect(t.runner.engineSource).toBe("project-build");
    expect(t.settings.settings.engineTrust[ROOT]).toEqual({ allow: true, exes: [BUILD] });
  });

  it("질문을 닫은 뒤 그 탐색이 아직 도는 동안 실행하면 새로 찾지 않고 그 탐색의 결과를 쓴다 (자가 검사의 열기와 실행)", async () => {
    let release!: () => void;
    const probeGate = { [BUNDLED]: new Promise<void>((r) => (release = r)) };
    const t = await setup({ files: [BUILD], engines: { [BUILD]: ["lua"], [BUNDLED]: ["lua"] }, bundled: bundledEngine(), answers: [null], probeGate });
    const opened = t.runner.resolveEngine();
    await new Promise((r) => setTimeout(r, 0));
    expect(t.questions).toHaveLength(1);
    const started = t.runner.start();
    await new Promise((r) => setTimeout(r, 0));
    release();
    await opened;
    await started;
    expect(t.questions).toHaveLength(1);
    expect(t.specs.map((spec) => spec.exe)).toEqual([BUNDLED]);
    expect(t.runner.engineSource).toBe("bundled");
    await t.runner.stop();
  });

  it("질문이 떠 있는 동안 실행하면 그 답을 기다려 쓴다", async () => {
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    const t = await setup({ files: [BUILD], engines: { [BUILD]: ["lua"], [BUNDLED]: ["lua"] }, bundled: bundledEngine(), answers: ["allow"], gate });
    const opened = t.runner.resolveEngine();
    await new Promise((r) => setTimeout(r, 0));
    const started = t.runner.start();
    await new Promise((r) => setTimeout(r, 0));
    open();
    await opened;
    await started;
    expect(t.questions).toHaveLength(1);
    expect(t.specs.map((spec) => spec.exe)).toEqual([BUILD]);
    await t.runner.stop();
  });

  it("앞의 탐색이 답을 남긴 뒤에 파일을 본 탐색은 그 답을 읽는다 (다시 묻지 않는다)", async () => {
    const t = await setup({ files: [BUILD], engines: { [BUILD]: ["lua"] }, answers: ["deny"] });
    await t.runner.resolveEngine();
    await t.runner.resolveEngine();
    expect(t.questions).toHaveLength(1);
    expect(t.existsCalls).toEqual([[BUILD, SIBLING], [BUILD, SIBLING]]);
  });

  it("탐색이 겹쳐도 같은 질문은 한 번만 띄운다", async () => {
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    const t = await setup({ files: [BUILD], engines: { [BUILD]: ["lua"] }, answers: ["allow"], gate });
    const first = t.runner.resolveEngine();
    const second = t.runner.resolveEngine();
    await new Promise((r) => setTimeout(r, 0));
    open();
    await Promise.all([first, second]);
    expect(t.questions).toHaveLength(1);
    expect(t.runner.enginePath).toBe(BUILD);
  });
});

describe("신뢰 취소", () => {
  it("신뢰 취소는 답을 지우고 이번에는 묻지 않고 다시 찾는다", async () => {
    const t = await setup({ files: [BUILD], engines: { [BUILD]: ["lua"], [BUNDLED]: ["lua"] }, bundled: bundledEngine(), answers: ["allow"] });
    await t.runner.resolveEngine();
    expect(t.runner.trustRecord).toEqual({ allow: true, exes: [BUILD] });
    await t.runner.revokeTrust();
    expect(t.runner.trustRecord).toBeNull();
    expect(t.settings.settings.engineTrust).toEqual({});
    expect(t.runner.engineSource).toBe("bundled");
    expect(t.questions).toHaveLength(1);
    await Promise.resolve();
    expect(t.storage.data?.engineTrust).toEqual({});
  });

  it("다시 묻기는 거절을 지우고 곧바로 묻는다", async () => {
    const t = await setup({ files: [BUILD], engines: { [BUILD]: ["lua"] }, answers: ["deny", "allow"] });
    await t.runner.resolveEngine();
    expect(t.runner.trustRecord?.allow).toBe(false);
    await t.runner.askTrustAgain();
    expect(t.questions).toHaveLength(2);
    expect(t.runner.enginePath).toBe(BUILD);
    expect(t.runner.trustRecord).toEqual({ allow: true, exes: [BUILD] });
  });

  it("프로젝트가 닫혀 있으면 아무것도 하지 않는다", async () => {
    const t = await setup({ files: [BUILD], answers: ["deny"] });
    await t.runner.resolveEngine();
    await t.host.project.close();
    expect(t.runner.trustRecord).toBeNull();
    await t.runner.revokeTrust();
    await t.runner.askTrustAgain();
    expect(t.settings.settings.engineTrust[ROOT]?.allow).toBe(false);
  });
});

describe("앱에 든 엔진", () => {
  it("15초 시간 제한으로 찌르고, 다른 후보는 셸의 기본 시간이다", async () => {
    const t = await setup({ enginePath: SETTINGS, engines: { [BUNDLED]: ["lua", "mruby"] }, bundled: bundledEngine() });
    await t.runner.resolveEngine();
    expect(t.probed).toEqual([
      [SETTINGS, undefined],
      [BUNDLED, BUNDLED_PROBE_TIMEOUT_MS],
    ]);
    expect(BUNDLED_PROBE_TIMEOUT_MS).toBe(15_000);
  });

  it("시간 초과면 한 번 더 찌른다 (첫 실행의 격리 검사)", async () => {
    const t = await setup({ engines: { [BUNDLED]: ["lua", "mruby"] }, bundled: bundledEngine(), slow: { [BUNDLED]: 1 } });
    expect(await t.runner.resolveEngine()).toBe(BUNDLED);
    expect(t.probed).toEqual([
      [BUNDLED, 15_000],
      [BUNDLED, 15_000],
    ]);
  });

  it("두 번 다 실패하면 다음 후보로, 파일이 없으면 다시 찌르지 않는다", async () => {
    const slow = await setup({ engines: { [BUNDLED]: ["lua"] }, bundled: bundledEngine(), slow: { [BUNDLED]: 2 } });
    expect(await slow.runner.resolveEngine()).toBeNull();
    expect(paths(slow.probed)).toEqual([BUNDLED, BUNDLED]);
    const gone = await setup({ bundled: bundledEngine() });
    expect(await gone.runner.resolveEngine()).toBeNull();
    expect(paths(gone.probed)).toEqual([BUNDLED]);
  });

  it("상태 바 툴팁과 콘솔에 판을 보인다 (engine.json 에서)", async () => {
    const t = await setup({ engines: { [BUNDLED]: ["lua", "mruby"] }, bundled: bundledEngine() });
    await t.runner.resolveEngine();
    expect(t.runner.bundled?.meta?.engineCommit).toBe(COMMIT);
    expect(t.runner.statusTitle).toBe("앱에 든 엔진 v2.0.0-alpha.1 (cac4b94, lua mruby)");
    expect(t.runner.engineDescription).toBe("앱에 든 엔진 v2.0.0-alpha.1 (cac4b94, lua mruby)");
    expect(texts(t.log)).toContainEqual(`info/runner: 엔진: ${BUNDLED} (앱에 든 엔진 v2.0.0-alpha.1 (cac4b94), 기능: lua mruby)`);
  });

  it("태그가 없거나 engine.json 이 없어도 이름을 짓는다", () => {
    expect(bundledEngineLabel(bundledEngine(null), null)).toBe("앱에 든 엔진 (cac4b94, lua mruby)");
    expect(bundledEngineLabel({ path: BUNDLED, meta: null, metaError: "없다" }, ["lua"])).toBe("앱에 든 엔진 (lua)");
    expect(bundledEngineLabel({ path: BUNDLED, meta: null }, [])).toBe("앱에 든 엔진");
    expect(bundledEngineLabel(null, null)).toBe("앱에 든 엔진");
  });

  it("앱에 든 엔진을 찾다가 실패해도 탐색은 계속된다", async () => {
    const t = await setup({ files: [], engines: { [SETTINGS]: ["lua"] }, enginePath: SETTINGS });
    const failing = new RunnerStore(t.host, { probe: async () => ["lua"], bundled: async () => Promise.reject(new Error("셸이 없다")) });
    expect(await failing.resolveEngine()).toBe(SETTINGS);
    expect(failing.bundled).toBeNull();
  });

  it(".initial-editor/engine 이 앱에 든 엔진을 가리키면 앱에 든 엔진이다: 묻지 않고, 15초와 재시도, 판", async () => {
    const t = await setup({ projectFile: BUNDLED, engines: { [BUNDLED]: ["lua", "mruby"] }, bundled: bundledEngine(null), slow: { [BUNDLED]: 1 } });
    expect(await t.runner.resolveEngine()).toBe(BUNDLED);
    expect(t.questions).toEqual([]);
    expect(t.runner.engineSource).toBe("bundled");
    expect(t.probed).toEqual([
      [BUNDLED, 15_000],
      [BUNDLED, 15_000],
    ]);
    expect(t.runner.engineDescription).toBe("앱에 든 엔진 (cac4b94, lua mruby)");
  });

  it("실행 직전의 다시 묻기도 15초다", async () => {
    const t = await setup({ engines: { [BUNDLED]: ["lua"] }, bundled: bundledEngine() });
    await t.runner.start();
    expect(t.probed).toEqual([
      [BUNDLED, 15_000],
      [BUNDLED, 15_000],
    ]);
    expect(t.specs[0].exe).toBe(BUNDLED);
  });
});

describe("엔진을 못 찾으면 에디터 안으로", () => {
  it("프로세스 방식이어도 그 실행만 에디터 안으로 넘어가고 한 줄 남긴다. 설정은 그대로다", async () => {
    const t = await setup({ embedded: true, files: [BUILD], answers: ["deny"] });
    expect(t.runner.mode).toBe("process");
    await t.runner.resolveEngine();
    // 실행 버튼은 켜져 있고 툴팁이 넘어감을 알린다
    expect(t.runner.canRun).toBe(true);
    expect(t.runner.modeHint).toBe(FALLBACK_NOTICE);
    expect(t.runner.statusTitle).toContain(FALLBACK_NOTICE);
    expect(t.runner.statusTitle).toContain(`신뢰하지 않아 건너뛴 경로: ${BUILD}`);
    await t.runner.start();
    expect(t.specs).toEqual([]);
    expect(t.embedded!.launches).toEqual([{ INITIAL2D_SCRIPT: "lua" }]);
    expect(t.runner.activeMode).toBe("embedded");
    expect(t.runner.fallback).toBe("embedded");
    expect(t.runner.engineSource).toBe("none");
    expect(t.settings.settings.runMode).toBe("process");
    expect(t.runner.statusText).toBe("엔진 (게임 탭): 실행 중 00:00");
    const line = texts(t.log).find((l) => l.startsWith(`info/runner: ${FALLBACK_NOTICE}`));
    expect(line).toContain(`탐색한 경로: ${SIBLING}`);
    expect(line).toContain("설정의 실행 방식은 변경 안 함");
    await t.runner.stop();
  });

  it("mruby 프로젝트는 지금처럼 이유를 띄우고 멈춘다", async () => {
    const t = await setup({ embedded: true, script: "mruby" });
    await t.runner.start();
    expect(t.embedded!.launches).toEqual([]);
    expect(t.runner.state).toBe("idle");
    expect(t.runner.fallback).toBe("embedded");
    expect(t.toasts).toContainEqual(`error: ${WASM_NO_MRUBY}`);
  });

  it("엔진을 찾으면 넘어가지 않고, 다음 실행에서 넘어감 표시를 지운다", async () => {
    const t = await setup({ embedded: true, engines: { [BUNDLED]: ["lua"] }, bundled: null });
    await t.runner.start();
    expect(t.runner.fallback).toBe("embedded");
    await t.runner.stop();
    const found = await setup({ embedded: true, engines: { [BUNDLED]: ["lua"] }, bundled: bundledEngine() });
    await found.runner.start();
    expect(found.runner.fallback).toBeNull();
    expect(found.runner.activeMode).toBe("process");
    expect(found.specs).toHaveLength(1);
    expect(found.embedded!.launches).toEqual([]);
  });

  it("찾아보기 전에는 넘어간다고 말하지 않는다", async () => {
    const t = await setup({ embedded: true });
    expect(t.runner.modeHint).toBeUndefined();
  });

  it("에디터 안 실행이 없으면 전처럼 실행 버튼이 꺼진다", async () => {
    const t = await setup({});
    await t.runner.resolveEngine();
    expect(t.runner.canRun).toBe(false);
    expect(t.runner.startHint).toContain("엔진 탐색 실패");
  });
});

describe("StartOptions.mode", () => {
  it("한 번의 실행만 방식을 고르고 설정은 바꾸지 않는다", async () => {
    const t = await setup({ embedded: true, engines: { [BUNDLED]: ["lua"] }, bundled: bundledEngine() });
    await t.runner.start({ mode: "embedded" });
    expect(t.runner.activeMode).toBe("embedded");
    expect(t.specs).toEqual([]);
    expect(t.settings.settings.runMode).toBe("process");
    await t.runner.stop();

    t.settings.update({ runMode: "embedded" }, false);
    await t.runner.start({ mode: "process" });
    expect(t.runner.activeMode).toBe("process");
    expect(t.specs).toHaveLength(1);
    expect(t.settings.settings.runMode).toBe("embedded");
    await t.runner.stop();
  });

  it("다시 시작은 같은 방식으로", async () => {
    const t = await setup({ embedded: true, engines: { [BUNDLED]: ["lua"] }, bundled: bundledEngine() });
    await t.runner.start({ mode: "embedded" });
    await t.runner.restart();
    expect(t.embedded!.launches).toHaveLength(2);
    expect(t.specs).toEqual([]);
  });
});
