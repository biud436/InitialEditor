// 확장 레이어의 앱 쪽 자리: 도구 넘기기(mapTools), 레이어 커맨드와 단축키, 저장 전 질문. 가짜 레이어로 RPG 없이 본다.
import { CommandRegistry, DocumentRegistry, MemoryBackend, MenuRegistry, visibleMenu } from "@initial-editor/core";
import { TilemapContrib } from "@initial-editor/ext-tilemap";
import { MapDocument, parseMap } from "@initial-editor/ext-tilemap/model";
import { observable, runInAction } from "mobx";
import { describe, expect, it } from "vitest";
import type { ConfirmOptions } from "../modals";
import { FakeMarksState, fakeLayer } from "./__fixtures__/fakeLayer";
import { confirmLayerErrors, layerCommandId, layerErrorsMessage, registerLayerCommands, selectExtLayer } from "./extLayers";
import { HIDDEN_EXT_NOTICE, MapToolController, targetHidden, type ToolPointer } from "./mapTools";

const PATH = "resources/maps/town.json";
const OTHER = "resources/maps/other.json";

function mapText(extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    version: 2,
    name: "town",
    width: 8,
    height: 6,
    tileWidth: 16,
    tileHeight: 16,
    layers: [{ name: "ground", data: new Array(48).fill(1) }],
    tilesets: [{ image: "resources/tiles/t.png", firstGid: 1, columns: 8 }],
    objects: [{ id: "start", type: "start", x: 8, y: 8 }],
    ...extra,
  });
}

function setup(opts: Parameters<typeof fakeLayer>[0] = {}) {
  const documents = new DocumentRegistry();
  const contrib = new TilemapContrib({ documents });
  const { spec, log } = fakeLayer(opts);
  contrib.registerMapLayer(spec);
  const doc = new MapDocument(new MemoryBackend(), PATH, parseMap(mapText({ marks: [{ id: "a", x: 1, y: 1 }] })));
  documents.open(doc);
  const tools = new MapToolController({ document: doc, zoom: () => 2, changed: () => {}, layerTool: (id) => (id === spec.id ? spec.createTool!({ document: doc, zoom: () => 2, changed: () => {}, notice: () => {} }) : null) });
  const at = (x: number, y: number, extra: Partial<ToolPointer> = {}): ToolPointer => ({ world: { x, y }, button: 0, shift: false, alt: false, ...extra });
  return { documents, contrib, spec, log, doc, tools, at };
}

describe("도구 넘기기", () => {
  it("대상이 확장 레이어면 포인터를 월드와 칸 좌표로 레이어 도구에 넘긴다 (더블클릭 포함)", () => {
    const f = setup();
    f.doc.setTarget({ kind: "ext", id: "test.marks" });
    f.tools.pointerDown(f.at(40, 20, { mod: true }));
    f.tools.pointerMove(f.at(50, 36));
    f.tools.pointerUp(f.at(50, 36, { shift: true }));
    f.tools.doubleClick(f.at(17, 33, { alt: true }));
    expect(f.log.pointers).toEqual([
      ["down", { world: { x: 40, y: 20 }, cell: { x: 2, y: 1 }, button: 0, shift: false, alt: false, mod: true }],
      ["move", { world: { x: 50, y: 36 }, cell: { x: 3, y: 2 }, button: 0, shift: false, alt: false, mod: false }],
      ["up", { world: { x: 50, y: 36 }, cell: { x: 3, y: 2 }, button: 0, shift: true, alt: false, mod: false }],
      ["double", { world: { x: 17, y: 33 }, cell: { x: 1, y: 2 }, button: 0, shift: false, alt: true, mod: false }],
    ]);
    expect(f.tools.cursor).toBe("copy");
    expect(f.tools.wantsRightButton()).toBe(true);
    expect(f.tools.preview).toEqual({ kind: "none" });
    // 타일은 칠하지 않았다
    expect(f.doc.undo.depth).toBe(0);
  });

  it("Ctrl 조합도 오브젝트 규칙보다 먼저 레이어 도구가 받는다. 처리하지 않은 키는 그 뒤 규칙으로 간다", () => {
    const f = setup();
    f.doc.select(["start"]);
    f.doc.setTarget({ kind: "ext", id: "test.marks" });
    // 조합 키만 누른 것은 넘기지 않는다
    expect(f.tools.keyDown({ key: "Control", shift: false, alt: false, mod: true })).toBe(false);
    expect(f.tools.keyDown({ key: "Shift", shift: true, alt: false, mod: false })).toBe(false);
    expect(f.tools.keyDown({ key: "c", shift: false, alt: false, mod: true })).toBe(true);
    expect(f.tools.keyDown({ key: "Delete", shift: false, alt: false, mod: false })).toBe(true);
    // 도구가 받지 않은 Ctrl+V 는 false (전역 단축키로 간다), Escape 는 오브젝트 선택 풀기
    expect(f.tools.keyDown({ key: "v", shift: false, alt: false, mod: true })).toBe(false);
    expect(f.tools.keyDown({ key: "Escape", shift: false, alt: false, mod: false })).toBe(true);
    expect(f.log.keys.map((k) => `${k.mod ? "Ctrl+" : ""}${k.key}`)).toEqual(["Ctrl+c", "Delete", "Ctrl+v", "Escape"]);
    expect(f.doc.selection.size).toBe(0);
    // 오브젝트는 지우지 않았다
    expect(f.doc.model.objects.map((o) => o.id)).toEqual(["start"]);
  });

  it("대상이 확장 레이어가 아니거나 이 맵에 상태가 없으면 도구에 넘기지 않는다", () => {
    const f = setup();
    f.tools.keyDown({ key: "c", shift: false, alt: false, mod: true });
    f.doc.setTarget({ kind: "objects" });
    f.tools.pointerDown(f.at(1, 1));
    f.tools.pointerUp(f.at(1, 1));
    expect(f.log.pointers).toEqual([]);
    expect(f.log.keys).toEqual([]);
    f.doc.setTarget({ kind: "ext", id: "test.unknown" });
    expect(f.tools.extTool()).toBeNull();
    f.tools.pointerDown(f.at(1, 1));
    expect(f.log.pointers).toEqual([]);
    expect(f.tools.cursor).toBe("default");
  });
});

describe("숨긴 확장 레이어", () => {
  it("눈을 끈 레이어는 포인터와 편집 키를 도구에 넘기지 않고 알린다 (타일 레이어처럼). 되돌리기와 저장 키는 흘려보낸다", () => {
    const f = setup();
    const notices: string[] = [];
    const tool = f.spec.createTool!({ document: f.doc, zoom: () => 2, changed: () => {}, notice: () => {} });
    const tools = new MapToolController({ document: f.doc, zoom: () => 2, changed: () => {}, notice: (m) => void notices.push(m), layerTool: () => tool });
    f.doc.setTarget({ kind: "ext", id: "test.marks" });
    f.doc.toggleExtLayer("test.marks");
    expect(targetHidden(f.doc)).toBe(true);
    tools.pointerDown(f.at(40, 20));
    tools.pointerMove(f.at(50, 36));
    tools.pointerUp(f.at(50, 36));
    tools.doubleClick(f.at(17, 33));
    const key = (k: string, mod = false) => tools.keyDown({ key: k, shift: false, alt: false, mod });
    expect([key("Delete"), key("Backspace"), key("ArrowLeft"), key("v", true), key("d", true)]).toEqual([true, true, true, true, true]);
    expect([key("z", true), key("s", true), key("Escape")]).toEqual([false, false, false]);
    expect(f.log.pointers).toEqual([]);
    expect(f.log.keys).toEqual([]);
    expect(notices).toEqual(new Array(7).fill(HIDDEN_EXT_NOTICE));
    expect(tools.cursor).toBe("not-allowed");
    // 눈을 켜면 다시 도구가 받는다
    f.doc.toggleExtLayer("test.marks");
    tools.pointerDown(f.at(40, 20));
    expect(key("Delete")).toBe(true);
    expect(f.log.pointers.map(([kind]) => kind)).toEqual(["down"]);
    expect(f.log.keys.map((k) => k.key)).toEqual(["Delete"]);
  });
});

describe("레이어 커맨드", () => {
  function commandSetup() {
    const f = setup({ paths: [PATH] });
    const commands = new CommandRegistry({ platform: "mac" });
    const menus = new MenuRegistry();
    const checked = new Map<string, () => boolean>();
    const hints = new Map<string, () => string | undefined>();
    const support = observable({ activeMap: f.doc as MapDocument | null, editableFocus: false }, { activeMap: observable.ref });
    const host = { tilemap: f.contrib, commands, menus, setChecked: (id: string, fn: () => boolean) => checked.set(id, fn), setHint: (id: string, fn: () => string | undefined) => hints.set(id, fn) };
    const off = registerLayerCommands(host, support);
    return { ...f, commands, menus, checked, hints, support, off };
  }

  it("레이어마다 toolKey 단축키의 커맨드와 맵 메뉴 항목이 생기고, 누르면 대상이 그 레이어다", async () => {
    const f = commandSetup();
    const id = layerCommandId("test.marks");
    const cmd = f.commands.get(id)!;
    expect([cmd.label, cmd.shortcut, cmd.category]).toEqual(["표식 도구", "M", "map"]);
    expect(f.commands.findByKey({ key: "m", ctrlKey: false, metaKey: false, shiftKey: false, altKey: false })).toBe(id);
    expect(f.menus.items.some((m) => m.commandId === id && m.path === "맵/표식 도구")).toBe(true);
    expect(f.checked.get(id)!()).toBe(false);
    await f.commands.execute(id);
    expect(f.doc.target).toEqual({ kind: "ext", id: "test.marks" });
    expect(f.doc.tool).toBe("ext");
    expect(f.checked.get(id)!()).toBe(true);
  });

  it("맵 탭이 아니거나, 이 맵에 레이어가 없거나, 입력 칸에 초점이 있으면 꺼진다", async () => {
    const f = commandSetup();
    const id = layerCommandId("test.marks");
    expect(f.commands.isEnabled(id)).toBe(true);
    runInAction(() => (f.support.editableFocus = true));
    expect(f.commands.isEnabled(id)).toBe(false);
    runInAction(() => (f.support.editableFocus = false));
    const other = new MapDocument(new MemoryBackend(), OTHER, parseMap(mapText()));
    f.documents.open(other);
    runInAction(() => (f.support.activeMap = other));
    expect(other.layerState("test.marks")).toBeNull();
    expect(f.commands.isEnabled(id)).toBe(false);
    expect(f.hints.get(id)!()).toBe("이 맵에는 표식 레이어가 없다");
    expect(selectExtLayer(other, "test.marks")).toBe(false);
    expect(other.target).toEqual({ kind: "layer", index: 0 });
    runInAction(() => (f.support.activeMap = null));
    expect(f.hints.get(id)!()).toBe("맵 탭이 활성일 때");
  });

  it("레이어의 visible 이 거짓이면(이 프로젝트에 없는 레이어) 커맨드가 메뉴에서 빠지고 단축키도 듣지 않는다", () => {
    const f = commandSetup();
    const shown = observable.box(false);
    const other = fakeLayer({ id: "test.rpgish", label: "이벤트", section: "rpgish", toolKey: "N", visible: () => shown.get() });
    f.contrib.registerMapLayer(other.spec);
    const id = layerCommandId("test.rpgish");
    const menu = () => visibleMenu(f.menus.tree(), (cid) => f.commands.isVisible(cid)).find((n) => n.label === "맵")!.children.map((n) => n.label);
    expect(f.commands.isVisible(id)).toBe(false);
    expect(f.commands.isEnabled(id)).toBe(false);
    expect(f.commands.findByKey({ key: "n", ctrlKey: false, metaKey: false, shiftKey: false, altKey: false })).toBeNull();
    expect(menu()).toEqual(["표식 도구"]);
    runInAction(() => shown.set(true));
    expect(f.commands.isVisible(id)).toBe(true);
    expect(menu()).toEqual(["표식 도구", "이벤트 도구"]);
  });

  it("나중에 등록한 레이어도 커맨드가 생기고, 거두면 커맨드와 메뉴가 빠진다", () => {
    const f = commandSetup();
    const late = fakeLayer({ id: "test.late", label: "늦은", section: "late", toolKey: "L" });
    const offLate = f.contrib.registerMapLayer(late.spec);
    expect(f.commands.get(layerCommandId("test.late"))?.shortcut).toBe("L");
    offLate();
    expect(f.commands.get(layerCommandId("test.late"))).toBeUndefined();
    expect(f.menus.items.some((m) => m.commandId === layerCommandId("test.late"))).toBe(false);
    f.off();
    expect(f.commands.get(layerCommandId("test.marks"))).toBeUndefined();
  });
});

describe("저장 전 질문", () => {
  function asker(answer: boolean) {
    const asked: ConfirmOptions[] = [];
    return { asked, modals: { confirm: async (o: ConfirmOptions) => (asked.push(o), answer) } };
  }

  it("레이어 상태에 오류가 없으면 묻지 않는다. 오류가 있으면 목록을 보이고 그래도 저장을 묻는다", async () => {
    const f = setup();
    const ok = asker(true);
    expect(await confirmLayerErrors(ok.modals, f.doc)).toBe(true);
    expect(ok.asked).toEqual([]);
    const state = f.doc.layerState("test.marks") as FakeMarksState;
    f.doc.apply(state.add({ id: "out", x: -2, y: 0 }));
    expect(await confirmLayerErrors(ok.modals, f.doc)).toBe(true);
    expect(ok.asked).toEqual([
      { title: "오류가 있는 맵 저장", message: "town.json에 오류가 1개 있다. 엔진이 틀린 항목을 건너뛰거나 멈출 수 있다.\n- marks[2]: out 이(가) 맵 밖이다", okLabel: "그래도 저장", cancelLabel: "취소" },
    ]);
    const no = asker(false);
    expect(await confirmLayerErrors(no.modals, f.doc)).toBe(false);
  });

  it("오브젝트의 오류와 맵이 아닌 문서는 묻지 않는다", async () => {
    const doc = new MapDocument(
      new MemoryBackend(),
      PATH,
      parseMap(
        mapText({
          objects: [
            { id: "dup", type: "start", x: 0, y: 0 },
            { id: "dup", type: "start", x: 8, y: 0 },
          ],
        }),
      ),
    );
    expect(doc.problems.map((p) => [p.severity, p.message])).toEqual([["error", "id 가 겹친다: dup"]]);
    const a = asker(false);
    expect(await confirmLayerErrors(a.modals, doc)).toBe(true);
    expect(await confirmLayerErrors(a.modals, { kind: "script" } as never)).toBe(true);
    expect(a.asked).toEqual([]);
  });

  it("목록은 여덟 줄까지이고 나머지는 수로 적는다", () => {
    const errors = Array.from({ length: 10 }, (_, i) => ({ severity: "error" as const, message: `오류 ${i}`, location: `e[${i}]` }));
    const text = layerErrorsMessage("a.json", errors);
    expect(text.split("\n")).toHaveLength(10);
    expect(text.endsWith("- 그 밖에 2개")).toBe(true);
  });
});
