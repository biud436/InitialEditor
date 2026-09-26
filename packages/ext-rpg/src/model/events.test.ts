import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { UndoStack } from "@initial-editor/core";
import { parseMap, serializeMap } from "@initial-editor/ext-tilemap/model";
import { engineMapFiles, fixtureMap, fixtureSchema, HAS_ENGINE } from "../testing/fixtures";
import { canonicalCommand, canonicalEvent, EventsSection, fileArgValue, fixShapes, orderCommand, orderCondition, orderEvent, sameProjectFile } from "./events";
import { EventEditor, newCommand } from "./commands";
import { commandSpec, type EventSchema } from "./schema";
import { validateEvents } from "./validate";
import { walkCommands } from "./tree";
import { field, isPlainObject } from "./json";
import { REF_KEYS, WANDER_KEYS, AREA_KEYS } from "./events";

const schema = fixtureSchema();

/** 맵 파일 글을 섹션으로 읽고 다시 쓴다 (마일스톤 2 의 모델만의 길) */
function roundTrip(text: string): string {
  const map = parseMap(text);
  const section = new EventsSection(map.events ?? undefined, schema);
  const back = section.serialize();
  return serializeMap({ ...map, events: back === undefined ? null : (back as unknown[]) });
}

/** 스키마가 모르는 키가 있으면 그 자리를 돌려준다 (에디터가 여는 모든 이벤트가 폼으로 열린다) */
function unknownKeys(events: readonly unknown[], s: EventSchema): string[] {
  const out: string[] = [];
  const known = (o: unknown, keys: readonly string[], where: string) => {
    if (!isPlainObject(o)) return;
    for (const k of Object.keys(o)) if (!keys.includes(k)) out.push(`${where}.${k}`);
  };
  events.forEach((ev, i) => {
    const where = `events[${i + 1}]`;
    known(
      ev,
      s.fields.map((f) => f.name),
      where,
    );
    known(field(ev, "charset"), REF_KEYS, `${where}.charset`);
    known(field(ev, "wander"), WANDER_KEYS, `${where}.wander`);
    known(field(field(ev, "wander"), "area"), AREA_KEYS, `${where}.wander.area`);
    walkCommands(field(ev, "commands"), s, (cmd) => {
      const spec = commandSpec(s, cmd.code);
      if (!spec) {
        out.push(`${where}: code ${String(cmd.code)}`);
        return;
      }
      known(cmd, ["code", ...spec.args.map((a) => a.name), ...spec.lists.map((l) => l.name)], `${where}.${spec.code}`);
      for (const a of spec.args) {
        if (a.type === "face") known(cmd[a.name], REF_KEYS, `${where}.face`);
        if (a.type === "condition") known(cmd[a.name], s.conditions.flatMap((c) => c.args.map((x) => x.name)), `${where}.cond`);
      }
    });
  });
  return out;
}

describe("events 섹션 왕복", () => {
  it.each(["port_town", "inn"])("픽스처 %s: 읽고 쓰면 바이트가 같고, 이벤트가 전부 스키마로 읽힌다", (name) => {
    const { text, map } = fixtureMap(name);
    expect(roundTrip(text)).toBe(text);
    const events = map.events ?? [];
    expect(events.length).toBeGreaterThan(0);
    expect(validateEvents(events, { schema, map }).filter((p) => p.severity === "error")).toEqual([]);
    expect(unknownKeys(events, schema)).toEqual([]);
  });

  it.each(["port_town", "inn"])("픽스처 %s: 이전 도구가 쓴 키 순서가 에디터의 정해진 순서와 같다 (중첩 값까지)", (name) => {
    const events = fixtureMap(name).map.events ?? [];
    for (const ev of events) expect(JSON.stringify(canonicalEvent(ev, schema))).toBe(JSON.stringify(ev));
  });

  const engineMaps = engineMapFiles();
  it.skipIf(!HAS_ENGINE || engineMaps.length === 0)("엔진의 모든 맵: 읽고 쓰면 바이트가 같고, 이벤트가 전부 스키마로 읽힌다", () => {
    expect(engineMaps.length).toBeGreaterThanOrEqual(9);
    let events = 0;
    for (const file of engineMaps) {
      const text = readFileSync(file, "utf8");
      expect(roundTrip(text), path.basename(file)).toBe(text);
      const map = parseMap(text);
      const list = map.events ?? [];
      events += list.length;
      const errors = validateEvents(list, { schema, map }).filter((p) => p.severity === "error");
      expect(errors, path.basename(file)).toEqual([]);
      expect(unknownKeys(list, schema), path.basename(file)).toEqual([]);
      for (const ev of list) expect(JSON.stringify(canonicalEvent(ev, schema)), path.basename(file)).toBe(JSON.stringify(ev));
    }
    // 항구 마을 17개와 여관 6개 (이전 뒤)
    expect(events).toBeGreaterThanOrEqual(23);
  });

  it("events 키가 없는 맵은 그대로 없고, 이벤트를 더하면 생긴다", () => {
    const { text } = fixtureMap("port_town");
    const raw = JSON.parse(text);
    delete raw.events;
    const noEvents = serializeMap(parseMap(JSON.stringify(raw)));
    expect(roundTrip(noEvents)).toBe(noEvents);
    const section = new EventsSection(undefined, schema);
    expect(section.serialize()).toBeUndefined();
    const ed = new EventEditor(section, () => ({ schema, map: parseMap(noEvents) }));
    new UndoStack().push(ed.addEvent({ x: 16, y: 41 }));
    expect(section.serialize()).toEqual([{ id: "event_1", x: 16, y: 41, trigger: "action", commands: [] }]);
    const empty = new EventsSection([], schema);
    expect(empty.serialize()).toEqual([]);
  });

  it("배열이 아닌 events 는 편집을 막고 그대로 쓴다", () => {
    const section = new EventsSection({ a: 1 }, schema);
    expect(section.usable).toBe(false);
    expect(section.shapeError).toContain("배열이 아니다");
    expect(section.serialize()).toEqual({ a: 1 });
    expect(section.list).toEqual([]);
    const ed = new EventEditor(section, () => ({ schema, map: { width: 4, height: 4, collision: null } }));
    expect(() => ed.addEvent({ x: 0, y: 0 })).toThrow("배열이 아니다");
    // 빈 객체는 엔진에게 빈 배열이라 쓸 수 있고, 저장할 때 [] 로 쓴다
    const empty = new EventsSection({}, schema);
    expect(empty.usable).toBe(true);
    expect(empty.serialize()).toEqual([]);
  });

  it("다시 읽기(reset)와 id 찾기", () => {
    const section = new EventsSection([{ id: "a", x: 0, y: 0 }, null, { id: "b", x: 1, y: 0 }, { id: "a", x: 2, y: 0 }], schema);
    expect(section.indexOfId("a")).toBe(0);
    expect(section.indexOfId("b")).toBe(2);
    expect(section.indexOfId("zz")).toBe(-1);
    expect(section.ids()).toEqual(["a", "b", "a"]);
    expect(section.eventAt(1)).toBeUndefined();
    const before = section.revision;
    section.reset([{ id: "c", x: 0, y: 0 }]);
    expect(section.ids()).toEqual(["c"]);
    expect(section.revision).toBe(before + 1);
  });
});

describe("저장할 때 제 모양으로 (빈 {} 와 [] 규칙)", () => {
  it("배열 자리의 {} 는 [], 객체 자리의 [] 는 {} 로 쓰고, 손대지 않은 이벤트는 같은 객체다", () => {
    const untouched = { id: "u", x: 0, y: 0, commands: [{ code: "message", text: "a" }] };
    const list = [
      untouched,
      { id: "s", x: 1, y: 0, wander: [], commands: {} },
      { id: "t", x: 2, y: 0, charset: [], commands: [{ code: "if", cond: [], thenDo: {}, elseDo: [{ code: "message", text: "b", face: [] }] }, { code: "choice", options: {}, branches: [{}, []] }] },
      { id: "w", x: 3, y: 0, wander: { area: [] } },
      [],
    ];
    const fixed = fixShapes(list, schema);
    expect(fixed[0]).toBe(untouched);
    expect(fixed[1]).toEqual({ id: "s", x: 1, y: 0, wander: {}, commands: [] });
    expect(fixed[2]).toEqual({ id: "t", x: 2, y: 0, charset: {}, commands: [{ code: "if", cond: {}, thenDo: [], elseDo: [{ code: "message", text: "b", face: {} }] }, { code: "choice", options: [], branches: [[], []] }] });
    expect(fixed[3]).toEqual({ id: "w", x: 3, y: 0, wander: { area: {} } });
    expect(fixed[4]).toEqual({});
    // 키 자리는 그대로
    expect(Object.keys(fixed[1] as object)).toEqual(["id", "x", "y", "wander", "commands"]);
    const clean = [untouched];
    expect(fixShapes(clean, schema)).toBe(clean);
  });
});

describe("키 순서 (M2 2.6)", () => {
  it("고친 객체는 정해진 순서, 모르는 키는 뒤에 원래 순서대로", () => {
    expect(Object.keys(orderEvent({ commands: [], zeta: 1, trigger: "touch", id: "a", alpha: 2, y: 1, x: 0 }, schema))).toEqual(["id", "x", "y", "trigger", "commands", "zeta", "alpha"]);
    expect(Object.keys(orderCommand({ text: "t", extra: 1, face: {}, code: "message", name: "n" }, schema))).toEqual(["code", "text", "name", "face", "extra"]);
    expect(Object.keys(orderCommand({ branches: [], cancel: 1, options: ["a"], code: "choice" }, schema))).toEqual(["code", "options", "cancel", "branches"]);
    expect(Object.keys(orderCommand({ elseDo: [], thenDo: [], cond: {}, code: "if" }, schema))).toEqual(["code", "cond", "thenDo", "elseDo"]);
    // 모르는 code 는 그대로
    expect(Object.keys(orderCommand({ b: 1, code: "zzz", a: 2 }, schema))).toEqual(["b", "code", "a"]);
    expect(Object.keys(orderCondition({ value: 2, op: ">=", item: "shell" }, schema))).toEqual(["item", "op", "value"]);
    expect(Object.keys(orderCondition({ equals: false, flag: "f" }, schema))).toEqual(["flag", "equals"]);
    // 꼴이 둘이면 판정하는 꼴(item)의 인자가 앞이고 나머지는 원래 순서로 뒤
    expect(Object.keys(orderCondition({ flag: "f", value: 1, item: "i" }, schema))).toEqual(["item", "value", "flag"]);
  });

  it("새 이벤트와 새 커맨드는 중첩 값까지 정해진 순서다", () => {
    const ev = canonicalEvent(
      {
        commands: [{ face: { index: 1, set: "npc" }, text: "a", code: "message" }, { elseDo: [{ text: "b", code: "message" }], cond: { value: 1, item: "shell" }, code: "if" }],
        wander: { area: { h: 2, w: 2, y: 0, x: 0 }, maxWait: 60, minWait: 30 },
        charset: { index: 2, set: "npc" },
        y: 1,
        x: 0,
        id: "a",
      },
      schema,
    );
    expect(JSON.stringify(ev)).toBe(
      JSON.stringify({
        id: "a",
        x: 0,
        y: 1,
        charset: { set: "npc", index: 2 },
        wander: { minWait: 30, maxWait: 60, area: { x: 0, y: 0, w: 2, h: 2 } },
        commands: [
          { code: "message", text: "a", face: { set: "npc", index: 1 } },
          { code: "if", cond: { item: "shell", value: 1 }, elseDo: [{ code: "message", text: "b" }] },
        ],
      }),
    );
    const choice = canonicalCommand({ branches: [[{ key: "k", code: "setFlag" }], []], options: ["a", "b"], code: "choice" }, schema);
    expect(JSON.stringify(choice)).toBe('{"code":"choice","options":["a","b"],"branches":[[{"code":"setFlag","key":"k"}],[]]}');
  });

  it("파일 인자는 ./resources/... 꼴로 쓰고 두 꼴을 같은 파일로 본다", () => {
    expect(fileArgValue("resources/audio/door.wav")).toBe("./resources/audio/door.wav");
    expect(fileArgValue("./resources/audio/door.wav")).toBe("./resources/audio/door.wav");
    expect(fileArgValue("resources\\audio\\door.wav")).toBe("./resources/audio/door.wav");
    expect(sameProjectFile("./resources/a.png", "resources/a.png")).toBe(true);
    expect(sameProjectFile("./resources/a.png", "resources/b.png")).toBe(false);
  });
});

describe("대사 글 왕복 (줄바꿈, 따옴표, 한글)", () => {
  it("에디터가 적은 대사가 저장과 다시 읽기에서 그대로다", () => {
    const { text, map } = fixtureMap("port_town");
    const section = new EventsSection(map.events!, schema);
    const ed = new EventEditor(section, () => ({ schema, map }));
    const stack = new UndoStack();
    const line = '첫 줄\n"따옴표" 와 \'홑따옴표\'\t탭, 역슬래시 \\ 끝\r\n둘째 줄 🙂';
    stack.push(ed.addEvent({ x: 16, y: 41 }));
    const i = section.list.length - 1;
    stack.push(ed.insertCommands(i, [], 0, [newCommand(schema, "message", { text: line, name: "표지판 \"주인\"" })]));
    stack.push(ed.insertCommands(i, [], 1, [newCommand(schema, "choice", { options: ["예 \"네\"", "아니요\n줄"] })]));
    const saved = serializeMap({ ...map, events: section.serialize() as unknown[] });
    expect(saved).toContain('"text": "첫 줄\\n\\"따옴표\\" 와 \'홑따옴표\'\\t탭, 역슬래시 \\\\ 끝\\r\\n둘째 줄 🙂"');
    const back = parseMap(saved).events!;
    const ev = back[back.length - 1] as { commands: Array<Record<string, unknown>> };
    expect(ev.commands[0].text).toBe(line);
    expect(ev.commands[0].name).toBe('표지판 "주인"');
    expect(ev.commands[1].options).toEqual(['예 "네"', "아니요\n줄"]);
    // 다시 읽어 다시 쓰면 바이트가 같다
    expect(roundTrip(saved)).toBe(saved);
    // 원래 이벤트의 줄은 한 줄도 바뀌지 않았다: 새 이벤트 앞까지 같다
    const cut = text.lastIndexOf("\n    }\n  ]");
    expect(saved.slice(0, cut)).toBe(text.slice(0, cut));
  });
});
