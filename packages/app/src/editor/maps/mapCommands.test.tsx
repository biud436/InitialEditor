// @vitest-environment jsdom
// 맵/새 맵과 맵/크기 바꾸기: 커맨드, 단축키, 메뉴, 켜짐, 그리고 대화상자를 거쳐 파일과 모델이 바뀌는 흐름.
import { CommandRegistry, DocumentRegistry, LogStore, MenuRegistry, Project } from "@initial-editor/core";
import { MemoryBackend } from "@initial-editor/core/testing";
import { MapDocument, parseMap } from "@initial-editor/ext-tilemap/model";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Editor } from "../Editor";
import { ModalStore } from "../modals";
import { registerMapCommands } from "./mapCommands";
import type { MapSupport } from "./MapSupport";
import { encodePng } from "./sampleMap";

afterEach(cleanup);

const MAP_PATH = "resources/maps/meadow.json";
const MAP = JSON.stringify({
  version: 2,
  name: "meadow",
  id: 2,
  width: 4,
  height: 2,
  tileWidth: 16,
  tileHeight: 16,
  layers: [{ name: "ground", data: [1, 2, 3, 4, 5, 6, 7, 8] }],
  tilesets: [{ image: "resources/tiles/meadow16.png", firstGid: 1, columns: 8 }],
  objects: [{ id: "start", type: "start", x: 8, y: 8 }],
});

async function setup(open = true) {
  const be = new MemoryBackend({
    "game.json": "{}",
    [MAP_PATH]: MAP,
    "resources/tiles/meadow16.png": encodePng(128, 64, new Uint8Array(128 * 64 * 4)),
  });
  const project = new Project(be);
  if (open) await project.open("/mem");
  const documents = new DocumentRegistry();
  const commands = new CommandRegistry({ platform: "win" });
  const menus = new MenuRegistry();
  const modals = new ModalStore();
  const log = new LogStore();
  const toasts: string[] = [];
  const push = (t: string) => void toasts.push(t);
  const hints = new Map<string, () => string | undefined>();
  const opened: string[] = [];
  const editor = {
    backend: be,
    project,
    documents,
    commands,
    menus,
    modals,
    log,
    toasts: { info: push, success: push, warn: push, error: push },
    tree: { reveal: async () => {} },
    setHint: (id: string, fn: () => string | undefined) => hints.set(id, fn),
    setChecked: () => {},
  } as unknown as Editor;
  const support = {
    get activeMap() {
      return documents.active instanceof MapDocument ? documents.active : null;
    },
    toolKeysOff: false,
    view: { grid: true, dimAbove: false, toggleGrid() {}, toggleDimAbove() {} },
    rendererFor: () => null,
    lastLayer: () => 0,
    openMap: async (path: string) => {
      opened.push(path);
      const doc = await MapDocument.open(be, path);
      documents.open(doc);
      return doc;
    },
  } as unknown as MapSupport;
  const dispose = registerMapCommands(editor, support);
  return { be, editor, commands, menus, modals, log, toasts, hint: (id: string) => hints.get(id)?.(), opened, documents, support, dispose };
}

/** 모달 저장소의 맨 위 대화상자를 그린다 (Modals.tsx 대신) */
function renderTopModal(modals: ModalStore) {
  const spec = modals.top;
  if (!spec || spec.kind !== "custom") throw new Error("대화상자가 없다");
  return render(<>{spec.render(() => spec.resolve())}</>);
}

const type = (id: string, value: string) => fireEvent.change(screen.getByTestId(id), { target: { value } });

describe("맵 커맨드: 새 맵과 크기 바꾸기", () => {
  it("단축키, 메뉴 자리, 켜짐과 안내", async () => {
    const { commands, menus, hint } = await setup(false);
    expect(commands.get("map.new")?.shortcut).toBe("Ctrl+Alt+M");
    expect(commands.findByKey({ key: "m", ctrlKey: true, altKey: true, shiftKey: false, metaKey: false })).toBeNull();
    expect(commands.isEnabled("map.new")).toBe(false);
    expect(hint("map.new")).toBe("열린 프로젝트 없음");
    expect(commands.isEnabled("map.resize")).toBe(false);
    expect(hint("map.resize")).toBe("활성 맵 탭 없음");
    const paths = menus.items.filter((i) => i.commandId === "map.new" || i.commandId === "map.resize").map((i) => i.path);
    expect(paths).toEqual(["맵/새 맵", "맵/크기 바꾸기"]);
    const opened = await setup(true);
    expect(opened.commands.isEnabled("map.new")).toBe(true);
    expect(opened.commands.findByKey({ key: "m", ctrlKey: true, altKey: true, shiftKey: false, metaKey: false })).toBe("map.new");
  });

  it("새 맵: 대화상자에서 받은 값으로 파일을 쓰고 열고 기록한다", async () => {
    const { commands, modals, be, opened, documents, log } = await setup();
    let running!: Promise<boolean>;
    act(() => {
      running = commands.execute("map.new");
    });
    renderTopModal(modals);
    await waitFor(() => expect(screen.getByTestId("new-map-columns").getAttribute("data-columns")).toBe("8"));
    type("new-map-name", "stage1");
    type("new-map-width", "6");
    type("new-map-height", "5");
    await act(async () => {
      fireEvent.click(screen.getByTestId("new-map-ok"));
      await running;
    });
    expect(opened).toEqual(["resources/maps/stage1.json"]);
    const saved = parseMap(await be.readText("resources/maps/stage1.json"));
    expect(saved).toMatchObject({ name: "stage1", id: 3, width: 6, height: 5, tileWidth: 16, tilesets: [{ image: "resources/tiles/meadow16.png", columns: 8 }] });
    expect(saved.layers.map((l) => l.name)).toEqual(["ground", "deco"]);
    expect(saved.collision?.length).toBe(30);
    expect((documents.active as MapDocument).path).toBe("resources/maps/stage1.json");
    expect(log.entries.some((e) => e.text.startsWith("새 맵 생성됨: resources/maps/stage1.json (6x5 타일"))).toBe(true);
  });

  it("새 맵: 취소하면 아무것도 쓰지 않는다", async () => {
    const { commands, modals, be, opened } = await setup();
    let running!: Promise<boolean>;
    act(() => {
      running = commands.execute("map.new");
    });
    renderTopModal(modals);
    await act(async () => {
      fireEvent.click(screen.getByText("취소"));
      await running;
    });
    expect(opened).toEqual([]);
    expect(await be.list("resources/maps")).toHaveLength(1);
  });

  it("크기 바꾸기: 맵 탭에서 대화상자를 거쳐 되돌리기 한 단계로 바꾼다", async () => {
    const { commands, modals, support, documents, log } = await setup();
    const doc = await support.openMap(MAP_PATH);
    expect(documents.active).toBe(doc);
    expect(commands.isEnabled("map.resize")).toBe(true);
    let running!: Promise<boolean>;
    act(() => {
      running = commands.execute("map.resize");
    });
    renderTopModal(modals);
    expect(screen.getByTestId("resize-current").textContent).toBe("4x2 타일 (64x32 px)");
    type("resize-width", "6");
    type("resize-height", "3");
    fireEvent.click(document.querySelector('[data-anchor="bottom-right"]')!);
    await act(async () => {
      fireEvent.click(screen.getByTestId("resize-ok"));
      await running;
    });
    const m = doc!.model;
    expect([m.width, m.height]).toEqual([6, 3]);
    expect(m.layers[0].data).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 0, 0, 5, 6, 7, 8]);
    expect(m.findObject("start")).toMatchObject({ x: 40, y: 24 });
    expect(doc!.undo.depth).toBe(1);
    expect(log.entries.at(-1)?.text).toBe("맵 크기 변경됨: meadow.json 4x2 → 6x3 타일 (기준점 오른쪽 아래, 내용 이동 x +2, y +1 (타일))");
  });
});
