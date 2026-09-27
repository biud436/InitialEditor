// @vitest-environment jsdom
import { CommandRegistry, LogStore, MemorySettingsStorage, MenuRegistry, SettingsStore, type OutputStream, type RunHandle } from "@initial-editor/core";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Editor } from "../Editor";
import { ModalStore } from "../modals";
import {
  ALLOW_SCRIPT,
  askDirtyBeforeStage,
  askMissingRepo,
  askStageConfirm,
  DEST_NOTE,
  DIRTY_KEEP,
  DIRTY_SAVE,
  MISSING_TITLE,
  OPEN_SETTINGS,
  RTP_CHECK_WARNING,
  RTP_LABEL,
  STAGE_OK,
  STAGE_TITLE,
} from "./AndroidStageDialog";
import { AndroidStageStore, DESKTOP_ONLY, type AndroidHost, type FoundRepo, type StageRequest } from "./AndroidStageStore";
import { ANDROID_STAGE_COMMAND, ANDROID_STAGE_LABEL, installAndroidStage, runAndroidStage } from "./index";

afterEach(cleanup);

class ScriptedHandle implements RunHandle {
  id = 3;
  private outputs = new Set<(line: string, stream: OutputStream) => void>();
  private exits = new Set<(code: number | null) => void>();
  onOutput(cb: (line: string, stream: OutputStream) => void) {
    this.outputs.add(cb);
    return () => void this.outputs.delete(cb);
  }
  onExit(cb: (code: number | null) => void) {
    this.exits.add(cb);
    return () => void this.exits.delete(cb);
  }
  async stop() {}
  play(lines: string[], code: number) {
    for (const line of lines) for (const cb of this.outputs) cb(line, "stdout");
    for (const cb of this.exits) cb(code);
  }
}

const ROOT = "/home/u/games/flappy";
const REPO = "/home/u/games/Initial2D";

/** 셸 흉내: 미리 세기는 RTP 에 따라 다른 수, 스테이징은 STAGED 줄 */
function fakeDeps(opts: { runs: StageRequest[]; exists?: boolean; countFails?: boolean }) {
  return {
    probe: async (paths: string[]) => paths.map((p) => ({ script: opts.exists !== false && p === REPO, sdl: true, gradlew: true })),
    run: async (req: StageRequest) => {
      opts.runs.push(req);
      const handle = new ScriptedHandle();
      setTimeout(() => {
        if (req.dryRun && opts.countFails) handle.play([], 2);
        else if (req.dryRun) handle.play([`DRYRUN files=${req.withRtp ? 20 : 12} bytes=2048 rtp=${req.withRtp ? "yes" : "no"}`], 0);
        else handle.play([`STAGED files=12 bytes=2048 stamp=0123456789ab rtp=${req.withRtp ? "yes" : "no"} dest=${REPO}/android/app/src/main/assets`], 0);
      }, 0);
      return handle;
    },
  };
}

function makeHost(settings = new SettingsStore(new MemorySettingsStorage())): AndroidHost {
  return {
    project: { isOpen: true, root: ROOT },
    settings,
    log: new LogStore(),
    toasts: { success: () => {}, warn: () => {}, error: () => {} },
    platform: "mac",
    engine: () => ({ path: null, source: "none" }),
  };
}

function renderTop(modals: ModalStore) {
  const spec = modals.top;
  if (!spec || spec.kind !== "custom") throw new Error("사용자 정의 모달이 없다");
  render(<>{spec.render(() => spec.resolve())}</>);
  return spec;
}

async function found(store: AndroidStageStore): Promise<FoundRepo> {
  const { found: repo } = await store.discover();
  if (!repo) throw new Error("저장소를 못 찾았다");
  return repo;
}

describe("확인 대화상자", () => {
  it("원본, 대상, 스크립트를 보이고 미리 센 뒤에야 스테이징이 켜진다. RTP 체크는 기본 꺼짐", async () => {
    const runs: StageRequest[] = [];
    const settings = new SettingsStore(new MemorySettingsStorage());
    settings.update({ engineRepoPath: REPO });
    const store = new AndroidStageStore(makeHost(settings), fakeDeps({ runs }));
    const repo = await found(store);
    const modals = new ModalStore();
    const answer = askStageConfirm(modals, store, repo, ROOT);
    const spec = renderTop(modals);
    expect(spec.title).toBe(STAGE_TITLE);
    expect(screen.getByTestId("android-stage-project").textContent).toBe(ROOT);
    expect(screen.getByTestId("android-stage-dest").textContent).toBe(`${REPO}/android/app/src/main/assets/`);
    expect(screen.getByText(DEST_NOTE)).toBeTruthy();
    expect(screen.getByTestId("android-stage-script").textContent).toBe(`${REPO}/android/prepare_assets.sh`);
    expect(screen.queryByTestId("android-stage-untrusted")).toBeNull();
    const rtp = screen.getByTestId("android-stage-rtp") as HTMLInputElement;
    expect(rtp.checked).toBe(false);
    expect(screen.getByText(RTP_LABEL, { exact: false })).toBeTruthy();
    expect(screen.queryByTestId("android-stage-rtp-warning")).toBeNull();
    const ok = screen.getByTestId("android-stage-ok") as HTMLButtonElement;
    await waitFor(() => expect(screen.getByTestId("android-stage-count").textContent).toBe("파일 12개, 2.0 KB"));
    expect(ok.disabled).toBe(false);
    expect(runs).toEqual([{ repo: REPO, project: ROOT, withRtp: false, dryRun: true }]);

    // RTP 를 켜면 경고 줄이 뜨고 다시 센다
    fireEvent.click(rtp);
    expect(screen.getByTestId("android-stage-rtp-warning").textContent).toBe(RTP_CHECK_WARNING);
    await waitFor(() => expect(screen.getByTestId("android-stage-count").textContent).toBe("파일 20개, 2.0 KB"));
    expect(runs[1]).toEqual({ repo: REPO, project: ROOT, withRtp: true, dryRun: true });
    fireEvent.click(screen.getByRole("button", { name: STAGE_OK }));
    expect(await answer).toEqual({ withRtp: true });
    expect(modals.stack).toHaveLength(0);
  });

  it("프로젝트에서 찾은 저장소는 스크립트 경로와 허용 단추부터. 허용해야 미리 센다", async () => {
    const runs: StageRequest[] = [];
    const host = makeHost();
    const store = new AndroidStageStore(host, fakeDeps({ runs }));
    const repo = await found(store);
    expect(repo.source).toBe("sibling");
    const modals = new ModalStore();
    const answer = askStageConfirm(modals, store, repo, ROOT);
    renderTop(modals);
    expect(screen.getByTestId("android-stage-untrusted").textContent).toContain("형제 폴더 ../Initial2D");
    expect(screen.getByTestId("android-stage-script").textContent).toBe(`${REPO}/android/prepare_assets.sh`);
    expect((screen.getByTestId("android-stage-ok") as HTMLButtonElement).disabled).toBe(true);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(runs).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: ALLOW_SCRIPT }));
    expect(host.settings.settings.androidTrust[ROOT]).toEqual({ allow: true, exes: [`${REPO}/android/prepare_assets.sh`] });
    await waitFor(() => expect((screen.getByTestId("android-stage-ok") as HTMLButtonElement).disabled).toBe(false));
    expect(runs).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(await answer).toBeNull();
  });

  it("미리 세기가 실패하면 이유를 보이고 스테이징은 꺼진 채다", async () => {
    const settings = new SettingsStore(new MemorySettingsStorage());
    settings.update({ engineRepoPath: REPO });
    const store = new AndroidStageStore(makeHost(settings), fakeDeps({ runs: [], countFails: true }));
    const modals = new ModalStore();
    void askStageConfirm(modals, store, await found(store), ROOT);
    renderTop(modals);
    await waitFor(() => expect(screen.getByTestId("android-stage-count").getAttribute("data-kind")).toBe("error"));
    expect(screen.getByTestId("android-stage-count").textContent).toBe("스크립트가 종료 코드 2 로 끝났다");
    expect((screen.getByTestId("android-stage-ok") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("못 찾음과 저장 안 된 문서", () => {
  it("못 찾으면 찾아본 곳을 보이고 설정 열기를 고를 수 있다", async () => {
    const store = new AndroidStageStore(makeHost(), fakeDeps({ runs: [], exists: false }));
    const { searched } = await store.discover();
    const modals = new ModalStore();
    const answer = askMissingRepo(modals, searched);
    const spec = renderTop(modals);
    expect(spec.title).toBe(MISSING_TITLE);
    const body = screen.getByTestId("android-stage-missing").textContent ?? "";
    expect(body).toContain(`${ROOT}/android/prepare_assets.sh (열린 프로젝트 자신)`);
    expect(body).toContain(`${REPO}/android/prepare_assets.sh (형제 폴더 ../Initial2D)`);
    fireEvent.click(screen.getByRole("button", { name: OPEN_SETTINGS }));
    expect(await answer).toBe(true);
  });

  for (const [label, choice] of [
    [DIRTY_SAVE, "save"],
    [DIRTY_KEEP, "keep"],
    ["취소", "cancel"],
  ] as const) {
    it(`저장 안 된 문서: ${label} 는 ${choice}`, async () => {
      const modals = new ModalStore();
      const answer = askDirtyBeforeStage(modals, 2);
      renderTop(modals);
      expect(screen.getByTestId("android-stage-dirty").textContent).toContain("저장하지 않은 문서가 2개 있다");
      fireEvent.click(screen.getByRole("button", { name: label }));
      expect(await answer).toBe(choice);
    });
  }
});

describe("명령 android.stage", () => {
  interface FakeDoc {
    title: string;
    dirty: boolean;
  }

  function fakeEditor(opts: { mode?: string; dirty?: FakeDoc[]; repoPath?: string } = {}) {
    const settings = new SettingsStore(new MemorySettingsStorage());
    if (opts.repoPath) settings.update({ engineRepoPath: opts.repoPath });
    const hints = new Map<string, () => string | undefined>();
    const toasts: Array<[string, string]> = [];
    const saved: string[] = [];
    let dirty = opts.dirty ?? [];
    const editor = {
      mode: opts.mode ?? "tauri",
      project: { isOpen: true, root: ROOT },
      settings,
      modals: new ModalStore(),
      log: new LogStore(),
      toasts: {
        success: (t: string) => toasts.push(["success", t]),
        info: (t: string) => toasts.push(["info", t]),
        warn: (t: string) => toasts.push(["warn", t]),
        error: (t: string) => toasts.push(["error", t]),
      },
      platform: "mac",
      runner: { enginePath: null, engineSource: "none" },
      documents: {
        active: null,
        get dirtyDocuments() {
          return dirty;
        },
      },
      saveDocument: async (doc: FakeDoc) => {
        saved.push(doc.title);
        dirty = dirty.filter((d) => d !== doc);
        return "saved";
      },
      commands: new CommandRegistry({ platform: "mac" }),
      menus: new MenuRegistry(),
      setHint: (id: string, fn: () => string | undefined) => hints.set(id, fn),
    };
    return { editor: editor as unknown as Editor, hints, toasts, saved };
  }

  it("실행 메뉴의 구분선 아래에 있고, 셸이 없으면 꺼지고 이유가 툴팁에 간다", () => {
    const { editor, hints } = fakeEditor({ mode: "memory" });
    const store = installAndroidStage(editor);
    expect(store.available).toBe(false);
    expect(editor.commands.get(ANDROID_STAGE_COMMAND)?.label).toBe(ANDROID_STAGE_LABEL);
    expect(editor.commands.isEnabled(ANDROID_STAGE_COMMAND)).toBe(false);
    expect(hints.get(ANDROID_STAGE_COMMAND)?.()).toBe(DESKTOP_ONLY);
    expect(editor.menus.items).toContainEqual({ path: "실행/안드로이드로 스테이징", commandId: ANDROID_STAGE_COMMAND, order: 70, separatorBefore: true });
  });

  it("Tauri 면 켜진다", () => {
    const { editor, hints } = fakeEditor();
    const store = installAndroidStage(editor, fakeDeps({ runs: [] }));
    expect(store.available).toBe(true);
    expect(editor.commands.isEnabled(ANDROID_STAGE_COMMAND)).toBe(true);
    expect(hints.get(ANDROID_STAGE_COMMAND)?.()).toBeUndefined();
  });

  it("저장 안 된 문서를 저장하고, 확인 뒤 에디터의 인자로 스테이징한다", async () => {
    const runs: StageRequest[] = [];
    const doc = { title: "main.lua", dirty: true };
    const { editor, saved, toasts } = fakeEditor({ dirty: [doc], repoPath: REPO });
    const store = installAndroidStage(editor, fakeDeps({ runs }));
    const flow = runAndroidStage(editor, store);
    await waitFor(() => expect(editor.modals.top?.title).toBe("저장하지 않은 문서"));
    renderTop(editor.modals);
    fireEvent.click(screen.getByRole("button", { name: DIRTY_SAVE }));
    await waitFor(() => expect(editor.modals.top?.title).toBe(STAGE_TITLE));
    expect(saved).toEqual(["main.lua"]);
    cleanup();
    renderTop(editor.modals);
    await waitFor(() => expect((screen.getByTestId("android-stage-ok") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: STAGE_OK }));
    await flow;
    expect(runs).toEqual([
      { repo: REPO, project: ROOT, withRtp: false, dryRun: true },
      { repo: REPO, project: ROOT, withRtp: false, dryRun: false },
    ]);
    expect(toasts).toContainEqual(["success", "안드로이드 에셋 12개, 2.0 KB"]);
    expect(store.last?.stamp).toBe("0123456789ab");
  });

  it("저장 안 된 문서에서 취소하면 저장소도 찾지 않는다", async () => {
    let probed = 0;
    const { editor } = fakeEditor({ dirty: [{ title: "a.lua", dirty: true }] });
    const deps = fakeDeps({ runs: [] });
    const store = installAndroidStage(editor, { ...deps, probe: async (p) => (probed++, deps.probe(p)) });
    const flow = runAndroidStage(editor, store);
    await waitFor(() => expect(editor.modals.top).not.toBeNull());
    renderTop(editor.modals);
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    await flow;
    expect(probed).toBe(0);
  });

  it("못 찾고 설정 열기를 고르면 설정 대화상자가 뜬다", async () => {
    const { editor } = fakeEditor();
    const store = installAndroidStage(editor, fakeDeps({ runs: [], exists: false }));
    const flow = runAndroidStage(editor, store);
    await waitFor(() => expect(editor.modals.top?.title).toBe(MISSING_TITLE));
    renderTop(editor.modals);
    fireEvent.click(screen.getByRole("button", { name: OPEN_SETTINGS }));
    await waitFor(() => expect(editor.modals.top?.title).toBe("설정"));
    editor.modals.close(editor.modals.top!.id);
    await flow;
  });
});
