// @vitest-environment jsdom
// 씬 렌더러가 확장 노드에 주는 ctx (WebGL 없이): 이름표는 줌의 역수로 크기를 지키고, setBounds가 고르기 경계를 정한다.
import { Emitter, ExtensionRegistries, makeObject, MemoryBackend, SceneDocument, type ObjectTypeSpec, type SceneObject } from "@initial-editor/core";
import { Container } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import { SceneRenderer, type SceneNodeContext } from "./SceneRenderer";
import { SceneViewState } from "./viewState";

vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
});

interface Entry {
  node: Container;
  size: { x: number; y: number; w: number; h: number };
  labels: Container[];
}

interface Internals {
  createEntry(o: SceneObject, spec: ObjectTypeSpec | undefined): Entry;
  destroyEntry(entry: Entry): void;
  applyTransform(): void;
  nodes: Map<string, Entry>;
}

function setup(createSceneNode: ObjectTypeSpec["createSceneNode"]) {
  const registries = new ExtensionRegistries();
  const spec: ObjectTypeSpec = { type: "ext", label: "확장", defaults: {}, createSceneNode };
  registries.objectTypes.set("ext", spec);
  const doc = new SceneDocument(new MemoryBackend(), "resources/scenes/s.json", undefined, () => new Set(["ext"]));
  const r = new SceneRenderer({
    document: doc,
    view: new SceneViewState(null),
    textures: { load: async () => ({}), events: new Emitter() } as never,
    objectTypes: registries.objectTypes,
    gameSize: () => ({ width: 100, height: 100 }),
    theme: () => ({ colors: new Proxy({}, { get: () => 0x888888 }), fonts: new Proxy({}, { get: () => "sans-serif" }) }) as never,
  });
  const internals = r as unknown as Internals;
  const object = makeObject("ext", "e1", {}, { x: 10, y: 20 });
  return { r, internals, spec, object };
}

describe("확장 노드의 ctx", () => {
  it("setBounds가 경계를 정하고, 이름표는 줌의 역수로 크기를 지킨다", () => {
    let ctx!: SceneNodeContext;
    const { r, internals, spec, object } = setup((_o, c) => {
      ctx = c as SceneNodeContext;
      const root = new Container();
      const label = ctx.makeLabel("이름", 0);
      root.addChild(label);
      ctx.setBounds({ x: 0, y: 0, w: 48, h: 48 });
      return root;
    });
    r.transform.zoom = 2;
    const entry = internals.createEntry(object, spec);
    internals.nodes.set(object.id, entry);
    expect(entry.size).toEqual({ x: 0, y: 0, w: 48, h: 48 });
    expect(entry.labels).toHaveLength(1);
    expect(entry.labels[0].scale.x).toBe(0.5);

    // 비동기로 다 그린 뒤: 옛 이름표를 버리고 새 경계를 알린다
    entry.labels[0].destroy();
    ctx.setBounds({ x: 0, y: 0, w: 320, h: 160 });
    expect(entry.size).toEqual({ x: 0, y: 0, w: 320, h: 160 });
    expect(entry.labels).toHaveLength(0);
    const next = ctx.makeLabel("다음", 0);
    r.transform.zoom = 4;
    expect(() => internals.applyTransform()).not.toThrow();
    expect(next.scale.x).toBe(0.25);
  });

  it("setBounds를 부르지 않으면 노드의 지역 경계를 쓴다", () => {
    const { internals, spec, object } = setup(() => {
      const root = new Container();
      const child = new Container();
      child.boundsArea = { x: 0, y: 0, width: 30, height: 20 } as never;
      root.addChild(child);
      return root;
    });
    const entry = internals.createEntry(object, spec);
    expect(entry.size.w).toBe(30);
    expect(entry.size.h).toBe(20);
  });

  it("노드를 만들지 못하면 이름표 상자이고, 만들다 만 이름표와 늦은 setBounds는 버린다", () => {
    let ctx!: SceneNodeContext;
    let orphan!: Container;
    const { internals, spec, object } = setup((_o, c) => {
      ctx = c as SceneNodeContext;
      orphan = ctx.makeLabel("만들다 만", 0);
      throw new Error("실패");
    });
    const entry = internals.createEntry(object, spec);
    expect(orphan.destroyed).toBe(true);
    expect(entry.size).toEqual({ x: 0, y: 0, w: 48, h: 48 });
    expect(entry.labels).toHaveLength(1);
    ctx.setBounds({ x: 0, y: 0, w: 500, h: 500 });
    expect(entry.size).toEqual({ x: 0, y: 0, w: 48, h: 48 });
  });

  it("버린 노드의 늦은 setBounds는 아무것도 하지 않는다", () => {
    let ctx!: SceneNodeContext;
    const { internals, spec, object } = setup((_o, c) => {
      ctx = c as SceneNodeContext;
      return new Container();
    });
    const entry = internals.createEntry(object, spec);
    const before = { ...entry.size };
    internals.destroyEntry(entry);
    ctx.setBounds({ x: 0, y: 0, w: 99, h: 99 });
    expect(entry.size).toEqual(before);
  });
});

interface PointerInternals extends Internals {
  host: HTMLElement | null;
  app: unknown;
  onPointerDown(e: unknown): void;
  onPointerMove(e: unknown): void;
  onPointerUp(e: unknown): void;
}

/** 배경 대상(맵, 0,0 320x192)과 보통 대상(e2, 100,100 10x10). 줌 1, 팬 24라 화면 = 월드 + 24 */
function backgroundSetup() {
  const registries = new ExtensionRegistries();
  const spec: ObjectTypeSpec = {
    type: "ext",
    label: "확장",
    defaults: {},
    createSceneNode: (o, c) => {
      const ctx = c as SceneNodeContext;
      const obj = o as SceneObject;
      if (obj.id === "map") ctx.setBounds({ x: 0, y: 0, w: 320, h: 192 }, { background: true });
      else ctx.setBounds({ x: 0, y: 0, w: 10, h: 10 });
      return new Container();
    },
  };
  registries.objectTypes.set("ext", spec);
  const map = makeObject("ext", "map", {}, { x: 0, y: 0 });
  const e2 = makeObject("ext", "e2", {}, { x: 100, y: 100 });
  const doc = new SceneDocument(new MemoryBackend(), "resources/scenes/s.json", { version: 1, name: "s", objects: [e2, map], extra: {} }, () => new Set(["ext"]));
  const r = new SceneRenderer({
    document: doc,
    view: new SceneViewState(null),
    textures: { load: async () => ({}), events: new Emitter() } as never,
    objectTypes: registries.objectTypes,
    gameSize: () => ({ width: 100, height: 100 }),
    theme: () => ({ colors: new Proxy({}, { get: () => 0x888888 }), fonts: new Proxy({}, { get: () => "sans-serif" }) }) as never,
  });
  const internals = r as unknown as PointerInternals;
  for (const o of doc.scene.objects) internals.nodes.set(o.id, internals.createEntry(o, spec));
  internals.host = document.createElement("div");
  internals.app = { canvas: { getBoundingClientRect: () => ({ left: 0, top: 0 }), setPointerCapture() {}, hasPointerCapture: () => false, releasePointerCapture() {} } };
  const ev = (x: number, y: number, shiftKey = false) => ({ clientX: x + 24, clientY: y + 24, button: 0, pointerId: 1, shiftKey, preventDefault() {} });
  const press = (from: { x: number; y: number }, to = from, shiftKey = false) => {
    internals.onPointerDown(ev(from.x, from.y, shiftKey));
    internals.onPointerMove(ev((from.x + to.x) / 2, (from.y + to.y) / 2, shiftKey));
    internals.onPointerMove(ev(to.x, to.y, shiftKey));
    internals.onPointerUp(ev(to.x, to.y, shiftKey));
  };
  return { doc, press };
}

describe("배경 대상 (타일맵)", () => {
  it("누르고 놓으면 고르고, 빈 곳을 누르면 푼다. Shift는 더한다", () => {
    const { doc, press } = backgroundSetup();
    press({ x: 50, y: 50 });
    expect(doc.selectedIds).toEqual(["map"]);
    press({ x: 400, y: 400 });
    expect(doc.selectedIds).toEqual([]);
    press({ x: 105, y: 105 });
    expect(doc.selectedIds).toEqual(["e2"]);
    press({ x: 50, y: 50 }, { x: 51, y: 50 }, true);
    expect(doc.selectedIds).toEqual(["e2", "map"]);
  });

  it("고르지 않은 배경 위에서 끌면 상자 선택이고 맵은 움직이지 않는다", () => {
    const { doc, press } = backgroundSetup();
    press({ x: 90, y: 90 }, { x: 130, y: 130 });
    expect(doc.selectedIds).toEqual(["e2"]);
    expect(doc.scene.find("map")).toMatchObject({ x: 0, y: 0 });
    expect(doc.undo.depth).toBe(0);
    // 상자가 맵을 다 품으면 맵도 든다
    press({ x: -10, y: -10 }, { x: 330, y: 200 });
    expect(doc.selectedIds).toEqual(["e2", "map"]);
  });

  it("고른 배경은 누르고 끌면 움직인다. 그 위의 보통 대상은 여전히 먼저 맞는다", () => {
    const { doc, press } = backgroundSetup();
    press({ x: 50, y: 50 });
    expect(doc.selectedIds).toEqual(["map"]);
    press({ x: 50, y: 50 }, { x: 82, y: 66 });
    expect(doc.scene.find("map")).toMatchObject({ x: 32, y: 16 });
    expect(doc.undo.depth).toBe(1);
    press({ x: 105, y: 105 });
    expect(doc.selectedIds).toEqual(["e2"]);
  });
});
