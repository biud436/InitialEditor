import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MemoryBackend } from "../testing/memory-backend";
import { addNode, connectData, connectExec, disconnectData, moveNodes, removeNodes, renameCase, setArg, updateVar, uniqueNodeId } from "./edit";
import { emptyGraph, parseGraph, serializeGraph, type GraphFile } from "./format";
import { nodeGeometry, NODE_WIDTH } from "./geometry";
import { GraphDocument } from "./graphDocument";
import { layoutGraph, nodeSize } from "./layout";
import { validateGraph } from "./validate";
import { parseNodeLibrary } from "./library";

const FIXTURES = join(__dirname, "fixtures");
const read = (...p: string[]) => readFileSync(join(FIXTURES, ...p), "utf8");
const BIRD_PATH = "scripts/components/flappy/bird.graph.json";
const LIB_PATH = "scripts/components/flappy/common.nodes.json";
const text = (be: MemoryBackend, p: string) => new TextDecoder().decode(be.files.get(p)!);

async function flappyBackend(extra: Record<string, string> = {}) {
  const be = new MemoryBackend({ [BIRD_PATH]: read("flappy", "bird.graph.json"), [LIB_PATH]: read("flappy", "common.nodes.json"), ...extra });
  await be.open("/mem");
  return be;
}

describe("그래프 편집 함수", () => {
  const base = (): GraphFile => ({
    ...emptyGraph(),
    nodes: [
      { id: "update", kind: "event.update", next: "a" },
      { id: "a", kind: "text.print", in: { value: "r" }, next: "b" },
      { id: "b", kind: "text.print", args: { value: 1 } },
      { id: "r", kind: "math.random" },
    ],
    layout: { update: [0, 0], a: [200, 0], b: [400, 0], r: [0, 100] },
  });

  it("id 짓기와 노드 더하기", () => {
    const g = base();
    expect(uniqueNodeId(g, "a")).toBe("a_2");
    expect(uniqueNodeId(g, "print")).toBe("print");
    expect(uniqueNodeId(g, "1x")).toBe("n_1x");
    const id = addNode(g, { kind: "text.print" }, [10.4, 20.6]);
    expect(id).toBe("print");
    expect(g.layout.print).toEqual([10, 21]);
  });

  it("노드를 지우면 그 노드를 가리키던 출구와 값 연결도 지운다", () => {
    const g = base();
    removeNodes(g, ["r", "b"]);
    expect(g.nodes.map((n) => n.id)).toEqual(["update", "a"]);
    expect(g.nodes[1]).toEqual({ id: "a", kind: "text.print", in: {} });
    expect(g.layout).toEqual({ update: [0, 0], a: [200, 0] });
  });

  it("값 연결은 그 포트의 상수를 남기고, 실행 연결은 대상으로 들어오던 다른 출구를 끊는다", () => {
    const g = base();
    connectData(g, { node: "r", port: "out" }, { node: "b", port: "value" });
    expect(g.nodes[2]).toMatchObject({ in: { value: "r" }, args: { value: 1 } });
    connectData(g, { node: "update", port: "elapsed" }, { node: "b", port: "value" });
    expect(g.nodes[2].in).toEqual({ value: "update.elapsed" });
    disconnectData(g, { node: "b", port: "value" });
    expect(g.nodes[2].in).toEqual({});
    connectExec(g, { node: "update", exit: "next" }, "b");
    expect(g.nodes[0].next).toBe("b");
    expect(g.nodes[1].next).toBeUndefined();
    const sw = { id: "s", kind: "flow.switch", cases: { x: "a" } };
    g.nodes.push(sw);
    connectExec(g, { node: "s", exit: "case:y" }, "a");
    // 끊긴 갈래는 값을 남긴다 (빈 target)
    expect(g.nodes[4].cases).toEqual({ x: "", y: "a" });
    renameCase(g, "s", "y", "z");
    expect(g.nodes[4].cases).toEqual({ x: "", z: "a" });
    renameCase(g, "s", "x", undefined);
    expect(g.nodes[4].cases).toEqual({ z: "a" });
    setArg(g, "b", "value", "hi");
    expect(g.nodes[2].args).toEqual({ value: "hi" });
    moveNodes(g, [{ id: "b", x: 1.2, y: 3.7 }, { id: "nope", x: 0, y: 0 }]);
    expect(g.layout.b).toEqual([1, 4]);
  });

  it("변수 이름을 바꾸면 그 변수를 쓰는 노드도 바뀐다", () => {
    const g = parseGraph(read("flappy", "bird.graph.json"));
    const users = g.nodes.filter((n) => n.field === "birdVy").map((n) => n.id);
    expect(users.length).toBe(7);
    updateVar(g, "state", "birdVy", { key: "velocity", type: "number" });
    expect(g.nodes.filter((n) => n.field === "velocity").map((n) => n.id)).toEqual(users);
    expect(g.state!.fields.find((f) => f.key === "velocity")).toEqual({ key: "velocity", type: "number" });
  });
});

describe("노드 모양과 자동 정렬", () => {
  it("포트 위치", () => {
    const a = validateGraph(parseGraph(read("sampler", "sampler.graph.json")), { libraries: new Map() });
    const branch = nodeGeometry({ id: "b", kind: "flow.branch" }, a.specs.get("id_sw")!);
    expect(branch.pins.map((p) => `${p.kind}:${p.key}`)).toEqual(["exec-in:in", "exec-out:next", "data-in:value", "exec-out:else"]);
    const value = nodeGeometry({ id: "r", kind: "math.random" }, a.specs.get("rnd01")!);
    expect(value.pins).toEqual([{ kind: "data-out", key: "out", label: "", x: NODE_WIDTH, y: 15 }]);
    expect(value.height).toBe(30);
  });

  it("플래피 bird 를 정렬하면 노드가 모두 자리를 얻고 서로 겹치지 않는다", () => {
    const g = parseGraph(read("flappy", "bird.graph.json"));
    const lib = parseNodeLibrary(LIB_PATH, read("flappy", "common.nodes.json"));
    const a = validateGraph(g, { libraries: new Map([[LIB_PATH, lib]]) });
    const pos = layoutGraph(g, a);
    expect(Object.keys(pos).sort()).toEqual(g.nodes.map((n) => n.id).sort());
    const boxes = g.nodes.map((n) => ({ id: n.id, x: pos[n.id][0], y: pos[n.id][1], ...nodeSize(a, n) }));
    for (const p of boxes) for (const q of boxes) {
      if (p.id >= q.id) continue;
      const overlap = p.x < q.x + q.width && q.x < p.x + p.width && p.y < q.y + q.height && q.y < p.y + p.height;
      expect(overlap, `${p.id} ${q.id}`).toBe(false);
    }
    // 실행 줄기는 왼쪽에서 오른쪽으로 한 줄이고, 값 분기 다음 문장은 갈래들이 끝난 열 이후에 같은 줄이다 (갈래는 그 아래 줄)
    expect(pos.set_dt[0]).toBeGreaterThan(pos.update[0]);
    expect(pos.by_state[0]).toBeGreaterThan(pos.set_dt[0]);
    expect(pos.sync_angle[1]).toBe(pos.by_state[1]);
    for (const id of ["float_y", "fall", "tumble_if", "die"]) {
      expect(pos.sync_angle[0]).toBeGreaterThanOrEqual(pos[id][0]);
      expect(pos[id][1]).toBeGreaterThan(pos.by_state[1]);
    }
  });
});

describe("그래프 문서", () => {
  it("열고, 고치고, 되돌리고, 끌기는 한 단계로 합친다", async () => {
    const be = await flappyBackend();
    const doc = await GraphDocument.open(be, BIRD_PATH);
    expect(doc.logicalName).toBe("components/flappy/bird");
    expect(doc.problems).toEqual([]);
    expect(doc.dirty).toBe(false);
    const dtAt = doc.graph.layout.dt;
    doc.change("상수 변경", (g) => setArg(g, "float_off", "b", 20));
    expect(doc.graph.nodes.find((n) => n.id === "float_off")!.args).toEqual({ b: 20 });
    expect(doc.dirty).toBe(true);
    doc.change("노드 이동", (g) => moveNodes(g, [{ id: "dt", x: 10, y: 10 }]), "drag:1");
    doc.change("노드 이동", (g) => moveNodes(g, [{ id: "dt", x: 30, y: 40 }]), "drag:1");
    expect(doc.undo.depth).toBe(2);
    doc.undo.undo();
    expect(doc.graph.layout.dt).toEqual(dtAt);
    doc.undo.undo();
    expect(doc.graph.nodes.find((n) => n.id === "float_off")!.args).toEqual({ b: 14 });
    expect(doc.dirty).toBe(false);
    doc.change("아무것도", () => {});
    expect(doc.undo.depth).toBe(0);
  });

  it("저장하면 그래프와 생성 코드를 쓰고, 다음 저장에서 같은 파일은 다시 쓰지 않는다", async () => {
    const be = await flappyBackend();
    const doc = await GraphDocument.open(be, BIRD_PATH);
    doc.change("상수 변경", (g) => setArg(g, "float_off", "b", 20));
    await doc.save();
    expect(text(be, BIRD_PATH)).toBe(serializeGraph(doc.graph));
    expect(doc.lastGeneration).toEqual({ status: "written", written: ["scripts/lua/components/flappy/bird.lua", "scripts/ruby/components/flappy/bird.rb"], blocked: [], errors: 0 });
    expect(doc.writtenWithSave).toEqual(doc.lastGeneration!.written);
    expect(text(be, "scripts/lua/components/flappy/bird.lua")).toContain("math.sin(st.readyTime * 4) * 20");
    await doc.save();
    expect(doc.lastGeneration!.status).toBe("unchanged");
    expect(doc.writtenWithSave).toEqual([]);
  });

  it("손으로 쓴 파일은 덮어쓰지 않고, force 면 덮어쓴다", async () => {
    const hand = "-- components/flappy/bird.lua : 새의 물리\nreturn {}\n";
    const be = await flappyBackend({ "scripts/lua/components/flappy/bird.lua": hand });
    const doc = await GraphDocument.open(be, BIRD_PATH);
    const r = await doc.generate();
    expect(r).toEqual({ status: "blocked", written: ["scripts/ruby/components/flappy/bird.rb"], blocked: ["scripts/lua/components/flappy/bird.lua"], errors: 0 });
    expect(text(be, "scripts/lua/components/flappy/bird.lua")).toBe(hand);
    const forced = await doc.generate(true);
    expect(forced.written).toEqual(["scripts/lua/components/flappy/bird.lua"]);
    expect(text(be, "scripts/lua/components/flappy/bird.lua")).toBe(read("flappy", "bird.expected.lua"));
  });

  it("오류가 있으면 생성하지 않는다", async () => {
    const be = await flappyBackend();
    const doc = await GraphDocument.open(be, BIRD_PATH);
    doc.change("노드 지우기", (g) => removeNodes(g, ["c_flap"]));
    doc.change("잘못된 연결", (g) => connectData(g, { node: "st_state", port: "out" }, { node: "fall", port: "value" }));
    expect(doc.analysis.errors).toBeGreaterThan(0);
    await doc.save();
    expect(doc.lastGeneration).toMatchObject({ status: "errors", written: [] });
    expect(be.files.has("scripts/lua/components/flappy/bird.lua")).toBe(false);
  });

  it("uses 가 바뀌면 라이브러리를 다시 읽는다", async () => {
    const be = await flappyBackend();
    const doc = await GraphDocument.open(be, BIRD_PATH);
    doc.change("라이브러리 빼기", (g) => (g.uses = []));
    await new Promise((r) => setTimeout(r, 0));
    expect(doc.problems.some((p) => p.message.includes("라이브러리 상수가 없습니다: flappy.GRAVITY"))).toBe(true);
    doc.undo.undo();
    await new Promise((r) => setTimeout(r, 0));
    expect(doc.problems).toEqual([]);
  });

  it("생성 코드의 줄에서 노드를 찾는다", async () => {
    const doc = await GraphDocument.open(await flappyBackend(), BIRD_PATH);
    const lines = read("flappy", "bird.expected.rb").split("\n");
    expect(doc.nodeAtLine("ruby", lines.findIndex((l) => l.includes("FlappyCommon.die(st)")) + 1)).toBe("die");
    expect(doc.nodeAtLine("lua", 1)).toBeNull();
  });

  it("다시 읽기는 되돌리기와 선택을 비운다", async () => {
    const be = await flappyBackend();
    const doc = await GraphDocument.open(be, BIRD_PATH);
    doc.select(["die"]);
    doc.change("상수 변경", (g) => setArg(g, "float_off", "b", 20));
    await doc.reload();
    expect(doc.undo.depth).toBe(0);
    expect(doc.selection.size).toBe(0);
    expect(doc.dirty).toBe(false);
  });
});
