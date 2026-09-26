// @vitest-environment jsdom
import { ExtensionRegistries } from "@initial-editor/core";
import { act, cleanup, render, screen } from "@testing-library/react";
import { runInAction } from "mobx";
import { afterEach, describe, expect, it } from "vitest";
import type { Editor } from "../../editor/Editor";
import { EditorProvider } from "../../editor/EditorContext";
import { ExtensionsPanel } from "./ExtensionsPanel";

afterEach(cleanup);

function setup() {
  const registries = new ExtensionRegistries();
  render(
    <EditorProvider value={{ registries } as unknown as Editor}>
      <ExtensionsPanel />
    </EditorProvider>,
  );
  return registries;
}

describe("확장 패널", () => {
  it("등록된 패널이 없으면 무엇이 오는 자리인지와 맵 패널이 어디 있는지 알린다", () => {
    setup();
    const hint = screen.getByTestId("extensions-empty").textContent ?? "";
    expect(hint).toContain("registerPanel");
    expect(hint).toContain("맵 탭을 열면");
    expect(hint).not.toContain("E3");
  });

  it("확장이 등록한 패널을 제목과 함께 그린다", () => {
    const registries = setup();
    act(() => runInAction(() => registries.panels.set("demo", { id: "demo", title: "데모", Component: () => <p>데모 본문</p> })));
    expect(screen.queryByTestId("extensions-empty")).toBeNull();
    expect(screen.getByText("데모")).toBeTruthy();
    expect(screen.getByText("데모 본문")).toBeTruthy();
  });
});
