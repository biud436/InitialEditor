// 맵 이동의 대상 고르기와 대상 보기 (locationPick.ts, e5 문서 4절): 단추의 막는 이유(맵 미지정, 등록되지 않은 맵, 맵 파일 없음,
// 엔진이 열 수 없는 맵, 잠금, x, y 미지정, 맵 뷰 없음), 대상 보기의 x, y 판정(정수가 아님, 음수, 맵 범위 밖), 고르기의 흐름(한 명령, 원래 맵의 스택, 커맨드로 초점, 취소, 원래 맵이 닫힘,
// 고르는 동안 바뀐 이벤트, 같은 값), 같은 맵에서 고르기, 대상 보기.
import { NO_MAP_VIEWS } from "@initial-editor/ext-tilemap";
import { runInAction } from "mobx";
import { describe, expect, it } from "vitest";
import { bigIntValue } from "@initial-editor/ext-tilemap/model";
import { field } from "../model/json";
import { FakeMapViews, fixtureSources, INN, layerHarness, PORT_TOWN, stateOf } from "../testing/layerHarness";
import { LocationPicker, PICK_PROMPT } from "./locationPick";

const TRANSFER = { list: [], index: 1 };

function setup(opts: { lockPort?: boolean } = {}) {
  const sources = fixtureSources();
  if (opts.lockPort) {
    const game = sources.game!;
    sources.set({ game: { ...game, maps: game.maps.map((m) => (m.name === "port_town" ? { ...m, alt: ["resources/maps/port_town_rtp.json"] } : m)) } });
  }
  const h = layerHarness({ sources });
  const doc = h.open(PORT_TOWN);
  const st = stateOf(doc);
  const views = new FakeMapViews();
  const notified: string[] = [];
  const picker = new LocationPicker({ views, documents: h.documents, sources, notify: (m) => void notified.push(m) });
  const door = st.section.indexOfId("inn_door");
  const transfer = () => (field(st.section.list[st.section.indexOfId("inn_door")], "commands") as Array<Record<string, unknown>>)[1];
  /** inn_door 의 transfer 인자를 바꾼다 (되돌리기 스택 밖에서 준비) */
  const setTransfer = (values: Record<string, unknown>) => {
    const r = st.run((ed) => ed.setArgs(door, TRANSFER, values));
    if (!r.ok) throw new Error(r.reason);
    doc.undo.clear();
  };
  return { h, doc, st, views, notified, picker, sources, door, transfer, setTransfer };
}

describe("단추의 막는 이유", () => {
  it("맵 위치 인자가 있는 커맨드만 단추가 있고, 대상 맵이 있으면 둘 다 쓸 수 있다", () => {
    const t = setup();
    expect(t.picker.applies(t.st, t.transfer())).toBe(true);
    expect(t.picker.applies(t.st, { code: "message", text: "a" })).toBe(false);
    expect(t.picker.applies(t.st, null)).toBe(false);
    expect(t.picker.blockers(t.st, t.transfer())).toEqual({ pick: undefined, reveal: undefined });
  });

  it("맵 미지정, 등록되지 않은 맵, 맵 파일 없음, 엔진이 열 수 없는 맵은 두 단추를 같은 이유로 막는다", () => {
    const t = setup();
    const reasons = (map: unknown) => t.picker.blockers(t.st, { ...t.transfer(), map });
    expect(reasons("")).toEqual({ pick: "맵 미지정", reveal: "맵 미지정" });
    expect(reasons(undefined)).toEqual({ pick: "맵 미지정", reveal: "맵 미지정" });
    expect(reasons(3)).toEqual({ pick: "맵 인자는 문자열이어야 합니다", reveal: "맵 인자는 문자열이어야 합니다" });
    expect(reasons("forest")).toEqual({ pick: "rpg-game.json 에 등록되지 않은 맵: forest", reveal: "rpg-game.json 에 등록되지 않은 맵: forest" });
    expect(reasons("village").pick).toBe("맵 파일 없음: resources/maps/village.json");
    t.sources.mapChecks.set("resources/maps/room.json", { kind: "invalid", reason: "타일셋 없음" });
    expect(reasons("room")).toEqual({ pick: "엔진이 열 수 없는 맵: 타일셋 없음", reveal: "엔진이 열 수 없는 맵: 타일셋 없음" });
    t.sources.mapChecks.set("resources/maps/inn.json", { kind: "ok", images: ["resources/tiles/none.png"], width: 20, height: 14 });
    expect(reasons("inn").pick).toBe("엔진이 열 수 없는 맵: 타일셋 이미지 없음 (resources/tiles/none.png)");
  });

  it("잠긴 레이어는 고르기만 막고, x 와 y 가 없으면 대상 보기만 막는다. 맵 뷰가 없으면 둘 다", () => {
    const locked = setup({ lockPort: true });
    const b = locked.picker.blockers(locked.st, locked.transfer());
    expect(b.pick).toMatch(/^읽기 전용: alt 로 등록된 맵 \(RTP 버전과 기본 버전/);
    expect(b.reveal).toBeUndefined();
    const t = setup();
    expect(t.picker.blockers(t.st, { ...t.transfer(), x: undefined, y: undefined })).toEqual({ pick: undefined, reveal: "x, y 미지정" });
    expect(t.picker.blockers(t.st, { ...t.transfer(), x: undefined })).toEqual({ pick: undefined, reveal: "x 미지정" });
    runInAction(() => (t.views.blocked = NO_MAP_VIEWS));
    expect(t.picker.blockers(t.st, t.transfer())).toEqual({ pick: NO_MAP_VIEWS, reveal: NO_MAP_VIEWS });
  });
});

describe("대상 보기의 x, y (대상 맵 inn 은 20x14)", () => {
  const big = bigIntValue("12345678901234567890");
  const cases: Array<[string, Record<string, unknown>, string | undefined]> = [
    ["맵 안의 끝 타일", { x: 19, y: 13 }, undefined],
    ["2.0 은 정수", { x: 2.0, y: 0 }, undefined],
    ["2^53을 넘는 정수", { x: big, y: 1 }, "x 값이 맵 범위 밖 (현재: 12345678901234567890, 너비 20)"],
    ["음의 큰 정수", { x: 1, y: bigIntValue("-12345678901234567890") }, "y 값은 0 이상이어야 합니다 (현재: -12345678901234567890)"],
    ["음수", { x: -1, y: 2 }, "x 값은 0 이상이어야 합니다 (현재: -1)"],
    ["소수", { x: 1.5, y: 2 }, "x 값은 정수여야 합니다 (현재: 1.5)"],
    ["너비 밖", { x: 20, y: 0 }, "x 값이 맵 범위 밖 (현재: 20, 너비 20)"],
    ["높이 밖", { x: 0, y: 14 }, "y 값이 맵 범위 밖 (현재: 14, 높이 14)"],
    ["수가 아닌 값", { x: "3", y: true }, 'x 값은 숫자여야 합니다 (현재: "3"), y 값은 숫자여야 합니다 (현재: true)'],
    ["y 만 없음", { x: 3, y: undefined }, "y 미지정"],
    ["x 는 없고 y 는 밖", { x: undefined, y: 99 }, "x 미지정, y 값이 맵 범위 밖 (현재: 99, 높이 14)"],
  ];
  for (const [what, xy, reveal] of cases) {
    it(`${what}: ${reveal ?? "대상 보기 가능"}`, () => {
      const t = setup();
      expect(t.picker.blockers(t.st, { ...t.transfer(), ...xy })).toEqual({ pick: undefined, reveal });
    });
  }

  it("맵 크기를 모르면 범위 끝은 보지 않지만 2^53을 넘는 정수는 범위 밖이다", () => {
    const t = setup();
    t.sources.mapSize = () => undefined;
    expect(t.picker.blockers(t.st, { ...t.transfer(), x: 500, y: 500 })).toEqual({ pick: undefined, reveal: undefined });
    expect(t.picker.blockers(t.st, { ...t.transfer(), x: big, y: 1 }).reveal).toBe("x 값이 맵 범위 밖 (현재: 12345678901234567890)");
  });

  it("범위 밖의 x, y 로는 대상 보기를 부르지 않고 이유를 알린다. 고르기는 된다", async () => {
    const t = setup();
    t.setTransfer({ x: 25, y: 4 });
    expect(await t.picker.reveal(t.st, t.door, TRANSFER)).toBe(false);
    expect(t.notified).toEqual(["x 값이 맵 범위 밖 (현재: 25, 너비 20)"]);
    expect(t.views.reveals).toEqual([]);
    expect(t.picker.blockers(t.st, t.transfer()).pick).toBeUndefined();
  });
});

describe("맵에서 고르기", () => {
  it("대상 맵을 원래 맵으로 돌아오게 열고, 고른 타일의 x, y 를 원래 맵의 스택에 한 명령으로 넣고 그 커맨드로 초점을 보낸다", async () => {
    const t = setup();
    t.st.clearSelection();
    const done = t.picker.pick(t.st, t.door, TRANSFER);
    expect(t.views.picks).toEqual([{ path: INN, prompt: PICK_PROMPT, returnTo: t.doc }]);
    expect(t.transfer()).toMatchObject({ x: 10, y: 12 });
    t.views.end({ x: 3, y: 4 });
    expect(await done).toBe("picked");
    expect(t.transfer()).toEqual({ code: "transfer", map: "inn", x: 3, y: 4, dir: "up" });
    expect(t.doc.undo.depth).toBe(1);
    expect(t.st.selected).toEqual([t.door]);
    expect(t.st.focusRequest).toMatchObject({ target: "commands", location: `events[${t.door + 1}].commands[2]` });
    t.doc.undo.undo();
    expect(t.transfer()).toMatchObject({ x: 10, y: 12 });
    t.doc.undo.redo();
    expect(t.transfer()).toMatchObject({ x: 3, y: 4 });
  });

  it("같은 맵이 대상이면 그 맵에서 고른다", async () => {
    const t = setup();
    t.setTransfer({ map: "port_town" });
    const done = t.picker.pick(t.st, t.door, TRANSFER);
    expect(t.views.picks[0]).toMatchObject({ path: PORT_TOWN, returnTo: t.doc });
    t.views.end({ x: 20, y: 30 });
    expect(await done).toBe("picked");
    expect(t.transfer()).toMatchObject({ map: "port_town", x: 20, y: 30 });
  });

  it("취소(null)는 바꾸지 않고 그 커맨드로 초점만 보낸다. 같은 타일을 고르면 단계가 없다", async () => {
    const t = setup();
    const cancelled = t.picker.pick(t.st, t.door, TRANSFER);
    t.views.end(null);
    expect(await cancelled).toBe("cancelled");
    expect(t.transfer()).toMatchObject({ x: 10, y: 12 });
    expect(t.doc.undo.depth).toBe(0);
    expect(t.st.focusRequest?.location).toBe(`events[${t.door + 1}].commands[2]`);
    const same = t.picker.pick(t.st, t.door, TRANSFER);
    t.views.end({ x: 10, y: 12 });
    expect(await same).toBe("unchanged");
    expect(t.doc.undo.depth).toBe(0);
    expect(t.doc.dirty).toBe(false);
  });

  it("고르는 동안 원래 맵이 닫히면 바꾸지 않는다", async () => {
    const t = setup();
    const done = t.picker.pick(t.st, t.door, TRANSFER);
    t.h.documents.close(t.doc);
    t.views.end({ x: 1, y: 1 });
    expect(await done).toBe("closed");
    expect(t.transfer()).toMatchObject({ x: 10, y: 12 });
    expect(t.doc.undo.depth).toBe(0);
    expect(t.notified).toEqual([]);
  });

  it("고르는 동안 이벤트가 지워지거나 커맨드의 맵이 바뀌면 넣지 않고 알린다. 앞의 이벤트를 지워 번호만 바뀌면 넣는다", async () => {
    const t = setup();
    const removed = t.picker.pick(t.st, t.door, TRANSFER);
    t.st.run((ed) => ed.removeEvents([t.door]));
    t.views.end({ x: 1, y: 1 });
    expect(await removed).toBe("changed");
    expect(t.notified).toEqual(["선택하는 동안 이벤트나 커맨드가 변경되어 x, y를 입력하지 않았습니다"]);
    t.doc.undo.undo();
    const retarget = t.picker.pick(t.st, t.door, TRANSFER);
    t.st.run((ed) => ed.setArgs(t.door, TRANSFER, { map: "port_town" }));
    t.views.end({ x: 1, y: 1 });
    expect(await retarget).toBe("changed");
    t.doc.undo.undo();
    const shifted = t.picker.pick(t.st, t.door, TRANSFER);
    t.st.run((ed) => ed.removeEvents([0]));
    t.views.end({ x: 2, y: 5 });
    expect(await shifted).toBe("picked");
    expect(t.transfer()).toMatchObject({ x: 2, y: 5 });
    expect(t.st.selected).toEqual([t.st.section.indexOfId("inn_door")]);
  });

  it("막힌 고르기는 맵 뷰를 부르지 않고 이유를 알린다", async () => {
    const locked = setup({ lockPort: true });
    expect(await locked.picker.pick(locked.st, locked.door, TRANSFER)).toBe("blocked");
    expect(locked.views.picks).toEqual([]);
    expect(locked.notified[0]).toMatch(/^읽기 전용: /);
    const t = setup();
    t.setTransfer({ map: "forest" });
    expect(await t.picker.pick(t.st, t.door, TRANSFER)).toBe("blocked");
    expect(t.notified).toEqual(["rpg-game.json 에 등록되지 않은 맵: forest"]);
    expect(await t.picker.pick(t.st, t.door, { list: [], index: 0 })).toBe("blocked");
    expect(t.views.picks).toEqual([]);
  });
});

describe("대상 보기", () => {
  it("대상 맵과 x, y 타일을 넘긴다. x, y 가 없으면 부르지 않고 알린다", async () => {
    const t = setup();
    expect(await t.picker.reveal(t.st, t.door, TRANSFER)).toBe(true);
    expect(t.views.reveals).toEqual([[INN, { x: 10, y: 12 }]]);
    t.setTransfer({ x: undefined, y: undefined });
    expect(await t.picker.reveal(t.st, t.door, TRANSFER)).toBe(false);
    expect(t.notified).toEqual(["x, y 미지정"]);
    expect(t.views.reveals).toHaveLength(1);
  });

  it("잠긴 레이어에서도 대상 보기는 된다", async () => {
    const t = setup({ lockPort: true });
    expect(await t.picker.reveal(t.st, t.door, TRANSFER)).toBe(true);
    expect(t.views.reveals).toEqual([[INN, { x: 10, y: 12 }]]);
  });
});
