// @vitest-environment jsdom
// 문서 탭의 자리 규칙: 보통 문서는 문서 그룹에, 게임 탭(옆 문서)은 처음에 문서 그룹 오른쪽의 새 그룹에, 옮긴 뒤로는 그 자리에.
// 순수 규칙(documentPlacement)과 진짜 dockview(jsdom, 크기 없음)에 붙인 DocumentDock 둘 다 본다.

import { Document, DocumentRegistry } from "@initial-editor/core";
import { createDockview, type DockviewApi } from "dockview";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentDock, documentPlacement, relativeDirection, type DockPanelInfo } from "./documentDock";
import { WelcomeDocument } from "./documents/WelcomeDocument";
import { GAME_KIND, GameDocument } from "./gameView/GameDocument";

class PathDocument extends Document {
  constructor(path: string, kind = "script") {
    super(kind, path, path.split("/").at(-1) ?? path);
  }
  async save(): Promise<void> {}
  async reload(): Promise<void> {}
}

const tool = (id: string): DockPanelInfo => ({ id, kind: null });
const doc = (id: string, kind = "script"): DockPanelInfo => ({ id: `doc:${id}`, kind });
const game: DockPanelInfo = { id: "doc:game", kind: GAME_KIND };

describe("documentPlacement", () => {
  it("보통 문서: 활성 보통 문서 옆, 게임 탭이 활성이면 다른 보통 문서 옆", () => {
    const panels = [tool("console"), doc("welcome", "welcome"), doc("scripts/main.lua"), game];
    expect(documentPlacement({ panels, activeId: "doc:scripts/main.lua" }, "script")).toEqual({ referencePanel: "doc:scripts/main.lua", direction: "within" });
    expect(documentPlacement({ panels, activeId: "doc:game" }, "script")).toEqual({ referencePanel: "doc:welcome", direction: "within" });
    expect(documentPlacement({ panels, activeId: "console" }, "scene")).toEqual({ referencePanel: "doc:welcome", direction: "within" });
  });

  it("보통 문서: 게임 탭만 남았으면 그 왼쪽, 문서가 없으면 콘솔 위", () => {
    expect(documentPlacement({ panels: [tool("console"), game], activeId: "doc:game" }, "script")).toEqual({ referencePanel: "doc:game", direction: "left" });
    expect(documentPlacement({ panels: [tool("hierarchy"), tool("console")], activeId: null }, "script")).toEqual({ referencePanel: "console", direction: "above" });
    expect(documentPlacement({ panels: [tool("hierarchy")], activeId: null }, "script")).toEqual({ referencePanel: "hierarchy", direction: "right" });
    expect(documentPlacement({ panels: [], activeId: null }, "script")).toEqual({ direction: "right" });
  });

  it("게임 탭: 처음은 활성 보통 문서 그룹의 오른쪽", () => {
    const panels = [tool("console"), doc("welcome", "welcome"), doc("scripts/main.lua")];
    expect(documentPlacement({ panels, activeId: "doc:scripts/main.lua" }, GAME_KIND)).toEqual({ referencePanel: "doc:scripts/main.lua", direction: "right" });
    expect(documentPlacement({ panels, activeId: "console" }, GAME_KIND)).toEqual({ referencePanel: "doc:welcome", direction: "right" });
    expect(documentPlacement({ panels: [tool("console")], activeId: null }, GAME_KIND)).toEqual({ referencePanel: "console", direction: "above" });
  });

  it("게임 탭: 기억한 자리 (같은 그룹에 있던 탭, 없어졌으면 기억한 방향이나 오른쪽)", () => {
    const panels = [tool("console"), doc("welcome", "welcome"), doc("scripts/main.lua")];
    expect(documentPlacement({ panels, activeId: "doc:scripts/main.lua", sideSpot: { referencePanel: "console" } }, GAME_KIND)).toEqual({
      referencePanel: "console",
      direction: "within",
    });
    expect(documentPlacement({ panels, activeId: "doc:scripts/main.lua", sideSpot: { referencePanel: "doc:gone.lua" } }, GAME_KIND)).toEqual({
      referencePanel: "doc:scripts/main.lua",
      direction: "right",
    });
    expect(documentPlacement({ panels, activeId: "doc:scripts/main.lua", sideSpot: { direction: "below" } }, GAME_KIND)).toEqual({
      referencePanel: "doc:scripts/main.lua",
      direction: "below",
    });
  });
});

describe("relativeDirection", () => {
  const box = (left: number, top: number, width = 100, height = 100) => ({ left, top, width, height });
  it("가운데를 이어 더 많이 떨어진 축의 방향", () => {
    expect(relativeDirection(box(0, 0), box(150, 10))).toBe("right");
    expect(relativeDirection(box(200, 0), box(0, 30))).toBe("left");
    expect(relativeDirection(box(0, 0), box(20, 150))).toBe("below");
    expect(relativeDirection(box(0, 300), box(0, 0))).toBe("above");
  });
  it("크기가 없으면(배치 전) null", () => {
    expect(relativeDirection(box(0, 0, 0, 0), box(10, 0))).toBeNull();
    expect(relativeDirection(box(0, 0), box(0, 0))).toBeNull();
  });
});

describe("DocumentDock (dockview)", () => {
  let api: DockviewApi;
  let documents: DocumentRegistry;
  let dock: DocumentDock;

  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const el = document.createElement("div");
    document.body.appendChild(el);
    api = createDockview(el, {
      createComponent: () => ({ element: document.createElement("div"), init: () => {} }),
      createTabComponent: () => ({ element: document.createElement("div"), init: () => {} }),
    });
    api.layout(1200, 800);
    api.addPanel({ id: "console", component: "console", title: "콘솔" });
    documents = new DocumentRegistry();
    dock = new DocumentDock({ documents, openPath: async () => {}, openWelcome: () => {}, canOpenPaths: () => true });
    dock.attach(api, { applying: false });
  });

  afterEach(() => {
    dock.detach();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  const groupOf = (id: string) => api.getPanel(id)?.group;
  const settle = () => new Promise<void>((r) => setTimeout(r, 0));

  it("게임 탭은 스크립트 그룹 옆의 새 그룹에 열리고, 그 뒤 여는 스크립트는 게임 그룹에 끼지 않는다", async () => {
    documents.open(new WelcomeDocument());
    const main = new PathDocument("scripts/lua/main.lua");
    documents.open(main);
    expect(groupOf("doc:scripts/lua/main.lua")).toBe(groupOf("doc:welcome"));

    const gameDoc = new GameDocument();
    documents.open(gameDoc);
    await settle();
    expect(groupOf("doc:game")).toBeDefined();
    expect(groupOf("doc:game")).not.toBe(groupOf("doc:scripts/lua/main.lua"));
    expect(api.activePanel?.id).toBe("doc:game");
    // 두 그룹 모두 앞에 보이는 탭이 있다 (스크립트는 가려지지 않는다)
    expect(groupOf("doc:scripts/lua/main.lua")?.activePanel?.id).toBe("doc:scripts/lua/main.lua");

    // 게임 탭이 활성인 채로 스크립트와 씬을 열어도 문서 그룹으로 간다
    documents.open(new PathDocument("scripts/lua/title.lua"));
    documents.activate(gameDoc);
    documents.open(new PathDocument("resources/scenes/title.json", "scene"));
    expect(groupOf("doc:scripts/lua/title.lua")).toBe(groupOf("doc:welcome"));
    expect(groupOf("doc:resources/scenes/title.json")).toBe(groupOf("doc:welcome"));
    expect(groupOf("doc:game")?.panels.map((p) => p.id)).toEqual(["doc:game"]);

    // 닫고 다시 열면 다시 옆 그룹
    documents.close(gameDoc);
    expect(api.getPanel("doc:game")).toBeUndefined();
    documents.open(new GameDocument());
    await settle();
    expect(groupOf("doc:game")).not.toBe(groupOf("doc:welcome"));
    expect(groupOf("doc:game")?.panels).toHaveLength(1);
  });

  it("사용자가 게임 탭을 옮기면 그 자리를 기억해 닫고 다시 열 때 그 자리에 연다", async () => {
    documents.open(new WelcomeDocument());
    documents.open(new PathDocument("scripts/lua/main.lua"));
    const first = new GameDocument();
    documents.open(first);
    await settle();

    // 콘솔 그룹으로 끌어다 놓는다
    api.getPanel("doc:game")!.api.moveTo({ group: groupOf("console")!, position: "center" });
    await settle();
    expect(groupOf("doc:game")).toBe(groupOf("console"));
    expect(dock.sideSpot(GAME_KIND)).toEqual({ referencePanel: "console" });

    // 탭의 닫기(dockview 가 패널을 지운다)로 닫고 다시 연다
    api.getPanel("doc:game")!.api.close();
    expect(documents.documents.includes(first)).toBe(false);
    documents.open(new GameDocument());
    await settle();
    expect(groupOf("doc:game")).toBe(groupOf("console"));

    // 문서 그룹으로 옮기면 거기
    api.getPanel("doc:game")!.api.moveTo({ group: groupOf("doc:welcome")!, position: "center" });
    await settle();
    documents.close(documents.documents.find((d) => d.kind === GAME_KIND)!);
    documents.open(new GameDocument());
    await settle();
    expect(groupOf("doc:game")).toBe(groupOf("doc:welcome"));
  });

  it("탭을 다른 그룹이나 새 자리로 옮기면 그 문서를 알린다 (그룹 통째로 옮기기도)", async () => {
    documents.open(new WelcomeDocument());
    const main = new PathDocument("scripts/lua/main.lua");
    documents.open(main);
    const gameDoc = new GameDocument();
    documents.open(gameDoc);
    await settle();
    const moved: Document[] = [];
    const off = dock.onDocumentMoved((d) => moved.push(d));

    api.getPanel("doc:game")!.api.moveTo({ group: groupOf("doc:welcome")!, position: "center" });
    expect(moved).toEqual([gameDoc]);
    expect(groupOf("doc:game")).toBe(groupOf("doc:welcome"));

    // 새 그룹(아래)으로
    api.getPanel("doc:game")!.api.moveTo({ group: groupOf("doc:welcome")!, position: "bottom" });
    expect(moved).toEqual([gameDoc, gameDoc]);
    expect(groupOf("doc:game")).not.toBe(groupOf("doc:welcome"));

    // 도구 패널을 옮기는 것은 문서가 아니다
    api.getPanel("console")!.api.moveTo({ group: groupOf("doc:welcome")!, position: "center" });
    expect(moved).toHaveLength(2);

    // 스크립트 탭의 그룹을 통째로 옮기면 그 그룹의 문서들
    groupOf("doc:welcome")!.api.moveTo({ group: groupOf("doc:game")!, position: "right" });
    expect(moved.slice(2)).toEqual(expect.arrayContaining([main]));

    off();
    api.getPanel("doc:game")!.api.moveTo({ group: groupOf("doc:welcome")!, position: "center" });
    expect(moved.filter((d) => d === gameDoc)).toHaveLength(2);
  });
});
