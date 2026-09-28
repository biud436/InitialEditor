// @vitest-environment jsdom
// 설정 대화상자의 "찾은 엔진" 줄과 신뢰 취소 (docs/plans/e6-packaging.md 2.3 절)
import { BackendError, LogStore, MemorySettingsStorage, Project, SettingsStore, type ProjectBackend } from "@initial-editor/core";
import { MemoryBackend } from "@initial-editor/core/testing";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Editor } from "../editor/Editor";
import { EditorProvider } from "../editor/EditorContext";
import type { TrustAnswer } from "../editor/runner/engineTrust";
import { RunnerStore } from "../editor/runner/RunnerStore";
import { FoundEngineRow } from "./SettingsDialog";

afterEach(cleanup);

const BUILD = "/home/u/game/build/Initial2D";
const BUNDLED = "/Applications/InitialEditor.app/Contents/MacOS/Initial2D";

async function setup(answers: TrustAnswer[], open = true) {
  const mem = new MemoryBackend({ "game.json": "{}" });
  const backend: ProjectBackend = Object.assign(Object.create(mem) as MemoryBackend, { kind: "tauri", capabilities: { run: true, pickFolder: true, watch: true, hmr: true } });
  const project = new Project(backend);
  const settings = new SettingsStore(new MemorySettingsStorage());
  const toasts = { info() {}, success() {}, warn() {}, error() {} };
  const queue = [...answers];
  const runner = new RunnerStore(
    { backend, project, settings, log: new LogStore(), platform: "mac", toasts },
    {
      probe: async (exe) => {
        if (exe === BUILD || exe === BUNDLED) return ["lua", "mruby"];
        throw new BackendError("없다", "engine_not_found", exe);
      },
      exists: async (paths) => paths.map((p) => p === BUILD),
      bundled: async () => ({ path: BUNDLED, meta: { engineTag: null, engineCommit: "cac4b94e2dab79e13e5fd2ebdb6686fd23cfd33f", describe: "cac4b94", target: "aarch64-apple-darwin", sha256: "0", features: ["lua", "mruby"] } }),
      askTrust: async () => queue.shift() ?? null,
    },
  );
  if (open) await project.open("/home/u/game");
  const editor = { runner, project, settings } as unknown as Editor;
  render(
    <EditorProvider value={editor}>
      <FoundEngineRow />
    </EditorProvider>,
  );
  return { runner, settings };
}

const found = () => screen.getByTestId("settings-found-engine").textContent;

describe("설정의 찾은 엔진 줄", () => {
  it("프로젝트를 열기 전에는 찾지 않았다고 한다", async () => {
    await setup([], false);
    expect(found()).toBe("열린 프로젝트 없음 (프로젝트를 열면 탐색)");
    expect(screen.queryByTestId("settings-engine-trust")).toBeNull();
  });

  it("허용한 프로젝트는 찾은 엔진과 답을 보이고, 신뢰 취소가 답을 지우고 앱에 든 엔진으로 바꾼다", async () => {
    const { runner, settings } = await setup(["allow"]);
    await act(() => runner.resolveEngine());
    expect(found()).toBe(`${BUILD} (lua mruby), 프로젝트의 build/`);
    expect(screen.getByTestId("settings-engine-trust").textContent).toContain(`실행 허용 (${BUILD})`);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "신뢰 취소" }));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(settings.settings.engineTrust).toEqual({});
    expect(found()).toBe("앱에 든 엔진 (cac4b94, lua mruby)");
    expect(screen.queryByTestId("settings-engine-trust")).toBeNull();
  });

  it("거절한 프로젝트는 다시 묻기로 곧바로 다시 묻는다", async () => {
    const { runner } = await setup(["deny", "allow"]);
    await act(() => runner.resolveEngine());
    expect(found()).toBe("앱에 든 엔진 (cac4b94, lua mruby)");
    expect(screen.getByTestId("settings-engine-trust").textContent).toContain("실행하지 않음");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "다시 묻기" }));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(found()).toBe(`${BUILD} (lua mruby), 프로젝트의 build/`);
    expect(screen.getByRole("button", { name: "신뢰 취소" })).toBeTruthy();
  });
});
