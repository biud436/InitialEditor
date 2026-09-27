// @vitest-environment jsdom
// 설정 대화상자의 "엔진 저장소" 줄과 허용한 스테이징 스크립트의 신뢰 취소 (docs/plans/e6-packaging.md 6.3)
import { MemorySettingsStorage, SettingsStore } from "@initial-editor/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Editor } from "../editor/Editor";
import { EditorProvider } from "../editor/EditorContext";
import { EngineRepoRow } from "./SettingsDialog";

afterEach(cleanup);

const SCRIPT = "/home/u/Initial2D/android/prepare_assets.sh";

function setup(open: boolean) {
  const settings = new SettingsStore(new MemorySettingsStorage());
  settings.update({ androidTrust: { "/home/u/game": { allow: true, exes: [SCRIPT] }, "/home/u/other": { allow: true, exes: ["/x.sh"] } } });
  const editor = { settings, project: { isOpen: open, root: "/home/u/game" } } as unknown as Editor;
  render(
    <EditorProvider value={editor}>
      <EngineRepoRow />
    </EditorProvider>,
  );
  return settings;
}

describe("설정의 엔진 저장소 줄", () => {
  it("경로를 적으면 설정에 남는다", () => {
    const settings = setup(false);
    const input = screen.getByTestId("settings-engine-repo") as HTMLInputElement;
    expect(input.value).toBe("");
    fireEvent.change(input, { target: { value: "/home/u/Initial2D" } });
    expect(settings.settings.engineRepoPath).toBe("/home/u/Initial2D");
    // 프로젝트가 없으면 신뢰 줄도 없다
    expect(screen.queryByTestId("settings-android-trust")).toBeNull();
  });

  it("열린 프로젝트에서 허용한 스크립트를 보이고 신뢰 취소는 그 프로젝트의 답만 지운다", () => {
    const settings = setup(true);
    expect(screen.getByTestId("settings-android-trust").textContent).toContain(SCRIPT);
    fireEvent.click(screen.getByTestId("settings-android-trust-reset"));
    expect(settings.settings.androidTrust).toEqual({ "/home/u/other": { allow: true, exes: ["/x.sh"] } });
    expect(screen.queryByTestId("settings-android-trust")).toBeNull();
  });
});
