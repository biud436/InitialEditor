import { describe, expect, it } from "vitest";
import { UndoStack } from "@initial-editor/core";
import { fixtureMap, fixtureSchema } from "../testing/fixtures";
import { EditRefused, EventEditor, EventListCommand, newCommand, uniqueEventId, type EditContext } from "./commands";
import { EventsSection } from "./events";
import { getList, type CommandPath } from "./tree";
import { bigIntValue } from "@initial-editor/ext-tilemap/model";
import { field } from "./json";
import type { MapGeometry } from "./validate";

const schema = fixtureSchema();

/** 10x8 맵, (4,3) 은 막힌 칸 */
const MAP: MapGeometry = { width: 10, height: 8, collision: Array.from({ length: 80 }, (_, i) => (i === 3 * 10 + 4 ? 1 : 0)) };

function setup(events: unknown[] = [], extra: Partial<EditContext> = {}) {
  const section = new EventsSection(events, schema);
  const ctx: EditContext = { schema, map: MAP, ...extra };
  const ed = new EventEditor(section, () => ctx);
  const stack = new UndoStack();
  return { section, ed, stack, ctx };
}

const ev = (id: string, x: number, y: number, more: Record<string, unknown> = {}) => ({ id, x, y, ...more });
const at = (section: EventsSection, i: number) => section.list[i] as Record<string, unknown>;

describe("이벤트 추가, 지우기, 붙여넣기", () => {
  it("새 이벤트: 겹치지 않는 event_N, action, 커맨드 없음. 되돌리면 사라진다", () => {
    const { section, ed, stack } = setup([ev("event_1", 0, 0)]);
    const cmd = ed.addEvent({ x: 2, y: 1 });
    expect(cmd.focus).toEqual([1]);
    stack.push(cmd);
    expect(section.list[1]).toEqual({ id: "event_2", x: 2, y: 1, trigger: "action", commands: [] });
    expect(Object.keys(at(section, 1))).toEqual(["id", "x", "y", "trigger", "commands"]);
    stack.undo();
    expect(section.list).toHaveLength(1);
    stack.redo();
    expect(section.list).toHaveLength(2);
    expect(uniqueEventId([{ id: "event_1" }, { id: "event_3" }])).toBe("event_2");
  });

  it("지우기와 되돌리기 (손대지 않은 이벤트는 같은 객체)", () => {
    const a = ev("a", 0, 0);
    const { section, ed, stack } = setup([a, ev("b", 1, 0), ev("c", 2, 0)]);
    stack.push(ed.removeEvents([0, 2]));
    expect(section.ids()).toEqual(["b"]);
    stack.undo();
    expect(section.ids()).toEqual(["a", "b", "c"]);
    expect(section.list[0]).toBe(a);
    expect(() => ed.removeEvents([7])).toThrow(EditRefused);
  });

  it("붙여넣기: 첫 이벤트가 그 칸에, 나머지는 거리를 지키고, id 는 겹치지 않게, 배회 구역도 함께", () => {
    const { section, ed, stack } = setup([ev("npc", 1, 1, { charset: { set: "npc", index: 0 }, wander: { area: { x: 0, y: 0, w: 3, h: 3 } } }), ev("sign", 2, 1)]);
    const copied = ed.copyEvents([1, 0]);
    expect(copied.map((e) => field(e, "id"))).toEqual(["npc", "sign"]);
    stack.push(ed.pasteEvents(copied, { x: 5, y: 4 }));
    expect(section.ids()).toEqual(["npc", "sign", "npc_2", "sign_2"]);
    expect(at(section, 2)).toMatchObject({ x: 5, y: 4, wander: { area: { x: 4, y: 3, w: 3, h: 3 } } });
    expect(at(section, 3)).toMatchObject({ x: 6, y: 4 });
    // 원본은 그대로
    expect(at(section, 0)).toMatchObject({ x: 1, y: 1, wander: { area: { x: 0, y: 0 } } });
    expect(() => ed.pasteEvents([], { x: 0, y: 0 })).toThrow(EditRefused);
    // 맵 밖에 붙이거나 구역이 음수가 되면 거절한다
    expect(() => ed.pasteEvents([ev("s", 0, 0)], { x: 10, y: 0 })).toThrow(/맵 범위 밖/);
    expect(() => ed.pasteEvents(copied, { x: 9, y: 0 })).toThrow(/wander\.area\.y/);
  });

  it("붙여넣기: 2^53을 넘는 정수 id(표식 글)는 글이 아니라 새 event_N 이 된다 (표식 글에 _2 를 붙이지 않는다)", () => {
    const big = bigIntValue("12345678901234567890");
    const { section, ed, stack } = setup([ev("event_1", 0, 0), { id: big, x: 1, y: 0 }]);
    stack.push(ed.pasteEvents([{ id: big, x: 1, y: 0 }], { x: 3, y: 3 }));
    expect(section.ids()).toEqual(["event_1", "event_2"]);
    expect(JSON.stringify(section.list)).not.toMatch(/INT:[^"]*_/);
  });
});

describe("옮기기와 합치기", () => {
  it("한 번의 끌기(같은 mergeKey)는 되돌리기 한 단계, 배회 구역도 같은 만큼 옮긴다", () => {
    const { section, ed, stack } = setup([ev("npc", 2, 2, { charset: { set: "npc", index: 0 }, wander: { minWait: 30, area: { x: 1, y: 1, w: 3, h: 3 } } })]);
    stack.push(ed.moveEvents([0], 1, 0, { mergeKey: "drag-1" }));
    stack.push(ed.moveEvents([0], 1, 0, { mergeKey: "drag-1" }));
    stack.push(ed.moveEvents([0], 0, 1, { mergeKey: "drag-1" }));
    expect(stack.depth).toBe(1);
    expect(at(section, 0)).toMatchObject({ x: 4, y: 3, wander: { area: { x: 3, y: 2, w: 3, h: 3 } } });
    // 다른 끌기는 따로
    stack.push(ed.moveEvents([0], -1, 0, { mergeKey: "drag-2" }));
    expect(stack.depth).toBe(2);
    stack.undo();
    stack.undo();
    expect(at(section, 0)).toMatchObject({ x: 2, y: 2, wander: { area: { x: 1, y: 1 } } });
    // 방향키(합치기 키 없음)는 한 칸이 한 단계
    stack.push(ed.moveEvents([0], 0, 1));
    stack.push(ed.moveEvents([0], 0, 1));
    expect(stack.depth).toBe(2);
  });

  it("keepArea 면 구역은 두고 이벤트만", () => {
    const { section, ed, stack } = setup([ev("npc", 2, 2, { charset: { set: "npc", index: 0 }, wander: { area: { x: 1, y: 1, w: 3, h: 3 } } })]);
    stack.push(ed.moveEvents([0], 1, 0, { keepArea: true }));
    expect(at(section, 0)).toMatchObject({ x: 3, wander: { area: { x: 1, y: 1 } } });
  });

  it("막는 것: 맵 밖, 같은 칸의 action 과 touch, 구역이 음수로", () => {
    const { section, ed } = setup([ev("a", 0, 0), ev("b", 2, 0), ev("t1", 5, 5, { trigger: "touch" }), ev("t2", 6, 5, { trigger: "touch" }), ev("auto", 3, 3, { trigger: "auto" }), ev("w", 1, 6, { charset: { set: "npc", index: 0 }, wander: { area: { x: 0, y: 5, w: 2, h: 2 } } })]);
    expect(() => ed.moveEvents([0], -1, 0)).toThrow(/0 이상의 정수여야 함/);
    expect(() => ed.moveEvents([1], 8, 0)).toThrow(/맵 범위 밖/);
    expect(() => ed.moveEvents([0], 2, 0)).toThrow(/같은 타일/);
    expect(() => ed.moveEvents([3], -1, 0)).toThrow(/같은 타일\(5,5\)의 touch/);
    expect(() => ed.moveEvents([5], -1, 0)).toThrow(/wander\.area\.x/);
    // auto 는 같은 칸이어도 되고, action 과 touch 도 서로는 된다
    expect(() => ed.moveEvents([4], -3, -3)).not.toThrow();
    expect(() => ed.moveEvents([2], -5, -5)).not.toThrow();
    // 여럿을 함께 옮기면 옮긴 뒤의 자리로 본다 (a 와 b 가 같이 오른쪽으로)
    expect(() => ed.moveEvents([0, 1], 2, 0)).not.toThrow();
    expect(() => ed.moveEvents([0], 0.5, 0)).toThrow(/타일 단위로만 이동할 수 있습니다/);
    expect(section.ids()).toHaveLength(6);
  });
});

describe("칸 바꾸기, 이름 바꾸기", () => {
  it("타이핑 한 초점(같은 mergeKey)은 한 단계, 외형은 정해진 키 순서로", () => {
    const { section, ed, stack } = setup([ev("a", 0, 0)]);
    stack.push(ed.setField(0, "speed", 2, { mergeKey: "focus-1" }));
    stack.push(ed.setField(0, "speed", 2.5, { mergeKey: "focus-1" }));
    expect(stack.depth).toBe(1);
    expect(at(section, 0).speed).toBe(2.5);
    stack.push(ed.setField(0, "charset", { index: 3, set: "npc" }));
    expect(Object.keys(at(section, 0))).toEqual(["id", "x", "y", "charset", "speed"]);
    expect(Object.keys(at(section, 0).charset as object)).toEqual(["set", "index"]);
    stack.push(ed.setField(0, "charset", undefined));
    expect(at(section, 0).charset).toBeUndefined();
    stack.undo();
    stack.undo();
    stack.undo();
    expect(section.list[0]).toEqual(ev("a", 0, 0));
  });

  it("막는 것: 범위 밖 외형 번호, 모르는 방향과 트리거, 속도 0, 칸 지우기, commands", () => {
    const { ed } = setup([ev("a", 0, 0), ev("b", 1, 1, { trigger: "touch" })]);
    expect(() => ed.setField(0, "charset", { set: "npc", index: 8 })).toThrow(/charset\.index/);
    expect(() => ed.setField(0, "charset", { set: "monster" })).toThrow(/charset\.set/);
    expect(() => ed.setField(0, "charset", { file: "", index: 0 })).toThrow(/charset\.file/);
    expect(() => ed.setField(0, "dir", "north")).toThrow(/방향/);
    expect(() => ed.setField(0, "trigger", "click")).toThrow(/트리거/);
    expect(() => ed.setField(0, "speed", 0)).toThrow(/0보다 큰 숫자여야 함/);
    expect(() => ed.setField(0, "through", "yes")).toThrow(/불리언이어야 함/);
    expect(() => ed.setField(0, "x", undefined)).toThrow(/x/);
    expect(() => ed.setField(0, "commands", [])).toThrow(/커맨드 목록 에디터에서만 편집할 수 있습니다/);
    expect(() => ed.setField(0, "zzz", 1)).toThrow(/스키마에 없는/);
    expect(() => ed.setField(0, "wander", { minWait: 50, maxWait: 10 })).toThrow(/maxWait/);
    // 칸 옮기기로 같은 칸의 touch 가 되는 것도 막는다
    expect(() => ed.setField(0, "trigger", "touch")).not.toThrow();
    expect(() => ed.setField(1, "x", 0)).not.toThrow();
  });

  it("밖에서 고친 파일의 원래 오류는 막지 않고, 고치는 편집은 된다", () => {
    const { section, ed, stack } = setup([ev("a", 0, 0, { dir: "north", commands: [{ code: "message" }] })]);
    stack.push(ed.setField(0, "speed", 2));
    expect(at(section, 0).speed).toBe(2);
    stack.push(ed.setField(0, "dir", "up"));
    expect(at(section, 0).dir).toBe("up");
    expect(() => ed.setField(0, "dir", "west")).toThrow(/방향/);
  });

  it("이름 바꾸기는 이 맵의 moveRoute.target, turn.target 을 함께 바꾸고 한 단계로 되돌린다", () => {
    const { section, ed, stack } = setup([
      ev("kid", 0, 0, { charset: { set: "npc", index: 0 } }),
      ev("mom", 1, 0, {
        commands: [
          { code: "turn", target: "kid", dir: "up" },
          { code: "if", cond: { flag: "a" }, thenDo: [{ code: "moveRoute", target: "kid", route: ["up"] }], elseDo: [{ code: "turn", target: "player", dir: "down" }] },
        ],
      }),
    ]);
    const before = JSON.stringify(section.list);
    stack.push(ed.renameEvent(0, "child"));
    expect(section.ids()).toEqual(["child", "mom"]);
    const cmds = at(section, 1).commands as Array<Record<string, unknown>>;
    expect(cmds[0].target).toBe("child");
    expect(getList(cmds, [{ at: 1, list: "thenDo" }], schema)![0]).toMatchObject({ target: "child" });
    expect(getList(cmds, [{ at: 1, list: "elseDo" }], schema)![0]).toMatchObject({ target: "player" });
    expect(stack.depth).toBe(1);
    stack.undo();
    expect(JSON.stringify(section.list)).toBe(before);
    // setField("id") 도 같은 길이다
    stack.push(ed.setField(0, "id", "boy"));
    expect((at(section, 1).commands as Array<Record<string, unknown>>)[0].target).toBe("boy");
  });

  it("이름 막기: 빈 이름, 예약된 player, 겹치는 id", () => {
    const { ed } = setup([ev("a", 0, 0), ev("b", 1, 0)]);
    expect(() => ed.renameEvent(0, "")).toThrow(/비어 있지 않은 문자열이어야 함/);
    expect(() => ed.renameEvent(0, "player")).toThrow(/예약된/);
    expect(() => ed.renameEvent(1, "a")).toThrow(/중복/);
    // 앞 이벤트를 뒤와 같게 바꿔도 막는다 (엔진은 뒤의 것에 낸다)
    expect(() => ed.renameEvent(0, "b")).toThrow(/중복/);
  });

  it("옛 id 가 2^53을 넘는 정수(표식 글)면 글이 아니라 참조를 바꾸지 않는다", () => {
    const big = bigIntValue("12345678901234567890");
    const { section, ed, stack } = setup([{ id: big, x: 0, y: 0 }, ev("c", 2, 0, { commands: [{ code: "turn", target: big, dir: "up" }] })]);
    stack.push(ed.renameEvent(0, "kid"));
    expect(section.ids()).toEqual(["kid", "c"]);
    expect((at(section, 1).commands as Array<Record<string, unknown>>)[0].target).toBe(big);
  });

  it("옛 id 를 쓰는 다른 이벤트가 남아 있으면 참조는 두다", () => {
    const { section, ed, stack } = setup([ev("dup", 0, 0), ev("dup", 1, 0), ev("c", 2, 0, { commands: [{ code: "turn", target: "dup", dir: "up" }] })]);
    stack.push(ed.renameEvent(1, "other"));
    expect((at(section, 2).commands as Array<Record<string, unknown>>)[0].target).toBe("dup");
  });

  it("배회 켜기와 구역 (가장자리 끌기가 한 단계)", () => {
    const { section, ed, stack } = setup([ev("npc", 2, 2, { charset: { set: "npc", index: 0 } })]);
    expect(() => ed.setWanderArea(0, { x: 0, y: 0, w: 4, h: 4 })).toThrow(/배회\(wander\) 설정 없음/);
    stack.push(ed.setWander(0, { maxWait: 90, minWait: 30 }));
    expect(Object.keys(at(section, 0).wander as object)).toEqual(["minWait", "maxWait"]);
    stack.push(ed.setWanderArea(0, { x: 1, y: 1, w: 3, h: 3 }, { mergeKey: "edge" }));
    stack.push(ed.setWanderArea(0, { x: 1, y: 1, w: 4, h: 3 }, { mergeKey: "edge" }));
    expect(stack.depth).toBe(2);
    expect(at(section, 0).wander).toEqual({ minWait: 30, maxWait: 90, area: { x: 1, y: 1, w: 4, h: 3 } });
    expect(() => ed.setWanderArea(0, { x: 1, y: 1, w: 0, h: 3 })).toThrow(/area\.w/);
    stack.push(ed.setWander(0, undefined));
    expect(at(section, 0).wander).toBeUndefined();
  });
});

describe("커맨드 넣기, 빼기, 옮기기, 인자", () => {
  const P = (index: number, list: CommandPath["list"] = []): CommandPath => ({ list, index });

  it("넣기는 정해진 키 순서로, 없는 목록은 만들고, 틀린 커맨드는 거절한다", () => {
    const { section, ed, stack } = setup([ev("a", 0, 0)]);
    stack.push(ed.insertCommands(0, [], 0, [{ text: "안녕", code: "message" }]));
    expect(Object.keys(at(section, 0))).toEqual(["id", "x", "y", "commands"]);
    stack.push(ed.insertCommands(0, [], 1, [newCommand(schema, "if", { cond: { flag: "a" } })]));
    stack.push(ed.insertCommands(0, [{ at: 1, list: "elseDo" }], 0, [newCommand(schema, "wait", { ms: 100 })]));
    expect(at(section, 0).commands).toEqual([
      { code: "message", text: "안녕" },
      { code: "if", cond: { flag: "a" }, elseDo: [{ code: "wait", ms: 100 }] },
    ]);
    expect(() => ed.insertCommands(0, [], 0, [{ code: "message" }])).toThrow(/text/);
    expect(() => ed.insertCommands(0, [], 0, [{ code: "nothing" }])).toThrow(/스키마에 없는 커맨드: nothing/);
    expect(() => ed.insertCommands(0, [], 0, [newCommand(schema, "choice", { options: ["a", null] })])).toThrow(/options/);
    expect(() => ed.insertCommands(0, [], 0, [{ code: "wait", ms: -1 }])).toThrow(/0 이상이어야 함/);
    expect(() => ed.insertCommands(0, [], 9, [newCommand(schema, "wait")])).toThrow(EditRefused);
    expect(() => ed.insertCommands(0, [{ at: 0, list: "thenDo" }], 0, [newCommand(schema, "wait")])).toThrow(EditRefused);
    expect(() => ed.insertCommands(0, [], 0, [])).toThrow(/삽입할 커맨드 없음/);
    stack.undo();
    stack.undo();
    stack.undo();
    expect(section.list[0]).toEqual(ev("a", 0, 0));
  });

  it("스크립트: 이름이 비었거나 없으면 넣지도 비우지도 못한다 (엔진이 그 이벤트를 건너뛴다)", () => {
    const { section, ed, stack } = setup([ev("a", 0, 0, { trigger: "auto" })]);
    expect(newCommand(schema, "script")).toEqual({ code: "script", name: "" });
    expect(() => ed.insertCommands(0, [], 0, [newCommand(schema, "script")])).toThrow(EditRefused);
    expect(() => ed.insertCommands(0, [], 0, [newCommand(schema, "script")])).toThrow(/commands\[1\]\.name.*등록되지 않은 스크립트/);
    expect(() => ed.insertCommands(0, [], 0, [{ code: "script" }])).toThrow(/\.name/);
    expect(section.list[0]).toEqual(ev("a", 0, 0, { trigger: "auto" }));
    stack.push(ed.insertCommands(0, [], 0, [newCommand(schema, "script", { name: "boss" })]));
    expect(at(section, 0).commands).toEqual([{ code: "script", name: "boss" }]);
    expect(() => ed.setArg(0, P(0), "name", "")).toThrow(/name: 등록되지 않은 스크립트/);
    expect(() => ed.setArg(0, P(0), "name", undefined)).toThrow(/name: 값 없음 \(문자열 필요\)/);
    stack.push(ed.setArg(0, P(0), "name", "boss2"));
    expect(at(section, 0).commands).toEqual([{ code: "script", name: "boss2" }]);
  });

  it("모르는 커맨드의 인자는 고칠 수 없다. code 가 2^53을 넘는 정수(표식 글)면 숫자 그대로 알린다", () => {
    const { ed } = setup([ev("a", 0, 0, { commands: [{ code: bigIntValue("12345678901234567890"), text: "x" }] })]);
    expect(() => ed.setArg(0, P(0), "text", "y")).toThrow("커맨드를 편집할 수 없습니다: 12345678901234567890 (스키마에 없습니다)");
    expect(() => ed.setArgs(0, P(0), { text: "y" })).toThrow("스키마에 없는 커맨드: 12345678901234567890");
  });

  it("빼기와 옮기기", () => {
    const { section, ed, stack } = setup([ev("a", 0, 0, { commands: [{ code: "message", text: "1" }, { code: "if", cond: { flag: "f" }, thenDo: [] }, { code: "message", text: "3" }] })]);
    stack.push(ed.moveCommands(0, P(0), 1, { list: [{ at: 1, list: "thenDo" }], index: 0 }));
    expect(at(section, 0).commands).toEqual([{ code: "if", cond: { flag: "f" }, thenDo: [{ code: "message", text: "1" }] }, { code: "message", text: "3" }]);
    expect(() => ed.moveCommands(0, P(0), 1, { list: [{ at: 0, list: "thenDo" }], index: 0 })).toThrow(/커맨드를 자신의 하위 목록으로 이동할 수 없습니다/);
    stack.push(ed.removeCommands(0, [{ at: 0, list: "thenDo" }], 0));
    expect(ed.commandsOf(0, [{ at: 0, list: "thenDo" }])).toEqual([]);
    stack.undo();
    stack.undo();
    expect((at(section, 0).commands as unknown[]).length).toBe(3);
  });

  it("인자 바꾸기: 타이핑은 합치고, 틀린 값과 필수 인자 지우기와 항목은 거절한다", () => {
    const { section, ed, stack } = setup([ev("a", 0, 0, { commands: [{ code: "message", text: "" }, { code: "choice", options: ["a"] }] })]);
    stack.push(ed.setArg(0, P(0), "text", "안", { mergeKey: "t" }));
    stack.push(ed.setArg(0, P(0), "text", "안녕", { mergeKey: "t" }));
    expect(stack.depth).toBe(1);
    stack.push(ed.setArg(0, P(0), "face", { index: 3, set: "npc" }));
    stack.push(ed.setArg(0, P(0), "name", "선장"));
    const cmd = (at(section, 0).commands as Array<Record<string, unknown>>)[0];
    expect(Object.keys(cmd)).toEqual(["code", "text", "name", "face"]);
    expect(Object.keys(cmd.face as object)).toEqual(["set", "index"]);
    expect(() => ed.setArg(0, P(0), "face", { set: "npc", index: 16 })).toThrow(/face.*0\.\.15|0\.\.15/);
    expect(() => ed.setArg(0, P(0), "name", 3)).toThrow(/name/);
    expect(() => ed.setArg(0, P(0), "text", undefined)).toThrow(/text: 값 없음 \(문자열 필요\)/);
    expect(() => ed.setArg(0, P(0), "zzz", 1)).toThrow(/zzz 인자 없음/);
    expect(() => ed.setArg(0, P(1), "options", ["b"])).toThrow(/항목\(options\)은 항목 에디터에서만 편집할 수 있습니다/);
    expect(() => ed.setArg(0, P(1), "cancel", 0)).toThrow(/1 이상/);
    stack.push(ed.setArg(0, P(0), "name", undefined));
    expect(Object.keys((at(section, 0).commands as Array<Record<string, unknown>>)[0])).toEqual(["code", "text", "face"]);
    // 하위 목록의 옛 오류는 인자 바꾸기를 막지 않는다
    const broken = setup([ev("b", 0, 0, { commands: [{ code: "if", cond: { flag: "x" }, thenDo: [{ code: "message" }] }] })]);
    broken.stack.push(broken.ed.setArg(0, P(0), "cond", { flag: "y" }));
    expect((broken.section.list[0] as { commands: Array<Record<string, unknown>> }).commands[0].cond).toEqual({ flag: "y" });
  });

  it("인자 여럿(setArgs): x 와 y 가 한 명령, 되돌리기 한 단계이고 다시 실행하면 둘 다 돌아온다. 키 순서는 스키마 순서", () => {
    const transfer = { code: "transfer", map: "inn", dir: "up" };
    const { section, ed, stack } = setup([ev("door", 0, 0, { commands: [{ code: "playSe", file: "./a.wav" }, transfer] })]);
    const cmd = () => (at(section, 0).commands as Array<Record<string, unknown>>)[1];
    const made = ed.setArgs(0, P(1), { x: 4, y: 7 });
    expect(made.unchanged).toBe(false);
    expect(made.label).toBe("인자 변경: x, y");
    expect(made.focus).toEqual([0]);
    stack.push(made);
    expect(stack.depth).toBe(1);
    expect(cmd()).toEqual({ code: "transfer", map: "inn", x: 4, y: 7, dir: "up" });
    expect(Object.keys(cmd())).toEqual(["code", "map", "x", "y", "dir"]);
    stack.push(ed.setArgs(0, P(1), { y: 2, x: 9 }));
    expect(stack.depth).toBe(2);
    expect(cmd()).toMatchObject({ x: 9, y: 2 });
    stack.undo();
    expect(cmd()).toMatchObject({ x: 4, y: 7 });
    stack.undo();
    expect(cmd()).toEqual(transfer);
    stack.redo();
    expect(cmd()).toEqual({ code: "transfer", map: "inn", x: 4, y: 7, dir: "up" });
    stack.redo();
    expect(cmd()).toMatchObject({ x: 9, y: 2 });
    // undefined 는 지운다 (선택 인자)
    stack.push(ed.setArgs(0, P(1), { x: undefined, y: undefined }));
    expect(cmd()).toEqual(transfer);
  });

  it("인자 여럿(setArgs): 값이 모두 그대로면 unchanged 라 스택이 쌓지 않는다. 합치기 키가 같으면 하나로 합친다", () => {
    const { section, ed, stack } = setup([ev("door", 0, 0, { commands: [{ code: "transfer", map: "inn", x: 3, y: 4 }] })]);
    const same = ed.setArgs(0, P(0), { x: 3, y: 4 });
    expect(same.unchanged).toBe(true);
    const state = stack.stateId;
    stack.push(same);
    expect(stack.depth).toBe(0);
    expect(stack.stateId).toBe(state);
    stack.push(ed.setArgs(0, P(0), { x: 5, y: 6 }, { mergeKey: "k" }));
    stack.push(ed.setArgs(0, P(0), { x: 7, y: 8 }, { mergeKey: "k" }));
    expect(stack.depth).toBe(1);
    expect((at(section, 0).commands as Array<Record<string, unknown>>)[0]).toMatchObject({ x: 7, y: 8 });
    stack.undo();
    expect((at(section, 0).commands as Array<Record<string, unknown>>)[0]).toMatchObject({ x: 3, y: 4 });
  });

  it("인자 여럿(setArgs): 하나라도 틀리면 전부 거절하고 목록은 그대로다", () => {
    const transfer = { code: "transfer", map: "inn", x: 3, y: 4 };
    const { section, ed } = setup([ev("door", 0, 0, { commands: [transfer, { code: "choice", options: ["a"] }] })]);
    expect(() => ed.setArgs(0, P(0), { x: 5, y: -1 })).toThrow(/^y: /);
    expect(() => ed.setArgs(0, P(0), { x: 1.5, y: 2 })).toThrow(/^x: /);
    expect(() => ed.setArgs(0, P(0), { x: 1, zzz: 2 })).toThrow("인자 없음: 맵 이동.zzz");
    expect(() => ed.setArgs(0, P(0), { map: undefined, x: 1 })).toThrow(/map: 값 없음 \(id 문자열 필요\)/);
    expect(() => ed.setArgs(0, P(1), { options: ["b"] })).toThrow("항목 인자는 항목 편집으로 수정해야 합니다: 선택지.options");
    expect(() => ed.setArgs(0, P(0), {})).toThrow("변경할 인자 없음");
    expect(() => ed.setArgs(0, P(5), { x: 1 })).toThrow(EditRefused);
    expect((at(section, 0).commands as unknown[])[0]).toEqual(transfer);
    const locked = setup([ev("door", 0, 0, { commands: [transfer] })], { locked: "읽기 전용 맵" });
    expect(() => locked.ed.setArgs(0, P(0), { x: 1, y: 1 })).toThrow("읽기 전용 맵");
  });

  it("선택지 항목: 가지와 취소 번호가 함께 간다", () => {
    const branches = [[{ code: "message", text: "A" }], [{ code: "message", text: "B" }], [{ code: "message", text: "C" }]];
    const { section, ed, stack } = setup([ev("a", 0, 0, { commands: [{ code: "choice", options: ["a", "b", "c"], cancel: 3, branches }] })]);
    const choice = () => (at(section, 0).commands as Array<{ options: string[]; cancel?: number; branches: Array<Array<{ text: string }>> }>)[0];
    const texts = () => choice().branches.map((b) => b.map((c) => c.text).join(""));
    stack.push(ed.addOption(0, P(0), 1, "새"));
    expect(choice().options).toEqual(["a", "새", "b", "c"]);
    expect(texts()).toEqual(["A", "", "B", "C"]);
    expect(choice().cancel).toBe(4);
    stack.push(ed.moveOption(0, P(0), 3, 0));
    expect(choice().options).toEqual(["c", "a", "새", "b"]);
    expect(texts()).toEqual(["C", "A", "", "B"]);
    expect(choice().cancel).toBe(1);
    stack.push(ed.removeOption(0, P(0), 0));
    expect(choice().options).toEqual(["a", "새", "b"]);
    expect(texts()).toEqual(["A", "", "B"]);
    expect(choice().cancel).toBeUndefined();
    stack.push(ed.setOption(0, P(0), 1, "새로", { mergeKey: "o" }));
    stack.push(ed.setOption(0, P(0), 1, "새로운", { mergeKey: "o" }));
    expect(choice().options[1]).toBe("새로운");
    expect(stack.depth).toBe(4);
    for (let k = 0; k < 4; k++) stack.undo();
    expect(choice()).toEqual({ code: "choice", options: ["a", "b", "c"], cancel: 3, branches });
  });

  it("항목 옮기기의 취소 번호, 항목 하나는 뺄 수 없다, 가지가 없는 선택지", () => {
    const { section, ed, stack } = setup([ev("a", 0, 0, { commands: [{ code: "choice", options: ["a", "b", "c", "d"], cancel: 2 }, { code: "choice", options: ["only"] }] })]);
    const cmd = (i: number) => (at(section, 0).commands as Array<{ options: string[]; cancel?: number; branches?: unknown[] }>)[i];
    stack.push(ed.moveOption(0, P(0), 0, 2));
    expect(cmd(0).options).toEqual(["b", "c", "a", "d"]);
    expect(cmd(0).cancel).toBe(1);
    expect(cmd(0).branches).toBeUndefined();
    stack.push(ed.moveOption(0, P(0), 3, 0));
    expect(cmd(0).cancel).toBe(2);
    stack.push(ed.removeOption(0, P(0), 3));
    expect(cmd(0).cancel).toBe(2);
    expect(() => ed.removeOption(0, P(1), 0)).toThrow(/항목이 1개 이상 필요합니다/);
    expect(() => ed.addOption(0, P(1), 5, "x")).toThrow(/항목 인덱스가 범위 밖/);
    expect(() => ed.addOption(0, { list: [], index: 9 }, 0, "x")).toThrow(EditRefused);
  });
});

describe("잠금", () => {
  it("잠긴 레이어는 모든 편집을 거절한다 (이유 그대로)", () => {
    const reason = "RTP 판과 기본 판 두 파일이라 이벤트를 두 벌 둬야 한다";
    const { ed } = setup([ev("a", 0, 0, { commands: [{ code: "message", text: "t" }] })], { locked: reason });
    const edits: Array<() => unknown> = [
      () => ed.addEvent({ x: 1, y: 1 }),
      () => ed.removeEvents([0]),
      () => ed.moveEvents([0], 1, 0),
      () => ed.setField(0, "speed", 2),
      () => ed.renameEvent(0, "b"),
      () => ed.insertCommands(0, [], 0, [{ code: "wait", ms: 1 }]),
      () => ed.removeCommands(0, [], 0),
      () => ed.setArg(0, { list: [], index: 0 }, "text", "u"),
      () => ed.pasteEvents([ev("c", 0, 0)], { x: 2, y: 2 }),
    ];
    for (const edit of edits) expect(edit).toThrow(reason);
  });

  it("객체가 아닌 이벤트는 고칠 수 없다", () => {
    const { ed } = setup([null, ev("a", 0, 0)]);
    expect(() => ed.setField(0, "speed", 2)).toThrow(/편집할 수 없습니다 \(객체가 아닙니다\)/);
    expect(() => ed.setField(5, "speed", 2)).toThrow(/이벤트 없음/);
  });
});

describe("newCommand 와 항구 마을", () => {
  it("스키마 기본값으로 필수 인자를 채운다 (file 은 기본값이 없다)", () => {
    expect(newCommand(schema, "message")).toEqual({ code: "message", text: "" });
    expect(newCommand(schema, "wait")).toEqual({ code: "wait", ms: 0 });
    expect(newCommand(schema, "turn")).toEqual({ code: "turn", target: "", dir: "down" });
    expect(newCommand(schema, "choice")).toEqual({ code: "choice", options: ["항목 1"] });
    expect(newCommand(schema, "if")).toEqual({ code: "if", cond: { item: "" } });
    expect(newCommand(schema, "setFlag", { key: "k" })).toEqual({ code: "setFlag", key: "k" });
    expect(newCommand(schema, "playSe")).toEqual({ code: "playSe" });
    expect(Object.keys(newCommand(schema, "transfer", { dir: "up", map: "inn", y: 2, x: 1 }))).toEqual(["code", "map", "x", "y", "dir"]);
    expect(() => newCommand(schema, "zzz")).toThrow(EditRefused);
    // 스키마에 없는 값도 제 칸으로 싣는다 ("__proto__" 도 프로토타입이 아니라 칸이다)
    const extra = newCommand(schema, "message", JSON.parse('{"text": "t", "__proto__": {"note": 1}}') as Record<string, unknown>);
    expect(Object.keys(extra)).toEqual(["code", "text", "__proto__"]);
    expect(Object.getPrototypeOf(extra)).toBe(Object.prototype);
    expect(JSON.stringify(extra)).toBe('{"code":"message","text":"t","__proto__":{"note":1}}');
  });

  it("항구 마을: 이벤트 하나를 옮긴 diff 는 그 이벤트의 x, y 줄뿐이다", () => {
    const { map } = fixtureMap("port_town");
    const section = new EventsSection(map.events!, schema);
    const ed = new EventEditor(section, () => ({ schema, map }));
    const stack = new UndoStack();
    const before = JSON.stringify(section.serialize(), null, 2).split("\n");
    const i = section.indexOfId("bench");
    stack.push(ed.moveEvents([i], 1, 1));
    const after = JSON.stringify(section.serialize(), null, 2).split("\n");
    expect(after).toHaveLength(before.length);
    const changed = before.map((line, k) => [line, after[k]]).filter(([a, b]) => a !== b);
    expect(changed.map(([, b]) => b.trim())).toEqual([`"x": ${Number(field(map.events![i], "x")) + 1},`, `"y": ${Number(field(map.events![i], "y")) + 1},`]);
    expect(stack.depth).toBe(1);
    expect(stack.undoLabel).toBe("이벤트 이동");
  });

  it("EventListCommand 는 같은 섹션의 같은 키만 합친다", () => {
    const a = setup([ev("a", 0, 0)]);
    const b = setup([ev("a", 0, 0)]);
    const c1 = a.ed.moveEvents([0], 1, 0, { mergeKey: "k" });
    const c2 = b.ed.moveEvents([0], 1, 0, { mergeKey: "k" });
    expect(c1).toBeInstanceOf(EventListCommand);
    expect(c1.merge(c2)).toBe(false);
  });
});
