// @vitest-environment jsdom
import { ExtensionRegistries } from "@initial-editor/core";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { observable, runInAction } from "mobx";
import { afterEach, describe, expect, it } from "vitest";
import type { Editor } from "../../editor/Editor";
import { EditorProvider } from "../../editor/EditorContext";
import { ExtensionsPanel } from "./ExtensionsPanel";

afterEach(cleanup);

function setup() {
  const registries = new ExtensionRegistries();
  const shown: string[] = [];
  const open = new Set<string>(["ext:open"]);
  const layout = { isPanelOpen: (id: string) => open.has(id), showPanel: (id: string) => void shown.push(id) };
  render(
    <EditorProvider value={{ registries, layout } as unknown as Editor}>
      <ExtensionsPanel />
    </EditorProvider>,
  );
  return { registries, shown };
}

describe("확장 패널", () => {
  it("등록된 패널이 없으면 무엇이 오는 자리인지와 맵 패널이 어디 있는지 알린다", () => {
    setup();
    const hint = screen.getByTestId("extensions-empty").textContent ?? "";
    expect(hint).toContain("registerPanel");
    expect(hint).toContain("맵 탭을 열면");
    expect(hint).not.toContain("E3");
  });

  it("확장이 등록한 패널은 제 탭이라 여기는 제목과 열림 상태의 목록이고, 누르면 그 탭을 연다", () => {
    const { registries, shown } = setup();
    act(() =>
      runInAction(() => {
        registries.panels.set("demo", { id: "demo", title: "데모", Component: () => <p>데모 본문</p> });
        registries.panels.set("open", { id: "open", title: "열린 것", Component: () => <p>열린 본문</p> });
      }),
    );
    expect(screen.queryByTestId("extensions-empty")).toBeNull();
    const entries = screen.getAllByTestId("extension-panel-entry");
    expect(entries.map((e) => [e.getAttribute("data-panel"), e.textContent])).toEqual([
      ["demo", "데모닫힘"],
      ["open", "열린 것열림"],
    ]);
    // 본문은 제 탭(ExtensionPanelHost)이 그린다
    expect(screen.queryByText("데모 본문")).toBeNull();
    fireEvent.click(screen.getByText("데모"));
    expect(shown).toEqual(["ext:demo"]);
  });

  it("visible이 거짓인 패널(이 프로젝트에 해당하지 않는다)은 목록에 없고, 참이 되면 나타난다", () => {
    const { registries } = setup();
    const visible = observable.box(false);
    act(() =>
      runInAction(() => {
        registries.panels.set("events", { id: "events", title: "이벤트", Component: () => null, visible: () => visible.get() });
      }),
    );
    expect(screen.queryByTestId("extension-panel-entry")).toBeNull();
    expect(screen.getByTestId("extensions-empty")).toBeTruthy();
    act(() => runInAction(() => visible.set(true)));
    expect(screen.getAllByTestId("extension-panel-entry").map((e) => e.getAttribute("data-panel"))).toEqual(["events"]);
  });
});
