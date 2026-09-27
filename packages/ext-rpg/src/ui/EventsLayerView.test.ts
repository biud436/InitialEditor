// @vitest-environment jsdom
// 이벤트 레이어의 그림 (e5 문서 3절 "그리기", WebGL 없이): 진짜 port_town 의 17개가 게임과 같은 자리에 그려진다.
// 외형은 CharSet 의 서 있는 프레임(방향 행), 발이 칸 아래 변. 나머지는 칸의 표식과 트리거 글자. 그림을 읽기 전과 못 읽으면 표식.
// 고르기 테두리, 구역, 문제 점, 끌기 미리보기, 다시 그리기와 버리기.
import type { MapLayerViewContext } from "@initial-editor/ext-tilemap";
import { Container, Graphics, Sprite, Text, TextureSource } from "pixi.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { characterDrawPos, charsetFrame } from "../model/assets";
import { field } from "../model/json";
import { fixtureSources, layerHarness, PORT_TOWN, stateOf, type MutableSources } from "../testing/layerHarness";
import { EventsLayerView } from "./EventsLayerView";

vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
});

const COLORS: Record<string, number> = { accent: 0x0000a1, warning: 0x0000a2, success: 0x0000a3, "fg-muted": 0x0000a4, danger: 0x0000a5, "scene-selection": 0x0000a6, fg: 0x0000a7 };

const views: EventsLayerView[] = [];
afterEach(() => {
  for (const v of views.splice(0)) v.dispose();
});

async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

function setup(opts: { sources?: MutableSources; failLoad?: boolean; sheet?: { w: number; h: number } } = {}) {
  const h = layerHarness({ sources: opts.sources });
  const doc = h.open(PORT_TOWN);
  const st = stateOf(doc);
  const container = new Container();
  const loads: string[] = [];
  let zoom = 1;
  const sheet = opts.sheet ?? { w: 288, h: 256 };
  const ctx: MapLayerViewContext = {
    document: doc,
    container,
    zoom: () => zoom,
    color: (token) => COLORS[token] ?? 0,
    font: () => "sans-serif",
    loadTexture: async (path) => {
      loads.push(path);
      if (opts.failLoad) throw new Error("없다");
      return { texture: { source: new TextureSource({ width: sheet.w, height: sheet.h }) }, width: sheet.w, height: sheet.h };
    },
  };
  const view = new EventsLayerView(ctx, { fileExists: () => h.sources.fileExists });
  views.push(view);
  return { h, doc, st, view, container, loads, setZoom: (z: number) => (zoom = z) };
}

const byIndex = (view: EventsLayerView) => new Map(view.drawn.map((m) => [m.index, m]));

describe("표식", () => {
  it("port_town 의 이벤트 17개가 칸에 그려진다: 외형 넷은 서 있는 프레임, 나머지는 칸의 표식", async () => {
    const t = setup();
    await flush();
    const schema = t.st.schema!;
    const list = t.st.section.list;
    expect(t.view.drawn).toHaveLength(17);
    const drawn = byIndex(t.view);
    const sprites = t.view.drawn.filter((m) => m.kind === "sprite").map((m) => field(list[m.index], "id"));
    expect(sprites.sort()).toEqual(["captain", "fishmonger", "keeper", "kid"]);
    list.forEach((ev, i) => {
      const m = drawn.get(i)!;
      const x = field(ev, "x") as number;
      const y = field(ev, "y") as number;
      const charset = field(ev, "charset");
      if (charset) {
        const pos = characterDrawPos(schema, 16, 16, x, y);
        expect([m.x, m.y]).toEqual([pos.x, pos.y]);
        expect(m.frame).toEqual(charsetFrame(schema, field(charset, "index") as number, field(ev, "dir") as string));
        expect(m.sheet).toBe("resources/charsets/placeholder.png");
      } else expect([m.x, m.y]).toEqual([x * 16, y * 16]);
    });
    // 선장(16,44): 발이 칸 아래 변, 가로 가운데. 24x32 프레임이 윗 칸으로 올라간다
    const captain = drawn.get(t.st.section.indexOfId("captain"))!;
    expect([captain.x, captain.y]).toEqual([16 * 16 - 4, 45 * 16 - 32]);
    // 위를 보는 선장은 up 행(0), npc 6번은 둘째 줄 셋째 칸
    expect(captain.frame).toEqual({ x: 2 * 72 + 24, y: 128, w: 24, h: 32 });
    expect(t.loads).toEqual(["resources/charsets/placeholder.png"]);
    const spritesInTree = (t.container.getChildByLabel("rpg-events-markers") as Container).children.filter((c) => c instanceof Sprite);
    expect(spritesInTree).toHaveLength(4);
  });

  it("그림을 읽기 전과 읽지 못하면 외형 이벤트도 표식으로 그린다", async () => {
    const t = setup({ failLoad: true });
    expect(t.view.drawn.filter((m) => m.kind === "badge")).toHaveLength(17);
    await flush();
    expect(t.view.drawn.filter((m) => m.kind === "badge")).toHaveLength(17);
  });

  it("시트가 프레임보다 작으면 표식으로 그린다", async () => {
    const t = setup({ sheet: { w: 48, h: 48 } });
    await flush();
    expect(t.view.drawn.every((m) => m.kind === "badge")).toBe(true);
  });

  it("RTP 그림이 프로젝트에 있으면 후보의 앞(RTP)을 쓴다", async () => {
    const sources = fixtureSources();
    sources.set({ files: new Set(["resources/rtp/CharSet/People1.png", "resources/charsets/placeholder.png"]) });
    const t = setup({ sources });
    await flush();
    expect(t.loads).toEqual(["resources/rtp/CharSet/People1.png"]);
  });

  it("트리거 글자: 말 걸기, 밟기, 자동", () => {
    const t = setup();
    const texts = (t.container.getChildByLabel("rpg-events-markers") as Container).children.filter((c): c is Text => c instanceof Text);
    const letter = (id: string) => texts.find((x) => x.label === `event:${t.st.section.indexOfId(id)}`)?.text;
    expect(letter("crates")).toBe("말");
    expect(letter("inn_door")).toBe("밟");
    expect(letter("arrival")).toBe("자");
  });

  it("이벤트가 바뀌면 다시 그린다 (옮기기, 되돌리기)", async () => {
    const t = setup();
    await flush();
    const i = t.st.section.indexOfId("bench");
    t.st.run((ed) => ed.moveEvents([i], 1, 0));
    expect(byIndex(t.view).get(i)).toMatchObject({ x: 20 * 16, y: 34 * 16 });
    t.doc.undo.undo();
    expect(byIndex(t.view).get(i)).toMatchObject({ x: 19 * 16, y: 34 * 16 });
  });
});

describe("고르기와 미리보기", () => {
  const graphicsOf = (container: Container) => container.children.filter((c): c is Graphics => c instanceof Graphics);

  it("고르면 테두리와 배회 구역이 그려지고, 풀면 사라진다", () => {
    const t = setup();
    const [areaG, , overlayG] = graphicsOf(t.container);
    const areaEmpty = areaG.bounds.width;
    t.st.select([t.st.section.indexOfId("kid")]);
    // 구역 13,19 6x6 칸
    expect(areaG.bounds.minX).toBeLessThanOrEqual(13 * 16);
    expect(areaG.bounds.maxX).toBeGreaterThanOrEqual(19 * 16);
    expect(overlayG.bounds.width).toBeGreaterThan(0);
    t.st.clearSelection();
    expect(areaG.bounds.width).toBe(areaEmpty);
  });

  it("끌기 미리보기: 옮길 자리(놓을 수 없으면 danger), 상자, 구역", () => {
    const t = setup();
    const previewG = graphicsOf(t.container)[3];
    const i = t.st.section.indexOfId("bench");
    t.st.setDrag({ kind: "move", indices: [i], dx: 2, dy: 0, ok: false, keepArea: false });
    expect(previewG.bounds.minX).toBeCloseTo(21 * 16 - 1, 0);
    t.st.setDrag({ kind: "box", from: { x: 1, y: 1 }, to: { x: 3, y: 2 } });
    expect([previewG.bounds.minX, previewG.bounds.maxX]).toEqual([16 - 0.5, 64 + 0.5]);
    t.st.setDrag(null);
    expect(previewG.bounds.width).toBe(0);
  });

  it("오류가 있는 이벤트는 점을 그린다", () => {
    const t = setup();
    const overlayG = graphicsOf(t.container)[2];
    expect(overlayG.bounds.width).toBe(0);
    const data = t.st.section.list.map((ev, k) => (k === 0 ? { ...(ev as object), charset: { set: "npc", index: 9 } } : ev));
    t.st.section.replace(data);
    expect(overlayG.bounds.width).toBeGreaterThan(0);
  });

  it("줌이 바뀌면 redraw 로 다시 그리고, dispose 뒤에는 그리지 않는다", () => {
    const t = setup();
    const before = t.view.drawn;
    t.setZoom(4);
    t.view.redraw();
    expect(t.view.drawn).not.toBe(before);
    t.view.dispose();
    const after = t.view.drawn;
    t.st.run((ed) => ed.moveEvents([0], 1, 0));
    expect(t.view.drawn).toBe(after);
  });
});
