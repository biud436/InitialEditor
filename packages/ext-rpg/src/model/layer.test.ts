// 이벤트 레이어의 상태와 붙이기 규칙 (e5 문서 2.2, 3절). 앱과 같은 길로 붙인다: 타일맵 자리에 등록하고 맵 문서를 연다.
// 진짜 픽스처(port_town.json 과 두 스키마)로 본다: 붙는 맵과 힌트, 늦게 오는 스키마, 잠금(버전, 사라짐, 등록 빠짐, RTP 쌍둥이),
// 바이트 왕복, 되돌리기의 정확함, 문제, 크기 바꾸기, 다시 읽기.
import { describe, expect, it } from "vitest";
import { parseMap, serializeMap } from "@initial-editor/ext-tilemap/model";
import { fixtureText } from "../testing/fixtures";
import { fixtureSources, INN, layerHarness, MEADOW, PORT_TOWN, stateOf, VILLAGE } from "../testing/layerHarness";
import { field } from "./json";
import { EVENTS_LAYER_ID, eventsStateOf } from "./layer";
import { parseEventSchema, schemaLockReason, EventSchemaVersionError } from "./schema";

const PORT_TEXT = fixtureText("resources/maps/port_town.json");
const VERSION_LOCK = schemaLockReason(new EventSchemaVersionError(2))!;

function idAt(list: readonly unknown[], i: number): unknown {
  return field(list[i], "id");
}

/** 두 글에서 다른 줄 */
function changedLines(a: string, b: string): Array<[string, string]> {
  const x = a.split("\n");
  const y = b.split("\n");
  const out: Array<[string, string]> = [];
  for (let i = 0; i < Math.max(x.length, y.length); i++) if (x[i] !== y[i]) out.push([x[i], y[i]]);
  return out;
}

describe("붙는 맵", () => {
  it("rpg-game.json 에 등록된 항구 마을에 붙고 이벤트 17개를 잠금 없이 든다", () => {
    const h = layerHarness();
    const doc = h.open(PORT_TOWN);
    const st = stateOf(doc);
    expect(st.section.list).toHaveLength(17);
    expect(st.locked).toBeNull();
    expect(st.match?.entry.name).toBe("port_town");
    expect(doc.layerIds).toEqual([EVENTS_LAYER_ID]);
  });

  it("열고 그대로 쓰면 바이트가 같다 (doc.text 가 상태의 serialize 를 쓴다)", () => {
    const doc = layerHarness().open(PORT_TOWN);
    expect(doc.text()).toBe(PORT_TEXT);
  });

  it("등록되지 않은 맵은 null 이고, 스키마가 있는 프로젝트면 힌트 한 줄", () => {
    const h = layerHarness();
    const doc = h.open(MEADOW);
    expect(eventsStateOf(doc)).toBeNull();
    expect(h.spec.hint?.(doc)).toBe("이벤트 레이어 없음 (rpg-game.json 에 등록된 맵에만 있음)");
  });

  it("스키마 파일이 없는 프로젝트(플래피)는 붙지 않고 힌트도 없다", () => {
    const h = layerHarness({ sources: fixtureSources({ schema: null, schemaPresent: false }) });
    const doc = h.open(PORT_TOWN);
    expect(eventsStateOf(doc)).toBeNull();
    expect(h.spec.hint?.(doc)).toBeUndefined();
  });

  it("rpg-game.json 을 읽지 못하면 붙지 않고 이유를 힌트로 보인다", () => {
    const h = layerHarness({ sources: fixtureSources({ game: null, gameProblem: "파일 없음" }) });
    const doc = h.open(PORT_TOWN);
    expect(eventsStateOf(doc)).toBeNull();
    expect(h.spec.hint?.(doc)).toBe("rpg-game.json 읽기 실패: 이벤트 레이어 없음 (파일 없음)");
  });

  it("alt 가 있는 항목의 맵(RTP 쌍둥이)은 읽기 전용이고 편집이 거절된다", () => {
    const h = layerHarness();
    const doc = h.open(VILLAGE);
    const st = stateOf(doc);
    expect(st.locked).toBe("alt 로 등록된 맵 (RTP 버전과 기본 버전 두 파일): 이벤트를 두 파일에 따로 저장해야 하므로 편집 불가. Lua 정의 파일에서 편집");
    const r = st.run((ed) => ed.addEvent({ x: 1, y: 1 }));
    expect(r).toEqual({ ok: false, reason: st.locked });
    expect(doc.undo.depth).toBe(0);
    expect(doc.dirty).toBe(false);
  });
});

describe("스키마가 늦게 오거나 바뀔 때 (refreshLayer)", () => {
  it("문서가 먼저 열리고 스키마가 나중에 오면 레이어가 생긴다", () => {
    const sources = fixtureSources({ schema: null, schemaPresent: false, game: null });
    const h = layerHarness({ sources });
    const doc = h.open(PORT_TOWN);
    expect(eventsStateOf(doc)).toBeNull();
    // 스키마 파일은 있는데 아직 읽는 중: 힌트 없이 기다린다
    sources.set({ schemaPresent: true });
    h.contrib.refreshLayer(EVENTS_LAYER_ID);
    expect(eventsStateOf(doc)).toBeNull();
    const fresh = fixtureSources();
    sources.set({ schema: fresh.schema, game: fresh.game });
    h.contrib.refreshLayer(EVENTS_LAYER_ID);
    expect(stateOf(doc).section.list).toHaveLength(17);
  });

  it("스키마 버전이 바뀌면 잠기고, 되돌아오면 풀린다 (상태는 그대로)", () => {
    const sources = fixtureSources();
    const h = layerHarness({ sources });
    const doc = h.open(PORT_TOWN);
    const st = stateOf(doc);
    sources.set({ schema: null, schemaProblem: VERSION_LOCK });
    h.contrib.refreshLayer(EVENTS_LAYER_ID);
    expect(stateOf(doc)).toBe(st);
    expect(st.locked).toBe(VERSION_LOCK);
    expect(st.run((ed) => ed.moveEvents([0], 0, 1)).ok).toBe(false);
    expect(doc.text()).toBe(PORT_TEXT);
    sources.set({ schema: fixtureSources().schema, schemaProblem: null });
    h.contrib.refreshLayer(EVENTS_LAYER_ID);
    expect(st.locked).toBeNull();
  });

  it("스키마 파일이 지워지면 편집 중인 값을 잃지 않고 잠긴다 (저장과 되돌리기는 된다)", () => {
    const sources = fixtureSources();
    const h = layerHarness({ sources });
    const doc = h.open(PORT_TOWN);
    const st = stateOf(doc);
    expect(st.run((ed) => ed.moveEvents([0], 0, 1)).ok).toBe(true);
    const edited = doc.text();
    expect(edited).not.toBe(PORT_TEXT);
    sources.set({ schema: null, schemaPresent: false });
    h.contrib.refreshLayer(EVENTS_LAYER_ID);
    expect(stateOf(doc)).toBe(st);
    expect(st.locked).toBe("event-commands.json 없음: 이벤트 편집 불가 (파일을 복원하면 해제)");
    expect(doc.text()).toBe(edited);
    doc.undo.undo();
    expect(doc.text()).toBe(PORT_TEXT);
  });

  it("맵이 rpg-game.json 에서 빠지면 떼지 않고 잠근다", () => {
    const sources = fixtureSources();
    const h = layerHarness({ sources });
    const doc = h.open(PORT_TOWN);
    const st = stateOf(doc);
    const game = sources.game!;
    sources.set({ game: { ...game, maps: game.maps.filter((m) => m.name !== "port_town") } });
    h.contrib.refreshLayer(EVENTS_LAYER_ID);
    expect(stateOf(doc)).toBe(st);
    expect(st.locked).toBe("rpg-game.json 에 이 맵의 등록 없음: 이벤트 편집 불가 (등록을 복원하면 해제)");
  });

  it("처음부터 모르는 버전이면 스키마 없이 붙어 잠기고, 원본을 그대로 쓴다 (제 모양 고치기도 하지 않는다)", () => {
    const h = layerHarness({ sources: fixtureSources({ schema: null, schemaProblem: VERSION_LOCK }) });
    const doc = h.open(PORT_TOWN);
    const st = stateOf(doc);
    expect(st.schema).toBeNull();
    expect(st.locked).toBe(VERSION_LOCK);
    expect(st.section.list).toHaveLength(17);
    expect(st.problems()).toEqual([]);
    expect(doc.text()).toBe(PORT_TEXT);
    // 빈 {} 커맨드 목록: 스키마가 있으면 [] 로 고쳐 쓰지만, 모르는 버전에서는 원본 그대로
    const data = parseMap(PORT_TEXT);
    const raw = serializeMap({ ...data, events: [...(data.events ?? []).slice(0, 2), { id: "odd", x: 1, y: 1, commands: {} }] });
    const odd = layerHarness({ sources: fixtureSources({ schema: null, schemaProblem: VERSION_LOCK }) }).open(PORT_TOWN, raw);
    expect(odd.text()).toBe(raw);
    expect(layerHarness().open(PORT_TOWN, raw).text()).not.toBe(raw);
  });

  it("스키마를 새로 읽으면 섹션도 새 스키마로 쓴다", () => {
    const sources = fixtureSources();
    const h = layerHarness({ sources });
    const st = stateOf(h.open(PORT_TOWN));
    const next = parseEventSchema(fixtureText("resources/schema/event-commands.json"));
    sources.set({ schema: next });
    h.contrib.refreshLayer(EVENTS_LAYER_ID);
    expect(st.schema).toBe(next);
  });
});

describe("편집과 되돌리기", () => {
  it("이벤트 하나를 옮기면 diff 는 그 이벤트의 x, y 줄뿐이고, 되돌리면 바이트까지 같다", () => {
    const doc = layerHarness().open(PORT_TOWN);
    const st = stateOf(doc);
    const i = st.section.indexOfId("bench");
    const r = st.run((ed) => ed.moveEvents([i], -1, 1), { select: true });
    expect(r.ok).toBe(true);
    expect(st.selected).toEqual([i]);
    const moved = doc.text();
    expect(changedLines(PORT_TEXT, moved)).toEqual([
      ['      "x": 19,', '      "x": 18,'],
      ['      "y": 34,', '      "y": 35,'],
    ]);
    expect(doc.undo.depth).toBe(1);
    doc.undo.undo();
    expect(doc.text()).toBe(PORT_TEXT);
    doc.undo.redo();
    expect(doc.text()).toBe(moved);
  });

  it("손대지 않은 이벤트의 2^53 을 넘는 정수는 다른 이벤트를 옮겨 저장해도 그대로다", () => {
    // mapfile.py 형식의 항구 마을에서 crates 에 data 를 더한다 (엔진은 64비트 정수로 읽는다)
    const text = PORT_TEXT.replace('"id": "crates",', '"id": "crates",\n      "data": {\n        "seed": 12345678901234567890\n      },');
    expect(text).not.toBe(PORT_TEXT);
    const doc = layerHarness().open(PORT_TOWN, text);
    expect(doc.text()).toBe(text);
    const st = stateOf(doc);
    st.run((ed) => ed.moveEvents([st.section.indexOfId("bench")], -1, 0));
    expect(changedLines(text, doc.text())).toEqual([['      "x": 19,', '      "x": 18,']]);
  });

  it("배회하는 이벤트를 옮기면 구역도 같은 명령으로 옮겨진다 (keepArea 면 구역은 둔다)", () => {
    const doc = layerHarness().open(PORT_TOWN);
    const st = stateOf(doc);
    const kid = st.section.indexOfId("kid");
    st.run((ed) => ed.moveEvents([kid], 1, 0));
    expect(field(field(st.section.list[kid], "wander"), "area")).toEqual({ x: 14, y: 19, w: 6, h: 6 });
    st.run((ed) => ed.moveEvents([kid], 1, 0, { keepArea: true }));
    expect(field(field(st.section.list[kid], "wander"), "area")).toEqual({ x: 14, y: 19, w: 6, h: 6 });
    expect(field(st.section.list[kid], "x")).toBe(16);
    expect(doc.undo.depth).toBe(2);
  });

  it("같은 칸의 action 이벤트는 거절되고 문서는 그대로다", () => {
    const doc = layerHarness().open(PORT_TOWN);
    const st = stateOf(doc);
    const r = st.run((ed) => ed.addEvent({ x: 16, y: 44 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/같은 타일\(16,44\)의 action/);
    expect(doc.undo.depth).toBe(0);
    expect(st.canRun((ed) => ed.addEvent({ x: 16, y: 44 }))).toBe(false);
    expect(st.canRun((ed) => ed.addEvent({ x: 2, y: 44 }))).toBe(true);
    expect(doc.undo.depth).toBe(0);
  });

  it("앞의 이벤트를 지우고 되돌려도 고른 것은 같은 이벤트다 (번호가 아니라 이벤트를 고른다)", () => {
    const doc = layerHarness().open(PORT_TOWN);
    const st = stateOf(doc);
    const notice = st.section.indexOfId("notice");
    const kidBefore = st.section.indexOfId("kid");
    expect(notice).toBeLessThan(kidBefore);
    st.run((ed) => ed.removeEvents([notice]));
    const kid = st.section.indexOfId("kid");
    st.select([kid]);
    doc.undo.undo();
    expect(st.section.indexOfId("kid")).toBe(kidBefore);
    expect(st.selected).toEqual([kidBefore]);
    expect(idAt(st.section.list, st.primary!)).toBe("kid");
    // 옮기기(새 객체)와 그 되돌리기, 다시 실행을 지나도 같은 이벤트다
    st.run((ed) => ed.moveEvents([kidBefore], 1, 0));
    doc.undo.undo();
    doc.undo.redo();
    expect(idAt(st.section.list, st.primary!)).toBe("kid");
    // 지운 이벤트를 고른 채 되돌리면 그 이벤트가 다시 골라진다
    st.select([notice]);
    st.run((ed) => ed.removeEvents([notice]));
    expect(st.selected).toEqual([]);
    doc.undo.undo();
    expect(st.selected.map((i) => idAt(st.section.list, i))).toEqual(["notice"]);
  });

  it("고른 번호는 목록 밖으로 나가면 보지 않는다", () => {
    const doc = layerHarness().open(PORT_TOWN);
    const st = stateOf(doc);
    const r = st.run((ed) => ed.addEvent({ x: 2, y: 44 }), { select: true });
    expect(r.ok && st.selected).toEqual([17]);
    expect(st.primary).toBe(17);
    doc.undo.undo();
    expect(st.selected).toEqual([]);
    doc.undo.redo();
    expect(st.selected).toEqual([17]);
  });
});

describe("문제", () => {
  it("항구 마을은 오류가 없고, auto 의 정보는 레이어의 문제가 아니라 이벤트 문제에만 있다", () => {
    const doc = layerHarness().open(PORT_TOWN);
    const st = stateOf(doc);
    expect(st.problems().filter((p) => p.severity === "error")).toEqual([]);
    const arrival = st.section.indexOfId("arrival");
    expect(st.problemsOf(arrival).some((p) => p.severity === "info" && p.location === `events[${arrival + 1}].trigger`)).toBe(true);
    expect(st.problems().some((p) => (p.severity as string) === "info")).toBe(false);
    expect(doc.layerErrors()).toEqual([]);
  });

  it("밖에서 고친 틀린 이벤트는 오류로 보이고 문서의 layerErrors 가 저장 전 질문에 쓴다", () => {
    const data = JSON.parse(PORT_TEXT) as { events: Array<Record<string, unknown>> };
    data.events[0] = { ...data.events[0], charset: { set: "npc", index: 9 } };
    data.events[1] = { ...data.events[1], x: 99 };
    const doc = layerHarness().open(PORT_TOWN, JSON.stringify(data));
    const errors = doc.layerErrors();
    expect(errors.map((p) => p.location).sort()).toEqual(["events[1].charset.index", "events[2].x"]);
    expect(errors.every((p) => p.layer === EVENTS_LAYER_ID)).toBe(true);
  });

  it("아이템 표에 없는 id 와 없는 파일은 경고, 정의 파일의 같은 id 도 경고", () => {
    const sources = fixtureSources({ files: new Set(["resources/charsets/placeholder.png"]), defs: new Map([["scripts/lua/maps/port_town.lua", new Set(["captain"])]]) });
    const doc = layerHarness({ sources }).open(PORT_TOWN);
    const st = stateOf(doc);
    const captain = st.section.indexOfId("captain");
    const warnings = st.problems().filter((p) => p.severity === "warning");
    expect(warnings.some((p) => p.location === `events[${captain + 1}].id` && p.message.includes("게임에서는 Lua 정의가 우선"))).toBe(true);
    expect(warnings.some((p) => p.message.includes("프로젝트에 없는 파일"))).toBe(true);
    // 파일 목록을 모르면 없는 파일 경고를 내지 않는다
    sources.set({ files: null });
    expect(st.problems().some((p) => p.message.includes("프로젝트에 없는 파일"))).toBe(false);
  });
});

describe("크기 바꾸기와 다시 읽기", () => {
  it("크기 바꾸기가 이벤트와 배회 구역을 같은 한 단계로 옮기고, 되돌리면 바이트까지 같다", () => {
    const doc = layerHarness().open(PORT_TOWN);
    const st = stateOf(doc);
    const kid = st.section.indexOfId("kid");
    doc.apply(doc.resizeCommand(doc.model.width + 2, doc.model.height + 1, "bottom-right"));
    expect(doc.undo.depth).toBe(1);
    expect([field(st.section.list[kid], "x"), field(st.section.list[kid], "y")]).toEqual([16, 21]);
    expect(field(field(st.section.list[kid], "wander"), "area")).toEqual({ x: 15, y: 20, w: 6, h: 6 });
    doc.undo.undo();
    expect(doc.text()).toBe(PORT_TEXT);
  });

  it("크기를 바꾼 뒤에 붙은 상태도 되돌리면 정확히 돌아간다 (원본과 같은 옮기기 함수)", () => {
    const sources = fixtureSources({ schema: null, schemaPresent: false });
    const h = layerHarness({ sources });
    const doc = h.open(PORT_TOWN);
    doc.apply(doc.resizeCommand(doc.model.width + 3, doc.model.height, "right"));
    sources.set({ schema: fixtureSources().schema, schemaPresent: true });
    h.contrib.refreshLayer(EVENTS_LAYER_ID);
    const st = stateOf(doc);
    const kid = st.section.indexOfId("kid");
    expect(field(field(st.section.list[kid], "wander"), "area")).toEqual({ x: 16, y: 19, w: 6, h: 6 });
    doc.undo.undo();
    expect(doc.text()).toBe(PORT_TEXT);
  });

  it("모르는 스키마 버전으로 잠겨 붙은 맵도 크기를 바꾸면 이벤트가 타일과 함께 옮겨져 저장되고, 되돌리면 바이트까지 같다", () => {
    const sources = fixtureSources({ schema: null, schemaProblem: VERSION_LOCK });
    const h = layerHarness({ sources });
    const doc = h.open(INN);
    const st = stateOf(doc);
    expect([st.schema, st.locked]).toEqual([null, VERSION_LOCK]);
    const innText = doc.text();
    const before = parseMap(innText).events ?? [];
    doc.apply(doc.resizeCommand(doc.model.width + 1, doc.model.height + 1, "bottom-right"));
    const saved = parseMap(doc.text());
    // 저장할 글(doc.text)이 옮긴 칸을 싣는다: 타일은 +1,+1 로 옮겨졌는데 이벤트만 옛 칸에 남으면 안 된다
    expect((saved.events ?? []).map((e) => [field(e, "id"), field(e, "x"), field(e, "y")])).toEqual(before.map((e) => [field(e, "id"), (field(e, "x") as number) + 1, (field(e, "y") as number) + 1]));
    expect(st.section.list.map((e) => field(e, "x"))).toEqual(before.map((e) => (field(e, "x") as number) + 1));
    // 스키마가 돌아와도 같은 글이다 (원본과 섹션이 어긋나지 않는다)
    const shifted = doc.text();
    sources.set({ schema: fixtureSources().schema, schemaProblem: null });
    h.contrib.refreshLayer(EVENTS_LAYER_ID);
    expect(st.locked).toBeNull();
    expect(doc.text()).toBe(shifted);
    doc.undo.undo();
    expect(doc.text()).toBe(innText);
  });

  it("파일을 다시 읽으면 reset: 새 이벤트, 고르기와 되돌리기가 비워진다", async () => {
    const h = layerHarness();
    const doc = h.open(PORT_TOWN);
    const st = stateOf(doc);
    st.select([0, 1]);
    st.run((ed) => ed.moveEvents([0], 0, 1));
    const data = parseMap(PORT_TEXT);
    await h.backend.writeText(PORT_TOWN, serializeMap({ ...data, events: (data.events ?? []).slice(0, 3) }));
    await doc.reload();
    expect(stateOf(doc)).toBe(st);
    expect(st.section.list).toHaveLength(3);
    expect(idAt(st.section.list, 0)).toBe("crates");
    expect(st.selected).toEqual([]);
    expect(doc.undo.depth).toBe(0);
  });

  it("여관도 붙고 이벤트 6개를 든다", () => {
    const st = stateOf(layerHarness().open(INN));
    expect(st.section.list).toHaveLength(6);
    expect(st.locked).toBeNull();
  });
});
