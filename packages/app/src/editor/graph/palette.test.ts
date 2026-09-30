import { parseGraph, parseNodeLibrary, validateGraph } from "@initial-editor/core";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { filterPalette, fitsWire, paletteEntries, type WireEnd } from "./palette";

const F = join(__dirname, "..", "..", "..", "..", "core", "src", "graph", "fixtures", "flappy");
const LIB = "scripts/components/flappy/common.nodes.json";

describe("노드 추가 목록", () => {
  const graph = parseGraph(readFileSync(join(F, "bird.graph.json"), "utf8"));
  const lib = parseNodeLibrary(LIB, readFileSync(join(F, "common.nodes.json"), "utf8"));
  const entries = paletteEntries(graph, validateGraph(graph, { libraries: new Map([[LIB, lib]]) }));

  it("있는 이벤트는 빼고, 상태 필드와 지역 변수와 라이브러리와 엔진 API 는 설정마다 한 항목이다", () => {
    const kinds = entries.map((e) => e.node.kind);
    expect(kinds).not.toContain("event.init");
    expect(kinds).not.toContain("event.update");
    expect(kinds).toContain("event.render");
    expect(entries.filter((e) => e.category === "상태").map((e) => `${e.node.kind}:${e.node.field}`)).toContain("state.set:birdVy");
    expect(entries.filter((e) => e.category === "지역 변수").length).toBe(2);
    expect(entries.find((e) => e.node.const === "flappy.GRAVITY")).toMatchObject({ category: "플래피", label: "중력 가속도", detail: "flappy.GRAVITY" });
    expect(entries.some((e) => e.node.fn === "flappy.state")).toBe(false);
    expect(entries.find((e) => e.node.fn === "Input.IsKeyDown")).toMatchObject({ category: "엔진 API" });
    expect(new Set(entries.map((e) => e.key)).size).toBe(entries.length);
  });

  it("검색은 이름, 설정, 분류, 종류로 거른다", () => {
    expect(filterPalette(entries, "콘솔").map((e) => e.node.kind)).toEqual(["text.print"]);
    expect(filterPalette(entries, "birdvy").every((e) => e.node.field === "birdVy")).toBe(true);
    expect(filterPalette(entries, "GRAVITY").map((e) => e.node.const)).toEqual(["flappy.GRAVITY"]);
    expect(filterPalette(entries, "  ").length).toBe(entries.length);
  });
});

describe("선을 놓아 연 목록", () => {
  const graph = parseGraph(readFileSync(join(F, "bird.graph.json"), "utf8"));
  const lib = parseNodeLibrary(LIB, readFileSync(join(F, "common.nodes.json"), "utf8"));
  const analysis = validateGraph(graph, { libraries: new Map([[LIB, lib]]) });
  const entries = paletteEntries(graph, analysis);
  const fits = (end: WireEnd) => entries.filter((e) => fitsWire(e, end, analysis.env));
  const kinds = (end: WireEnd) => new Set(fits(end).map((e) => e.node.kind));

  it("실행 출구에는 문장만, 실행 입구에는 이벤트도", () => {
    const out = kinds({ kind: "exec-out" });
    expect(out.has("text.print")).toBe(true);
    expect(out.has("math.add")).toBe(false);
    expect(out.has("event.render")).toBe(false);
    expect(kinds({ kind: "exec-in" }).has("event.render")).toBe(true);
  });

  it("값의 출력에는 그 형식을 받는 입력이 있는 노드만", () => {
    const bool = kinds({ kind: "data-out", type: { t: "boolean" } });
    expect(bool.has("flow.branch")).toBe(true);
    expect(bool.has("logic.not")).toBe(true);
    expect(bool.has("math.sin")).toBe(false);
    const num = fits({ kind: "data-out", type: { t: "number" } });
    expect(num.some((e) => e.node.kind === "state.set" && e.node.field === "birdVy")).toBe(true);
    expect(num.some((e) => e.node.kind === "state.set" && e.node.field === "state")).toBe(false);
  });

  it("값의 입력에는 그 형식을 내는 값 노드만 (덧셈은 정수도 낸다)", () => {
    const toBool = kinds({ kind: "data-in", type: { t: "boolean" } });
    expect(toBool.has("cmp.gt")).toBe(true);
    expect(toBool.has("math.add")).toBe(false);
    expect(toBool.has("text.print")).toBe(false);
    const toInt = kinds({ kind: "data-in", type: { t: "integer" } });
    expect(toInt.has("math.add")).toBe(true);
    expect(toInt.has("math.div")).toBe(false);
    expect(toInt.has("math.floor")).toBe(true);
  });
});
