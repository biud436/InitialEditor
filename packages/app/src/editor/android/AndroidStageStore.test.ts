import { LogStore, MemorySettingsStorage, SettingsStore, type OutputStream, type RunHandle } from "@initial-editor/core";
import { describe, expect, it } from "vitest";
import { ANDROID_LOG_SOURCE, AndroidStageStore, DESKTOP_ONLY, NEED_PROJECT, STAGING_BUSY, type AndroidHost, type FoundRepo, type RepoProbeResult, type StageRequest } from "./AndroidStageStore";
import { RTP_WARNING } from "./stageOutput";

/** 가짜 스크립트 실행: 정한 줄을 찍고 정한 코드로 끝난다 */
class ScriptedHandle implements RunHandle {
  id = 7;
  private outputs = new Set<(line: string, stream: OutputStream) => void>();
  private exits = new Set<(code: number | null) => void>();
  constructor(
    private readonly lines: Array<[string, OutputStream]>,
    private readonly code: number | null,
  ) {}
  onOutput(cb: (line: string, stream: OutputStream) => void) {
    this.outputs.add(cb);
    return () => void this.outputs.delete(cb);
  }
  onExit(cb: (code: number | null) => void) {
    this.exits.add(cb);
    return () => void this.exits.delete(cb);
  }
  async stop() {}
  play() {
    for (const [line, stream] of this.lines) for (const cb of this.outputs) cb(line, stream);
    for (const cb of this.exits) cb(this.code);
  }
}

interface Setup {
  store: AndroidStageStore;
  host: AndroidHost & { toastLog: Array<[string, string]>; project: { isOpen: boolean; root: string } };
  runs: StageRequest[];
  probes: string[][];
}

function setup(opts: {
  exists?: (path: string) => Partial<RepoProbeResult> | null;
  script?: (req: StageRequest) => { lines: Array<[string, OutputStream]>; code: number | null };
  deps?: false;
  engine?: { path: string | null; source: string };
  repoPath?: string;
}): Setup {
  const settings = new SettingsStore(new MemorySettingsStorage());
  if (opts.repoPath) settings.update({ engineRepoPath: opts.repoPath });
  const toastLog: Array<[string, string]> = [];
  const host = {
    project: { isOpen: true, root: "/home/u/games/flappy" },
    settings,
    log: new LogStore(),
    toasts: {
      success: (t: string) => toastLog.push(["success", t]),
      warn: (t: string) => toastLog.push(["warn", t]),
      error: (t: string) => toastLog.push(["error", t]),
    },
    platform: "mac" as const,
    engine: () => opts.engine ?? { path: null, source: "none" },
    toastLog,
  };
  const runs: StageRequest[] = [];
  const probes: string[][] = [];
  const deps =
    opts.deps === false
      ? null
      : {
          probe: async (paths: string[]) => {
            probes.push(paths);
            return paths.map((p) => {
              const hit = opts.exists?.(p);
              return { script: !!hit, sdl: hit?.sdl ?? false, gradlew: hit?.gradlew ?? false };
            });
          },
          run: async (req: StageRequest) => {
            runs.push(req);
            const { lines, code } = opts.script?.(req) ?? { lines: [], code: 0 };
            const handle = new ScriptedHandle(lines, code);
            setTimeout(() => handle.play(), 0); // 셸처럼 줄은 구독 뒤에 온다
            return handle;
          },
        };
  return { store: new AndroidStageStore(host, deps), host, runs, probes };
}

const STAGED = "STAGED files=12 bytes=3145728 stamp=0123456789ab rtp=no dest=/home/u/games/Initial2D/android/app/src/main/assets";

function androidLog(host: AndroidHost) {
  return host.log.entries.filter((e) => e.source === ANDROID_LOG_SOURCE).map((e) => [e.level, e.text]);
}

describe("AndroidStageStore 켜짐", () => {
  it("셸이 없으면(브라우저, 메모리, 브리지) 데스크톱 앱에서만 된다", () => {
    const { store } = setup({ deps: false });
    expect(store.available).toBe(false);
    expect(store.enabled).toBe(false);
    expect(store.disabledReason).toBe(DESKTOP_ONLY);
  });

  it("프로젝트가 없으면 꺼지고, 열려 있으면 켜진다", () => {
    const { store, host } = setup({});
    expect(store.enabled).toBe(true);
    host.project.isOpen = false;
    expect(store.disabledReason).toBe(NEED_PROJECT);
  });
});

describe("AndroidStageStore 저장소 찾기", () => {
  it("스크립트가 있는 첫 후보를 고르고 SDL 과 Gradle 래퍼 상태를 붙인다 (실행하지 않고 본다)", async () => {
    const { store, probes, runs } = setup({
      exists: (p) => (p === "/home/u/games/Initial2D" ? { sdl: true } : null),
      engine: { path: "/home/u/src/Initial2D/build/Initial2D", source: "project-file" },
    });
    const { found, searched } = await store.discover();
    expect(probes).toEqual([["/home/u/games/flappy", "/home/u/src/Initial2D", "/home/u/games/Initial2D"]]);
    expect(searched.map((c) => c.source)).toEqual(["project", "engine", "sibling"]);
    expect(found).toMatchObject({ source: "sibling", repo: "/home/u/games/Initial2D", needsTrust: true, state: { sdl: true, gradlew: false } });
    expect(runs).toEqual([]);
  });

  it("설정의 저장소가 먼저이고 신뢰가 필요 없다", async () => {
    const { store } = setup({ repoPath: "/opt/Initial2D", exists: () => ({}) });
    const { found } = await store.discover();
    expect(found).toMatchObject({ source: "settings", repo: "/opt/Initial2D", needsTrust: false });
    expect(store.isTrusted(found!)).toBe(true);
  });

  it("못 찾으면 찾아본 곳을 준다", async () => {
    const { store } = setup({ exists: () => null });
    const { found, searched } = await store.discover();
    expect(found).toBeNull();
    expect(searched.map((c) => c.script)).toEqual(["/home/u/games/flappy/android/prepare_assets.sh", "/home/u/games/Initial2D/android/prepare_assets.sh"]);
  });
});

describe("AndroidStageStore 신뢰", () => {
  it("프로젝트에서 나온 저장소는 허용 전에 스크립트를 돌리지 않는다. 허용은 프로젝트별로 앱 설정에 남는다", async () => {
    const { store, host, runs } = setup({ exists: (p) => (p === "/home/u/games/Initial2D" ? {} : null) });
    const { found } = await store.discover();
    expect(store.isTrusted(found!)).toBe(false);
    await expect(store.count(found!, false)).rejects.toThrow(/스크립트 실행 허용 안 함/);
    expect(await store.stage(found!, false).catch((e: Error) => e.message)).toMatch(/허용 안 함/);
    expect(runs).toEqual([]);
    store.trust(found!);
    expect(host.settings.settings.androidTrust).toEqual({
      "/home/u/games/flappy": { allow: true, exes: ["/home/u/games/Initial2D/android/prepare_assets.sh"] },
    });
    expect(store.isTrusted(found!)).toBe(true);
    // 다른 프로젝트에서는 다시 묻는다
    host.project.root = "/home/u/games/other";
    expect(store.isTrusted(found!)).toBe(false);
  });

  it("같은 프로젝트가 다른 스크립트를 가리키면 다시 묻는다", async () => {
    const { store, host } = setup({ exists: () => ({}) });
    host.settings.update({ androidTrust: { "/home/u/games/flappy": { allow: true, exes: ["/elsewhere/android/prepare_assets.sh"] } } });
    const { found } = await store.discover();
    expect(found!.source).toBe("project");
    expect(store.isTrusted(found!)).toBe(false);
    store.trust(found!);
    expect(host.settings.settings.androidTrust["/home/u/games/flappy"].exes).toEqual(["/elsewhere/android/prepare_assets.sh", "/home/u/games/flappy/android/prepare_assets.sh"]);
  });
});

describe("AndroidStageStore 미리 세기와 스테이징", () => {
  const trusted = (state = { sdl: false, gradlew: false }): FoundRepo => ({
    source: "settings",
    repo: "/home/u/games/Initial2D",
    script: "/home/u/games/Initial2D/android/prepare_assets.sh",
    needsTrust: false,
    state,
  });

  it("미리 세기는 --dry-run 이고 DRYRUN 줄을 읽는다. 콘솔에는 남기지 않는다", async () => {
    const { store, runs, host } = setup({ script: () => ({ lines: [["DRYRUN files=12 bytes=2048 rtp=yes", "stdout"]], code: 0 }) });
    expect(await store.count(trusted(), true)).toEqual({ files: 12, bytes: 2048, rtp: true });
    expect(runs).toEqual([{ repo: "/home/u/games/Initial2D", project: "/home/u/games/flappy", withRtp: true, dryRun: true }]);
    expect(androidLog(host)).toEqual([]);
  });

  it("미리 세기가 실패하면 스크립트의 이유를 던진다", async () => {
    const { store } = setup({ script: () => ({ lines: [["prepare_assets: python3 이 필요하다 (찾지 못했다: python3)", "stderr"]], code: 2 }) });
    await expect(store.count(trusted(), false)).rejects.toThrow("python3 이 필요하다 (찾지 못했다: python3)");
  });

  it("스테이징은 에디터 명령의 인자로 돌고, 줄을 콘솔 source android 에 흘리고, 토스트와 다음 명령을 남긴다", async () => {
    const { store, runs, host } = setup({
      script: () => ({
        lines: [
          ["스테이징: /home/u/games/flappy -> /home/u/games/Initial2D/android/app/src/main/assets", "stdout"],
          ["WARN aapt-ignored: resources/_old/a.png 는 APK 에 들어가지 않는 이름이라 뺐다", "stderr"],
          [STAGED, "stdout"],
        ],
        code: 0,
      }),
    });
    const promise = store.stage(trusted(), false);
    expect(store.state).toBe("staging");
    expect(store.disabledReason).toBe(STAGING_BUSY);
    const summary = await promise;
    expect(summary).toMatchObject({ files: 12, bytes: 3145728, stamp: "0123456789ab", rtp: false });
    expect(store.state).toBe("idle");
    expect(store.last).toEqual(summary);
    expect(runs).toEqual([{ repo: "/home/u/games/Initial2D", project: "/home/u/games/flappy", withRtp: false, dryRun: false }]);
    const log = androidLog(host);
    expect(log[0]).toEqual(["info", "안드로이드 스테이징: /home/u/games/flappy 를 /home/u/games/Initial2D/android/app/src/main/assets/ 로 (RTP 변환물 제외)"]);
    expect(log).toContainEqual(["warn", "WARN aapt-ignored: resources/_old/a.png 는 APK 에 들어가지 않는 이름이라 뺐다"]);
    expect(log).toContainEqual(["info", STAGED]);
    const tail = log.slice(-6).map(([, t]) => t);
    expect(tail).toEqual([
      "다음 셸 명령 (/home/u/games/Initial2D 에서):",
      "  ./android/download_sdl.sh",
      "  cd android",
      "  gradle wrapper --gradle-version 8.6",
      "  ./gradlew :app:assembleDebug",
      "  adb install -r app/build/outputs/apk/debug/app-debug.apk",
    ]);
    expect(host.toastLog).toEqual([["success", "안드로이드 에셋 12개, 3.0 MB"]]);
  });

  it("RTP 변환물이 들어가면 경고 토스트를 더한다", async () => {
    const { store, host } = setup({
      script: () => ({ lines: [["WARN rtp: RTP 변환물이 들어간다. 이 APK 는 배포하지 않는다", "stdout"], [STAGED.replace("rtp=no", "rtp=yes"), "stdout"]], code: 0 }),
    });
    await store.stage(trusted({ sdl: true, gradlew: true }), true);
    expect(host.toastLog).toEqual([
      ["success", "안드로이드 에셋 12개, 3.0 MB"],
      ["warn", RTP_WARNING],
    ]);
    expect(androidLog(host)).toContainEqual(["warn", "WARN rtp: RTP 변환물이 들어간다. 이 APK 는 배포하지 않는다"]);
    // SDL 과 래퍼가 있으면 빌드부터
    expect(androidLog(host).slice(-4).map(([, t]) => t)).toEqual([
      "다음 셸 명령 (/home/u/games/Initial2D 에서):",
      "  cd android",
      "  ./gradlew :app:assembleDebug",
      "  adb install -r app/build/outputs/apk/debug/app-debug.apk",
    ]);
  });

  it("실패하면 오류 줄과 오류 토스트이고 마지막 결과는 그대로다", async () => {
    const { store, host } = setup({ script: () => ({ lines: [["prepare_assets: game.json 이 없다: /home/u/games/flappy", "stderr"]], code: 2 }) });
    expect(await store.stage(trusted(), false)).toBeNull();
    expect(store.last).toBeNull();
    expect(store.state).toBe("idle");
    expect(androidLog(host)).toContainEqual(["error", "prepare_assets: game.json 이 없다: /home/u/games/flappy"]);
    expect(androidLog(host)).toContainEqual(["error", "스테이징 실패: game.json 이 없다: /home/u/games/flappy"]);
    expect(host.toastLog).toEqual([["error", "안드로이드 스테이징 실패: game.json 이 없다: /home/u/games/flappy"]]);
  });

  it("종료 코드가 0 이어도 STAGED 줄이 없으면 실패다", async () => {
    const { store, host } = setup({ script: () => ({ lines: [["완료: /x (3개 파일)", "stdout"]], code: 0 }) });
    expect(await store.stage(trusted(), false)).toBeNull();
    expect(host.toastLog[0][0]).toBe("error");
  });

  it("셸이 띄우지 못하면(bash 나 python3 이 없다) 이유를 알린다", async () => {
    const { store, host } = setup({});
    const failing = new AndroidStageStore(host, {
      probe: async () => [],
      run: async () => {
        throw new Error("Git for Windows 의 bash 가 필요하다");
      },
    });
    expect(await failing.stage(trusted(), false)).toBeNull();
    expect(failing.state).toBe("idle");
    expect(host.toastLog).toEqual([["error", "안드로이드 스테이징 시작 실패: Git for Windows 의 bash 가 필요하다"]]);
    expect(store.state).toBe("idle");
  });

  it("스테이징 중에는 두 번째 스테이징을 띄우지 않는다", async () => {
    const { store, runs } = setup({ script: () => ({ lines: [[STAGED, "stdout"]], code: 0 }) });
    const first = store.stage(trusted(), false);
    expect(await store.stage(trusted(), false)).toBeNull();
    await first;
    expect(runs).toHaveLength(1);
  });
});
