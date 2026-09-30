import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseGraph, type GraphFile, type GraphNode } from "./format";
import { parseNodeLibrary } from "./library";
import { validateGraph } from "./validate";

const FIXTURES = join(__dirname, "fixtures");
const LIB_PATH = "scripts/components/flappy/common.nodes.json";
const FLAPPY = parseNodeLibrary(LIB_PATH, readFileSync(join(FIXTURES, "flappy", "common.nodes.json"), "utf8"));

function graph(nodes: GraphNode[], extra: Partial<GraphFile> = {}): GraphFile {
  return { version: 1, uses: [], params: null, state: null, locals: [], nodes, layout: {}, ...extra };
}

function problems(g: GraphFile, libs: [string, typeof FLAPPY | string][] = []): string[] {
  return validateGraph(g, { libraries: new Map(libs) }).problems.map((p) => `${p.severity === "error" ? "E" : "W"} ${p.node ?? "-"}${p.port ? `.${p.port}` : ""}: ${p.message}`);
}

const update = (next?: string): GraphNode => ({ id: "u", kind: "event.update", next });
const print = (id: string, value: unknown, next?: string): GraphNode => ({ id, kind: "text.print", args: { value }, next });

describe("그래프 검사", () => {
  it("픽스처 둘은 문제가 없다", () => {
    expect(problems(parseGraph(readFileSync(join(FIXTURES, "flappy", "bird.graph.json"), "utf8")), [[LIB_PATH, FLAPPY]])).toEqual([]);
    expect(problems(parseGraph(readFileSync(join(FIXTURES, "sampler", "sampler.graph.json"), "utf8")))).toEqual([]);
  });

  it("노드 id, 종류, 이벤트", () => {
    expect(problems(graph([update(), { id: "u", kind: "event.init" }]))).toEqual(["E u: 노드 id가 겹칩니다: u"]);
    expect(problems(graph([{ id: "a-b", kind: "event.init" }]))).toEqual(["E a-b: 노드 id는 식별자여야 합니다: a-b"]);
    expect(problems(graph([{ id: "x", kind: "math.pow" }]))).toEqual(["E x: 알 수 없는 노드 종류입니다: math.pow"]);
    expect(problems(graph([update(), { id: "u2", kind: "event.update" }]))).toEqual(["E u2: 매 틱 (update) 이벤트가 두 개입니다: u, u2"]);
  });

  it("실행 흐름: 출구, 두 번 들어오기, 순환, 이어지지 않은 노드", () => {
    expect(problems(graph([update("v"), { id: "v", kind: "math.random" }]))).toEqual(["E u: next 출구는 실행 노드를 가리켜야 합니다: v"]);
    expect(problems(graph([update(), { id: "v", kind: "math.random", next: "u" }]))).toEqual(["E v: 값 노드에는 실행 출구(next)가 없습니다"]);
    expect(problems(graph([update("p"), print("p", 1), { id: "q", kind: "text.print", args: { value: 2 }, then: "p" }]))).toContain("E q: 이 노드에는 then 출구가 없습니다");
    expect(problems(graph([update("a"), print("a", 1, "b"), print("b", 2), { id: "c", kind: "flow.branch", args: { cond: true }, then: "b" }]))).toEqual([
      "E b: 실행 흐름이 한 노드로 두 번 들어옵니다: a, c → b",
      "W c: 이벤트에서 이어지지 않아 코드로 만들지 않습니다",
    ]);
    expect(problems(graph([update(), print("a", 1, "b"), print("b", 2, "a")]))).toEqual(["W a: 이벤트에서 이어지지 않아 코드로 만들지 않습니다", "W b: 이벤트에서 이어지지 않아 코드로 만들지 않습니다"]);
    expect(problems(graph([update("a"), print("a", 1, "u")]))).toEqual(["E a: next 출구가 이벤트 노드를 가리킵니다: u"]);
    expect(problems(graph([update("a"), print("a", 1, "zz")]))).toEqual(["E a: next 출구가 없는 노드를 가리킵니다: zz"]);
  });

  it("값의 연결과 형식", () => {
    expect(problems(graph([update("p"), { id: "p", kind: "text.print" }]))).toEqual(["E p.value: 입력이 비어 있습니다: 값"]);
    expect(problems(graph([update("p"), { id: "p", kind: "text.print", args: { value: 1, other: 2 } }]))).toEqual(["E p.other: 알 수 없는 입력 포트의 상수입니다: other"]);
    expect(problems(graph([update("p"), { id: "p", kind: "text.print", in: { value: "nope" } }]))).toEqual(["E p.value: 입력 값이 없는 노드를 가리킵니다: nope"]);
    expect(problems(graph([update("b"), { id: "t", kind: "math.random" }, { id: "b", kind: "flow.branch", in: { cond: "t" } }]))).toEqual([
      "E b.cond: 입력 조건에 number 값을 이을 수 없습니다 (필요: boolean)",
    ]);
    expect(problems(graph([update("b"), { id: "b", kind: "flow.branch", args: { cond: 1 } }]))).toEqual(["E b.cond: 입력 조건의 상수: true 나 false 여야 합니다"]);
    expect(problems(graph([update("p"), { id: "k", kind: "api.call", fn: "Input.IsKeyDown", args: { key: "SPACEBAR" } }, { id: "p", kind: "text.print", in: { value: "k" } }]))).toEqual([
      "E k.key: 입력 키의 상수: 알 수 없는 키 이름입니다: SPACEBAR",
    ]);
    expect(problems(graph([update("p"), { id: "p", kind: "text.print", in: { value: "u.nope" } }]))).toEqual(["E p.value: 입력 값이 가리키는 출력이 없습니다: u.nope"]);
    expect(problems(graph([update(), { id: "a", kind: "math.add", in: { a: "b" }, args: { b: 1 } }, { id: "b", kind: "math.add", in: { a: "a" }, args: { b: 1 } }]))).toEqual([
      "E a: 값의 연결이 순환합니다",
    ]);
  });

  it("enum 과 상수의 비교, 값 분기의 갈래", () => {
    const state = { from: "scene", fields: [{ key: "mode", type: "enum" as const, values: ["a", "b"] }] };
    const cmp = (b: unknown) => graph([update("p"), { id: "m", kind: "state.get", field: "mode" }, { id: "e", kind: "cmp.eq", in: { a: "m" }, args: { b } }, { id: "p", kind: "text.print", in: { value: "e" } }], { state });
    expect(problems(cmp("a"))).toEqual([]);
    expect(problems(cmp("c"))).toEqual(["E e.b: 입력 b의 상수: a, b 중 하나여야 합니다"]);
    const sw = graph([update("s"), { id: "m", kind: "state.get", field: "mode" }, { id: "s", kind: "flow.switch", in: { value: "m" }, cases: { a: "p", z: "q" } }, print("p", 1), print("q", 2)], { state });
    expect(problems(sw)).toEqual(["E s: 값 분기의 갈래 z는 a, b 중 하나여야 합니다"]);
    const isw = graph([update("s"), { id: "s", kind: "flow.switch", args: { value: 3 }, cases: { "1": "p", x: "q" } }, print("p", 1), print("q", 2)]);
    expect(problems(isw)).toEqual(["E s: 값 분기의 갈래 x는 정수여야 합니다"]);
  });

  it("범위: 이벤트 출력과 반복 순번", () => {
    expect(problems(graph([{ id: "i", kind: "event.init", next: "p" }, update(), { id: "p", kind: "text.print", in: { value: "u.elapsed" } }]))).toEqual([
      "E p: 매 틱 (update)의 출력 elapsed는 그 이벤트의 흐름 안에서만 쓸 수 있습니다",
    ]);
    const loop = (extra: GraphNode[]) => graph([update("r"), { id: "r", kind: "flow.repeat", args: { count: 3 }, body: "in", next: "out" }, { id: "in", kind: "text.print", in: { value: "r.index" } }, ...extra]);
    expect(problems(loop([print("out", 0)]))).toEqual([]);
    expect(problems(loop([{ id: "out", kind: "text.print", in: { value: "r.index" } }]))).toEqual(["E out: 반복 r의 순번은 그 반복의 본문 안에서만 쓸 수 있습니다"]);
    expect(problems(graph([update("r"), { id: "r", kind: "flow.repeat", in: { count: "r.index" } }]))).toEqual(["E r: 반복의 순번을 그 반복의 횟수에 쓸 수 없습니다"]);
  });

  it("상태, 지역 변수, 매개변수, 라이브러리", () => {
    expect(problems(graph([update("s"), { id: "s", kind: "state.set", field: "hp", args: { value: 1 } }]))).toEqual(["E s: 그래프에 상태(state)가 없습니다"]);
    expect(problems(graph([update()], { state: { from: "scene", fields: [{ key: "birdVy", type: "number" }, { key: "bird_vy", type: "number" }] } }))).toEqual([
      "E -: 상태 필드 birdVy와 bird_vy의 Ruby 이름이 같습니다: bird_vy",
      "E -: 상태 필드 bird_vy와 birdVy의 Ruby 이름이 같습니다: bird_vy",
    ]);
    expect(problems(graph([update()], { state: { from: "scene", fields: [{ key: "hp", type: "integer", default: 1.5 }] } }))).toEqual(["E -: 상태 필드 hp의 기본값: 정수여야 합니다"]);
    expect(problems(graph([update()], { state: { from: "nope.state", fields: [] } }))).toEqual(['E -: state.from은 "scene" 이나 상태 표를 반환하는 라이브러리 함수여야 합니다: nope.state']);
    expect(problems(graph([update()], { uses: [LIB_PATH], state: { from: "flappy.dt", fields: [] } }), [[LIB_PATH, FLAPPY]])).toEqual(["E -: state.from 함수는 scene 만 받고 state 를 반환해야 합니다: flappy.dt"]);
    for (const bad of ["end", "st", "_tmp", "Big"]) expect(problems(graph([update()], { locals: [{ key: bad, type: "number" }] }))[0]).toMatch(/지역 변수 이름은/);
    expect(problems(graph([update()], { params: [{ key: "speed", type: "vector" }] }))).toEqual(["E -: 매개변수 선언: fields[0].type은 string, text, number, integer, boolean, enum, object 중 하나여야 합니다"]);
    expect(problems(graph([update("p"), { id: "g", kind: "param.get", field: "speed" }, { id: "p", kind: "text.print", in: { value: "g" } }]))).toEqual(["E g: 매개변수가 없습니다: speed"]);
    expect(problems(graph([update()], { uses: ["x.nodes.json"] }))).toEqual(["E -: 노드 라이브러리를 읽지 못했습니다: x.nodes.json"]);
    expect(problems(graph([update()], { uses: ["x.nodes.json"] }), [["x.nodes.json", "파일이 없습니다"]])).toEqual(["E -: 노드 라이브러리 x.nodes.json: 파일이 없습니다"]);
    expect(problems(graph([update("d"), { id: "d", kind: "lib.call", fn: "flappy.die" }], { uses: [LIB_PATH] }), [[LIB_PATH, FLAPPY]])).toEqual([
      "E d: 상태를 받는 함수인데 그래프에 상태(state)가 없습니다: flappy.die",
    ]);
    expect(problems(graph([update("d"), { id: "d", kind: "lib.call", fn: "flappy.nope" }], { uses: [LIB_PATH] }), [[LIB_PATH, FLAPPY]])).toEqual(["E d: 라이브러리 함수가 없습니다: flappy.nope"]);
  });

  it("state.from 라이브러리 함수가 선언한 필드를 쓴다. 그래프가 같은 필드를 다시 적으면 오류", () => {
    const g = parseGraph(readFileSync(join(FIXTURES, "flappy", "bird.graph.json"), "utf8"));
    const a = validateGraph(g, { libraries: new Map([[LIB_PATH, FLAPPY]]) });
    expect(a.inheritedState.map((f) => f.key)).toContain("birdVy");
    expect(a.env.state!.get("birdVy")).toMatchObject({ type: "number" });
    expect(a.rubyStateName("GROUND_Y")).toBe("ground_y");
    g.state!.fields = [{ key: "birdVy", type: "number" }, { key: "lives", type: "integer" }];
    expect(problems(g, [[LIB_PATH, FLAPPY]])).toEqual(["E -: 상태 필드 birdVy는 라이브러리(flappy.state)가 이미 선언했습니다"]);
  });

  it("오브젝트 속성", () => {
    expect(problems(graph([update("s"), { id: "s", kind: "obj.set", field: "id", args: { value: "x" } }]))).toEqual(["E s: 쓸 수 없는 오브젝트 속성입니다: id"]);
    expect(problems(graph([update("s"), { id: "s", kind: "obj.set", field: "z", args: { value: 1 } }]))[0]).toMatch(/오브젝트 속성이 아닙니다: z/);
    expect(problems(graph([update("s"), { id: "s", kind: "obj.set", field: "x", args: { target: "a", value: 1 } }]))).toEqual(["E s.target: 입력 대상의 상수: 오브젝트는 상수로 줄 수 없습니다 (노드로 연결합니다)"]);
    expect(problems(graph([update("s"), { id: "s", kind: "prop.set", field: "hp", type: "enum", args: { value: 1 } }]))[0]).toMatch(/props 값의 형식/);
  });
});
